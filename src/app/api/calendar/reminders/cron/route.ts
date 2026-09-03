import { NextResponse } from 'next/server';
import { runDailyRemindersCron } from '@/modules/calendar/services/event-reminders.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';

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
    console.error('Error in daily reminders cron:', error);
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de recordatorios' }, { status: 500 });
  }
}
