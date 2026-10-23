/**
 * Lo que ve un proveedor de su inventario: estado del stock y cobertura. Puro y sin
 * datos inventados — si no hay ventas que lo respalden, no hay cobertura que mostrar.
 */

export type StockStatus = 'OUT' | 'LOW' | 'OK';

/** Ventana con la que se mide cuánto sale. */
export const MOVEMENT_WINDOW_DAYS = 30;

/**
 * `OUT` sin existencias; `LOW` si hay y están en o bajo el mínimo que la empresa fijó
 * (un mínimo en cero significa "sin mínimo": nunca avisa); `OK` en el resto.
 */
export function stockStatus(total: number, minStock: number): StockStatus {
  if (total <= 0) return 'OUT';
  if (minStock > 0 && total <= minStock) return 'LOW';
  return 'OK';
}

/**
 * Días que alcanzan las existencias al ritmo de venta de la ventana. `null` cuando no hubo
 * ventas: sin ritmo no se puede estimar nada y no se inventa un número.
 */
export function coverageDays(total: number, soldInWindow: number, windowDays = MOVEMENT_WINDOW_DAYS): number | null {
  if (!(soldInWindow > 0) || windowDays <= 0) return null;
  if (total <= 0) return 0;
  return Math.floor(total / (soldInWindow / windowDays));
}

export interface StatusCounts {
  products: number;
  out: number;
  low: number;
}

export function countStatuses(rows: ReadonlyArray<{ status: StockStatus }>): StatusCounts {
  return {
    products: rows.length,
    out: rows.filter((row) => row.status === 'OUT').length,
    low: rows.filter((row) => row.status === 'LOW').length,
  };
}

/** Redondeo de cantidades para mostrar (kilos y litros llevan hasta 3 decimales). */
export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}
