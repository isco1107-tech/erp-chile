/**
 * Estadística mínima para el Centro de Inteligencia. Funciones puras, sin
 * dependencias: se usan tanto en el servidor como en el simulador del cliente.
 */

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Coeficiente de determinación (0-1). Qué tanto de la variación explica la tendencia. */
  r2: number;
  /** Desviación estándar de los residuos: base de la banda de confianza. */
  residualStd: number;
}

/** Mínimos cuadrados sobre x = 0..n-1. Con menos de 2 puntos no hay tendencia. */
export function linearFit(values: readonly number[]): LinearFit | null {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let x = 0; x < n; x += 1) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (values[x] - meanY);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let x = 0; x < n; x += 1) {
    const predicted = intercept + slope * x;
    ssRes += (values[x] - predicted) ** 2;
    ssTot += (values[x] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const residualStd = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  return { slope, intercept, r2, residualStd };
}

export interface ProjectedPoint {
  value: number;
  low: number;
  high: number;
}

/**
 * Proyección lineal con banda de ±1 desviación de los residuos (≈68%). Nunca
 * proyecta ventas negativas: el piso es 0. Devuelve [] si no hay al menos 3
 * puntos — una recta por dos puntos no es una tendencia, es una línea.
 */
export function projectLinear(values: readonly number[], periods: number): ProjectedPoint[] {
  if (values.length < 3) return [];
  const fit = linearFit(values);
  if (!fit) return [];
  const result: ProjectedPoint[] = [];
  for (let step = 1; step <= periods; step += 1) {
    const x = values.length - 1 + step;
    const value = Math.max(0, Math.round(fit.intercept + fit.slope * x));
    // La incertidumbre crece con la distancia al último dato observado.
    const spread = Math.round(fit.residualStd * Math.sqrt(1 + step / values.length));
    result.push({ value, low: Math.max(0, value - spread), high: value + spread });
  }
  return result;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Percentil p (0-100) por interpolación lineal. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/** División que devuelve `null` en vez de `Infinity`/`NaN` cuando no hay base. */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/** Variación porcentual. `null` cuando el período base es 0: un "+∞%" no informa nada. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Interpolación lineal por tramos, con los extremos recortados. `points`
 * debe venir ordenado por `x` ascendente: [[x, score], ...].
 */
export function piecewise(value: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (points.length === 0) return 0;
  if (value <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (value <= x1) return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

/** Índice Herfindahl-Hirschman (0-10.000) sobre participaciones en %. */
export function herfindahl(sharesPct: readonly number[]): number {
  return Math.round(sharesPct.reduce((sum, share) => sum + share * share, 0));
}
