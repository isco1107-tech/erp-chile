import type { MobileCandidate, MobileProduct } from '@/modules/warehouse-mobile/types';
import { resolveWithProduct, setSource, type Draft, type DraftLine, type LineSource, type PendingState } from '../draft';
import { retryDelayMs } from '../outbox';
import type { BodegaApi } from './api';

/**
 * Identificación de las líneas del borrador que esperan ser reconocidas (un
 * código o una foto), en tres pasos separados a propósito:
 *
 *   1. `pickNext`        elige UNA línea que toca intentar.
 *   2. `performIdentify` la consulta al servidor (lo único asíncrono) y devuelve
 *                        un resultado en forma de dato.
 *   3. `applyOutcome`    aplica ese resultado al borrador que haya en ESE momento.
 *
 * El paso 3 es aparte porque la consulta puede tardar (una foto espera su turno
 * de la IA): mientras tanto la persona puede haber cambiado cantidades o quitado
 * la línea. Aplicar el resultado al borrador vigente, y no a una copia vieja,
 * evita pisar lo que hizo mientras esperaba.
 *
 * Así el teléfono cuida la cuota de la IA:
 *  - UNA consulta a la vez (30 fotos seguidas se reconocen de a una, en segundo plano).
 *  - Los códigos (búsqueda en el catálogo, sin IA) pasan antes que las fotos.
 *  - Si el servidor dice "IA ocupada", TODAS las fotos esperan lo que pidió.
 *  - Sin señal, se reintenta con espera creciente y, tras varios fracasos, la línea
 *    pasa a "elige tú" para no quedar colgada.
 */

export interface IdentifyDeps {
  api: Pick<BodegaApi, 'lookupCode' | 'identify'>;
  getPhotoBlob: (photoId: string) => Promise<Blob | null>;
  now: () => number;
  random?: () => number;
}

/** Fracasos de red seguidos antes de entregarle la línea a la persona. */
export const MAX_NETWORK_ATTEMPTS = 6;

export type WaitingLine = DraftLine & { source: Extract<LineSource, { kind: 'code' | 'identify' }> };

export function isWaiting(line: DraftLine): line is WaitingLine {
  return line.source.kind === 'code' || line.source.kind === 'identify';
}

export type IdentifyOutcome =
  | { kind: 'product'; product: MobileProduct; confirmed: boolean; origin: 'code' | 'ai'; factor: number }
  | { kind: 'source'; source: LineSource }
  | { kind: 'auth'; status: 401 | 403; message: string };

export interface IdentifyResult {
  outcome: IdentifyOutcome;
  /** Hasta cuándo no se mandan fotos a la IA (lo pidió el servidor). */
  holdUntil: number;
}

function toProduct(candidate: MobileCandidate): MobileProduct {
  const { id, sku, name, brand, unit, barcode, imageUrl, tracksLots, isActive, stock, totalStock } = candidate;
  return { id, sku, name, brand, unit, barcode, imageUrl, tracksLots, isActive, stock, totalStock };
}

/** La línea que toca intentar ahora, o `null`. Códigos primero; fotos solo si ya pasó la espera de la IA. */
export function pickNext(draft: Draft, holdUntil: number, now: number): WaitingLine | null {
  const waiting = draft.lines.filter(isWaiting).sort((a, b) => a.createdAt - b.createdAt);
  const code = waiting.find((line) => line.source.kind === 'code' && line.source.pending.nextAttemptAt <= now);
  if (code) return code;
  if (now < holdUntil) return null;
  return waiting.find((line) => line.source.kind === 'identify' && line.source.pending.nextAttemptAt <= now) ?? null;
}

/** Cuándo volver a mirar el borrador, o `null` si no queda nada esperando. */
export function nextIdentifyWake(draft: Draft, holdUntil: number): number | null {
  const times = draft.lines.filter(isWaiting).map((line) => (line.source.kind === 'identify' ? Math.max(line.source.pending.nextAttemptAt, holdUntil) : line.source.pending.nextAttemptAt));
  return times.length > 0 ? Math.min(...times) : null;
}

function resolveSource(line: WaitingLine, reason: 'candidates' | 'new' | 'unreadable' | 'unavailable' | 'failed' | 'unknown-code', extra: { candidates?: MobileCandidate[]; read?: Extract<LineSource, { kind: 'resolve' }>['read']; message?: string | null; dropPhoto?: boolean }): LineSource {
  return {
    kind: 'resolve',
    reason,
    candidates: extra.candidates ?? [],
    read: extra.read ?? null,
    photoId: line.source.kind === 'identify' && !extra.dropPhoto ? line.source.photoId : null,
    code: line.source.kind === 'code' ? line.source.code : null,
    message: extra.message ?? null,
  };
}

