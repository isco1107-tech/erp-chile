/**
 * Genealogía de un lote (de dónde vino y adónde fue), como funciones puras.
 *
 * Sirve para un retiro del mercado: dado un lote, qué proveedor lo trajo, en qué
 * documento entró, en qué se transformó, a qué clientes llegó y cuánto queda en
 * bodega. Nada se inventa: lo que no se puede enlazar a un documento se informa
 * como «sin documento enlazado», no se adivina.
 */

const EPSILON = 1e-9;

/** Cantidad de un lote dentro del reparto por lote (`InventoryMovement.lotAllocations`). */
export function quantityForLot(raw: unknown, lotNumber: string): number {
  if (!Array.isArray(raw)) return 0;
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.lotNumber === lotNumber && typeof record.quantity === 'number') total += record.quantity;
  }
  return total;
}

/** Todos los lotes distintos que toca un reparto, con su cantidad. */
export function lotsInAllocations(raw: unknown): Array<{ lotNumber: string; quantity: number }> {
  if (!Array.isArray(raw)) return [];
  const byLot = new Map<string, number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.lotNumber !== 'string' || typeof record.quantity !== 'number') continue;
    byLot.set(record.lotNumber, (byLot.get(record.lotNumber) ?? 0) + record.quantity);
  }
  return [...byLot].map(([lotNumber, quantity]) => ({ lotNumber, quantity }));
}

export type LotMovementClass = 'ENTRY' | 'SALE' | 'RETURN' | 'PRODUCTION_USE' | 'WRITE_OFF' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'OTHER_IN' | 'OTHER_OUT';

export const LOT_MOVEMENT_LABELS: Record<LotMovementClass, string> = {
  ENTRY: 'Entrada',
  SALE: 'Venta',
  RETURN: 'Devolución de cliente',
  PRODUCTION_USE: 'Usado en producción',
  WRITE_OFF: 'Salida o pérdida',
  TRANSFER_OUT: 'Traslado (sale)',
  TRANSFER_IN: 'Traslado (entra)',
  OTHER_IN: 'Ajuste de entrada',
  OTHER_OUT: 'Ajuste de salida',
};

export interface ClassifiableMovement {
  type: 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER';
  previousStock: number;
  newStock: number;
  sourceKind: string | null;
}

/** Qué papel juega un movimiento en la vida de un lote. */
export function classifyLotMovement(movement: ClassifiableMovement): LotMovementClass {
  switch (movement.type) {
    case 'PURCHASE_IN':
      return 'ENTRY';
    case 'SALE_OUT':
      return 'SALE';
    case 'TRANSFER':
      return movement.newStock < movement.previousStock ? 'TRANSFER_OUT' : 'TRANSFER_IN';
    case 'ADJUSTMENT_IN':
      if (movement.sourceKind === 'SALES_DOCUMENT') return 'RETURN';
      if (movement.sourceKind === 'PRODUCTION_ORDER') return 'ENTRY';
      return 'OTHER_IN';
    case 'ADJUSTMENT_OUT':
      return movement.sourceKind === 'PRODUCTION_ORDER' ? 'PRODUCTION_USE' : movement.sourceKind === 'SALES_DOCUMENT' ? 'WRITE_OFF' : 'WRITE_OFF';
    default:
      return 'OTHER_OUT';
  }
}

const INFLOW: ReadonlySet<LotMovementClass> = new Set(['ENTRY', 'RETURN', 'OTHER_IN', 'TRANSFER_IN']);

export function isLotInflow(cls: LotMovementClass): boolean {
  return INFLOW.has(cls);
}

export interface LotReconciliation {
  /** Lo que entró al lote (entradas, ajustes y devoluciones; los traslados se anulan entre sí). */
  received: number;
  /** Lo que salió (ventas, producción, pérdidas; sin traslados). */
  dispatched: number;
  /** Lo que el lote tiene hoy en bodegas. */
  inStock: number;
  /** received − dispatched − inStock. Distinto de cero = hay movimientos del lote sin registrar o anteriores al seguimiento. */
  unexplained: number;
  balanced: boolean;
}

export function reconcileLot(rows: ReadonlyArray<{ cls: LotMovementClass; quantity: number }>, inStock: number): LotReconciliation {
  let received = 0;
  let dispatched = 0;
  for (const row of rows) {
    if (row.cls === 'TRANSFER_IN' || row.cls === 'TRANSFER_OUT') continue;
    if (isLotInflow(row.cls)) received += row.quantity;
    else dispatched += row.quantity;
  }
  const unexplained = Math.round((received - dispatched - inStock) * 1e6) / 1e6;
  return { received, dispatched, inStock, unexplained, balanced: Math.abs(unexplained) < EPSILON * 1e3 };
}

export interface CustomerHit {
  contactId: string;
  name: string;
  rut: string;
  /** Unidades netas del lote que recibió (ventas menos devoluciones). */
  quantity: number;
  documents: string[];
  firstAt: Date;
  lastAt: Date;
}

export interface CustomerMovementRow {
  contactId: string;
  name: string;
  rut: string;
  /** Con signo: venta positiva, devolución negativa. */
  quantity: number;
  document: string;
  at: Date;
}

/** Clientes alcanzados por un lote, con lo neto que recibió cada uno. Los que devolvieron todo quedan fuera. */
export function aggregateCustomers(rows: readonly CustomerMovementRow[]): CustomerHit[] {
  const byContact = new Map<string, CustomerHit>();
  for (const row of rows) {
    const hit = byContact.get(row.contactId);
    if (!hit) {
      byContact.set(row.contactId, { contactId: row.contactId, name: row.name, rut: row.rut, quantity: row.quantity, documents: [row.document], firstAt: row.at, lastAt: row.at });
      continue;
    }
    hit.quantity += row.quantity;
    if (!hit.documents.includes(row.document)) hit.documents.push(row.document);
    if (row.at < hit.firstAt) hit.firstAt = row.at;
    if (row.at > hit.lastAt) hit.lastAt = row.at;
  }
  return [...byContact.values()].filter((hit) => hit.quantity > EPSILON).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'es'));
}

/** Porcentaje del lote recibido que ya llegó a clientes (0 si no se recibió nada). */
export function distributedShare(received: number, soldNet: number): number {
  if (received <= EPSILON) return 0;
  return Math.min(100, Math.max(0, Math.round((soldNet / received) * 1000) / 10));
}
