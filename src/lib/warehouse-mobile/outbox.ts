import type { SyncOperation } from '@/modules/warehouse-mobile/schema';
import type { OpResult } from '@/modules/warehouse-mobile/types';

/**
 * Cola de envío del celular: reglas puras de reintento y de estados.
 *
 * La bodega suele tener mala señal. Una operación que el bodeguero confirmó se
 * guarda en el teléfono y se reenvía hasta que el servidor responda; como lleva
 * siempre la misma `clientOpId`, reenviar nunca duplica (ver
 * `WarehouseMobileOp`). Nada de este archivo toca el navegador: el
 * almacenamiento (IndexedDB) y el reloj entran por parámetro, para poder
 * probar cada caso.
 */

export interface RetryOptions {
  baseMs?: number;
  maxMs?: number;
  /** Espera mínima que pidió el servidor (`retryAfterMs`). */
  hintMs?: number;
  /** Fuente de azar en [0, 1) para la variación; inyectable para probar. */
  random?: () => number;
}

export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 5 * 60_000;

/**
 * Espera antes del intento número `attempts + 1`. Crece al doble en cada
 * fracaso (2 s, 4 s, 8 s… hasta 5 min) con ±20 % de variación para que varios
 * celulares que recuperan la señal a la vez no golpeen juntos al servidor.
 * Si el servidor pidió esperar más, se respeta su pedido.
 */
export function retryDelayMs(attempts: number, options: RetryOptions = {}): number {
  const base = options.baseMs ?? RETRY_BASE_MS;
  const max = options.maxMs ?? RETRY_MAX_MS;
  const random = options.random ?? Math.random;
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempts));
  const jittered = exponential * (0.8 + random() * 0.4);
  const delay = Math.min(max, jittered);
  return Math.round(options.hintMs !== undefined ? Math.max(delay, options.hintMs) : delay);
}

export type OutboxStatus = 'queued' | 'sending' | 'rejected' | 'done';

export interface OutboxEntry {
  /** Igual a `op.clientOpId`. */
  id: string;
  op: SyncOperation;
  /** Foto guardada en el teléfono que se sube antes de enviar (producto nuevo). */
  photoId: string | null;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError: string | null;
  result: OpResult | null;
}

export function createOutboxEntry(op: SyncOperation, now: number, photoId: string | null = null): OutboxEntry {
  return { id: op.clientOpId, op, photoId, status: 'queued', attempts: 0, nextAttemptAt: now, createdAt: now, lastError: null, result: null };
}

/** Operaciones listas para enviar ahora, las más antiguas primero. */
export function pickDue(entries: readonly OutboxEntry[], now: number, max: number): OutboxEntry[] {
  return entries
    .filter((entry) => entry.status === 'queued' && entry.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, max);
}

/** Cuándo conviene volver a mirar la cola (el próximo reintento), o `null` si no hay nada pendiente. */
export function nextWakeAt(entries: readonly OutboxEntry[]): number | null {
  const queued = entries.filter((entry) => entry.status === 'queued').map((entry) => entry.nextAttemptAt);
  return queued.length > 0 ? Math.min(...queued) : null;
}

export function markSending(entries: readonly OutboxEntry[], ids: ReadonlySet<string>, now: number): OutboxEntry[] {
  return entries.map((entry) => (ids.has(entry.id) ? { ...entry, status: 'sending', nextAttemptAt: now } : entry));
}

/** Aplica la respuesta del servidor a la operación correspondiente. */
export function applyOpResult(entry: OutboxEntry, result: OpResult, now: number, options: RetryOptions = {}): OutboxEntry {
  switch (result.status) {
    case 'APPLIED':
      return { ...entry, status: 'done', result, lastError: null };
    case 'REJECTED':
      // El servidor entendió y dijo que no: reintentar igual no cambia nada. La
      // persona debe corregirla o descartarla.
      return { ...entry, status: 'rejected', result, lastError: result.message };
    case 'RETRY':
      return failedAttempt(entry, now, result.message, options);
  }
}

/** Un intento que no llegó a una respuesta (sin señal, servidor caído, foto sin subir). */
export function failedAttempt(entry: OutboxEntry, now: number, message: string, options: RetryOptions = {}): OutboxEntry {
  const attempts = entry.attempts + 1;
  return { ...entry, status: 'queued', attempts, nextAttemptAt: now + retryDelayMs(attempts - 1, options), lastError: message };
}

/**
 * Al abrir la app, lo que quedó "enviando" es de una sesión que se cerró a la
 * mitad: puede haber llegado o no. Vuelve a la cola; si ya se había aplicado,
 * la misma clave hace que el servidor responda sin repetirlo.
 */
export function recoverInterrupted(entries: readonly OutboxEntry[], now: number): OutboxEntry[] {
  return entries.map((entry) => (entry.status === 'sending' ? { ...entry, status: 'queued', nextAttemptAt: now } : entry));
}

export interface OutboxSummary {
  /** Esperando enviarse (incluye lo que se está enviando). */
  pending: number;
  /** Rechazadas por el servidor: necesitan atención de la persona. */
  rejected: number;
  done: number;
  /** Operaciones que ya fallaron varias veces seguidas: probablemente sin señal. */
  stalled: number;
}

export const STALLED_AFTER_ATTEMPTS = 3;

export function summarizeOutbox(entries: readonly OutboxEntry[]): OutboxSummary {
  const summary: OutboxSummary = { pending: 0, rejected: 0, done: 0, stalled: 0 };
  for (const entry of entries) {
    if (entry.status === 'queued' || entry.status === 'sending') {
      summary.pending++;
      if (entry.attempts >= STALLED_AFTER_ATTEMPTS) summary.stalled++;
    } else if (entry.status === 'rejected') summary.rejected++;
    else summary.done++;
  }
  return summary;
}

/** Lo ya enviado se conserva un rato para el historial y luego se limpia. */
export const DONE_RETENTION_MS = 24 * 60 * 60_000;

export function pruneDone(entries: readonly OutboxEntry[], now: number): OutboxEntry[] {
  return entries.filter((entry) => entry.status !== 'done' || now - entry.createdAt < DONE_RETENTION_MS);
}
