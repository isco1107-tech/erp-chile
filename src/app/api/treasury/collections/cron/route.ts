import { NextResponse } from 'next/server';
import { runCollectionRemindersCron } from '@/modules/treasury/services/collections.service';
import { createCronBudget, parseCronCursor, scheduleCronContinuation } from '@/lib/cron/batch';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';
/** Tope de duración de la función; el cron corta el lote antes (ver `src/lib/cron/batch.ts`). */
export const maxDuration = 300;

/** Cobranza automática diaria: solo empresas que la activaron en Tesorería → Cobranza. */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const { after, hop } = parseCronCursor(req);
    const budget = createCronBudget();
    const result = await runCollectionRemindersCron(new Date(), { after, budget });
    const continued = scheduleCronContinuation(req, result.nextAfter, hop, 'cron:collection-reminders');
    return NextResponse.json({ success: true, ...result, continued, timestamp: new Date().toISOString() });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:collection-reminders' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar la cobranza automática' }, { status: 500 });
  }
}
