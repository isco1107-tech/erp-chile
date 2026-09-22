import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { renderCandidateContractPdf } from '@/modules/candidates/services/contract-pdf.service';
import { saveZapsignRequest, upsertGeneratedContract } from '@/modules/candidates/services/documents.service';
import { createDocument } from '@/lib/zapsign/client';
import { captureException } from '@/lib/observability';

/**
 * Genera el contrato desde la plantilla, lo sube a Blob (borrador, por si se
 * quiere revisar antes de firmar) y lo envía a ZapSign para firma electrónica
 * avanzada por correo. No devuelve el PDF (a diferencia de `contract/route.ts`)
 * — solo confirma el envío y el link de firma de respaldo, por eso va como
 * JSON y no como streaming binario.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('candidates:write');

    const url = new URL(req.url);
    const candidateId = url.searchParams.get('candidateId');
    if (!candidateId) {
      return NextResponse.json({ success: false, error: 'Falta la candidata' }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId: session.companyId } });
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'Candidata no encontrada' }, { status: 404 });
    }
    if (!candidate.email) {
      return NextResponse.json(
        { success: false, error: 'La candidata no tiene email registrado — agrégalo en su ficha antes de solicitar la firma' },
        { status: 400 },
      );
    }

    const buffer = await renderCandidateContractPdf(session.companyId, candidateId);

    const pathname = `candidates/${session.companyId}/contracts/${candidateId}-${Date.now()}.pdf`;
    const blob = await put(pathname, buffer, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false });

    const document = await upsertGeneratedContract(session.companyId, candidateId, blob.url);

    const zapsign = await createDocument({
      name: `Contrato de imagen — ${candidate.fullName}`,
      pdfBuffer: buffer,
      signerName: candidate.fullName,
      signerEmail: candidate.email,
    });

    const updated = await saveZapsignRequest(session.companyId, document.id, {
      zapsignDocToken: zapsign.docToken,
      zapsignSignUrl: zapsign.signUrl,
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CandidateDocument',
      entityId: document.id,
      metadata: { candidateId, action: 'request_signature', zapsignDocToken: zapsign.docToken },
    });

    return NextResponse.json({ success: true, data: { documentId: updated.id, signUrl: zapsign.signUrl } });
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
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    captureException(error, { module: 'candidates' });
    return NextResponse.json({ success: false, error: 'No se pudo enviar el contrato a firma' }, { status: 500 });
  }
}
