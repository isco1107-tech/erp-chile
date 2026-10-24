import { dayKey, type DayPoint } from './live-metrics';

/**
 * Mapa de calor de rotación y reacción al precio (Métricas de retail).
 * Funciones puras: el servicio arma la serie diaria de cada producto (venta
 * neta y si tuvo stock) y los precios reales de cada venta.
 *
 * Reglas:
 * - Un período sin stock no es "no se vendió": se marca aparte.
 * - Un cambio de precio sale de los precios COBRADOS (descuento incluido), no
 *   de la ficha del producto: es lo que de verdad pagó el cliente.
 * - La comparación antes/después usa solo días completos con stock y pide un
 *   mínimo de días a cada lado; si no alcanza, lo dice en vez de calcular.
 */

export const HEATMAP_GRAINS = ['semana', 'dia'] as const;
export type HeatmapGrain = (typeof HEATMAP_GRAINS)[number];
export const HEATMAP_ORDERS = ['mas', 'menos'] as const;
export type HeatmapOrder = (typeof HEATMAP_ORDERS)[number];

/** Semanas (lunes a domingo) y días que muestra el mapa. */
export const HEATMAP_WEEKS = 12;
export const HEATMAP_DAYS = 28;
/** Días hacia atrás que se leen para detectar cambios de precio. */
export const PRICE_LOOKBACK_DAYS = 90;
/** Productos por mapa: los que más (o menos) se vendieron. */
export const HEATMAP_PRODUCT_LIMIT = 40;

export const parseGrain = (value: string | undefined): HeatmapGrain => (value === 'dia' ? 'dia' : 'semana');
export const parseOrder = (value: string | undefined): HeatmapOrder => (value === 'menos' ? 'menos' : 'mas');

/** Los `count` días calendario que terminan en `today` (incluido), del más antiguo a hoy. */
export function lastDays(today: { year: number; month: number; day: number }, count: number): string[] {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day - offset));
    keys.push(dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  }
  return keys;
}

const parseKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
};

/** Lunes de la semana de un día (`YYYY-MM-DD`). */
export function weekStart(key: string): string {
  const date = parseKey(key);
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000);
  return dayKey(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

/** `14/10`. */
export function shortDay(key: string): string {
  const [, month, day] = key.split('-');
  return `${day}/${month}`;
}

export interface HeatmapColumn {
  key: string;
  label: string;
  /** Días de la columna (los de la semana que caen en la ventana, o el día). */
  days: string[];
}

/** Columnas del mapa: 12 semanas de lunes a domingo (la actual a medias) o 28 días. */
export function heatmapColumns(today: { year: number; month: number; day: number }, grain: HeatmapGrain): HeatmapColumn[] {
  if (grain === 'dia') return lastDays(today, HEATMAP_DAYS).map((key) => ({ key, label: shortDay(key), days: [key] }));
  const todayKey = lastDays(today, 1)[0]!;
  const firstMonday = parseKey(weekStart(todayKey)).getTime() - (HEATMAP_WEEKS - 1) * 7 * 86_400_000;
  const columns: HeatmapColumn[] = [];
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const days: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(firstMonday + (week * 7 + i) * 86_400_000);
      const key = dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      if (key <= todayKey) days.push(key);
    }
    columns.push({ key: days[0]!, label: shortDay(days[0]!), days });
  }
  return columns;
}

export interface HeatmapCell {
  sold: number;
  /** Días de la celda con stock en algún momento. */
  availableDays: number;
  totalDays: number;
}

export function bucketSeries(series: readonly DayPoint[], columns: readonly HeatmapColumn[]): HeatmapCell[] {
  const byDay = new Map(series.map((point) => [point.day, point]));
  return columns.map((column) => {
    let sold = 0;
    let availableDays = 0;
    for (const day of column.days) {
      const point = byDay.get(day);
      if (!point) continue;
      sold += point.sold;
      if (point.available) availableDays += 1;
    }
    return { sold, availableDays, totalDays: column.days.length };
  });
}

/** Nivel de color 0-5 de una celda respecto del máximo del mapa (0 = no se vendió). */
export function intensityLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!(value > 0) || !(max > 0)) return 0;
  const ratio = Math.min(1, value / max);
  return Math.max(1, Math.ceil(ratio * 5)) as 1 | 2 | 3 | 4 | 5;
}

// ── Reacción al precio ──────────────────────────────────────────────────────

/** Lo vendido de un producto en un día a un precio neto unitario (descuento incluido). */
export interface PricePoint {
  day: string;
  price: number;
  quantity: number;
}

/** Variación mínima para considerar que el precio cambió (2%). */
export const PRICE_CHANGE_MIN_PCT = 2;
/** Días de venta seguidos al precio nuevo para darlo por cambio (y no por una venta suelta). */
export const PRICE_CONFIRM_SALE_DAYS = 2;
/** Días completos con stock que se miran a cada lado del cambio, y el mínimo para opinar. */
export const PRICE_WINDOW_DAYS = 14;
export const PRICE_MIN_DAYS = 5;

