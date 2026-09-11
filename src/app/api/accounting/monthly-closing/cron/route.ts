import { NextResponse } from 'next/server';
import { runMonthlyClosingCron } from '@/modules/accounting/services/monthly-closing-cron.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';

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

    const result = await runMonthlyClosingCron();

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      emailsSent: result.emailsSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:monthly-closing' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de cierre mensual' }, { status: 500 });
  }
}
