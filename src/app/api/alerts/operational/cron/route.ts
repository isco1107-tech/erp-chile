import { NextResponse } from 'next/server';
import { runOperationalAlertsCron } from '@/modules/alerts/services/operational-alerts.service';
import { createCronBudget, parseCronCursor, scheduleCronContinuation } from '@/lib/cron/batch';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';
/** Tope de duración de la función; el cron corta el lote antes (ver `src/lib/cron/batch.ts`). */
export const maxDuration = 300;

/**
 * Alertas operativas diarias: stock bajo el mínimo + compras esperando
 * aprobación. Protegido con el mismo `CRON_SECRET` que el resto de las
 * rutas de cron (ver `src/lib/security/cron-auth.ts`) — sirve tanto para
 * Vercel Cron (configurado en `vercel.json`) como para que un workflow de
 * n8n llame esta misma URL con el header `Authorization: Bearer
 * <CRON_SECRET>` y lea `companies` del JSON para postear un resumen en
 * Slack, sin duplicar la lógica de qué cuenta como "stock bajo" o "compra
 * atascada" fuera del ERP.
 */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const { after, hop } = parseCronCursor(req);
    const budget = createCronBudget();
    const result = await runOperationalAlertsCron({ after, budget });
    const continued = scheduleCronContinuation(req, result.nextAfter, hop, 'cron:operational-alerts');

    return NextResponse.json({
      success: true,
      processedCompanies: result.processedCompanies,
      alertsSent: result.alertsSent,
      companies: result.companies,
      pending: result.nextAfter !== null,
      continued,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:operational-alerts' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar cron de alertas operativas' }, { status: 500 });
  }
}
