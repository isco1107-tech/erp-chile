'use client';

import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartLegendItem } from '@/components/ui/ChartCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/chile/tax';
import { formatCompactClp } from '@/lib/intelligence/format';

interface Point {
  label: string;
  netSales?: number;
  grossProfit?: number;
  projection?: number;
  band?: [number, number];
}

function TrendTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: Array<{ dataKey?: string; value?: number | [number, number]; color?: string; name?: string }> }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-[10px] bg-popover px-3 py-2 shadow-popover">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          if (entry.value === undefined || entry.value === null) return null;
          const text = Array.isArray(entry.value)
            ? `${formatCurrency(entry.value[0])} – ${formatCurrency(entry.value[1])}`
            : formatCurrency(entry.value);
          return (
            <div key={String(entry.dataKey)} className="flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Ventas y utilidad bruta de 12 meses, más la proyección estadística de los
 * próximos 3 con su banda de incertidumbre. La proyección arranca en el
 * último mes completo para que la línea se lea como continuación.
 */
export function SalesTrendChart({
  monthly,
  forecast,
}: {
  monthly: Array<{ label: string; netSales: number; grossProfit: number }>;
  forecast: Array<{ label: string; value: number; low: number; high: number }>;
}) {
  const hasData = monthly.some((point) => point.netSales !== 0);
  const data: Point[] = monthly.map((point) => ({ label: point.label, netSales: point.netSales, grossProfit: point.grossProfit }));
  if (forecast.length > 0 && data.length >= 2) {
    // Penúltimo punto = último mes completo (el último es el mes en curso).
    const anchor = data[data.length - 2];
    anchor.projection = anchor.netSales;
    anchor.band = [anchor.netSales ?? 0, anchor.netSales ?? 0];
    for (const point of forecast) data.push({ label: point.label, projection: point.value, band: [point.low, point.high] });
  }

  return (
    <ChartCard
      title="Ventas, utilidad y proyección"
      subtitle="12 meses reales + 3 meses proyectados por tendencia"
      height={320}
      legend={
        hasData ? (
          <>
            <ChartLegendItem color="var(--chart-2)" label="Ventas netas" />
            <ChartLegendItem color="var(--chart-3)" label="Utilidad bruta" />
            <ChartLegendItem color="var(--chart-1)" label="Proyección" />
          </>
        ) : undefined
      }
    >
      {hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickFormatter={formatCompactClp} width={60} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--muted)' }} />
            <Area dataKey="band" name="Rango probable" stroke="none" fill="var(--chart-1)" fillOpacity={0.15} isAnimationActive={false} />
            <Bar dataKey="netSales" name="Ventas netas" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={22} />
            <Bar dataKey="grossProfit" name="Utilidad bruta" fill="var(--chart-3)" radius={[6, 6, 0, 0]} maxBarSize={22} />
            <Line dataKey="projection" name="Proyección" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState title="Aún no hay ventas emitidas" description="La tendencia aparece apenas emitas tus primeros documentos de venta." className="h-full" />
      )}
    </ChartCard>
  );
}
