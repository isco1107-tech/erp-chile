import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { buildScrutinyWorkbook } from '@/modules/judging/services/judging.service';

/**
 * Exporta el acta de escrutinio de una ronda en Excel — mismo motivo que
 * `reports/excel` para ir en Route Handler y no Server Action (streaming
 * binario, sin límite de 1 MB de cuerpo).
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('judging:read');

    const url = new URL(req.url);
    const roundId = url.searchParams.get('roundId');
    if (!roundId) {
      return NextResponse.json({ success: false, error: 'Falta la ronda' }, { status: 400 });
    }

    const buffer = await buildScrutinyWorkbook(session.companyId, roundId);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'ScoreSheet',
      entityId: roundId,
      metadata: {},
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="acta_escrutinio_${roundId}.xlsx"`,
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
    console.error('Scrutiny export failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo generar el acta' }, { status: 500 });
  }
}
