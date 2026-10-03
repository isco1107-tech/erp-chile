import { NextResponse } from 'next/server';
import { runOverdueInstallmentsReminderCron } from '@/modules/payment-plans/services/overdue-reminder-cron.service';
import { createCronBudget, parseCronCursor, scheduleCronContinuation } from '@/lib/cron/batch';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';
/** Tope de duración de la función; el cron corta el lote antes (ver `src/lib/cron/batch.ts`). */
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const { after, hop } = parseCronCursor(req);
    const budget = createCronBudget();
    const result = await runOverdueInstallmentsReminderCron({ after, budget });
    const continued = scheduleCronContinuation(req, result.nextAfter, hop, 'cron:overdue-installments');

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      remindersSent: result.remindersSent,
      pending: result.nextAfter !== null,
      continued,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:overdue-installments' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de cuotas vencidas' }, { status: 500 });
  }
}
