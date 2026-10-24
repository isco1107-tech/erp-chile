import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { ScrollToEnd } from '@/components/shared/ScrollToEnd';
import { intensityLevel, type HeatmapColumn } from '@/lib/retail/heatmap';
import type { HeatmapRow } from '@/modules/retail/services/heatmap.service';

/**
 * Mapa de calor: una fila por producto, una celda por semana (o día). Escala
 * secuencial de un solo tono (la tinta de marca, de claro a oscuro) contra el
 * máximo del mapa; un período sin stock lleva textura rayada en vez de color,
 * porque no vender por no tener no es lo mismo que no vender. Cada celda trae
 * su cifra (la tabla es su propia vista accesible) y el detalle al pasar encima.
 */

const LEVEL_CLASS = [
  'bg-card text-muted-foreground',
  'bg-primary/10 text-foreground',
  'bg-primary/25 text-foreground',
  'bg-primary/45 text-foreground',
  'bg-primary/65 text-primary-foreground',
  'bg-primary/85 text-primary-foreground',
] as const;

/** Textura del "sin stock": rayas finas a 45° en tinta tenue, sin color de estado. */
export const NO_STOCK_STYLE: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--muted-foreground) 30%, transparent) 0 1px, transparent 1px 6px)',
};

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: value < 10 ? 1 : 0 });

export function HeatmapLegend({ max, unitHint }: { max: number; unitHint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        Menos
        <span className="inline-flex overflow-hidden rounded-sm border border-border" aria-hidden="true">
          {LEVEL_CLASS.slice(1).map((level) => (
            <span key={level} className={cn('block h-3 w-5', level.split(' ')[0])} />
          ))}
        </span>
        Más ({qty(max)} {unitHint} la celda más alta)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="block h-3 w-5 rounded-sm border border-border" style={NO_STOCK_STYLE} aria-hidden="true" />
        Sin stock todo el período
      </span>
      <span>* con algún día sin stock</span>
    </div>
  );
}

export function HeatmapGrid({ rows, columns, max, grain }: { rows: HeatmapRow[]; columns: HeatmapColumn[]; max: number; grain: 'semana' | 'dia' }) {
  return (
    <ScrollToEnd className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-left text-xs" data-testid="retail-heatmap">
        <caption className="sr-only">Unidades vendidas por producto y {grain === 'semana' ? 'semana' : 'día'}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-32 bg-card px-2 py-1 font-semibold text-muted-foreground sm:min-w-44">
              Producto
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="min-w-11 px-1 py-1 text-center font-medium whitespace-nowrap text-muted-foreground tabular-nums">
                {column.label}
              </th>
            ))}
            <th scope="col" className="px-2 py-1 text-right font-semibold text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId}>
              <th scope="row" className="sticky left-0 z-10 max-w-32 bg-card px-2 py-1 text-left font-medium sm:max-w-56">
                <span className="block truncate" title={row.name} data-truncate>
                  {row.name}
                </span>
                <span className="block truncate font-mono text-[11px] font-normal text-muted-foreground">{row.sku}</span>
              </th>
              {row.cells.map((cell, index) => {
                const column = columns[index]!;
                const noStock = cell.availableDays === 0;
                const partial = !noStock && cell.availableDays < cell.totalDays;
                const level = noStock ? 0 : intensityLevel(cell.sold, max);
                const period = grain === 'semana' ? `semana del ${column.label}` : column.label;
                const detail = noStock
                  ? `${row.name}, ${period}: sin stock`
                  : `${row.name}, ${period}: ${qty(cell.sold)} ${row.unit} vendidas${grain === 'semana' ? ` (${cell.availableDays} de ${cell.totalDays} días con stock)` : ''}`;
                return (
                  <td
                    key={column.key}
                    title={detail}
                    aria-label={detail}
                    className={cn('h-9 rounded-sm px-1 text-center tabular-nums', noStock ? 'text-muted-foreground' : LEVEL_CLASS[level])}
                    style={noStock ? NO_STOCK_STYLE : undefined}
                  >
                    {noStock ? '' : `${qty(cell.sold)}${partial ? '*' : ''}`}
                  </td>
                );
              })}
              <td className="px-2 text-right font-semibold whitespace-nowrap tabular-nums">
                {qty(row.total)} <span className="text-[11px] font-normal text-muted-foreground">{row.unit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollToEnd>
  );
}
