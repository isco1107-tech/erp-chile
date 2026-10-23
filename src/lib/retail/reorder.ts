import type { DayPoint } from './live-metrics';

/**
 * Reposición predictiva (Métricas de retail): cuándo se agota cada producto y
 * cuánto pedir, con el ritmo de venta real, el día de la semana, los días de
 * pago y el tiempo de entrega del proveedor. Funciones puras.
 *
 * Reglas:
 * - El ritmo base es la venta de los días completos CON stock (los agotados no
 *   son falta de demanda). Sin ritmo no hay proyección: no se inventa.
 * - Un patrón (fin de semana, días de pago) solo se usa si hay datos para
 *   sostenerlo; si no, vale 1 y se proyecta plano.
 * - La lluvia y otras causas externas quedan fuera de esta etapa.
 */

/** Días completos que se miran para el ritmo base y, si no alcanza, para el patrón completo. */
export const BASE_DAYS = 28;
export const HISTORY_DAYS = 84;
/** Mínimos para opinar: días con stock para el ritmo, y venta total para creer un patrón. */
export const MIN_RATE_DAYS = 7;
export const MIN_PATTERN_UNITS = 30;
export const MIN_WEEKDAY_SAMPLES = 4;
export const MIN_PAYDAY_SAMPLES = 6;
/** Hasta dónde se proyecta. */
export const HORIZON_DAYS = 120;

export const LEAD_DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30] as const;
export const COVER_DAY_OPTIONS = [7, 14, 21, 30] as const;
export const DEFAULT_REORDER_SETTINGS = { reorderLeadDays: 7, reorderCoverDays: 14 };
/** Pedir "pronto" si el día para pedir llega dentro de esta semana. */
export const SOON_DAYS = 7;

const DAY_MS = 86_400_000;

const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const keyOf = (date: Date) => date.toISOString().slice(0, 10);
/** 0 = lunes … 6 = domingo. */
export const weekdayOf = (key: string) => (parseKey(key).getUTCDay() + 6) % 7;
export const addDays = (key: string, days: number) => keyOf(new Date(parseKey(key).getTime() + days * DAY_MS));

/**
 * Días de pago en Chile: fin de mes (sueldos) y la quincena (anticipos). Es la
 * definición que se usa para medir si el producto vende distinto esos días.
 */
