import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';

/**
 * Sube la evidencia (foto, captura o PDF) de un `SponsorshipDeliverable` a
 * Vercel Blob y guarda la URL en `proofUrl`. Va en un Route Handler, no en
 * una Server Action, por el mismo motivo que `branding/upload`: el límite de
 * cuerpo de una Server Action es de 1 MB, insuficiente para una imagen o PDF.
 */

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');

    const form = await req.formData();
    const deliverableId = String(form.get('deliverableId') ?? '');
    const file = form.get('file');

    if (!deliverableId) {
      return NextResponse.json({ success: false, error: 'Falta el identificador del entregable' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte un archivo' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PNG, JPG, WEBP, GIF o PDF' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera los 5 MB' }, { status: 413 });
    }

    // El entregable debe pertenecer a la empresa del usuario: sin este
    // chequeo, cualquier id adivinado permitiría pisar el `proofUrl` de un
    // entregable de otra empresa.
    const deliverable = await prisma.sponsorshipDeliverable.findFirst({
      where: { id: deliverableId, companyId: session.companyId },
      select: { id: true, contractId: true },
    });
    if (!deliverable) {
      return NextResponse.json({ success: false, error: 'Entregable no encontrado' }, { status: 404 });
    }

    const EXTENSION_BY_TYPE: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
    };
    const extension = EXTENSION_BY_TYPE[file.type];
    const pathname = `sponsorships/${session.companyId}/${deliverableId}-${Date.now()}.${extension}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    });

    await prisma.sponsorshipDeliverable.updateMany({
      where: { id: deliverableId, companyId: session.companyId },
      data: { proofUrl: blob.url },
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipDeliverable',
      entityId: deliverableId,
      metadata: { contractId: deliverable.contractId, proofUrl: blob.url },
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Sponsorship deliverable proof upload failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo subir la evidencia' }, { status: 500 });
  }
}
