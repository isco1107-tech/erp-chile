import { OFFLINE_WINDOW_MS } from '@/modules/offline/schema';

/**
 * Reglas de la cola de contingencia (docs/adr/0002), sin navegador ni base de
 * datos, para poder probarlas solas. El almacenamiento está en queue-store.ts
 * y el envío en sync.ts.
 */

export type OfflineKind = 'POS_SALE' | 'STOCK_MOVEMENT' | 'PURCHASE' | 'GOODS_RECEIPT';

/**
 * PENDING: hecha sin conexión, falta enviarla.
 * FAILED: el servidor la rechazó y NO quedó aplicada: se corrige y reintenta.
 * REVIEW: quedó a medias en el servidor; alguien la revisa antes de repetirla.
 * DONE: aplicada.
 */
export type QueueStatus = 'PENDING' | 'FAILED' | 'REVIEW' | 'DONE';

export interface QueuedOperation {
  idempotencyKey: string;
  companyId: string;
  /** Quien la hizo: solo esa persona la sincroniza. */
  userId: string;
  kind: OfflineKind;
  shiftId?: string;
  payload: Record<string, unknown>;
  /** Hora del equipo (ISO). */
  capturedAt: string;
  status: QueueStatus;
  /** Para mostrarla en la lista: "Venta $12.500", "Entrada 5 × Café". */
  label: string;
  /** Número del comprobante provisorio (ventas del POS). */
  localNumber?: string;
  error?: string | null;
  resultRef?: string | null;
  folio?: number | null;
  /** Reintento explícito pedido por la persona (tras corregir). */
  retry?: boolean;
}

export interface SyncOutcome {
  status: 'DONE' | 'FAILED' | 'PROCESSING';
  resultRef: string | null;
  folio: number | null;
  error: string | null;
}

/** Lo que esta persona, en esta empresa, tiene por enviar, en el orden en que lo hizo. */
export function syncOrder(operations: QueuedOperation[], companyId: string, userId: string): QueuedOperation[] {
  return operations
    .filter((op) => op.companyId === companyId && op.userId === userId && op.status === 'PENDING')
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/**
 * `null` si se puede seguir operando sin conexión; si no, el motivo. El plazo
 * corre desde la operación más antigua todavía sin enviar: pasadas 2 horas,
 * no se aceptan operaciones nuevas hasta volver a conectarse.
 */
export function offlineCaptureBlock(operations: QueuedOperation[], companyId: string, now: Date = new Date()): string | null {
  const pending = operations.filter((op) => op.companyId === companyId && op.status === 'PENDING');
  if (pending.length === 0) return null;
  const oldest = Math.min(...pending.map((op) => new Date(op.capturedAt).getTime()));
  if (now.getTime() - oldest > OFFLINE_WINDOW_MS) {
    return 'Llevas más de 2 horas sin conexión. Para seguir, vuelve a conectarte y deja que se sincronice lo pendiente.';
  }
  return null;
}

/** Aplica la respuesta del servidor a la operación guardada en el equipo. */
export function applyOutcome(op: QueuedOperation, outcome: SyncOutcome): QueuedOperation {
  if (outcome.status === 'DONE') {
    return { ...op, status: 'DONE', error: null, resultRef: outcome.resultRef, folio: outcome.folio ?? op.folio ?? null, retry: false };
  }
  if (outcome.status === 'FAILED') return { ...op, status: 'FAILED', error: outcome.error ?? 'La operación fue rechazada', retry: false };
  return { ...op, status: 'REVIEW', error: 'Quedó a medias al sincronizar: revisa en el sistema si se aplicó antes de repetirla', retry: false };
}

/** Pide reintentar una operación rechazada (después de corregir lo que faltaba). */
export function markForRetry(op: QueuedOperation): QueuedOperation {
  return op.status === 'FAILED' ? { ...op, status: 'PENDING', error: null, retry: true } : op;
}

export interface QueueSummary {
  pending: number;
  failed: number;
  review: number;
  /** De otra empresa o de otra persona en este equipo: no se envían con esta sesión. */
  foreign: number;
}

export function summarize(operations: QueuedOperation[], companyId: string, userId: string): QueueSummary {
  const summary: QueueSummary = { pending: 0, failed: 0, review: 0, foreign: 0 };
  for (const op of operations) {
    if (op.status === 'DONE') continue;
    if (op.companyId !== companyId || op.userId !== userId) summary.foreign += 1;
    else if (op.status === 'PENDING') summary.pending += 1;
    else if (op.status === 'FAILED') summary.failed += 1;
    else summary.review += 1;
  }
  return summary;
}

/** Las aplicadas se guardan un día (para reimprimir o consultar) y después se borran del equipo. */
export function isPrunable(op: QueuedOperation, now: Date = new Date()): boolean {
  return op.status === 'DONE' && now.getTime() - new Date(op.capturedAt).getTime() > 24 * 60 * 60 * 1000;
}

/** Clave de la operación: la genera el equipo al capturarla. */
export function newOperationKey(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `off-${random}`;
}
