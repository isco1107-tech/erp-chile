import { NextResponse } from 'next/server';
import { purgeRejectedCandidates } from '@/modules/candidates/services/candidates.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { captureExceptionAndFlush } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/**
 * Purga por retención programada (Sección 7 del módulo de postulaciones):
 * elimina postulaciones `REJECTED` con más de N meses. Mismo patrón de
 * autenticación por `CRON_SECRET` que `app/api/calendar/reminders/cron`.
 *
 * Corre el día 1 de cada mes a las 04:00 UTC (ver `vercel.json`). Es la
 * garantía de que una postulación descartada no queda indefinidamente en el
 * sistema, como lo promete la política de privacidad (Ley 21.719).
 */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const months = Number(process.env.CANDIDATE_RETENTION_MONTHS ?? 12);
    const result = await purgeRejectedCandidates(months);

    return NextResponse.json({ success: true, ...result, months, timestamp: new Date().toISOString() });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:candidates-purge' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar la purga por retención' }, { status: 500 });
  }
}
