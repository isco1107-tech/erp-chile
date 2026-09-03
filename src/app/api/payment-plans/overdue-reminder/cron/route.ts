import { NextResponse } from 'next/server';
import { runOverdueInstallmentsReminderCron } from '@/modules/payment-plans/services/overdue-reminder-cron.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const result = await runOverdueInstallmentsReminderCron();

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      remindersSent: result.remindersSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in payment plans overdue reminder cron:', error);
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de cuotas vencidas' }, { status: 500 });
  }
}
