/**
 * Antigüedad de saldos (aging) para Cuentas por Cobrar / por Pagar: agrupa lo
 * pendiente según cuántos días lleva vencido. Pura y sin dependencias de UI
 * para poder testearla.
 */

export type AgingBucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKETS: { key: AgingBucketKey; label: string }[] = [
  { key: 'current', label: 'Al día' },
  { key: 'd1_30', label: '1–30 días' },
  { key: 'd31_60', label: '31–60 días' },
  { key: 'd61_90', label: '61–90 días' },
  { key: 'd90_plus', label: 'Más de 90' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días completos de atraso (0 si no vence o aún no vence). */
export function daysOverdue(dueDate: Date | string | null, now: Date = new Date()): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate).getTime();
  const diff = Math.floor((now.getTime() - due) / DAY_MS);
  return diff > 0 ? diff : 0;
}

export function agingBucket(days: number): AgingBucketKey {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

export function summarizeAging(
  items: { balance: number; dueDate: Date | string | null }[],
  now: Date = new Date()
): Record<AgingBucketKey, { amount: number; count: number }> {
  const result: Record<AgingBucketKey, { amount: number; count: number }> = {
    current: { amount: 0, count: 0 },
    d1_30: { amount: 0, count: 0 },
    d31_60: { amount: 0, count: 0 },
    d61_90: { amount: 0, count: 0 },
    d90_plus: { amount: 0, count: 0 },
  };
  for (const item of items) {
    if (item.balance <= 0) continue;
    const bucket = result[agingBucket(daysOverdue(item.dueDate, now))];
    bucket.amount += item.balance;
    bucket.count += 1;
  }
  return result;
}
