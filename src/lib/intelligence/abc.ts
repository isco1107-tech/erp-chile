/**
 * Clasificación ABC (principio de Pareto): los ítems que acumulan el ~80% del
 * valor son "A", el siguiente ~15% "B" y la cola larga "C". Sirve igual para
 * productos (por venta o margen) que para clientes.
 */

export type AbcClass = 'A' | 'B' | 'C';

export interface AbcThresholds {
  /** Participación acumulada hasta la que un ítem es A (0-1). */
  a: number;
  /** Participación acumulada hasta la que un ítem es B (0-1). */
  b: number;
}

export const DEFAULT_ABC_THRESHOLDS: AbcThresholds = { a: 0.8, b: 0.95 };

export type AbcResult<T> = T & {
  abc: AbcClass;
  /** Participación del ítem sobre el total (0-1). */
  share: number;
  /** Participación acumulada INCLUYENDO este ítem (0-1). */
  cumulativeShare: number;
};

/**
 * Se clasifica por la participación acumulada ANTES de sumar el ítem: así el
 * primer ítem siempre es A aunque por sí solo pese el 90% — si fuera por la
 * acumulada después, un cliente dominante quedaría absurdamente como "B".
 */
export function classifyAbc<T extends { value: number }>(
  items: readonly T[],
  thresholds: AbcThresholds = DEFAULT_ABC_THRESHOLDS
): AbcResult<T>[] {
  const positives = items.filter((item) => item.value > 0);
  const total = positives.reduce((sum, item) => sum + item.value, 0);
  const sorted = [...items].sort((a, b) => b.value - a.value);

  let cumulative = 0;
  return sorted.map((item) => {
    if (item.value <= 0 || total === 0) {
      return { ...item, abc: 'C' as const, share: 0, cumulativeShare: total === 0 ? 0 : cumulative / total };
    }
    const before = cumulative / total;
    cumulative += item.value;
    const abc: AbcClass = before < thresholds.a ? 'A' : before < thresholds.b ? 'B' : 'C';
    return { ...item, abc, share: item.value / total, cumulativeShare: cumulative / total };
  });
}

export function summarizeAbc<T>(results: readonly AbcResult<T>[]): Record<AbcClass, { count: number; share: number }> {
  const summary: Record<AbcClass, { count: number; share: number }> = {
    A: { count: 0, share: 0 },
    B: { count: 0, share: 0 },
    C: { count: 0, share: 0 },
  };
  for (const item of results) {
    summary[item.abc].count += 1;
    summary[item.abc].share += item.share;
  }
  return summary;
}
