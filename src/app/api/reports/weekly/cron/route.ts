import { NextResponse } from 'next/server';
import { runWeeklyReportCron } from '@/modules/reports/services/weekly-report-cron.service';
import { createCronBudget, parseCronCursor, scheduleCronContinuation } from '@/lib/cron/batch';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';
/** Tope de duración de la función; el cron corta el lote antes (ver `src/lib/cron/batch.ts`). */
export const maxDuration = 300;

/**
 * Entrega semanal del libro Excel (ventas, compras, inventario, kardex) por
 * correo a Dueño/Administrador/Contador de cada empresa con Reportes
 * Avanzados activo. Mismo `CRON_SECRET` que el resto de las rutas de cron.
 */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const { after, hop } = parseCronCursor(req);
    const budget = createCronBudget();
    const result = await runWeeklyReportCron({ after, budget });
    const continued = scheduleCronContinuation(req, result.nextAfter, hop, 'cron:weekly-report');

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      emailsSent: result.emailsSent,
      pending: result.nextAfter !== null,
      continued,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:weekly-report' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de reporte semanal' }, { status: 500 });
  }
}
