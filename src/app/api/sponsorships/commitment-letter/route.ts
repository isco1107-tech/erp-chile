import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { renderCommitmentLetterPdf } from '@/modules/sponsorships/services/agreement-pdf.service';
import { captureException } from '@/lib/observability';

/**
 * Genera la carta de compromiso desde la plantilla vigente, la sube a Blob y
 * actualiza `agreementFileUrl`/`agreementGeneratedAt` en el mismo paso que la
 * devuelve para descarga — Route Handler por el límite de 1 MB de body de
 * las Server Actions, mismo motivo que el resto de las rutas de exportación.
 * Regenerar una carta ya firmada (`agreementSignedAt` no nulo) se rechaza:
 * el documento firmado ya tiene validez, no se pisa.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');

    const url = new URL(req.url);
    const contractId = url.searchParams.get('contractId');
    if (!contractId) {
      return NextResponse.json({ success: false, error: 'Falta el contrato de auspicio' }, { status: 400 });
    }

    const contract = await prisma.sponsorshipContract.findFirst({ where: { id: contractId, companyId: session.companyId } });
    if (!contract) {
      return NextResponse.json({ success: false, error: 'Contrato de auspicio no encontrado' }, { status: 404 });
    }
    if (contract.agreementSignedAt) {
      return NextResponse.json({ success: false, error: 'Esta carta ya fue firmada — no se puede regenerar' }, { status: 400 });
    }

    const buffer = await renderCommitmentLetterPdf(session.companyId, contractId);

    const pathname = `sponsorships/${session.companyId}/agreements/${contractId}-${Date.now()}.pdf`;
    const blob = await put(pathname, buffer, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false });

    await prisma.sponsorshipContract.updateMany({
      where: { id: contractId, companyId: session.companyId },
      data: { agreementFileUrl: blob.url, agreementGeneratedAt: new Date() },
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipContract',
      entityId: contractId,
      metadata: { agreementFileUrl: blob.url },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="carta_compromiso_${contractId}.pdf"`,
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
    captureException(error, { module: 'sponsorships' });
    return NextResponse.json({ success: false, error: 'No se pudo generar la carta' }, { status: 500 });
  }
}
