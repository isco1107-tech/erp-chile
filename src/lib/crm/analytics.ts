import { santiagoDateParts } from '@/lib/chile/timezone';

/**
 * Analítica del CRM comercial: pronóstico por mes de cierre y desgloses
 * (por tipo de negocio, fuente, responsable o certamen).
 *
 * Funciones puras sobre las oportunidades ya leídas: el servicio decide qué
 * traer (y con qué filtro de empresa), acá solo se agrega. Mismo criterio que
 * `src/lib/intelligence/`: una métrica sin datos se devuelve `null`, nunca un
 * cero inventado que parezca un resultado real.
 */

export type CrmStage = 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface CrmAnalyticsOpportunity {
  stage: CrmStage;
  /** Efectivo neto estimado, CLP entero. */
  amount: number;
  /** Canje valorizado, CLP entero. No entra al pronóstico de caja. */
  barterValuation: number;
  probability: number;
  expectedCloseDate: Date | null;
  createdAt: Date;
  closedAt: Date | null;
}

const OPEN: ReadonlySet<CrmStage> = new Set(['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION']);
const DAY_MS = 24 * 60 * 60 * 1000;

export function isOpenStage(stage: CrmStage): boolean {
  return OPEN.has(stage);
}

export function weightedAmount(opp: Pick<CrmAnalyticsOpportunity, 'amount' | 'probability'>): number {
  return Math.round((opp.amount * opp.probability) / 100);
}

export interface ForecastBucket {
  /** `YYYY-MM`, o `overdue` / `undated` para los baldes especiales. */
  key: string;
  label: string;
  count: number;
  amount: number;
  weighted: number;
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Negocios abiertos agrupados por mes de cierre esperado (calendario de
 * Santiago), desde el mes en curso y por `horizonMonths` meses. Los que
 * tenían que cerrar en un mes ya pasado van al balde "Atrasados" — es el
 * dato más accionable del pronóstico —, y los que no tienen fecha a "Sin
 * fecha" en vez de desaparecer del total.
 */
export function forecastByMonth(opps: readonly CrmAnalyticsOpportunity[], now: Date, horizonMonths = 6): ForecastBucket[] {
  const today = santiagoDateParts(now);
  const months: ForecastBucket[] = [];
  for (let offset = 0; offset < horizonMonths; offset++) {
    const total = today.year * 12 + (today.month - 1) + offset;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    months.push({ key: monthKey(year, month), label: `${MONTH_LABELS[month - 1]} ${year}`, count: 0, amount: 0, weighted: 0 });
  }
  const overdue: ForecastBucket = { key: 'overdue', label: 'Atrasados', count: 0, amount: 0, weighted: 0 };
  const undated: ForecastBucket = { key: 'undated', label: 'Sin fecha', count: 0, amount: 0, weighted: 0 };
  const later: ForecastBucket = { key: 'later', label: 'Más adelante', count: 0, amount: 0, weighted: 0 };
  const currentKey = monthKey(today.year, today.month);

  for (const opp of opps) {
    if (!isOpenStage(opp.stage)) continue;
    let bucket: ForecastBucket | undefined;
    if (!opp.expectedCloseDate) bucket = undated;
    else {
      const parts = santiagoDateParts(opp.expectedCloseDate);
      const key = monthKey(parts.year, parts.month);
      if (key < currentKey) bucket = overdue;
      else bucket = months.find((m) => m.key === key) ?? later;
    }
    bucket.count += 1;
    bucket.amount += opp.amount;
    bucket.weighted += weightedAmount(opp);
  }

  return [overdue, ...months, later, undated].filter((b) => b.count > 0 || months.includes(b));
}

export interface BreakdownRow {
  key: string;
  label: string;
  openCount: number;
  openAmount: number;
  weighted: number;
  wonCount: number;
  wonAmount: number;
  wonBarter: number;
  lostCount: number;
  /** `null` sin negocios cerrados en el grupo (no hay tasa que calcular). */
  winRatePct: number | null;
  /** Mediana de días entre creación y cierre ganado; `null` sin ganados. */
  medianCycleDays: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Desglose genérico. `keyOf` devuelve la clave y la etiqueta del grupo; los
 * grupos salen ordenados por volumen total (abierto + ganado), de mayor a
 * menor, que es el orden en que se leen en un reporte comercial.
 */
export function breakdownBy<T extends CrmAnalyticsOpportunity>(opps: readonly T[], keyOf: (opp: T) => { key: string; label: string }): BreakdownRow[] {
  const groups = new Map<string, { label: string; items: T[] }>();
  for (const opp of opps) {
    const { key, label } = keyOf(opp);
    const group = groups.get(key) ?? { label, items: [] };
    group.items.push(opp);
    groups.set(key, group);
  }

  const rows: BreakdownRow[] = [];
  for (const [key, { label, items }] of groups) {
    const open = items.filter((o) => isOpenStage(o.stage));
    const won = items.filter((o) => o.stage === 'WON');
    const lost = items.filter((o) => o.stage === 'LOST');
    const closed = won.length + lost.length;
    rows.push({
      key,
      label,
      openCount: open.length,
      openAmount: open.reduce((s, o) => s + o.amount, 0),
      weighted: open.reduce((s, o) => s + weightedAmount(o), 0),
      wonCount: won.length,
      wonAmount: won.reduce((s, o) => s + o.amount, 0),
      wonBarter: won.reduce((s, o) => s + o.barterValuation, 0),
      lostCount: lost.length,
      winRatePct: closed === 0 ? null : (won.length / closed) * 100,
      medianCycleDays: median(won.filter((o) => o.closedAt).map((o) => ((o.closedAt as Date).getTime() - o.createdAt.getTime()) / DAY_MS)),
    });
  }
  return rows.sort((a, b) => b.openAmount + b.wonAmount - (a.openAmount + a.wonAmount));
}

export type DealRiskFlag = 'stale' | 'no-next-step' | 'close-date-passed';

/**
 * Señales de riesgo de un negocio abierto, para marcarlo en la lista:
 * estancado en su etapa, sin próximo paso agendado o con la fecha de cierre
 * esperada ya vencida.
 */
export function dealRiskFlags(
  opp: { stage: CrmStage; stageChangedAt: Date; expectedCloseDate: Date | null; hasPendingActivity: boolean },
  now: Date,
  staleAfterDays: number
): DealRiskFlag[] {
  if (!isOpenStage(opp.stage)) return [];
  const flags: DealRiskFlag[] = [];
  if (now.getTime() - opp.stageChangedAt.getTime() > staleAfterDays * DAY_MS) flags.push('stale');
  if (!opp.hasPendingActivity) flags.push('no-next-step');
  if (opp.expectedCloseDate && opp.expectedCloseDate.getTime() < now.getTime() - DAY_MS) flags.push('close-date-passed');
  return flags;
}

/** Etiquetas normalizadas: sin espacios sobrantes, sin repetir (sin distinguir mayúsculas), máximo 12. */
export function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase('es-CL');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length === 12) break;
  }
  return result;
}
