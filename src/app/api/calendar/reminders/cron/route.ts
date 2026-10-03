import { NextResponse } from 'next/server';
import { runDailyRemindersCron } from '@/modules/calendar/services/event-reminders.service';
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

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const { after, hop } = parseCronCursor(req);
    const budget = createCronBudget();
    const result = await runDailyRemindersCron(baseUrl, { after, budget });
    const continued = scheduleCronContinuation(req, result.nextAfter, hop, 'cron:calendar-reminders');

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      pending: result.nextAfter !== null,
      continued,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:calendar-reminders' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de recordatorios' }, { status: 500 });
  }
}
