import { newOperationKey, type OfflineKind, type QueuedOperation } from './queue-rules';

/**
 * Pantalla "Modo sin conexión" (docs/adr/0002): movimientos de stock, compras
 * y recepciones de OC que se registran sin red y se envían al volver. Sin
 * navegador ni base de datos, para probarlo solo.
 */

export type ContingencyForm = Exclude<OfflineKind, 'POS_SALE'>;

/** Tipos de movimiento que se ofrecen sin conexión. Las compras van por su propio formulario. */
export const OFFLINE_MOVEMENT_TYPES = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER'] as const;
export type OfflineMovementType = (typeof OFFLINE_MOVEMENT_TYPES)[number];

export const OFFLINE_MOVEMENT_LABELS: Record<OfflineMovementType, string> = {
  ADJUSTMENT_IN: 'Entrada',
  ADJUSTMENT_OUT: 'Salida',
  TRANSFER: 'Traslado',
};

/** Documentos de compra que se aceptan sin conexión: los que ingresan mercadería. Notas de crédito/débito, en línea. */
export const OFFLINE_PURCHASE_TYPES = ['FACTURA', 'BOLETA', 'GUIA_DESPACHO'] as const;
export type OfflinePurchaseType = (typeof OFFLINE_PURCHASE_TYPES)[number];

/** Clave de la copia de datos de cada formulario. Incluye la empresa. */
export function contingencySnapshotKey(form: ContingencyForm, companyId: string): string {
  return `contingency:${form}:${companyId}`;
}

/** Fecha de hoy en Chile (AAAA-MM-DD), para la fecha de emisión de una compra. */
export function todayInChile(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const quantityFormat = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 });

export function movementLabel(type: OfflineMovementType, quantity: number, productName: string): string {
  return `${OFFLINE_MOVEMENT_LABELS[type]} ${quantityFormat.format(quantity)} × ${productName}`;
}

export function purchaseLabel(documentLabel: string, folio: string, supplierName: string): string {
  return `${documentLabel} ${folio.trim()} · ${supplierName}`;
}

export function receiptLabel(orderFolio: number, supplierName: string): string {
  return `Recepción OC #${orderFolio} · ${supplierName}`;
}

/** Operación lista para la cola. La clave nace en el equipo. */
export function buildContingencyOperation(input: {
  companyId: string;
  userId: string;
  kind: ContingencyForm;
  payload: Record<string, unknown>;
  label: string;
  capturedAt?: Date;
  idempotencyKey?: string;
}): QueuedOperation {
  return {
    idempotencyKey: input.idempotencyKey ?? newOperationKey(),
    companyId: input.companyId,
    userId: input.userId,
    kind: input.kind,
    payload: { ...input.payload },
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    status: 'PENDING',
    label: input.label,
  };
}

interface ReceiptLineLike {
  id: string;
  pending: number;
}

/**
 * Lo que falta recibir de cada línea de OC descontando las recepciones que
 * ya están en la cola sin aplicar (pendientes, rechazadas o por revisar): sin
 * esto, recibir dos veces lo mismo sin conexión se descubriría recién al
 * sincronizar. Nunca baja de cero.
 */
export function pendingAfterQueue<L extends ReceiptLineLike>(lines: L[], orderId: string, operations: QueuedOperation[]): L[] {
  const queued = new Map<string, number>();
  for (const op of operations) {
    if (op.kind !== 'GOODS_RECEIPT' || op.status === 'DONE' || op.payload.orderId !== orderId) continue;
    const items = Array.isArray(op.payload.items) ? op.payload.items : [];
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const { orderItemId, quantity } = item as { orderItemId?: unknown; quantity?: unknown };
      if (typeof orderItemId === 'string' && typeof quantity === 'number') queued.set(orderItemId, (queued.get(orderItemId) ?? 0) + quantity);
    }
  }
  return lines.map((line) => ({ ...line, pending: Math.max(0, line.pending - (queued.get(line.id) ?? 0)) }));
}
