'use client';

/**
 * Recharts en cliente aparte, mismo motivo que `DashboardCharts`: importarlo
 * directo en el Server Component de detalle de proyecto rompe la recolección
 * de datos de servidor de Next durante el build.
 */

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartLegendItem, ChartTooltip } from '@/components/ui/ChartCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/chile/tax';
import type { ProjectFinancialSummary } from '@/lib/services/projects';

function formatCompactClp(value: number): string {
  return new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function ProjectFinanceCharts({ summary }: { summary: ProjectFinancialSummary }) {
  const totalIncome = summary.actualIncomeCash + summary.actualIncomeBarter;
  const incomeMix = [
    { name: 'Efectivo', value: summary.actualIncomeCash, color: 'var(--accent-foreground)' },
    { name: 'Canje (barter)', value: summary.actualIncomeBarter, color: 'var(--info)' },
  ].filter((d) => d.value > 0);

  const budgetVsActual = [
    { category: 'Ingresos', budgeted: summary.budgetedIncome, actual: summary.actualIncomeCash },
    { category: 'Gastos', budgeted: summary.budgetedExpense, actual: summary.actualExpense },
  ];

  return (
    <section className="grid grid-cols-12 gap-5">
      <div className="col-span-12 lg:col-span-7">
        <ChartCard
          title="Presupuesto vs. Real"
          subtitle="Ingresos en efectivo y gastos, comparados contra lo presupuestado"
          height={280}
          legend={
            <>
              <ChartLegendItem color="#E4E7EC" label="Presupuestado" />
              <ChartLegendItem color="var(--primary)" label="Real" />
            </>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={budgetVsActual} barGap={4}>
              <CartesianGrid vertical={false} stroke="#EAECF0" strokeDasharray="4 4" />
              <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                tickFormatter={formatCompactClp}
                width={48}
              />
              <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--muted)' }} />
              <Bar dataKey="budgeted" name="Presupuestado" fill="#E4E7EC" radius={[6, 6, 0, 0]} maxBarSize={56} />
              <Bar dataKey="actual" name="Real" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="col-span-12 lg:col-span-5">
        <ChartCard title="Composición de ingresos" subtitle="Efectivo vs. canje (barter)" height={280}>
          {incomeMix.length > 0 ? (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={incomeMix} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={3} strokeWidth={0}>
                    {incomeMix.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={ChartTooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums text-foreground">{formatCurrency(totalIncome)}</span>
                <span className="text-xs text-muted-foreground">ingreso total</span>
              </div>
            </div>
          ) : (
            <EmptyState title="Sin ingresos registrados" className="h-full" />
          )}
        </ChartCard>
        {incomeMix.length > 0 && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3 shadow-card">
            {incomeMix.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between text-xs">
                <ChartLegendItem color={entry.color} label={entry.name} />
                <span className="font-semibold tabular-nums text-foreground">{formatCurrency(entry.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
