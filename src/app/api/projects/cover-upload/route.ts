import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { sniffImageType, SNIFFED_IMAGE_EXTENSION } from '@/lib/security/file-signature';
import { readImageSize } from '@/lib/images/dimensions';
import { prisma } from '@/lib/prisma';

/**
 * Sube la imagen de portada del micrositio de un certamen. Route Handler por
 * el límite de 1 MB de las Server Actions (mismo motivo que `branding/upload`).
 * El tipo se valida por los primeros bytes del archivo, no por lo que declara
 * el navegador: esta imagen queda publicada en internet.
 */

const MAX_FILE_BYTES = 6 * 1024 * 1024;

/**
 * Tamaño mínimo por uso: la portada se estira a pantalla completa y la foto de una ganadora se
 * muestra grande, así que una imagen chica se ve pixelada y borrosa (pasó con una portada de
 * 150 × 150). Se rechaza al subir, con el motivo, en vez de publicarla mal.
 */
const MIN_SIZE = {
  cover: { width: 1000, height: 520, label: 'La portada', hint: 'de al menos 1600 × 900 px' },
  winner: { width: 600, height: 750, label: 'La foto', hint: 'vertical de al menos 800 × 1067 px' },
  director: null,
} as const;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const form = await req.formData();
    const projectId = String(form.get('projectId') ?? '');
    // `winner` = foto del salón de la fama (otra carpeta, para que una empresa solo pueda asociar fotos suyas);
    // `director` = foto de la directora (sin tamaño mínimo); por defecto, la portada.
    const rawPurpose = form.get('purpose');
    const purpose: 'cover' | 'winner' | 'director' = rawPurpose === 'winner' ? 'winner' : rawPurpose === 'director' ? 'director' : 'cover';
    const file = form.get('file');

    if (!projectId) return NextResponse.json({ success: false, error: 'Falta el certamen' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Adjunta una imagen' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ success: false, error: 'La imagen supera los 6 MB' }, { status: 413 });

    const project = await prisma.project.findFirst({ where: { id: projectId, companyId: session.companyId }, select: { id: true } });
    if (!project) return NextResponse.json({ success: false, error: 'Certamen no encontrado' }, { status: 404 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return NextResponse.json({ success: false, error: purpose === 'winner' ? 'La foto debe ser JPG, PNG o WEBP' : 'La portada debe ser JPG o PNG' }, { status: 400 });

    const min = MIN_SIZE[purpose];
    if (min) {
      const size = readImageSize(bytes);
      if (!size) return NextResponse.json({ success: false, error: 'No se pudo leer el tamaño de la imagen. Prueba con otro archivo JPG o PNG.' }, { status: 400 });
      if (size.width < min.width || size.height < min.height) {
        return NextResponse.json(
          { success: false, error: `${min.label} es muy chica (${size.width} × ${size.height} px) y se vería pixelada. Sube una imagen ${min.hint}.` },
          { status: 400 }
        );
      }
    }

    const pathname =
      purpose === 'winner'
        ? `pageant-winners/${session.companyId}/${projectId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${SNIFFED_IMAGE_EXTENSION[sniffed]}`
        : `pageant-covers/${session.companyId}/${projectId}-${Date.now()}.${SNIFFED_IMAGE_EXTENSION[sniffed]}`;
    const blob = await put(pathname, new Blob([bytes], { type: sniffed }), { access: 'public', contentType: sniffed, addRandomSuffix: false });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      metadata: { field: purpose === 'winner' ? 'pastWinnerPhoto' : 'coverImageUrl', url: blob.url },
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'projects', extra: { reason: 'cover-upload' } });
    return NextResponse.json({ success: false, error: 'No se pudo subir la imagen' }, { status: 500 });
  }
}
