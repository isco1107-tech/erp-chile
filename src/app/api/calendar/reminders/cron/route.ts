import { NextResponse } from 'next/server';
import { runDailyRemindersCron } from '@/modules/calendar/services/event-reminders.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const result = await runDailyRemindersCron(baseUrl);

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:calendar-reminders' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de recordatorios' }, { status: 500 });
  }
}
