/**
 * Métricas de retail en vivo: sell-through y días de inventario restante de
 * cada producto en UNA bodega, calculados con su kardex. Funciones puras (sin
 * Prisma): el servicio agrega los movimientos por día y esto decide qué
 * significan.
 *
 * Reglas:
 * - "Vendido" es lo que salió por venta menos lo que volvió por nota de crédito
 *   o anulación de esa venta. Mermas, degustaciones y traslados no son venta.
 * - La venta diaria se mide solo con los días COMPLETOS en que el producto
 *   tuvo stock: un día agotado no vendió porque no había, no porque nadie lo
 *   quisiera, y hoy todavía va a medias.
 * - Sin ventas no hay ritmo y los días restantes quedan vacíos: no se inventa
 *   un número.
 */

/** Períodos que ofrece la pantalla, en días completos (además de hoy). */
export const PERIOD_OPTIONS = [7, 14, 30, 90] as const;
export type PeriodOption = (typeof PERIOD_OPTIONS)[number];
export const DEFAULT_PERIOD: PeriodOption = 30;

/** "Se agota pronto" cuando el stock alcanza para estos días o menos. */
export const LOW_COVERAGE_OPTIONS = [3, 7, 14, 30] as const;
export type LowCoverageOption = (typeof LOW_COVERAGE_OPTIONS)[number];
export const DEFAULT_LOW_COVERAGE: LowCoverageOption = 7;

/** Cada cuánto se vuelve a pedir el panel mientras está a la vista. */
export const LIVE_REFRESH_MS = 60_000;

export function parsePeriod(value: string | undefined): PeriodOption {
  const n = Number(value);
  return (PERIOD_OPTIONS as readonly number[]).includes(n) ? (n as PeriodOption) : DEFAULT_PERIOD;
}

export function parseLowCoverage(value: string | undefined): LowCoverageOption {
  const n = Number(value);
  return (LOW_COVERAGE_OPTIONS as readonly number[]).includes(n) ? (n as LowCoverageOption) : DEFAULT_LOW_COVERAGE;
}

/**
 * Referencias con que Ventas reingresa stock al acreditar o anular una venta
 * (`sales.service.ts`): `DTE <tipo> Folio #n` y `Anulación … DTE <tipo> …`.
 * Un ajuste de entrada con una de estas referencias y sin operario es una
 * devolución de venta, no una llegada. `tests/retail-live-metrics.test.ts`
 * vigila que Ventas siga escribiéndolas así.
 */
export const SALE_REVERSAL_LIKE = ['DTE %', 'Anulación%DTE %'] as const;

/** Un día de un producto en una bodega, agregado desde el kardex. */
export interface DayAggregate {
  /** `YYYY-MM-DD` en el calendario de Santiago. */
  day: string;
  /** Unidades que salieron por venta. */
  sold: number;
  /** Unidades que volvieron por nota de crédito o anulación de una venta. */
  returned: number;
  /** Lo que entró por cualquier otra vía: llegadas, traslados, ajustes, producción. */
  received: number;
  /** Variación neta del stock en el día, de todo tipo de movimiento. */
  delta: number;
  /** Stock más alto que tuvo durante el día (antes o después de cada movimiento). */
  peak: number;
  /** Stock al cierre del día, después de su último movimiento. */
  close: number;
  lastSaleAt: Date | null;
}

export interface LiveWindow {
  /** Días completos del período, del más antiguo al de ayer. */
  completeDays: string[];
  /** Hoy, en Santiago. */
  today: string;
}

/** `YYYY-MM-DD` de un día calendario. */
export function dayKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Los `periodDays` días completos anteriores a hoy, más hoy. Aritmética de calendario, sin zona horaria. */
export function liveWindow(today: { year: number; month: number; day: number }, periodDays: number): LiveWindow {
  const completeDays: string[] = [];
  for (let offset = periodDays; offset >= 1; offset -= 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day - offset));
    completeDays.push(dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  }
  return { completeDays, today: dayKey(today.year, today.month, today.day) };
}

export type LiveStatus = 'OUT' | 'LOW' | 'NO_SALES' | 'OK';

export const LIVE_STATUS_META: Record<LiveStatus, { label: string; tone: 'danger' | 'warning' | 'neutral' | 'success' }> = {
  OUT: { label: 'Agotado', tone: 'danger' },
  LOW: { label: 'Se agota pronto', tone: 'warning' },
  NO_SALES: { label: 'Sin ventas', tone: 'neutral' },
  OK: { label: 'Con stock', tone: 'success' },
};

export interface LiveMetrics {
  stock: number;
  /** Stock al empezar el período (reconstruido desde el actual). */
  opening: number;
  /** Vendido neto en el período, hoy incluido. */
  sold: number;
  soldToday: number;
  /** Entrado en el período por otra vía que no sea devolución de venta. */
  received: number;
  /** Vendido ÷ (stock al empezar + entrado), entre 0 y 100. `null` si no hubo nada que vender. */
  sellThroughPct: number | null;
  /** Días completos del período en que el producto tuvo stock. */
  availableDays: number;
  /** Venta por día con stock. `null` sin ventas en días completos. */
  dailyVelocity: number | null;
  /** Días que alcanza el stock al ritmo de venta. `0` agotado, `null` sin ritmo. */
  coverageDays: number | null;
  status: LiveStatus;
  lastSaleAt: Date | null;
}

