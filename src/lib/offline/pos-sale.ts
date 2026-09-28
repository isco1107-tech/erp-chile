import type { QueuedOperation } from './queue-rules';

/**
 * Venta del POS hecha sin conexión (docs/adr/0002): lo que se guarda en la
 * cola y cómo se ve en el equipo mientras no se sincroniza. Sin navegador ni
 * base de datos, para probarlo solo.
 */

export interface OfflineSaleItem {
  productId: string;
  quantity: number;
}

export interface OfflineSalePayload {
  items: OfflineSaleItem[];
  paymentMethod: string;
  cashReceived?: number;
  customerRut?: string;
}

/** Clave de la copia del catálogo de una bodega en el equipo. Incluye la empresa. */
export function posCatalogKey(companyId: string, warehouseId: string): string {
  return `pos-catalog:${companyId}:${warehouseId}`;
}

/**
 * Número del comprobante provisorio: hora local de la venta más el final de
 * la clave, para que dos ventas en el mismo segundo no se confundan. No es un
 * folio: la boleta recibe el suyo al sincronizar.
 */
export function provisionalNumber(at: Date, idempotencyKey: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const suffix = idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return `P-${time}-${suffix}`;
}

/**
 * La venta como queda en la cola. La clave es la misma con que se intentó en
 * línea: si ese intento alcanzó a registrarse, al sincronizar el servidor
 * devuelve esa misma venta en vez de crear otra.
 */
export function buildOfflineSale(input: {
  companyId: string;
  userId: string;
  shiftId: string;
  idempotencyKey: string;
  payload: OfflineSalePayload;
  totalLabel: string;
  capturedAt: Date;
}): QueuedOperation {
  const localNumber = provisionalNumber(input.capturedAt, input.idempotencyKey);
  return {
    idempotencyKey: input.idempotencyKey,
    companyId: input.companyId,
    userId: input.userId,
    kind: 'POS_SALE',
    shiftId: input.shiftId,
    payload: { ...input.payload },
    capturedAt: input.capturedAt.toISOString(),
    status: 'PENDING',
    label: `Venta ${input.totalLabel} · ${localNumber}`,
    localNumber,
  };
}

/**
 * Descuenta del catálogo en pantalla lo vendido sin conexión, para que la
 * próxima venta avise si no alcanza. Solo productos con control de stock;
 * el servidor vuelve a validar todo al sincronizar.
 */
export function applySaleToStock<P extends { id: string; stock: number; isTrackable: boolean }>(products: P[], items: OfflineSaleItem[]): P[] {
  const sold = new Map<string, number>();
  for (const item of items) sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.quantity);
  return products.map((product) => {
    const quantity = sold.get(product.id);
    return quantity && product.isTrackable ? { ...product, stock: product.stock - quantity } : product;
  });
}

/** Ventas de este turno hechas sin conexión que todavía no quedan registradas. */
export function unsyncedShiftSales(operations: QueuedOperation[], shiftId: string): QueuedOperation[] {
  return operations.filter((op) => op.kind === 'POS_SALE' && op.shiftId === shiftId && op.status !== 'DONE');
}
