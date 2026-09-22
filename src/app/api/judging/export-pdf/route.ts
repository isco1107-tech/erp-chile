import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { buildRoundActaPdf } from '@/modules/judging/services/scrutiny-pdf.service';

/**
 * Acta notarial en PDF de una ronda ya cerrada — Route Handler por el mismo
 * motivo que el export de Excel (streaming binario). Solo funciona con la
 * ronda en `VOTING_CLOSED`/`COMPLETED`; el servicio rechaza cualquier otro
 * estado.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('judging:read');

    const url = new URL(req.url);
    const roundId = url.searchParams.get('roundId');
    if (!roundId) {
      return NextResponse.json({ success: false, error: 'Falta la ronda' }, { status: 400 });
    }

    const buffer = await buildRoundActaPdf(session.companyId, roundId);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'CompetitionRound',
      entityId: roundId,
      metadata: { format: 'pdf' },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="acta_notarial_${roundId}.pdf"`,
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
    captureException(error, { module: 'judging' });
    return NextResponse.json({ success: false, error: 'No se pudo generar el acta' }, { status: 500 });
  }
}
