'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleDollarSign, Gift, Scale, Target, Trophy } from 'lucide-react';
import { ChartCard } from '@/components/ui/ChartCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/chile/tax';
import { formatCompactClp, formatDays, formatPct } from '@/lib/intelligence/format';
import type { BreakdownRow, ForecastBucket } from '@/lib/crm/analytics';
import { getCrmReportAction } from '@/modules/crm/actions/crm.actions';
import type { CrmReport } from '@/modules/crm/services/crm.service';
import { cn } from '@/lib/utils';

function ForecastTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ForecastBucket }> }) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;
  return (
    <div className="rounded-[10px] bg-popover px-3 py-2 text-xs shadow-popover">
      <p className="mb-1 font-medium text-foreground">{bucket.label}</p>
      <p className="text-muted-foreground">
        Ponderado <span className="ml-2 font-semibold tabular-nums text-foreground">{formatCurrency(bucket.weighted)}</span>
      </p>
      <p className="text-muted-foreground">
        Monto total <span className="ml-2 font-semibold tabular-nums text-foreground">{formatCurrency(bucket.amount)}</span>
      </p>
      <p className="text-muted-foreground">{bucket.count} negocio(s)</p>
    </div>
  );
}

function BreakdownTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.openAmount + r.wonAmount));
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Sin datos todavía.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Grupo
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Abierto
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Ponderado
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Ganado
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Canje ganado
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Tasa de cierre
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Ciclo
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-foreground">{row.label}</p>
                    <div className="mt-1 h-1 w-full max-w-[180px] rounded-full bg-muted" aria-hidden="true">
                      <div className="h-1 rounded-full bg-chart-1" style={{ width: `${((row.openAmount + row.wonAmount) / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatCurrency(row.openAmount)}
                    <span className="block text-[11px] text-muted-foreground">{row.openCount} negocio(s)</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.weighted)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatCurrency(row.wonAmount)}
                    <span className="block text-[11px] text-muted-foreground">{row.wonCount} ganado(s)</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.wonBarter > 0 ? formatCurrency(row.wonBarter) : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatPct(row.winRatePct, 0)}</td>
                  <td className="py-2 text-right tabular-nums">{formatDays(row.medianCycleDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Reporte comercial (12 meses): pronóstico por mes de cierre y desgloses por
 * tipo de negocio, certamen, origen y responsable. Las cifras salen de las
 * funciones puras de `src/lib/crm/analytics.ts`.
 */
export function CrmReportsClient() {
  const [report, setReport] = useState<CrmReport | null>(null);
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    const result = await getCrmReportAction({ mine });
    if (result.success) setReport(result.data);
    else toast.error(result.error);
  }, [mine]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!report) return <p className="text-sm text-muted-foreground">Cargando reporte…</p>;
  const { totals } = report;
  const hasForecast = report.forecast.some((b) => b.count > 0);
  const maxLost = Math.max(1, ...report.lostReasons.map((r) => r.count));

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {[
          { v: false, label: 'Todo el equipo' },
          { v: true, label: 'Mis negocios' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setMine(option.v)}
            className={cn('rounded-md px-3 py-1', mine === option.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Embudo abierto" value={formatCurrency(totals.openAmount)} icon={Target} tone="accent" />
        <KpiCard label="Pronóstico ponderado" value={formatCurrency(totals.weighted)} icon={Scale} tone="info" />
        <KpiCard label="Ganado (12 meses)" value={formatCurrency(totals.wonAmount)} icon={Trophy} tone="success" />
        <KpiCard label="Canje ganado (12 meses)" value={formatCurrency(totals.wonBarter)} icon={Gift} tone="neutral" />
        <KpiCard label="Tasa de cierre" value={formatPct(totals.winRatePct, 0)} icon={CircleDollarSign} tone="accent" trend={`${totals.closedCount} cerrados`} hint="en 12 meses" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <ChartCard title="Pronóstico por mes de cierre" subtitle="Monto ponderado por probabilidad de los negocios abiertos, según su fecha esperada de cierre" height={280}>
          {hasForecast ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.forecast} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis tickFormatter={(v: number) => formatCompactClp(v)} tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <Tooltip content={<ForecastTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                <Bar dataKey="weighted" name="Ponderado" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Sin negocios abiertos con fecha de cierre" description="Agrega la fecha esperada de cierre a tus oportunidades para ver el pronóstico." />
          )}
        </ChartCard>

        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h3 className="text-base font-semibold text-foreground">Detalle del pronóstico</h3>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-1.5 font-medium">
                  Mes
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Negocios
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Ponderado
                </th>
              </tr>
            </thead>
            <tbody>
              {report.forecast.map((bucket) => (
                <tr key={bucket.key} className="border-b border-border last:border-0">
                  <td className={cn('py-1.5', bucket.key === 'overdue' && bucket.count > 0 && 'font-medium text-danger')}>{bucket.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{bucket.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(bucket.weighted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <BreakdownTable title="Por tipo de negocio" subtitle="Auspicios, producción de eventos, entradas corporativas, presentaciones…" rows={report.byDealType} />
      <BreakdownTable title="Por certamen" subtitle="Cuánto negocio genera cada certamen o evento" rows={report.byProject} />
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
        <BreakdownTable title="Por origen" subtitle="De dónde vienen los negocios que se ganan" rows={report.bySource} />
        <BreakdownTable title="Por responsable" subtitle="Desempeño del equipo comercial" rows={report.byOwner} />
      </div>

      <section className="rounded-lg border border-border bg-card p-5 shadow-card">
        <h3 className="text-base font-semibold text-foreground">Motivos de pérdida</h3>
        {report.lostReasons.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Sin negocios perdidos en los últimos 12 meses.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.lostReasons.map((r) => (
              <li key={r.reason} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
                <span className="truncate text-foreground">{r.reason}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{r.count}</span>
                <div className="col-span-2 mt-1 h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <div className="h-1.5 rounded-full bg-muted-foreground/50" style={{ width: `${(r.count / maxLost) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
