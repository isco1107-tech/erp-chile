/**
 * Stock muerto (Métricas de retail): productos con stock en una bodega que no
 * rotan. Funciones puras; el servicio les pasa las fechas que sacó del kardex.
 *
 * Reglas:
 * - "Rotar" es salir por venta o por traslado a otra bodega (la trastienda rota
 *   cuando surte la sala). Mermas y ajustes no cuentan.
 * - Lo recién llegado no está muerto: el reloj corre desde la última salida o
 *   desde que el producto volvió a tener stock después de estar agotado, lo
 *   que sea más reciente. Una reposición sobre stock que ya estaba no reinicia
 *   nada: lo que estaba sigue sin venderse.
 * - La sugerencia es una pista simple sobre datos reales (vencimiento, si
 *   alguna vez se vendió, cuánto lleva detenido), no un pronóstico.
 */

export const DEAD_STOCK_DAY_OPTIONS = [15, 30, 45, 60, 90] as const;
export type DeadStockDays = (typeof DEAD_STOCK_DAY_OPTIONS)[number];

export const DEFAULT_DEAD_STOCK_SETTINGS = { deadStockDays: 30 as DeadStockDays, deadStockAlerts: true };

/** Un producto cuenta como "vence pronto" para la sugerencia dentro de estos días. */
export const EXPIRY_SUGGESTION_DAYS = 30;

const DAY_MS = 86_400_000;

export function isDeadStockDays(value: number): value is DeadStockDays {
  return (DEAD_STOCK_DAY_OPTIONS as readonly number[]).includes(value);
}

/** Lo que el kardex dice de un producto en una bodega. */
export interface DeadStockTimeline {
  /** Última venta o traslado hacia otra bodega. */
  lastOutAt: Date | null;
  /** Última vez que pasó de no tener stock a tenerlo. */
  restockedAt: Date | null;
  /** Primer movimiento del producto en la bodega. */
  firstMovementAt: Date | null;
}

/** Desde cuándo corre el reloj: la última salida o el último reabastecimiento desde cero, lo más reciente. */
export function stoppedSince(timeline: DeadStockTimeline): Date | null {
  const candidates = [timeline.lastOutAt, timeline.restockedAt ?? timeline.firstMovementAt].filter((date): date is Date => date !== null);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

/** Días completos transcurridos (nunca negativos). */
export function daysBetween(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

export type DeadStockSuggestion = 'EXPIRED' | 'EXPIRING' | 'NEVER_SOLD' | 'LONG_STOPPED' | 'STOPPED';

export const DEAD_STOCK_SUGGESTIONS: Record<DeadStockSuggestion, string> = {
  EXPIRED: 'Tiene un lote vencido: retíralo de la venta y regístralo como merma.',
  EXPIRING: 'Vence pronto: ofrécelo en una degustación o con rebaja antes de que se pierda.',
  NEVER_SOLD: 'Nunca se ha vendido en esta bodega: revisa su ubicación y su precio, o si conviene devolverlo al proveedor.',
  LONG_STOPPED: 'Lleva mucho tiempo detenido: considera liquidarlo o devolverlo al proveedor.',
  STOPPED: 'Dejó de venderse: prueba una degustación, una ubicación más visible o un ajuste de precio.',
};

export function suggestFor(input: { neverSold: boolean; daysStopped: number; thresholdDays: number; daysToExpiry: number | null }): DeadStockSuggestion {
  if (input.daysToExpiry !== null && input.daysToExpiry < 0) return 'EXPIRED';
  if (input.daysToExpiry !== null && input.daysToExpiry <= EXPIRY_SUGGESTION_DAYS) return 'EXPIRING';
  if (input.neverSold) return 'NEVER_SOLD';
  if (input.daysStopped >= input.thresholdDays * 3) return 'LONG_STOPPED';
  return 'STOPPED';
}

/**
 * Días en que se avisa: al cumplir el umbral y luego cada otro tanto (30, 60,
 * 90…), no todos los días. La alerta corre una vez al día.
 */
export function isAlertMilestone(daysStopped: number, thresholdDays: number): boolean {
  return thresholdDays > 0 && daysStopped >= thresholdDays && daysStopped % thresholdDays === 0;
}

/** Una fila de la pantalla, lista para el navegador. */
export interface DeadStockRow {
  productId: string;
  name: string;
  sku: string;
  brand: string | null;
  unit: string;
  category: string | null;
  stock: number;
  daysStopped: number;
  lastSaleAt: string | null;
  neverSold: boolean;
  daysToExpiry: number | null;
  /** Stock × PMP; `null` si quien mira no puede ver costos. */
  value: number | null;
  suggestion: DeadStockSuggestion;
}

export interface DeadStockSummary {
  products: number;
  units: number;
  /** `null` si quien mira no puede ver costos. */
  value: number | null;
  neverSold: number;
  expiring: number;
}

export function summarizeDeadStock(rows: readonly DeadStockRow[], includeCosts: boolean): DeadStockSummary {
  return {
    products: rows.length,
    units: rows.reduce((sum, row) => sum + row.stock, 0),
    value: includeCosts ? rows.reduce((sum, row) => sum + (row.value ?? 0), 0) : null,
    neverSold: rows.filter((row) => row.neverSold).length,
    expiring: rows.filter((row) => row.suggestion === 'EXPIRED' || row.suggestion === 'EXPIRING').length,
  };
}
