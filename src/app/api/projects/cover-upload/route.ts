import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { sniffImageType, SNIFFED_IMAGE_EXTENSION } from '@/lib/security/file-signature';
import { prisma } from '@/lib/prisma';

/**
 * Sube la imagen de portada del micrositio de un certamen. Route Handler por
 * el límite de 1 MB de las Server Actions (mismo motivo que `branding/upload`).
 * El tipo se valida por los primeros bytes del archivo, no por lo que declara
 * el navegador: esta imagen queda publicada en internet.
 */

const MAX_FILE_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const form = await req.formData();
    const projectId = String(form.get('projectId') ?? '');
    const file = form.get('file');

    if (!projectId) return NextResponse.json({ success: false, error: 'Falta el certamen' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Adjunta una imagen' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ success: false, error: 'La imagen supera los 6 MB' }, { status: 413 });

    const project = await prisma.project.findFirst({ where: { id: projectId, companyId: session.companyId }, select: { id: true } });
    if (!project) return NextResponse.json({ success: false, error: 'Certamen no encontrado' }, { status: 404 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return NextResponse.json({ success: false, error: 'La portada debe ser JPG o PNG' }, { status: 400 });

    const pathname = `pageant-covers/${session.companyId}/${projectId}-${Date.now()}.${SNIFFED_IMAGE_EXTENSION[sniffed]}`;
    const blob = await put(pathname, new Blob([bytes], { type: sniffed }), { access: 'public', contentType: sniffed, addRandomSuffix: false });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      metadata: { field: 'coverImageUrl', url: blob.url },
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