const EPSILON = 1e-9;

/**
 * Métricas de un producto. `currentStock` es el saldo de hoy en la bodega; los
 * agregados fuera de la ventana se ignoran. El stock de cada día se reconstruye
 * hacia atrás desde el actual, así que un producto sin movimientos en un día
 * conserva el saldo del día anterior.
 */
export function computeLiveMetrics(
  currentStock: number,
  days: readonly DayAggregate[],
  window: LiveWindow,
  options: { lowCoverageDays: number }
): LiveMetrics {
  const inWindow = new Set([...window.completeDays, window.today]);
  const byDay = new Map<string, DayAggregate>();
  for (const row of days) if (inWindow.has(row.day)) byDay.set(row.day, row);

  let totalDelta = 0;
  let sold = 0;
  let received = 0;
  let lastSaleAt: Date | null = null;
  for (const row of byDay.values()) {
    totalDelta += row.delta;
    sold += row.sold - row.returned;
    received += row.received;
    if (row.lastSaleAt && (!lastSaleAt || row.lastSaleAt > lastSaleAt)) lastSaleAt = row.lastSaleAt;
  }
  const opening = currentStock - totalDelta;

  let level = opening;
  let availableDays = 0;
  let soldComplete = 0;
  for (const day of window.completeDays) {
    const row = byDay.get(day);
    const available = row ? row.peak > EPSILON : level > EPSILON;
    if (row) {
      level = row.close;
      soldComplete += row.sold - row.returned;
    }
    if (available) availableDays += 1;
  }
  const todayRow = byDay.get(window.today);
  const soldToday = todayRow ? todayRow.sold - todayRow.returned : 0;

  const available = Math.max(opening, 0) + received;
  const sellThroughPct = available > EPSILON ? Math.min(100, Math.max(0, (sold / available) * 100)) : null;
  const dailyVelocity = availableDays > 0 && soldComplete > EPSILON ? soldComplete / availableDays : null;
  const coverageDays = currentStock <= EPSILON ? 0 : dailyVelocity ? Math.floor(currentStock / dailyVelocity) : null;

  let status: LiveStatus;
  if (currentStock <= EPSILON) status = 'OUT';
  else if (coverageDays !== null && coverageDays <= options.lowCoverageDays) status = 'LOW';
  else if (sold <= EPSILON) status = 'NO_SALES';
  else status = 'OK';

  return { stock: currentStock, opening, sold, soldToday, received, sellThroughPct, availableDays, dailyVelocity, coverageDays, status, lastSaleAt };
}

/** Una fila del panel, lista para el navegador (cantidades ya redondeadas). */
export interface LiveMetricsRow {
  productId: string;
  name: string;
  sku: string;
  brand: string | null;
  unit: string;
  category: string | null;
  stock: number;
  soldToday: number;
  sold: number;
  received: number;
  sellThroughPct: number | null;
  dailyVelocity: number | null;
  coverageDays: number | null;
  availableDays: number;
  status: LiveStatus;
  lastSaleAt: string | null;
}

export interface LiveSummary {
  products: number;
  soldToday: number;
  sold: number;
  /** Vendido ÷ disponible de toda la bodega (suma unidades, kilos y litros por igual). */
  sellThroughPct: number | null;
  low: number;
  out: number;
  /** Agotados que sí se vendieron en el período: demanda que se está perdiendo. */
  outWithDemand: number;
  noSales: number;
}

export function summarizeLive(rows: ReadonlyArray<Pick<LiveMetrics, 'sold' | 'soldToday' | 'opening' | 'received' | 'status'>>): LiveSummary {
  let soldToday = 0;
  let sold = 0;
  let available = 0;
  let low = 0;
  let out = 0;
  let outWithDemand = 0;
  let noSales = 0;
  for (const row of rows) {
    soldToday += row.soldToday;
    sold += row.sold;
    available += Math.max(row.opening, 0) + row.received;
    if (row.status === 'LOW') low += 1;
    if (row.status === 'OUT') {
      out += 1;
      if (row.sold > EPSILON) outWithDemand += 1;
    }
    if (row.status === 'NO_SALES') noSales += 1;
  }
  return {
    products: rows.length,
    soldToday,
    sold,
    sellThroughPct: available > EPSILON ? Math.min(100, Math.max(0, (sold / available) * 100)) : null,
    low,
    out,
    outWithDemand,
    noSales,
  };
}

const SANTIAGO_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function santiagoParts(date: Date): Record<'day' | 'month' | 'hour' | 'minute' | 'second', string> {
  const parts = Object.fromEntries(SANTIAGO_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: parts.day ?? '', month: parts.month ?? '', hour: parts.hour ?? '', minute: parts.minute ?? '', second: parts.second ?? '' };
}

/**
 * `17:53:07` en Santiago. Armado con dígitos: el texto de `toLocaleTimeString`
 * cambia según la versión de ICU (Node usa un espacio fino antes de "p. m." y
 * Chromium otro), y esa diferencia rompía la hidratación de React.
 */
export function clockLabel(date: Date): string {
  const p = santiagoParts(date);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** `23/10 17:53` en Santiago, con el mismo cuidado que `clockLabel`. */
export function dayTimeLabel(date: Date): string {
  const p = santiagoParts(date);
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Cantidades para mostrar: kilos y litros llevan hasta 3 decimales. */
export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}
