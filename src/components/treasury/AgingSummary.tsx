import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { AGING_BUCKETS, summarizeAging, type AgingBucketKey } from './aging';

const BUCKET_COLOR: Record<AgingBucketKey, string> = {
  current: 'bg-success',
  d1_30: 'bg-[#c9a24a]',
  d31_60: 'bg-warning',
  d61_90: 'bg-[#c2410c]',
  d90_plus: 'bg-danger',
};

/**
 * Barra de antigüedad de saldos + desglose por tramo. Muestra de un vistazo
 * cuánto de lo pendiente está al día y cuánto lleva meses vencido.
 */
export function AgingSummary({
  title,
  items,
}: {
  title: string;
  items: { balance: number; dueDate: Date | string | null }[];
}) {
  const aging = summarizeAging(items);
  const total = AGING_BUCKETS.reduce((sum, bucket) => sum + aging[bucket.key].amount, 0);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">Según días de atraso sobre el vencimiento</p>
      </div>

      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No hay saldos pendientes.</p>
      ) : (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {AGING_BUCKETS.map((bucket) =>
              aging[bucket.key].amount > 0 ? (
                <div
                  key={bucket.key}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', BUCKET_COLOR[bucket.key])}
                  style={{ width: `${(aging[bucket.key].amount / total) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
            {AGING_BUCKETS.map((bucket) => (
              <div key={bucket.key}>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', BUCKET_COLOR[bucket.key])} aria-hidden="true" />
                  {bucket.label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatCurrency(aging[bucket.key].amount)}</dd>
                <dd className="text-xs text-muted-foreground">
                  {aging[bucket.key].count} doc. · {total ? Math.round((aging[bucket.key].amount / total) * 100) : 0}%
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
