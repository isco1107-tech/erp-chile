/**
 * Cobranza como funciones puras: antigüedad de la deuda por tramos y qué
 * recordatorio automático corresponde enviar a cada documento.
 */

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKETS: readonly AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Por vencer',
  d1_30: '1 a 30 días',
  d31_60: '31 a 60 días',
  d61_90: '61 a 90 días',
  d90_plus: 'Más de 90 días',
};

const DAY_MS = 86_400_000;

/** Días de atraso respecto de `today` (medianoche). Negativo = aún no vence. Sin vencimiento = 0. */
export function daysPastDue(dueDate: Date | null, today: Date): number {
  if (!dueDate) return 0;
  return Math.floor((today.getTime() - dueDate.getTime()) / DAY_MS);
}

export function agingBucket(daysLate: number): AgingBucket {
  if (daysLate <= 0) return 'current';
  if (daysLate <= 30) return 'd1_30';
  if (daysLate <= 60) return 'd31_60';
  if (daysLate <= 90) return 'd61_90';
  return 'd90_plus';
}

export type AgingTotals = Record<AgingBucket, number> & { total: number; overdue: number };

export function emptyAging(): AgingTotals {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0, overdue: 0 };
}

export function addToAging(totals: AgingTotals, balance: number, daysLate: number): AgingTotals {
  const bucket = agingBucket(daysLate);
  totals[bucket] += balance;
  totals.total += balance;
  if (bucket !== 'current') totals.overdue += balance;
  return totals;
}

/** Hitos permitidos para recordatorios: de 30 días antes a 180 después del vencimiento. */
export function normalizeReminderDays(days: readonly number[]): number[] {
  return [...new Set(days.map((day) => Math.trunc(day)).filter((day) => day >= -30 && day <= 180))].sort((a, b) => a - b).slice(0, 8);
}

/**
 * Qué hito enviar hoy a un documento: el mayor hito ya alcanzado que aún no
 * se envió y que es posterior a todo lo ya enviado. Así, si el cron falla un
 * día, se recupera al siguiente; y una deuda antigua recibe un solo aviso (el
 * último hito), no toda la serie de una vez. `null` = nada que enviar.
 */
export function reminderStageToSend(daysLate: number, stages: readonly number[], alreadySent: readonly number[]): number | null {
  const reached = normalizeReminderDays(stages).filter((stage) => stage <= daysLate);
  const best = reached[reached.length - 1];
  if (best === undefined) return null;
  const lastSent = alreadySent.length > 0 ? Math.max(...alreadySent) : -Infinity;
  if (alreadySent.includes(best) || best <= lastSent) return null;
  return best;
}

/** Texto del hito para el asunto del correo y el historial. */
export function describeStage(stage: number): string {
  if (stage < 0) return `vence en ${-stage} ${stage === -1 ? 'día' : 'días'}`;
  if (stage === 0) return 'vence hoy';
  return `vencido hace ${stage} ${stage === 1 ? 'día' : 'días'}`;
}
