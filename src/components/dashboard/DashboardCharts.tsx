'use client';

/**
 * Recharts necesita ejecutarse en el cliente (usa `React.createContext` de una
 * forma que rompe la recolección de datos de servidor de Next durante el build
 * — "TypeError: (0, i.createContext) is not a function" — si se importa
 * directo en un Server Component). Por eso los dos gráficos del Dashboard
 * viven acá, en un Client Component aparte que solo recibe datos ya calculados
 * como props; `dashboard/page.tsx` sigue siendo un Server Component que hace
 * las queries a Prisma y le pasa el resultado a este componente.
 */

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import { ChartCard, ChartLegendItem, ChartTooltip } from '@/components/ui/ChartCard';
import { EmptyState } from '@/components/ui/EmptyState';

function formatCompactClp(value: number): string {
  return new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Tooltip de conteos (documentos), no monetario: el `ChartTooltip` compartido siempre formatea como CLP. */
function CountTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number; payload?: { color?: string } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="rounded-[10px] bg-popover px-3 py-2 shadow-popover">
      <div className="flex items-center gap-2 text-xs">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.payload?.color }} aria-hidden />
        <span className="text-muted-foreground">{entry.name}</span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">{entry.value} docs.</span>
      </div>
    </div>
  );
}

export interface MonthlyBucket {
  key: string;
  label: string;
  netSales: number;
  costOfSales: number;
}

export interface MixDatum {
  name: string;
  value: number;
  color: string;
}

interface DashboardChartsProps {
  monthlyBuckets: MonthlyBucket[];
  mixData: MixDatum[];
  currentMonthDocCount: number;
}

export function DashboardCharts({ monthlyBuckets, mixData, currentMonthDocCount }: DashboardChartsProps) {
  const [months, setMonths] = useState<6 | 12>(12);
  const visibleBuckets = monthlyBuckets.slice(-months);
  const hasActivity = visibleBuckets.some((bucket) => bucket.netSales !== 0 || bucket.costOfSales !== 0);
  return (
    <section className="grid grid-cols-12 gap-5">
      <div className="col-span-12 lg:col-span-8">
        <ChartCard
          title="El ritmo de tu negocio"
          subtitle={`Ventas netas y costo PMP · últimos ${months} meses`}
          action={
            <div className="flex shrink-0 gap-1 rounded-full bg-muted p-1" aria-label="Período del gráfico">
              {([6, 12] as const).map((period) => (
                <button key={period} type="button" aria-pressed={months === period} onClick={() => setMonths(period)} className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${months === period ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{period}m</button>
              ))}
            </div>
          }
          height={280}
          legend={
            <>
              <ChartLegendItem color="var(--primary)" label="Ventas netas" />
              <ChartLegendItem color="var(--chart-2)" label="Costo PMP" />
            </>
          }
        >
          {hasActivity ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleBuckets} barGap={4} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickFormatter={formatCompactClp}
                width={48}
              />
              <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--muted)' }} />
              <Bar dataKey="netSales" name="Ventas netas" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={24} />
              <Bar dataKey="costOfSales" name="Costo PMP" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer> : <EmptyState title="Aún no hay actividad en este período" description="Las ventas emitidas y sus costos aparecerán aquí." className="h-full" />}
        </ChartCard>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <ChartCard title="Mix de documentos" subtitle="Emitidos este mes" height={280}>
          {mixData.length > 0 ? (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3} strokeWidth={0}>
                    {mixData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CountTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">{currentMonthDocCount}</span>
                <span className="text-xs text-muted-foreground">documentos</span>
              </div>
            </div>
          ) : (
            <EmptyState title="Sin documentos este mes" className="h-full" />
          )}
        </ChartCard>
        {mixData.length > 0 && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3 shadow-card">
            {mixData.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between text-xs">
                <ChartLegendItem color={entry.color} label={entry.name} />
                <span className="font-semibold tabular-nums text-foreground">{entry.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
