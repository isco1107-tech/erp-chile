import { NextResponse } from 'next/server';
import { runCollectionRemindersCron } from '@/modules/treasury/services/collections.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/** Cobranza automática diaria: solo empresas que la activaron en Tesorería → Cobranza. */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const result = await runCollectionRemindersCron();
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:collection-reminders' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar la cobranza automática' }, { status: 500 });
  }
}
