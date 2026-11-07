import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { sniffAllowedUpload, type SniffedUploadType } from '@/lib/security/file-signature';
import { prisma } from '@/lib/prisma';

/**
 * Sube la foto de una candidata a Cloudflare R2 y guarda la URL en `Candidate`.
 * Va en un Route Handler, no en una Server Action, por el límite de 1 MB de
 * cuerpo de las Server Actions (mismo motivo que `branding/upload`).
 */

const ALLOWED_TYPES: ReadonlySet<SniffedUploadType> = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('candidates:write');

    const form = await req.formData();
    const candidateId = String(form.get('candidateId') ?? '');
    const file = form.get('file');

    if (!candidateId) {
      return NextResponse.json({ success: false, error: 'Falta el identificador de la candidata' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PNG, JPG o WEBP' }, { status: 400 });
    }

    // Aislamiento multi-tenant: la candidata debe pertenecer a la empresa de
    // la sesión antes de aceptar la subida.
    const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId: session.companyId } });
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidata no encontrada' }, { status: 404 });
    }

    const { extension, contentType } = sniffed;
    // Auditoría 2026-09-27 (hallazgo A-5/SEG-04): el bucket sigue siendo
    // público, pero la ruta ya no se puede adivinar por timestamp — agregar
    // el bucket privado queda como decisión de producto pendiente.
    const pathname = `candidates/${session.companyId}/${candidateId}-${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });

    await prisma.candidate.updateMany({
      where: { id: candidateId, companyId: session.companyId },
      data: { photoUrl: blob.url },
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Candidate',
      entityId: candidateId,
      metadata: { field: 'photoUrl' },
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
    captureException(error, { module: 'candidates' });
    return NextResponse.json({ success: false, error: 'No se pudo subir la foto' }, { status: 500 });
  }
}