/** Consulta al servidor por UNA línea y devuelve qué hacer con ella. No toca el borrador. */
export async function performIdentify(line: WaitingLine, warehouseId: string, holdUntilIn: number, deps: IdentifyDeps): Promise<IdentifyResult> {
  const { api, now } = deps;
  const random = deps.random ?? Math.random;
  const t = now();
  let holdUntil = holdUntilIn;
  const { source } = line;
  const pending: PendingState = source.pending;

  const result = (outcome: IdentifyOutcome): IdentifyResult => ({ outcome, holdUntil });
  const waitAgain = (next: PendingState): IdentifyResult => result({ kind: 'source', source: { ...source, pending: next } });
  const authFailure = (status: 401 | 403, message: string) => result({ kind: 'auth', status, message });

  /** Fallo sin respuesta útil: reintento con espera, o la persona decide si ya van muchos. */
  const networkFailure = (message: string, hintMs?: number): IdentifyResult => {
    const attempts = pending.attempts + 1;
    if (attempts >= MAX_NETWORK_ATTEMPTS) {
      return result({
        kind: 'source',
        source: resolveSource(line, 'failed', { message: 'No se pudo reconocer por falta de conexión. Búscalo a mano o vuelve a intentarlo.' }),
      });
    }
    return waitAgain({ attempts, nextAttemptAt: t + retryDelayMs(attempts - 1, { random, hintMs }), message });
  };

  if (source.kind === 'code') {
    const response = await api.lookupCode(source.code, warehouseId);
    if (response.ok) {
      const match = response.data.match;
      if (match) return result({ kind: 'product', product: toProduct(match), confirmed: true, origin: 'code', factor: match.factor });
      return result({ kind: 'source', source: resolveSource(line, 'unknown-code', { message: `El código ${source.code} no está en el catálogo.` }) });
    }
    const { failure } = response;
    if (failure.kind === 'auth') return authFailure(failure.status, failure.message);
    if (failure.kind === 'rate') return waitAgain({ ...pending, nextAttemptAt: t + failure.retryAfterMs, message: failure.message });
    if (failure.kind === 'client') return result({ kind: 'source', source: resolveSource(line, 'failed', { message: failure.message }) });
    return networkFailure('Sin conexión: el código se buscará solo.');
  }

  const blob = await deps.getPhotoBlob(source.photoId);
  if (!blob) {
    return result({
      kind: 'source',
      source: resolveSource(line, 'failed', { dropPhoto: true, message: 'La foto ya no está en el teléfono. Vuelve a sacarla o busca el producto a mano.' }),
    });
  }

  const response = await api.identify(blob, warehouseId);
  if (!response.ok) {
    const { failure } = response;
    if (failure.kind === 'auth') return authFailure(failure.status, failure.message);
    if (failure.kind === 'rate') {
      holdUntil = Math.max(holdUntil, t + failure.retryAfterMs);
      return { ...waitAgain({ ...pending, nextAttemptAt: holdUntil, message: 'Esperando turno de la IA…' }), holdUntil };
    }
    if (failure.kind === 'client') return result({ kind: 'source', source: resolveSource(line, 'failed', { message: failure.message }) });
    return networkFailure('Sin conexión: la foto se identificará sola.');
  }

  const data = response.data;
  const resolveWith = (reason: 'candidates' | 'new' | 'unreadable' | 'unavailable') =>
    result({ kind: 'source', source: resolveSource(line, reason, { candidates: data.candidates, read: data.read, message: data.message ?? null }) });

  switch (data.status) {
    case 'matched': {
      const best = data.candidates[0];
      if (!best) return resolveWith('new');
      // Un código de barras exacto es seguro; un parecido por texto lo confirma la persona.
      const exact = best.reason === 'barcode' || best.reason === 'packaging';
      return result({ kind: 'product', product: toProduct(best), confirmed: exact, origin: exact ? 'code' : 'ai', factor: best.factor });
    }
    case 'candidates':
      return resolveWith('candidates');
    case 'new':
      return resolveWith('new');
    case 'unreadable':
      return resolveWith('unreadable');
    case 'unavailable':
      return resolveWith('unavailable');
    case 'error':
      // Falla del proveedor (no saturación): cuenta como intento, para no insistir eternamente.
      return networkFailure(data.message ?? 'La IA no respondió: se reintentará sola.', data.retryAfterMs);
    case 'busy': {
      // Un "ocupado" no es un fracaso: no cuenta como intento. Toda foto espera lo que pidió el servidor.
      holdUntil = Math.max(holdUntil, t + (data.retryAfterMs ?? 15_000) + Math.round(random() * 1_500));
      return { ...waitAgain({ ...pending, nextAttemptAt: holdUntil, message: data.message ?? 'Esperando turno de la IA…' }), holdUntil };
    }
  }
}

/** Aplica el resultado al borrador vigente. Si la línea ya no existe (la quitaron), no hace nada. */
export function applyOutcome(draft: Draft, lineId: string, outcome: IdentifyOutcome): Draft {
  if (!draft.lines.some((line) => line.id === lineId)) return draft;
  if (outcome.kind === 'auth') return draft;
  if (outcome.kind === 'source') return setSource(draft, lineId, outcome.source);
  return resolveWithProduct(draft, lineId, outcome.product, { confirmed: outcome.confirmed, origin: outcome.origin, factor: outcome.factor });
}

export interface IdentifyPassResult {
  draft: Draft;
  holdUntil: number;
  wakeAt: number | null;
  auth: { status: 401 | 403; message: string } | null;
  worked: boolean;
}

/** Un pase completo sobre un borrador dado (elegir + consultar + aplicar). Útil donde no hay edición concurrente. */
export async function runIdentifyPass(draft: Draft, holdUntil: number, deps: IdentifyDeps): Promise<IdentifyPassResult> {
  const line = pickNext(draft, holdUntil, deps.now());
  if (!line) return { draft, holdUntil, wakeAt: nextIdentifyWake(draft, holdUntil), auth: null, worked: false };
  const result = await performIdentify(line, draft.warehouseId, holdUntil, deps);
  const next = applyOutcome(draft, line.id, result.outcome);
  const auth = result.outcome.kind === 'auth' ? { status: result.outcome.status, message: result.outcome.message } : null;
  return { draft: next, holdUntil: result.holdUntil, wakeAt: auth ? null : nextIdentifyWake(next, result.holdUntil), auth, worked: true };
}
