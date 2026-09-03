import { NextResponse } from 'next/server';
import { purgeRejectedCandidates } from '@/modules/candidates/services/candidates.service';
import { isCronAuthorized } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Purga por retención programada (Sección 7 del módulo de postulaciones):
 * elimina postulaciones `REJECTED` con más de N meses. Mismo patrón de
 * autenticación por `CRON_SECRET` que `app/api/calendar/reminders/cron`.
 *
 * NO está agregada a `vercel.json` todavía — agregar un cron nuevo cambia lo
 * que corre automáticamente contra la base de datos compartida de
 * producción, así que se deja para que la organización decida el horario y
 * la habilite explícitamente (ver resumen final de la tarea).
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
    console.error('Error in candidate retention purge cron:', error);
    return NextResponse.json({ success: false, error: 'Error al ejecutar la purga por retención' }, { status: 500 });
  }
}
