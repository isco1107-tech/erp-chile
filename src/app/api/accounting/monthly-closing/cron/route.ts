import { NextResponse } from 'next/server';
import { runMonthlyClosingCron } from '@/modules/accounting/services/monthly-closing-cron.service';
import { createCronBudget, parseCronCursor, scheduleCronContinuation } from '@/lib/cron/batch';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';
/** Tope de duración de la función; el cron corta el lote antes (ver `src/lib/cron/batch.ts`). */
export const maxDuration = 300;

/**
 * Cierre mensual: calcula el F29 del mes recién terminado y las cuadraturas
 * contables para cada empresa con `hasDteBilling`, y manda el resumen por
 * correo a Dueños/Administradores/Contador. Mismo `CRON_SECRET` que el
 * resto de las rutas de cron — ver `src/lib/security/cron-auth.ts`.
 */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const { after, hop } = parseCronCursor(req);
    const budget = createCronBudget();
    const result = await runMonthlyClosingCron({ after, budget });
    const continued = scheduleCronContinuation(req, result.nextAfter, hop, 'cron:monthly-closing');

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      emailsSent: result.emailsSent,
      pending: result.nextAfter !== null,
      continued,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:monthly-closing' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de cierre mensual' }, { status: 500 });
  }
}
