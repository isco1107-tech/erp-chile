import { syncOfflineOperationAction } from '@/modules/offline/actions/offline.actions';
import { applyOutcome, isPrunable, syncOrder, type QueuedOperation } from './queue-rules';
import { deleteOperation, listOperations, saveOperation } from './queue-store';

/**
 * Envía al servidor lo hecho sin conexión, en el orden en que se hizo.
 *
 * - Un solo envío a la vez en todo el navegador (Web Locks): dos pestañas no
 *   mandan la misma operación en paralelo (el servidor igual lo resistiría).
 * - Se detiene al primer corte de red: el resto queda para la próxima vez,
 *   sin perder el orden.
 * - Una operación rechazada no frena a las siguientes: queda marcada para
 *   corregirla y reintentarla.
 */

export interface SyncRunResult {
  sent: number;
  failed: number;
  /** Se cortó la red o la sesión no permitió seguir; lo que falta queda pendiente. */
  stoppedEarly: boolean;
  /** Último motivo por el que el servidor no aceptó intentar (sesión, otra empresa). */
  message: string | null;
}

async function withQueueLock<T>(task: () => Promise<T>): Promise<T | null> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    // ifAvailable: si otra pestaña ya está sincronizando, esta no espera.
    return navigator.locks.request('aether-offline-sync', { ifAvailable: true }, async (lock) => (lock ? task() : null));
  }
  return task();
}

export async function syncQueue(companyId: string, userId: string): Promise<SyncRunResult | null> {
  return withQueueLock(async () => {
    const result: SyncRunResult = { sent: 0, failed: 0, stoppedEarly: false, message: null };
    const all = await listOperations();
    for (const op of all.filter((item) => isPrunable(item))) await deleteOperation(op.idempotencyKey);

    for (const op of syncOrder(all, companyId, userId)) {
      let response: Awaited<ReturnType<typeof syncOfflineOperationAction>>;
      try {
        response = await syncOfflineOperationAction(toRequest(op));
      } catch {
        // Sin red (o el servidor no respondió): se reintenta más tarde.
        result.stoppedEarly = true;
        break;
      }
      if (!response.success) {
        // No se pudo ni intentar (sesión vencida, otra empresa): queda pendiente.
        await saveOperation({ ...op, error: response.error });
        result.stoppedEarly = true;
        result.message = response.error;
        break;
      }
      const updated = applyOutcome(op, response.data);
      await saveOperation(updated);
      if (updated.status === 'DONE') result.sent += 1;
      else result.failed += 1;
    }
    return result;
  });
}

function toRequest(op: QueuedOperation) {
  const common = {
    companyId: op.companyId,
    capturedBy: op.userId,
    idempotencyKey: op.idempotencyKey,
    capturedAt: op.capturedAt,
    retry: op.retry ?? false,
    payload: op.payload,
  };
  return op.kind === 'POS_SALE' ? { ...common, kind: op.kind, shiftId: op.shiftId ?? '' } : { ...common, kind: op.kind };
}
