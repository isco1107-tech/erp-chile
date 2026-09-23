'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartLegendItem, ChartTooltip } from '@/components/ui/ChartCard';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/chile/tax';
import { FORECAST_KIND_LABEL, INFLOW_KINDS, runningBalance, type ForecastFlowKind, type WeeklyForecast } from '@/lib/intelligence/cash-forecast';
import { formatCompactClp, formatShortDate } from '@/lib/intelligence/format';
import type { CashForecastData } from '@/modules/intelligence/services/cash-forecast.service';
import { cn } from '@/lib/utils';

const OPENING_KEY = 'aether:cash-forecast:opening';

function toForecast(data: CashForecastData): WeeklyForecast {
  return {
    overdueInflows: data.overdueInflows,
    overdueOutflows: data.overdueOutflows,
    weeks: data.weeks.map((week) => ({ ...week, start: new Date(week.start), end: new Date(week.end) })),
  };
}

export function CashForecastClient({ data }: { data: CashForecastData }) {
  const [opening, setOpening] = useState(0);
  const [recoveryPct, setRecoveryPct] = useState(50);

  // Saldo inicial recordado por navegador: es una conveniencia (el sistema no
  // conoce el saldo de tus bancos), no un dato de la empresa.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPENING_KEY);
      if (stored !== null && Number.isFinite(Number(stored))) setOpening(Number(stored));
    } catch {
      /* almacenamiento bloqueado: se parte en 0 */
    }
  }, []);

  function updateOpening(value: number) {
    setOpening(value);
    try {
      window.localStorage.setItem(OPENING_KEY, String(value));
    } catch {
      /* sin persistencia, sigue funcionando */
    }
  }

  const forecast = useMemo(() => toForecast(data), [data]);
  const balances = useMemo(() => runningBalance(forecast, opening, recoveryPct), [forecast, opening, recoveryPct]);
  const chartData = forecast.weeks.map((week, index) => ({
    label: `S${index + 1} · ${formatShortDate(week.start)}`,
    inflows: week.inflows,
    outflows: -week.outflows,
    balance: balances[index].closing,
  }));
  const lowest = balances.reduce((min, point) => (point.closing < min.closing ? point : min), balances[0]);
  const firstNegative = balances.find((point) => point.closing < 0);
  const totalIn = forecast.weeks.reduce((sum, week) => sum + week.inflows, 0);
  const totalOut = forecast.weeks.reduce((sum, week) => sum + week.outflows, 0);
  const kinds = (Object.keys(FORECAST_KIND_LABEL) as ForecastFlowKind[]).filter((kind) => forecast.weeks.some((week) => week.byKind[kind] > 0));

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <Label htmlFor="opening-balance">Saldo actual en bancos y caja</Label>
          <CurrencyInput id="opening-balance" value={opening} onChange={updateOpening} className="mt-2" />
          <p className="mt-2 text-xs text-muted-foreground">Ingrésalo para ver tu saldo proyectado. Se recuerda solo en este navegador.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="recovery">Recuperación de lo vencido</Label>
            <span className="text-sm font-semibold tabular-nums">{recoveryPct}%</span>
          </div>
          <input id="recovery" type="range" min={0} max={100} step={5} value={recoveryPct} onChange={(e) => setRecoveryPct(Number(e.target.value))} className="mt-3 w-full accent-primary" />
          <p className="mt-2 text-xs text-muted-foreground">
            Tienes {formatCurrency(data.overdueInflows)} por cobrar ya vencidos. Aquí decides cuánto esperas recuperar en las próximas 4 semanas.
          </p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-5 shadow-card',
            firstNegative ? 'border-danger/30 bg-danger-soft' : 'border-success/30 bg-success-soft'
          )}
        >
          <div className="flex items-center gap-2">
            {firstNegative ? <AlertTriangle className="size-5 text-danger" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-success" aria-hidden="true" />}
            <p className={cn('text-sm font-semibold', firstNegative ? 'text-danger' : 'text-success')}>
              {firstNegative ? `Descalce de caja en la semana ${firstNegative.index + 1}` : 'Sin descalces en 13 semanas'}
            </p>
          </div>
          <p className="mt-2 text-sm text-foreground">
            Punto más bajo: <span className="font-semibold tabular-nums">{formatCurrency(lowest.closing)}</span> en la semana {lowest.index + 1}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Entradas {formatCurrency(totalIn)} · Salidas {formatCurrency(totalOut)}
          </p>
        </div>
      </section>

      <ChartCard
        title="Entradas, salidas y saldo proyectado"
        subtitle="Por semana, desde hoy"
        height={320}
        legend={
          <>
            <ChartLegendItem color="var(--chart-3)" label="Entradas" />
            <ChartLegendItem color="var(--chart-4)" label="Salidas" />
            <ChartLegendItem color="var(--chart-2)" label="Saldo al cierre" />
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} stackOffset="sign">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} interval={0} angle={-30} textAnchor="end" height={56} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickFormatter={formatCompactClp} width={64} />
            <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--muted)' }} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
            <Bar dataKey="inflows" name="Entradas" stackId="flow" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="outflows" name="Salidas" stackId="flow" fill="var(--chart-4)" radius={[0, 0, 4, 4]} maxBarSize={28} />
            <Line dataKey="balance" name="Saldo al cierre" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="grid grid-cols-12 gap-5">
        <div className="col-span-12 overflow-hidden rounded-lg border border-border bg-card shadow-card xl:col-span-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Semana</th>
                  {kinds.map((kind) => (
                    <th key={kind} className="px-3 py-2 text-right font-medium">
                      {FORECAST_KIND_LABEL[kind]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Neto</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {forecast.weeks.map((week, index) => (
                  <tr key={week.index} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      S{index + 1} · {formatShortDate(week.start)}
                    </td>
                    {kinds.map((kind) => {
                      const value = week.byKind[kind];
                      const inflow = INFLOW_KINDS.includes(kind);
                      return (
                        <td key={kind} className={cn('px-3 py-2 text-right tabular-nums', value === 0 ? 'text-muted-foreground/50' : inflow ? 'text-success' : 'text-foreground')}>
                          {value === 0 ? '—' : `${inflow ? '' : '−'}${formatCurrency(value)}`}
                        </td>
                      );
                    })}
                    <td className={cn('px-3 py-2 text-right font-medium tabular-nums', week.net < 0 ? 'text-danger' : 'text-foreground')}>{formatCurrency(week.net)}</td>
                    <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', balances[index].closing < 0 ? 'text-danger' : 'text-foreground')}>
                      {formatCurrency(balances[index].closing)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-span-12 rounded-lg border border-border bg-card p-5 shadow-card xl:col-span-4">
          <h2 className="text-base font-semibold text-foreground">Compromisos más grandes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Lo que más mueve tu caja en el horizonte.</p>
          <ul className="mt-4 space-y-2">
            {data.topFlows.length === 0 && <li className="text-sm text-muted-foreground">No hay compromisos con fecha en las próximas 13 semanas.</li>}
            {data.topFlows.map((flow, index) => {
              const inflow = INFLOW_KINDS.includes(flow.kind);
              return (
                <li key={`${flow.label}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{flow.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatShortDate(flow.date)} · <StatusBadge tone={inflow ? 'success' : 'neutral'} className="px-1.5 py-0 text-[10px]">{FORECAST_KIND_LABEL[flow.kind]}</StatusBadge>
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', inflow ? 'text-success' : 'text-foreground')}>
                    {inflow ? '+' : '−'}
                    {formatCurrency(flow.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
          {data.notes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-border pt-3">
              {data.notes.map((note) => (
                <li key={note} className="text-xs text-muted-foreground">
                  · {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
