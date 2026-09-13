import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { renderCandidateContractPdf } from '@/modules/candidates/services/contract-pdf.service';
import { upsertGeneratedContract } from '@/modules/candidates/services/documents.service';

/**
 * Genera el contrato de imagen desde la plantilla vigente, lo sube a Blob y
 * lo registra como `CandidateDocument` (`documentType = CONTRACT_IMAGE`) en
 * el mismo paso que lo devuelve para descarga — mismo motivo que el resto de
 * las rutas de exportación (límite de 1 MB de body de las Server Actions).
 * `upsertGeneratedContract` ya rechaza la regeneración si el contrato previo
 * está firmado.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('candidates:write');

    const url = new URL(req.url);
    const candidateId = url.searchParams.get('candidateId');
    if (!candidateId) {
      return NextResponse.json({ success: false, error: 'Falta la candidata' }, { status: 400 });
    }

    const buffer = await renderCandidateContractPdf(session.companyId, candidateId);

    const pathname = `candidates/${session.companyId}/contracts/${candidateId}-${Date.now()}.pdf`;
    const blob = await put(pathname, buffer, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false });

    const document = await upsertGeneratedContract(session.companyId, candidateId, blob.url);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CandidateDocument',
      entityId: document.id,
      metadata: { candidateId, fileUrl: blob.url },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="contrato_${candidateId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
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
    console.error('Candidate contract generation failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo generar el contrato' }, { status: 500 });
  }
}
