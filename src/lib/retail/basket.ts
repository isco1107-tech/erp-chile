/**
 * Canasta cruzada (Métricas de retail): qué productos se compran juntos en la
 * misma boleta o factura. Funciones puras sobre conteos que arma el servicio.
 *
 * - Soporte: en qué parte de las boletas aparecen los dos juntos.
 * - Confianza A→B: de las boletas con A, en cuántas también va B.
 * - Lift: cuántas veces más van juntos que si se eligieran al azar (1 = igual
 *   que el azar). Lo que ordena: un par muy vendido pero sin relación no es
 *   un combo.
 *
 * Un par necesita un mínimo de boletas juntos para mostrarse: con pocos casos
 * cualquier coincidencia parece relación.
 */

export const BASKET_PERIOD_OPTIONS = [30, 60, 90] as const;
export type BasketPeriod = (typeof BASKET_PERIOD_OPTIONS)[number];
export const MIN_TOGETHER_OPTIONS = [3, 5, 10, 20] as const;
export type MinTogether = (typeof MIN_TOGETHER_OPTIONS)[number];

/** Boletas con más productos distintos que esto (compras mayoristas, inventarios) no entran: deforman todo. */
export const MAX_BASKET_PRODUCTS = 40;
/** Desde este lift un par "se compra junto"; desde `COMBO_MIN_LIFT` y `COMBO_MIN_CONFIDENCE` se sugiere como combo. */
export const RELATED_MIN_LIFT = 1.2;
export const COMBO_MIN_LIFT = 1.5;
export const COMBO_MIN_CONFIDENCE = 20;
export const MAX_PAIRS = 50;
export const MAX_COMBOS = 5;

export const parseBasketPeriod = (value: string | undefined): BasketPeriod => {
  const n = Number(value);
  return (BASKET_PERIOD_OPTIONS as readonly number[]).includes(n) ? (n as BasketPeriod) : 30;
};
export const parseMinTogether = (value: string | undefined): MinTogether => {
  const n = Number(value);
  return (MIN_TOGETHER_OPTIONS as readonly number[]).includes(n) ? (n as MinTogether) : 5;
};

export interface PairCounts {
  a: string;
  b: string;
  /** Boletas con los dos. */
  together: number;
  /** Boletas con A y con B (cada uno, juntos o no). */
  withA: number;
  withB: number;
}

export interface PairMetrics extends PairCounts {
  /** % de las boletas con los dos. */
  supportPct: number;
  /** % de las boletas con A que también llevan B, y al revés. */
  confidenceAB: number;
  confidenceBA: number;
  lift: number;
}

export function pairMetrics(pair: PairCounts, tickets: number): PairMetrics | null {
  if (!(tickets > 0) || !(pair.withA > 0) || !(pair.withB > 0)) return null;
  return {
    ...pair,
    supportPct: (pair.together / tickets) * 100,
    confidenceAB: (pair.together / pair.withA) * 100,
    confidenceBA: (pair.together / pair.withB) * 100,
    lift: (pair.together * tickets) / (pair.withA * pair.withB),
  };
}

/** Pares con relación positiva, del más fuerte al más débil (en empate, el que más se repite). */
export function rankPairs(pairs: readonly PairCounts[], tickets: number, minTogether: number): PairMetrics[] {
  return pairs
    .filter((pair) => pair.together >= minTogether)
    .map((pair) => pairMetrics(pair, tickets))
    .filter((pair): pair is PairMetrics => pair !== null && pair.lift > 1)
    .sort((x, y) => y.lift - x.lift || y.together - x.together || (x.a + x.b < y.a + y.b ? -1 : 1));
}

/** Pares que valen como combo: relación fuerte y uno lleva al otro con frecuencia. */
export function comboCandidates<T extends PairMetrics>(pairs: readonly T[]): T[] {
  return pairs.filter((pair) => pair.lift >= COMBO_MIN_LIFT && Math.max(pair.confidenceAB, pair.confidenceBA) >= COMBO_MIN_CONFIDENCE).slice(0, MAX_COMBOS);
}

const pct = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 0 })}%`;
const times = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/** "Quienes llevan Miel también llevan Queso en el 40% de las boletas (3,2 veces más que lo normal)." */
export function describePair(pair: PairMetrics, names: { a: string; b: string }): string {
  const [from, to, confidence] = pair.confidenceAB >= pair.confidenceBA ? [names.a, names.b, pair.confidenceAB] : [names.b, names.a, pair.confidenceBA];
  return `Quienes llevan ${from} también llevan ${to} en el ${pct(confidence)} de las boletas (${times(pair.lift)} veces más que lo normal).`;
}
