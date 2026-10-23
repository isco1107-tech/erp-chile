import type { AppliedOpResult } from '@/modules/warehouse-mobile/types';
import { applyOpResult, failedAttempt, markSending, nextWakeAt, pickDue, retryDelayMs, type OutboxEntry } from '../outbox';
import type { BodegaApi } from './api';
import type { BodegaStore } from './store';

/**
 * Un "pase" de envío de la cola. No tiene reloj propio ni temporizadores: el
 * llamador decide cuándo correrlo (al confirmar, al volver la señal, al abrir la
 * app, al vencer un reintento) y este archivo solo hace UN pase y dice qué pasó.
 *
 * Garantías:
 * - Nada se descarta por un error de red: la operación vuelve a la cola con la
 *   MISMA clave y espera (ver `outbox.ts`).
 * - La foto de un producto nuevo se sube antes de enviar la operación; si la
 *   subida falla, la operación espera (no se envía sin su foto).
 * - La foto de respaldo de una salida (merma, daño…) también se sube antes, pero a
 *   diferencia de la del producto NUNCA se descarta: la salida sin su foto no se
 *   registra. Si la foto ya no está en el teléfono o el servidor la rechaza, la
 *   salida queda rechazada para que la persona la rehaga.
 * - Si la sesión venció, nada se pierde ni se cuenta como intento fallido: la
 *   cola espera a que la persona vuelva a entrar.
 */

/** Fallos del servidor al subir la foto antes de crear el producto sin ella. */
export const PHOTO_SERVER_ATTEMPTS = 2;

export interface SyncDeps {
  api: Pick<BodegaApi, 'sync' | 'uploadPhoto' | 'uploadEvidence'>;
  store: Pick<BodegaStore, 'getPhoto' | 'deletePhoto' | 'saveOutboxEntry'>;
  now: () => number;
  random?: () => number;
  /** Operaciones por envío (el servidor acepta hasta `limits.maxOpsPerBatch`). */
  maxBatch: number;
}

export interface SyncPassResult {
  entries: OutboxEntry[];
  /** La sesión venció (401) o no hay permiso (403): hay que iniciar sesión de nuevo. */
  auth: { status: 401 | 403; message: string } | null;
  /** Algo se intentó en este pase (para decidir si vale correr otro enseguida). */
  worked: boolean;
  /** Cuándo mirar la cola otra vez, o `null` si no hay nada que reintentar. */
  wakeAt: number | null;
  applied: AppliedOpResult[];
}

/** Rechazo hecho en el propio teléfono: la persona debe rehacer o descartar la operación. */
function rejectedLocally(entry: OutboxEntry, message: string): OutboxEntry {
  return { ...entry, status: 'rejected', lastError: message, result: { clientOpId: entry.id, status: 'REJECTED', code: 'INVALID', message } };
}

function replaceEntries(entries: readonly OutboxEntry[], changed: readonly OutboxEntry[]): OutboxEntry[] {
  const byId = new Map(changed.map((entry) => [entry.id, entry]));
  return entries.map((entry) => byId.get(entry.id) ?? entry);
}

