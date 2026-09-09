import { NextResponse } from 'next/server';
import { runWeeklyReportCron } from '@/modules/reports/services/weekly-report-cron.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

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

    const result = await runWeeklyReportCron();

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      emailsSent: result.emailsSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in weekly report cron:', error);
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de reporte semanal' }, { status: 500 });
  }
}