export function isPayday(key: string): boolean {
  const day = parseKey(key).getUTCDate();
  return day >= 28 || day <= 3 || day === 15 || day === 16;
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

export interface DemandPattern {
  /** Venta por día con stock, sin patrones. `null` sin ritmo. */
  base: number | null;
  /** Días con stock con que se midió el ritmo base. */
  baseDays: number;
  /** Factor por día de la semana (lunes primero); todos 1 si no hay datos. */
  weekday: number[];
  weekdayDetected: boolean;
  /** Factor de los días de pago y del resto (promedian 1 en el mes). */
  payday: number;
  otherDays: number;
  paydayDetected: boolean;
}

/** Patrón de demanda con la serie de días COMPLETOS (sin hoy), del más antiguo al más nuevo. */
export function demandPattern(completeDays: readonly DayPoint[]): DemandPattern {
  const available = completeDays.filter((point) => point.available);
  const recent = completeDays.slice(-BASE_DAYS).filter((point) => point.available);
  const rateSource = recent.length >= MIN_RATE_DAYS ? recent : available;
  const base = rateSource.length >= MIN_RATE_DAYS ? mean(rateSource.map((point) => point.sold)) : null;
  const flat: DemandPattern = { base: base && base > 0 ? base : null, baseDays: rateSource.length, weekday: [1, 1, 1, 1, 1, 1, 1], weekdayDetected: false, payday: 1, otherDays: 1, paydayDetected: false };
  if (!flat.base) return flat;

  const history = available.slice(-HISTORY_DAYS);
  const total = history.reduce((sum, point) => sum + point.sold, 0);
  const overall = mean(history.map((point) => point.sold)) ?? 0;
  if (total < MIN_PATTERN_UNITS || overall <= 0) return flat;

  const byWeekday = Array.from({ length: 7 }, (_, weekday) => history.filter((point) => weekdayOf(point.day) === weekday).map((point) => point.sold));
  let weekday = flat.weekday;
  let weekdayDetected = false;
  if (byWeekday.every((values) => values.length >= MIN_WEEKDAY_SAMPLES)) {
    const raw = byWeekday.map((values) => (mean(values) ?? 0) / overall);
    const avg = raw.reduce((sum, value) => sum + value, 0) / 7;
    const factors = raw.map((value) => (avg > 0 ? value / avg : 1));
    // Diferencias chicas son ruido de pocos datos: solo un patrón claro cambia la proyección.
    weekdayDetected = factors.some((value) => Math.abs(value - 1) >= 0.15);
    if (weekdayDetected) weekday = factors;
  }

  const paydays = history.filter((point) => isPayday(point.day)).map((point) => point.sold);
  const others = history.filter((point) => !isPayday(point.day)).map((point) => point.sold);
  let payday = 1;
  let otherDays = 1;
  let paydayDetected = false;
  const otherMean = mean(others);
  if (paydays.length >= MIN_PAYDAY_SAMPLES && others.length >= MIN_PAYDAY_SAMPLES && otherMean && otherMean > 0) {
    const ratio = Math.min(2, Math.max(0.5, (mean(paydays) ?? 0) / otherMean));
    if (Math.abs(ratio - 1) >= 0.1) {
      // Que el mes promedie 1: los días de pago son ~8 de 30.
      const share = 8 / 30;
      otherDays = 1 / (1 - share + share * ratio);
      payday = ratio * otherDays;
      paydayDetected = true;
    }
  }
  return { ...flat, weekday, weekdayDetected, payday, otherDays, paydayDetected };
}

/** Venta esperada de un día futuro. */
export function forecastFor(pattern: DemandPattern, key: string): number {
  if (!pattern.base) return 0;
  return pattern.base * pattern.weekday[weekdayOf(key)]! * (isPayday(key) ? pattern.payday : pattern.otherDays);
}

export type ReorderStatus = 'NOW' | 'SOON' | 'OK' | 'NO_RATE';

export const REORDER_STATUS_META: Record<ReorderStatus, { label: string; tone: 'danger' | 'warning' | 'success' | 'neutral' }> = {
  NOW: { label: 'Pedir ya', tone: 'danger' },
  SOON: { label: 'Pedir esta semana', tone: 'warning' },
  OK: { label: 'Al día', tone: 'success' },
  NO_RATE: { label: 'Sin ritmo de venta', tone: 'neutral' },
};

export interface ReorderPlan {
  status: ReorderStatus;
  /** Día en que se acaba (hoy = 0 si ya no hay). `null` sin ritmo o más allá del horizonte. */
  stockoutDay: string | null;
  daysToStockout: number | null;
  /** Último día para pedir y que llegue antes del quiebre. */
  orderBy: string | null;
  /** Cuánto pedir para cubrir el tiempo de entrega más los días de cobertura. 0 si no hace falta. */
  suggestedQty: number;
  /** Venta esperada durante el tiempo de entrega + cobertura. */
  demandUntilCovered: number;
}

/**
 * Proyecta desde mañana (hoy va a medias) con el stock de ahora más lo que
 * viene en camino. `leadDays` es lo que tarda en llegar un pedido hecho hoy.
 */
export function planReorder(input: { pattern: DemandPattern; stock: number; incoming: number; today: string; leadDays: number; coverDays: number }): ReorderPlan {
  const { pattern, today, leadDays, coverDays } = input;
  const onHand = Math.max(0, input.stock) + Math.max(0, input.incoming);
  if (!pattern.base) return { status: 'NO_RATE', stockoutDay: null, daysToStockout: null, orderBy: null, suggestedQty: 0, demandUntilCovered: 0 };

  let daysToStockout: number | null = onHand <= 0 ? 0 : null;
  let cumulative = 0;
  for (let d = 1; daysToStockout === null && d <= HORIZON_DAYS; d += 1) {
    cumulative += forecastFor(pattern, addDays(today, d));
    if (cumulative >= onHand) daysToStockout = d;
  }
  let demandUntilCovered = 0;
  for (let d = 1; d <= leadDays + coverDays; d += 1) demandUntilCovered += forecastFor(pattern, addDays(today, d));
  const suggestedQty = Math.max(0, Math.ceil(demandUntilCovered - onHand));

  const orderIn = daysToStockout === null ? null : daysToStockout - leadDays;
  const status: ReorderStatus = orderIn === null ? 'OK' : orderIn <= 0 ? 'NOW' : orderIn <= SOON_DAYS ? 'SOON' : 'OK';
  return {
    status,
    stockoutDay: daysToStockout === null ? null : addDays(today, daysToStockout),
    daysToStockout,
    orderBy: orderIn === null ? null : addDays(today, Math.max(0, orderIn)),
    suggestedQty,
    demandUntilCovered,
  };
}

const WEEKDAY_NAMES = ['los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados', 'los domingos'];

/** Lo que el patrón dice, en palabras: "Vende 40% más los sábados · 20% más en días de pago". */
export function describePattern(pattern: DemandPattern): string | null {
  const parts: string[] = [];
  if (pattern.weekdayDetected) {
    const peak = pattern.weekday.indexOf(Math.max(...pattern.weekday));
    parts.push(`Vende ${Math.round((pattern.weekday[peak]! - 1) * 100)}% más ${WEEKDAY_NAMES[peak]}`);
  }
  if (pattern.paydayDetected) {
    const diff = Math.round((pattern.payday / pattern.otherDays - 1) * 100);
    parts.push(`${Math.abs(diff)}% ${diff >= 0 ? 'más' : 'menos'} en días de pago`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Tiempo de entrega medido: la mediana de días entre la orden de compra y su recepción. `null` con menos de 2 casos. */
export function medianLeadDays(samples: readonly number[]): number | null {
  if (samples.length < 2) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
}
