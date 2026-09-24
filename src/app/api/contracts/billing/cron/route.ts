import { NextResponse } from 'next/server';
import { runRecurringBillingCron } from '@/modules/contracts/services/billing.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';
// Una empresa con muchos contratos emite un documento por contrato (folio +
// timbre + asiento): más tiempo que el default.
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const result = await runRecurringBillingCron();
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:recurring-billing' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar la facturación recurrente' }, { status: 500 });
  }
}
