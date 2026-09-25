/**
 * Toma de inventario, como funciones puras: diferencias entre lo contado y
 * el stock, y su valorización al PMP.
 */

export interface CountLine {
  productId: string;
  systemQuantity: number;
  countedQuantity: number | null;
  unitCost: number;
}

export interface CountDifference {
  productId: string;
  /** Contado - sistema. Positivo = sobrante, negativo = faltante. */
  difference: number;
  /** Diferencia valorizada al costo (entero, CLP). */
  value: number;
}

const EPSILON = 1e-9;

/** Diferencia de una línea contada (null si aún no se cuenta). */
export function lineDifference(line: Pick<CountLine, 'systemQuantity' | 'countedQuantity'>): number | null {
  if (line.countedQuantity === null) return null;
  const diff = line.countedQuantity - line.systemQuantity;
  return Math.abs(diff) < EPSILON ? 0 : diff;
}

export interface CountSummary {
  lines: number;
  counted: number;
  withDifference: number;
  surplusValue: number;
  shortageValue: number;
  /** Neto valorizado (sobrante - faltante). */
  netValue: number;
  /** % de líneas contadas. */
  progress: number;
}

export function summarizeCount(lines: readonly CountLine[]): CountSummary {
  let counted = 0;
  let withDifference = 0;
  let surplusValue = 0;
  let shortageValue = 0;
  for (const line of lines) {
    const diff = lineDifference(line);
    if (diff === null) continue;
    counted += 1;
    if (diff === 0) continue;
    withDifference += 1;
    const value = Math.round(Math.abs(diff) * line.unitCost);
    if (diff > 0) surplusValue += value;
    else shortageValue += value;
  }
  return {
    lines: lines.length,
    counted,
    withDifference,
    surplusValue,
    shortageValue,
    netValue: surplusValue - shortageValue,
    progress: lines.length === 0 ? 0 : Math.round((counted / lines.length) * 100),
  };
}

/**
 * Ajuste a aplicar al contabilizar: lo contado contra el stock DEL MOMENTO
 * (no contra la foto del inicio). Así, si hubo ventas mientras se contaba y
 * el conteo se hizo después de ellas, no se ajustan dos veces.
 */
export function adjustmentAtPosting(counted: number, stockNow: number): number {
  const diff = counted - stockNow;
  return Math.abs(diff) < EPSILON ? 0 : diff;
}
