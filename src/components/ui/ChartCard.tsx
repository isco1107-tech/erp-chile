import type { ReactNode } from 'react';
import type { TooltipContentProps } from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/chile/tax';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Control a la derecha del título: tabs, select o menú. */
  action?: ReactNode;
  /** Alto fijo del cuerpo del gráfico, según el brief (280 o 320px). */
  height?: 280 | 320;
  /** Leyenda con puntos redondos, debajo del gráfico. Usar <ChartLegendItem />. */
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Tarjeta contenedora estándar para cualquier gráfico de Recharts del dashboard. */
export function ChartCard({ title, subtitle, action, height = 280, legend, children, className }: ChartCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5 shadow-card', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>

      <div className="mt-4" style={{ height }}>
        {children}
      </div>

      {legend && <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">{legend}</div>}
    </div>
  );
}

/** Punto redondo + etiqueta (+ valor opcional) para la leyenda de un ChartCard. */
export function ChartLegendItem({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
      {value && <span className="font-semibold tabular-nums text-foreground">{value}</span>}
    </span>
  );
}

/**
 * Tooltip custom para Recharts: tarjeta blanca, radio 10px, sombra popover,
 * sin borde por defecto. Formatea los valores como CLP porque toda cifra
 * monetaria de este dashboard es CLP (ver `src/lib/chile/tax.ts`); si algún
 * gráfico futuro necesita mostrar un valor no monetario, no debe usar este
 * tooltip tal cual.
 */
export function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-[10px] bg-popover px-3 py-2 shadow-popover">
      {label !== undefined && <p className="mb-1.5 text-xs font-medium text-muted-foreground">{String(label)}</p>}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={entry.dataKey ? String(entry.dataKey) : index} className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground">
              {typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