export async function runSyncPass(initial: readonly OutboxEntry[], deps: SyncDeps): Promise<SyncPassResult> {
  const { api, store, now, maxBatch } = deps;
  const retry = deps.random ? { random: deps.random } : {};
  let entries = [...initial];
  const startedAt = now();
  const due = pickDue(entries, startedAt, maxBatch);

  if (due.length === 0) return { entries, auth: null, worked: false, wakeAt: nextWakeAt(entries), applied: [] };

  const persist = async (changed: readonly OutboxEntry[]) => {
    entries = replaceEntries(entries, changed);
    await Promise.all(changed.map((entry) => store.saveOutboxEntry(entry)));
  };

  // Se marcan "enviando" para que dos pases no tomen lo mismo.
  const ids = new Set(due.map((entry) => entry.id));
  entries = markSending(entries, ids, startedAt);
  await persist(entries.filter((entry) => ids.has(entry.id)));

  let auth: SyncPassResult['auth'] = null;
  const ready: OutboxEntry[] = [];

  // 1. Fotos de productos nuevos.
  for (const id of ids) {
    let entry = entries.find((candidate) => candidate.id === id);
    if (!entry) continue;
    if (auth) {
      // Ya se supo que no hay sesión: lo demás vuelve a la cola sin contar como intento.
      await persist([{ ...entry, status: 'queued', nextAttemptAt: startedAt }]);
      continue;
    }
    const { op } = entry;
    if (op.kind === 'CREATE_PRODUCT' && entry.photoId && !op.product.imageUrl) {
      const photo = await store.getPhoto(entry.photoId);
      if (!photo) {
        // La foto ya no está en el teléfono: el producto se crea igual, sin foto.
        entry = { ...entry, photoId: null };
      } else {
        const uploaded = await api.uploadPhoto(photo.blob, entry.id);
        if (!uploaded.ok) {
          const { failure } = uploaded;
          if (failure.kind === 'auth') {
            auth = { status: failure.status, message: failure.message };
            await persist([{ ...entry, status: 'queued', nextAttemptAt: startedAt }]);
          } else if (failure.kind === 'rate') {
            await persist([{ ...entry, status: 'queued', nextAttemptAt: now() + failure.retryAfterMs, lastError: failure.message }]);
          } else if (failure.kind === 'client' || (failure.kind === 'server' && entry.attempts >= PHOTO_SERVER_ATTEMPTS)) {
            // La foto no sirve (formato, tamaño) o el almacenamiento falla una y otra vez: la foto es un
            // adorno, el producto no. Se crea sin ella en vez de dejarlo bloqueado para siempre.
            entry = { ...entry, photoId: null };
          } else {
            await persist([failedAttempt(entry, now(), failure.message, retry)]);
          }
          if (failure.kind === 'auth' || failure.kind === 'rate' || (failure.kind !== 'client' && entry.photoId !== null)) continue;
        } else {
          entry = { ...entry, op: { ...op, product: { ...op.product, imageUrl: uploaded.data.url } } };
        }
      }
      await persist([entry]);
    }
    if (op.kind === 'MOVE' && entry.photoId && !op.evidenceUrl) {
      const photo = await store.getPhoto(entry.photoId);
      if (!photo) {
        await persist([rejectedLocally(entry, 'La foto de respaldo ya no está en el teléfono. Descarta este movimiento y regístralo de nuevo con una foto.')]);
        continue;
      }
      const uploaded = await api.uploadEvidence(photo.blob, entry.id);
      if (!uploaded.ok) {
        const { failure } = uploaded;
        if (failure.kind === 'auth') {
          auth = { status: failure.status, message: failure.message };
          await persist([{ ...entry, status: 'queued', nextAttemptAt: startedAt }]);
        } else if (failure.kind === 'rate') {
          await persist([{ ...entry, status: 'queued', nextAttemptAt: now() + failure.retryAfterMs, lastError: failure.message }]);
        } else if (failure.kind === 'client') {
          await persist([rejectedLocally(entry, `La foto de respaldo no se pudo subir: ${failure.message}`)]);
        } else {
          await persist([failedAttempt(entry, now(), failure.message, retry)]);
        }
        continue;
      }
      entry = { ...entry, op: { ...op, evidenceUrl: uploaded.data.url } };
      await persist([entry]);
    }
    ready.push(entry);
  }

  if (ready.length === 0) return { entries, auth, worked: true, wakeAt: nextWakeAt(entries), applied: [] };

  // 2. Un solo envío con todo lo que está listo.
  const response = await api.sync(ready.map((entry) => entry.op));
  const applied: AppliedOpResult[] = [];

  if (!response.ok) {
    const { failure } = response;
    if (failure.kind === 'auth') {
      auth = { status: failure.status, message: failure.message };
      await persist(ready.map((entry) => ({ ...entry, status: 'queued' as const, nextAttemptAt: startedAt })));
    } else if (failure.kind === 'rate') {
      await persist(ready.map((entry) => ({ ...entry, status: 'queued' as const, nextAttemptAt: now() + failure.retryAfterMs, lastError: failure.message })));
    } else if (failure.kind === 'client') {
      // El servidor rechazó el envío entero (cuerpo inválido o demasiado grande): reintentar igual no sirve.
      await persist(
        ready.map((entry) => ({
          ...entry,
          status: 'rejected' as const,
          lastError: failure.message,
          result: { clientOpId: entry.id, status: 'REJECTED' as const, code: 'INVALID' as const, message: failure.message },
        }))
      );
    } else {
      await persist(ready.map((entry) => failedAttempt(entry, now(), failure.message, retry)));
    }
    return { entries, auth, worked: true, wakeAt: nextWakeAt(entries), applied };
  }

  const byId = new Map(response.data.results.map((result) => [result.clientOpId, result]));
  const settled: OutboxEntry[] = [];
  for (const entry of ready) {
    const result = byId.get(entry.id);
    if (!result) {
      settled.push(failedAttempt(entry, now(), 'El servidor no respondió esta operación.', retry));
      continue;
    }
    const next = applyOpResult(entry, result, now(), retry);
    settled.push(next);
    if (result.status === 'APPLIED') {
      applied.push(result);
      if (entry.photoId) await store.deletePhoto(entry.photoId);
    }
  }
  await persist(settled);
  return { entries, auth, worked: true, wakeAt: nextWakeAt(entries), applied };
}

/** Espera hasta el próximo reintento (para el temporizador del llamador), nunca menos de 1 s ni más de 5 min. */
export function sleepUntil(wakeAt: number | null, now: number): number | null {
  if (wakeAt === null) return null;
  return Math.min(5 * 60_000, Math.max(1_000, wakeAt - now));
}

export { retryDelayMs };
