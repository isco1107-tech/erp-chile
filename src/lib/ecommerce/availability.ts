/**
 * Lo que se puede vender por internet de un producto: el stock físico de la bodega
 * de la tienda, menos lo apartado para pedidos que se están pagando y lo
 * comprometido en notas de venta abiertas. Es la misma idea de «disponible =
 * stock − comprometido» que ya usa el ERP al vender.
 */

export function availableUnits(input: { onHand: number; reservedByStore: number; committedBySalesOrders?: number }): number {
  const free = input.onHand - input.reservedByStore - (input.committedBySalesOrders ?? 0);
  return Math.max(0, Math.floor(free + 1e-9));
}

/** Un producto sin control de stock (servicio, o `isTrackable` apagado) siempre se puede pedir. */
export type StockState = 'in_stock' | 'low' | 'out';

export interface StockLabel {
  state: StockState;
  text: string;
}

export const LOW_STOCK_THRESHOLD = 5;

export function stockLabel(available: number | null): StockLabel {
  if (available === null) return { state: 'in_stock', text: 'Disponible' };
  if (available <= 0) return { state: 'out', text: 'Agotado' };
  if (available <= LOW_STOCK_THRESHOLD) return { state: 'low', text: available === 1 ? 'Última unidad' : `Últimas ${available} unidades` };
  return { state: 'in_stock', text: 'Disponible' };
}

/** Cuántas unidades se pueden pedir de verdad: no más que lo disponible ni que el tope por pedido. `null` = sin tope de stock. */
export function purchasableQuantity(requested: number, available: number | null, maxPerOrder?: number | null): number {
  let allowed = Math.max(0, Math.floor(requested));
  if (maxPerOrder) allowed = Math.min(allowed, maxPerOrder);
  if (available !== null) allowed = Math.min(allowed, available);
  return allowed;
}
