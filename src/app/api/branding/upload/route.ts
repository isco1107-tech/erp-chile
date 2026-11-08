import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { sniffAllowedUpload, type SniffedUploadType } from '@/lib/security/file-signature';
import { prisma } from '@/lib/prisma';

/**
 * Sube el logo o el fondo de la empresa a Cloudflare R2 y guarda la URL en
 * `Company`. Va en un Route Handler, no en una Server Action, por el mismo
 * motivo que la importación masiva: el límite de cuerpo de una Server Action
 * es de 1 MB, insuficiente para una imagen.
 */

// Sin SVG: el panel lo muestra con <img> (inerte), pero el archivo queda en el
// almacenamiento público y abierto directo ejecutaría su <script>. El tipo se
// comprueba por la firma binaria, no por `file.type` (lo declara el cliente).
const ALLOWED_TYPES: ReadonlySet<SniffedUploadType> = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KIND_FIELD = new Set(['logo', 'background']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BRAND_COLORS = 3;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('settings:company');

    const form = await req.formData();
    const kind = String(form.get('kind') ?? '');
    const file = form.get('file');

    if (!KIND_FIELD.has(kind)) {
      return NextResponse.json({ success: false, error: 'Tipo de imagen no válido' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte una imagen' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'La imagen supera los 5 MB' }, { status: 413 });
    }
    const sniffed = await sniffAllowedUpload(file, ALLOWED_TYPES);
    if (!sniffed) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PNG, JPG, WEBP o GIF' }, { status: 400 });
    }

    const { extension, contentType } = sniffed;
    const pathname = `branding/${session.companyId}/${kind}-${Date.now()}.${extension}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType,
      // El nombre ya es único por companyId+kind+timestamp; un sufijo random
      // encima solo complica poder reconstruir la URL para borrar la anterior.
      addRandomSuffix: false,
    });

    const field = kind === 'logo' ? 'logoUrl' : 'backgroundUrl';

    // La paleta de marca solo viaja junto al logo (el fondo del panel no la
    // determina). Se persiste SIEMPRE que kind==='logo' — incluyendo `[]`
    // cuando el navegador no mandó colores válidos (logo en blanco y negro,
    // extracción falló) — para que un logo nuevo sin paleta útil limpie la de
    // un logo anterior en vez de dejarla pegada.
    let brandPalette: string[] = [];
    const rawBrandPalette = form.get('brandPalette');
    if (typeof rawBrandPalette === 'string') {
      try {
        const parsed: unknown = JSON.parse(rawBrandPalette);
        if (Array.isArray(parsed)) {
          brandPalette = parsed
            .filter((c): c is string => typeof c === 'string' && HEX_COLOR_RE.test(c))
            .map((c) => c.toLowerCase())
            .slice(0, MAX_BRAND_COLORS);
        }
      } catch {
        // JSON inválido: se ignora y queda `brandPalette = []` (mismo efecto que no mandar nada).
      }
    }

    await prisma.company.updateMany({
      where: { id: session.companyId },
      data: { [field]: blob.url, ...(kind === 'logo' ? { brandPalette } : {}) },
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Company',
      entityId: session.companyId,
      metadata: { field, url: blob.url, ...(kind === 'logo' ? { brandPalette } : {}) },
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json(
        { success: false, error: 'Módulo no incluido en tu plan actual' },
        { status: 403 }
      );
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    captureException(error, { module: 'settings' });
    return NextResponse.json({ success: false, error: 'No se pudo subir la imagen' }, { status: 500 });
  }
}
