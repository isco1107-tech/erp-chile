import Link from 'next/link';
import { ArrowLeftRight, Warehouse as WarehouseIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { describeRange, type RangePresetId } from '@/lib/exports/ranges';
import { movementsQuery, readMovementsFilter, readRange, type ParamReader } from '@/lib/exports/filters';
import { LOG_KINDS, LOG_KIND_LABELS } from '@/lib/inventory/movement-kinds';
import { listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { MAX_MOVEMENT_EXPORT_ROWS, MOVEMENTS_PAGE_SIZE, listMovements, summarizeMovements } from '@/modules/exports/services/movements-export.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DownloadButton, FIELD_CLASS, Pager, RangePresets, clampPage, exportsHref } from './ExportChrome';

function when(date: Date): string {
  return date.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

/**
 * Movimientos de inventario de todas las bodegas (o de una). Cada fila trae su bodega y el stock de
 * ESE producto en ESA bodega, así que mezclarlas no confunde el saldo.
 */
export async function MovementsExportPanel({ companyId, read, includeCosts }: { companyId: string; read: ParamReader; includeCosts: boolean }) {
  const today = santiagoDateParts(new Date());
  const filter = readMovementsFilter(read, today);
  const { preset } = readRange(read, today);
  const page = clampPage(read('pagina'));
  const [{ rows, total }, summary, warehouses] = await Promise.all([
    listMovements(companyId, filter, page, { includeCosts }),
    summarizeMovements(companyId, filter),
    listWarehousesForLog(companyId),
  ]);

  const base = { datos: 'movimientos', tipo: filter.kind === 'ALL' ? undefined : filter.kind, bodega: filter.warehouseId, q: filter.q };
  const hrefFor = (overrides: Record<string, string | undefined>) => exportsHref({ ...base, ...(filter.from || filter.to ? { desde: filter.from, hasta: filter.to } : { rango: 'todo' }), ...overrides });
  const presetHref = (id: RangePresetId) => exportsHref({ ...base, rango: id });
  const truncated = total > MAX_MOVEMENT_EXPORT_ROWS;
  const warehouseName = warehouses.find((warehouse) => warehouse.id === filter.warehouseId)?.name;

  return (
    <div className="space-y-6">
      <RangePresets active={preset} hrefFor={presetHref} />

      <form method="get" action="/dashboard/exports" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros de movimientos de inventario">
        <input type="hidden" name="datos" value="movimientos" />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Bodega
          <select name="bodega" defaultValue={filter.warehouseId ?? ''} className={FIELD_CLASS}>
            <option value="">Todas las bodegas</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tipo de movimiento
          <select name="tipo" defaultValue={filter.kind} className={FIELD_CLASS}>
            {LOG_KINDS.map((kind) => <option key={kind} value={kind}>{LOG_KIND_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          Producto
          <input type="search" name="q" defaultValue={filter.q ?? ''} placeholder="Nombre, SKU o marca" className={FIELD_CLASS} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={filter.from ?? ''} className={FIELD_CLASS} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={filter.to ?? ''} className={FIELD_CLASS} />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Aplicar filtros</button>
          <Link href={exportsHref({ datos: 'movimientos' })} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">Limpiar</Link>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="movements-summary">
        <KpiCard label="Movimientos" value={total.toLocaleString('es-CL')} icon={ArrowLeftRight} hint={describeRange(filter)} />
        {summary.byType.slice(0, 3).map((entry) => (
          <KpiCard key={entry.type} label={entry.label} value={entry.movements.toLocaleString('es-CL')} icon={ArrowLeftRight} tone={entry.type === 'ADJUSTMENT_OUT' ? 'warning' : 'neutral'} hint="movimientos" />
        ))}
      </div>
      {summary.byWarehouse.length > 1 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <WarehouseIcon className="size-4" aria-hidden="true" />
          {summary.byWarehouse.map((entry) => `${entry.name}: ${entry.movements.toLocaleString('es-CL')}`).join(' · ')}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{warehouseName ?? 'Todas las bodegas'} · {LOG_KIND_LABELS[filter.kind]}</CardTitle>
            <CardDescription>
              Cada fila lleva su bodega y el stock de ese producto en esa bodega. Para ver las fotos de respaldo y filtrar por operario o motivo, usa Movimientos de bodega.
            </CardDescription>
          </div>
          <DownloadButton href={`/api/exports/inventory-movements?${movementsQuery(filter)}`} label={`Descargar Excel (${Math.min(total, MAX_MOVEMENT_EXPORT_ROWS).toLocaleString('es-CL')})`} disabled={total === 0} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {truncated && (
            <p role="status" className="mb-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
              Hay {total.toLocaleString('es-CL')} movimientos con estos filtros y un archivo trae como máximo los {MAX_MOVEMENT_EXPORT_ROWS.toLocaleString('es-CL')} más recientes. Acota las fechas (por mes, por ejemplo) para bajar el resto.
            </p>
          )}
          {rows.length === 0 ? (
            <EmptyState title="Sin movimientos" description="No hay movimientos con los filtros elegidos. Prueba con otro rango de fechas o con «Todo el historial»." />
          ) : (
            <table className="w-full min-w-[900px] text-sm" data-testid="movements-export-table">
              <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2">Fecha</th>
                  <th scope="col" className="p-2">Bodega</th>
                  <th scope="col" className="p-2">Producto</th>
                  <th scope="col" className="p-2">Movimiento</th>
                  <th scope="col" className="p-2 text-right">Cantidad</th>
                  <th scope="col" className="p-2 text-right">Stock después</th>
                  <th scope="col" className="p-2">Motivo</th>
                  <th scope="col" className="p-2">Operario</th>
                  {includeCosts && <th scope="col" className="p-2 text-right">Costo</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap">{when(row.date)}</td>
                    <td className="p-2">{row.warehouse}</td>
                    <td className="p-2">
                      <span className="font-medium">{row.product}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{row.sku}</span>
                    </td>
                    <td className="p-2"><StatusBadge tone={row.direction === 'in' ? 'success' : 'warning'}>{row.typeLabel}</StatusBadge></td>
                    <td className="p-2 text-right tabular-nums">{row.direction === 'in' ? '+' : '−'}{qty(row.quantity)} {row.unit}</td>
                    <td className="p-2 text-right tabular-nums">{qty(row.after)}</td>
                    <td className="p-2">{row.reason ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{row.operator ?? <span className="text-muted-foreground">—</span>}</td>
                    {includeCosts && <td className="p-2 text-right tabular-nums">{formatCurrency(row.totalCost ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager page={page} pageSize={MOVEMENTS_PAGE_SIZE} total={total} hrefFor={(next) => hrefFor({ pagina: String(next) })} />
        </CardContent>
      </Card>
    </div>
  );
}
