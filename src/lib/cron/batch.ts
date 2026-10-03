import 'server-only';

import { after } from 'next/server';
import { captureMessage } from '@/lib/observability';
import {
  MAX_CRON_HOPS,
  buildContinuationUrl,
  createCompanyCursor,
  createCronBudget,
  parseCronCursor,
  type CompanyCursor,
  type CronBudget,
  type CronRunOptions,
} from './batch-core';

export { createCompanyCursor, createCronBudget, parseCronCursor };
export type { CompanyCursor, CronBudget, CronRunOptions };

/**
 * Cron multi-empresa que no cabe en una sola invocación: cada ruta corre
 * empresas hasta agotar su presupuesto de tiempo y, si quedaron pendientes,
 * se vuelve a llamar a sí misma desde la última empresa procesada. Cada
 * empresa se procesa en exactamente UNA invocación (el cursor es `id > after`,
 * sin solapamiento), así que continuar no duplica correos ni asientos.
 *
 * Vercel no cancela la función cuando el cliente se desconecta salvo que se
 * active `supportsCancellation` en `vercel.json` (no está activo), por eso la
 * llamada de continuación solo espera unos segundos a que la otra invocación
 * arranque y suelta la conexión: no se anidan las duraciones.
 */
const CONTINUATION_CONNECT_TIMEOUT_MS = 5_000;

/**
 * Si quedaron empresas pendientes (`nextAfter`), agenda con `after()` la
 * siguiente invocación. Devuelve `true` si la agendó.
 */
export function scheduleCronContinuation(req: Request, nextAfter: string | null, hop: number, module: string): boolean {
  if (!nextAfter) return false;

  if (hop >= MAX_CRON_HOPS) {
    captureMessage('Cron multi-empresa cortado por exceder el máximo de continuaciones: quedan empresas sin procesar', 'error', {
      module,
      extra: { hop, nextAfter },
    });
    return false;
  }

  const authorization = req.headers.get('authorization');
  if (!authorization) return false;

  const url = buildContinuationUrl(req.url, nextAfter, hop + 1);
  captureMessage('Cron multi-empresa continúa en otra invocación por límite de tiempo', 'warn', { module, extra: { hop: hop + 1, nextAfter } });

  after(async () => {
    try {
      await fetch(url, { headers: { authorization }, signal: AbortSignal.timeout(CONTINUATION_CONNECT_TIMEOUT_MS) });
    } catch (error) {
      // El corte por tiempo de espera es lo esperado: la otra invocación ya arrancó.
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return;
      captureMessage('No se pudo encadenar la continuación del cron: quedan empresas sin procesar', 'error', {
        module,
        extra: { hop: hop + 1, nextAfter, reason: error instanceof Error ? error.message : String(error) },
      });
    }
  });
  return true;
}
