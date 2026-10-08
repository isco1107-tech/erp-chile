import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { sniffImageType, SNIFFED_IMAGE_EXTENSION } from '@/lib/security/file-signature';
import { readImageSize } from '@/lib/images/dimensions';
import { academySiteImagePrefix } from '@/lib/academy/site';

/**
 * Sube una foto del sitio web de la academia (portada, carrusel, directora,
 * clases, testimonios o logo).
 * Route Handler por el límite de 1 MB de las Server Actions. El tipo se valida
 * por los primeros bytes del archivo, no por lo que declara el navegador: la
 * imagen queda publicada en internet. Se guarda bajo `academy-site/{companyId}/`
 * y el servidor rechaza al guardar el sitio cualquier URL que no sea de esa carpeta.
 */

const MAX_FILE_BYTES = 6 * 1024 * 1024;

/** Tamaño mínimo por uso: la portada se estira a pantalla completa y se vería pixelada si es chica. */
const MIN_SIZE = {
  hero: { width: 1000, height: 520, label: 'La portada', hint: 'de al menos 1600 × 900 px' },
  gallery: { width: 600, height: 400, label: 'La foto', hint: 'de al menos 1200 × 800 px' },
  director: { width: 300, height: 300, label: 'La foto', hint: 'de al menos 600 × 600 px' },
  /** Foto de una clase o de un testimonio: se muestra en una tarjeta. */
  card: { width: 300, height: 300, label: 'La foto', hint: 'de al menos 600 × 600 px' },
  /** Logo: puede ser chico y alargado (ideal PNG con fondo transparente). */
  logo: { width: 64, height: 32, label: 'El logo', hint: 'de al menos 300 px de ancho' },
} as const;

type Purpose = keyof typeof MIN_SIZE;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('academy:manage');
    const form = await req.formData();
    const rawPurpose = String(form.get('purpose') ?? '');
    const purpose: Purpose = (Object.keys(MIN_SIZE) as Purpose[]).includes(rawPurpose as Purpose) ? (rawPurpose as Purpose) : 'hero';
    const file = form.get('file');

    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Adjunta una imagen' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ success: false, error: 'La imagen supera los 6 MB' }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return NextResponse.json({ success: false, error: 'La imagen debe ser JPG, PNG o WEBP' }, { status: 400 });

    const min = MIN_SIZE[purpose];
    const size = readImageSize(bytes);
    if (!size) return NextResponse.json({ success: false, error: 'No se pudo leer el tamaño de la imagen. Prueba con otro archivo JPG o PNG.' }, { status: 400 });
    if (size.width < min.width || size.height < min.height) {
      return NextResponse.json(
        { success: false, error: `${min.label} es muy chica (${size.width} × ${size.height} px) y se vería pixelada. Sube una imagen ${min.hint}.` },
        { status: 400 }
      );
    }

    const pathname = `${academySiteImagePrefix(session.companyId)}${purpose}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${SNIFFED_IMAGE_EXTENSION[sniffed]}`;
    const blob = await put(pathname, new Blob([bytes], { type: sniffed }), { access: 'public', contentType: sniffed, addRandomSuffix: false });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'AcademySite',
      entityId: session.companyId,
      metadata: { field: `${purpose}Image`, url: blob.url },
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'academia', extra: { reason: 'site-upload' } });
    return NextResponse.json({ success: false, error: 'No se pudo subir la imagen' }, { status: 500 });
  }
}