/** Precio que más se cobró cada día (por unidades; en empate, el menor). */
export function modalPrices(points: readonly PricePoint[]): Array<{ day: string; price: number }> {
  const byDay = new Map<string, Map<number, number>>();
  for (const point of points) {
    if (!(point.quantity > 0) || !(point.price > 0)) continue;
    const prices = byDay.get(point.day) ?? new Map<number, number>();
    prices.set(point.price, (prices.get(point.price) ?? 0) + point.quantity);
    byDay.set(point.day, prices);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, prices]) => {
      let best = 0;
      let bestQty = -1;
      for (const [price, qty] of prices) if (qty > bestQty || (qty === bestQty && price < best)) [best, bestQty] = [price, qty];
      return { day, price: best };
    });
}

const differs = (a: number, b: number) => Math.abs(b - a) / a >= PRICE_CHANGE_MIN_PCT / 100;

/** Días en que el precio cobrado cambió y se sostuvo (al menos dos días de venta al precio nuevo). */
export function detectPriceChanges(modal: ReadonlyArray<{ day: string; price: number }>): Array<{ day: string; from: number; to: number }> {
  const changes: Array<{ day: string; from: number; to: number }> = [];
  if (modal.length === 0) return changes;
  let current = modal[0]!.price;
  for (let i = 1; i < modal.length; i += 1) {
    const candidate = modal[i]!.price;
    if (!differs(current, candidate)) continue;
    const confirm = modal.slice(i, i + PRICE_CONFIRM_SALE_DAYS);
    // El último día con un precio nuevo no se puede confirmar todavía.
    if (confirm.length < PRICE_CONFIRM_SALE_DAYS || confirm.some((point) => differs(candidate, point.price))) continue;
    changes.push({ day: modal[i]!.day, from: current, to: candidate });
    current = candidate;
  }
  return changes;
}

export type PriceReactionStatus = 'OK' | 'INSUFFICIENT';

export interface PriceReaction {
  day: string;
  from: number;
  to: number;
  priceChangePct: number;
  status: PriceReactionStatus;
  daysBefore: number;
  daysAfter: number;
  velocityBefore: number | null;
  velocityAfter: number | null;
  /** Variación de la venta diaria; `null` si antes no se vendía o faltan días. */
  volumeChangePct: number | null;
}

/**
 * Venta diaria antes y después de un cambio de precio, solo en días completos
 * con stock, sin cruzar el cambio anterior ni el siguiente. `today` no cuenta
 * (va a medias).
 */
export function priceReaction(
  change: { day: string; from: number; to: number },
  series: readonly DayPoint[],
  bounds: { previousChange: string | null; nextChange: string | null; today: string }
): PriceReaction {
  const before = series.filter((point) => point.day < change.day && (!bounds.previousChange || point.day >= bounds.previousChange) && point.available).slice(-PRICE_WINDOW_DAYS);
  const after = series
    .filter((point) => point.day >= change.day && point.day < bounds.today && (!bounds.nextChange || point.day < bounds.nextChange) && point.available)
    .slice(0, PRICE_WINDOW_DAYS);
  const velocity = (points: readonly DayPoint[]) => (points.length > 0 ? points.reduce((sum, point) => sum + point.sold, 0) / points.length : null);
  const enough = before.length >= PRICE_MIN_DAYS && after.length >= PRICE_MIN_DAYS;
  const velocityBefore = enough ? velocity(before) : null;
  const velocityAfter = enough ? velocity(after) : null;
  return {
    ...change,
    priceChangePct: ((change.to - change.from) / change.from) * 100,
    status: enough ? 'OK' : 'INSUFFICIENT',
    daysBefore: before.length,
    daysAfter: after.length,
    velocityBefore,
    velocityAfter,
    volumeChangePct: velocityBefore !== null && velocityAfter !== null && velocityBefore > 0 ? ((velocityAfter - velocityBefore) / velocityBefore) * 100 : null,
  };
}

/** Una línea en castellano simple: qué pasó con la venta cuando cambió el precio. */
export function describeReaction(reaction: Pick<PriceReaction, 'status' | 'priceChangePct' | 'volumeChangePct' | 'daysBefore' | 'daysAfter'>): string {
  const price = `${reaction.priceChangePct < 0 ? 'Bajó' : 'Subió'} el precio ${formatShare(Math.abs(reaction.priceChangePct))}`;
  if (reaction.status === 'INSUFFICIENT') {
    return `${price}; todavía no hay ${PRICE_MIN_DAYS} días con stock a cada lado para comparar (antes ${reaction.daysBefore}, después ${reaction.daysAfter}).`;
  }
  if (reaction.volumeChangePct === null) return `${price}; antes no se vendía, así que no hay con qué comparar.`;
  if (Math.abs(reaction.volumeChangePct) < 5) return `${price} y la venta diaria se mantuvo (${formatSigned(reaction.volumeChangePct)}).`;
  return `${price} y la venta diaria ${reaction.volumeChangePct > 0 ? 'subió' : 'bajó'} ${formatShare(Math.abs(reaction.volumeChangePct))}.`;
}

const formatShare = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 0 })}%`;
const formatSigned = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatShare(Math.abs(value))}`;
