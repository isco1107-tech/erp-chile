'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsSnapshot } from '@/lib/analytics/types';
import { ChartCard, ChartLegendItem, ChartTooltip } from '@/components/ui/ChartCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/chile/tax';

const dayLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const compactClp = (value: number) => new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' };

function chartAxes() {
  return (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
      <XAxis dataKey="date" tickFormatter={dayLabel} axisLine={false} tickLine={false} tick={axisTick} minTickGap={24} />
      <YAxis tickFormatter={compactClp} width={54} axisLine={false} tickLine={false} tick={axisTick} />
      <Tooltip content={ChartTooltip} labelFormatter={(label) => `Fecha: ${String(label)}`} cursor={{ stroke: 'var(--border)' }} />
    </>
  );
}

export function AnalyticsCharts({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const hasTrading = snapshot.sources.sales || snapshot.sources.purchases;
  const hasTradingActivity = snapshot.daily.some((day) => day.documents > 0 || day.netSales !== 0 || day.purchases !== 0);
  const hasCashActivity = snapshot.daily.some((day) => day.income !== 0 || day.expense !== 0);

  return (
    <section aria-label="Series diarias de la empresa" className="space-y-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {hasTrading && (
          <ChartCard
            title="Ventas y compras netas"
            subtitle="CLP por día · documentos emitidos; notas de crédito restadas"
            className="min-w-0"
            legend={
              <>
                {snapshot.sources.sales && <ChartLegendItem color="var(--primary)" label="Ventas netas" />}
                {snapshot.sources.purchases && <ChartLegendItem color="var(--muted-foreground)" label="Compras netas" />}
              </>
            }
          >
            {hasTradingActivity ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={snapshot.daily} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {chartAxes()}
                  {snapshot.sources.sales && <Bar dataKey="netSales" name="Ventas netas" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />}
                  {snapshot.sources.purchases && <Bar dataKey="purchases" name="Compras netas" fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />}
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="Sin actividad comercial en este período" description="El gráfico aparecerá con los documentos emitidos de la empresa." className="h-full py-4" />}
          </ChartCard>
        )}
        {snapshot.sources.treasury && (
          <ChartCard
            title="Ingresos y egresos de caja"
            subtitle="CLP por día · pagos registrados, según su fecha de pago"
            className="min-w-0"
            legend={<><ChartLegendItem color="var(--success)" label="Ingresos" /><ChartLegendItem color="var(--destructive)" label="Egresos" /></>}
          >
            {hasCashActivity ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={snapshot.daily} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {chartAxes()}
                  <Line type="linear" dataKey="income" name="Ingresos" stroke="var(--success)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="expense" name="Egresos" stroke="var(--destructive)" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState title="Sin pagos registrados en este período" description="Ingresos y egresos muestran movimientos efectivos; no equivalen a ventas y compras." className="h-full py-4" />}
          </ChartCard>
        )}
      </div>
      {(hasTrading || snapshot.sources.treasury) && (
        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Ver datos diarios en tabla</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <caption className="sr-only">Valores diarios en pesos chilenos. La fecha corresponde a America/Santiago.</caption>
              <thead><tr className="border-b border-border text-muted-foreground"><th scope="col" className="p-2">Fecha</th>{snapshot.sources.sales && <th scope="col" className="p-2">Ventas netas</th>}{snapshot.sources.purchases && <th scope="col" className="p-2">Compras netas</th>}{snapshot.sources.treasury && <><th scope="col" className="p-2">Ingresos</th><th scope="col" className="p-2">Egresos</th></>}</tr></thead>
              <tbody>{snapshot.daily.map((day) => <tr key={day.date} className="border-b border-border last:border-0"><th scope="row" className="whitespace-nowrap p-2 font-normal">{day.date}</th>{snapshot.sources.sales && <td className="whitespace-nowrap p-2">{formatCurrency(day.netSales)}</td>}{snapshot.sources.purchases && <td className="whitespace-nowrap p-2">{formatCurrency(day.purchases)}</td>}{snapshot.sources.treasury && <><td className="whitespace-nowrap p-2">{formatCurrency(day.income)}</td><td className="whitespace-nowrap p-2">{formatCurrency(day.expense)}</td></>}</tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

export function ScienceCharts({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const science = snapshot.science;
  if (!science || science.status !== 'ready') return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: snapshot.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(snapshot.generatedAt));
  const history = snapshot.daily.filter((day) => day.date < today).slice(-science.sampleDays).map((day) => ({ date: day.date, observed: day.netSales, expected: null as number | null, lower: null as number | null, upper: null as number | null }));
  const projected = science.forecast.map((day) => ({ ...day, observed: null as number | null }));
  const chartData = [...history, ...projected];

  return (
    <section aria-label="Historial y proyección de ventas" className="space-y-4">
      <ChartCard
        title="Historial y proyección de ventas netas"
        subtitle="CLP por día · se excluye el día actual del historial; los trazos discontinuos representan estimaciones"
        height={320}
        className="min-w-0"
        legend={<><ChartLegendItem color="var(--primary)" label="Observado" /><ChartLegendItem color="var(--foreground)" label="Estimado (discontinuo)" /><ChartLegendItem color="var(--muted-foreground)" label="Límites de referencia (punteados)" /></>}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={chartData} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {chartAxes()}
            <Line type="linear" dataKey="observed" name="Observado" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="expected" name="Estimado" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="7 4" dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="lower" name="Límite inferior" stroke="var(--muted-foreground)" strokeDasharray="2 4" dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="upper" name="Límite superior" stroke="var(--muted-foreground)" strokeDasharray="2 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <details className="rounded-lg border border-border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">Ver proyección en tabla</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">Proyecciones diarias en pesos chilenos con sus límites de referencia.</caption>
            <thead><tr className="border-b border-border text-muted-foreground"><th scope="col" className="p-2">Fecha</th><th scope="col" className="p-2">Estimado</th><th scope="col" className="p-2">Límite inferior</th><th scope="col" className="p-2">Límite superior</th></tr></thead>
            <tbody>{science.forecast.map((day) => <tr key={day.date} className="border-b border-border last:border-0"><th scope="row" className="whitespace-nowrap p-2 font-normal">{day.date}</th><td className="whitespace-nowrap p-2">{formatCurrency(day.expected)}</td><td className="whitespace-nowrap p-2">{formatCurrency(day.lower)}</td><td className="whitespace-nowrap p-2">{formatCurrency(day.upper)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
