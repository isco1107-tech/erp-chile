import Link from 'next/link';
import { CalendarClock, CircleDollarSign, Download, PackageSearch, Snail, Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import { formatCurrency } from '@/lib/chile/tax';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DeadStockSettingsForm } from '@/components/retail/DeadStockSettingsForm';
import { formatDays } from '@/lib/intelligence/format';
import { DEAD_STOCK_SUGGESTIONS, type DeadStockRow } from '@/lib/retail/dead-stock';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import { getWarehouseOf, listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { liveMetricsFacets } from '@/modules/retail/services/live-metrics.service';
import { getDeadStock } from '@/modules/retail/services/dead-stock.service';
import { getRetailSettings } from '@/modules/retail/services/retail-settings.service';

export const metadata = { title: 'Stock muerto' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;
const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

function expiryLabel(days: number | null): { text: string; tone: 'danger' | 'warning' | 'neutral' } | null {
  if (days === null) return null;
  if (days < 0) return { text: `Vencido hace ${formatDays(-days)}`, tone: 'danger' };
  if (days === 0) return { text: 'Vence hoy', tone: 'danger' };
  return { text: `Vence en ${formatDays(days)}`, tone: days <= 30 ? 'warning' : 'neutral' };
}

const lastSale = (row: DeadStockRow) => (row.lastSaleAt ? dayTimeLabel(new Date(row.lastSaleAt)) : 'Nunca');

/**
 * Productos con stock que llevan el umbral de días sin rotar en UNA bodega, con
 * su valor detenido (si el rol ve costos) y una sugerencia por producto.
 */
export default async function DeadStockPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!moduleEnabled(context.features, 'hasDeadStock') || !can(context, 'retail:read')) return null;

  const warehouses = await listWarehousesForLog(context.companyId);
  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Métricas de retail" title="Stock muerto" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega en Inventario para empezar a medir qué se vende y qué no." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const categoryId = one(params.categoria);
  const supplierId = one(params.proveedor);
  const includeCosts = can(context, 'products:costs');
  const canManage = can(context, 'retail:manage');

  const settings = await getRetailSettings(context.companyId);
  const [data, facets] = await Promise.all([
    getDeadStock(context.companyId, { warehouseId: warehouse.id, thresholdDays: settings.deadStockDays, categoryId, supplierId }, { includeCosts }),
    liveMetricsFacets(context.companyId),
  ]);
  const { rows, summary } = data;

  const query = (overrides: Record<string, string | undefined>) =>
    new URLSearchParams(
      Object.entries({ bodega: warehouse.id, categoria: categoryId, proveedor: supplierId, ...overrides }).filter((entry): entry is [string, string] => Boolean(entry[1]))
    ).toString();
  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Métricas de retail"
        title="Stock muerto"
        description={`Productos con stock que llevan ${settings.deadStockDays} días o más sin venderse ni trasladarse a otra bodega. Lo recién llegado no cuenta: el reloj parte desde la última salida o desde que volvió a tener stock.`}
        actions={
          <a href={`/api/retail/dead-stock/export?${query({})}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            <Download className="size-4" aria-hidden="true" /> Descargar Excel
          </a>
        }
      />

      <section className="rounded-xl border border-border bg-card p-4 shadow-card" aria-label="Ajustes de stock muerto">
        {canManage ? (
          <DeadStockSettingsForm deadStockDays={settings.deadStockDays} deadStockAlerts={settings.deadStockAlerts} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Un producto se considera detenido a los {settings.deadStockDays} días sin rotar.{' '}
            {settings.deadStockAlerts ? 'Se avisa por la campanita al cumplirlos.' : 'Los avisos están apagados.'} Lo ajustan los administradores.
          </p>
        )}
      </section>

      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={`/dashboard/retail/stock-muerto?${query({ bodega: entry.id })}`}
            aria-current={entry.id === warehouse.id ? 'page' : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${entry.id === warehouse.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
          >
            <WarehouseIcon className="size-4" aria-hidden="true" /> {entry.name}
          </Link>
        ))}
      </nav>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:grid-cols-3" aria-label="Filtros">
        <input type="hidden" name="bodega" value={warehouse.id} />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Categoría
          <select name="categoria" defaultValue={categoryId ?? ''} className={selectClass}>
            <option value="">Todas</option>
            {facets.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Proveedor
          <select name="proveedor" defaultValue={supplierId ?? ''} className={selectClass}>
            <option value="">Todos</option>
            {facets.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Aplicar
          </button>
          <Link href={`/dashboard/retail/stock-muerto?${new URLSearchParams({ bodega: warehouse.id }).toString()}`} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Productos detenidos" value={String(summary.products)} icon={Snail} tone="warning" />
        {summary.value !== null ? (
          <KpiCard
            label="Valor detenido"
            labelExtra={<InfoTooltip text="Stock detenido valorizado al costo promedio (PMP) de cada producto: plata inmovilizada en la bodega." />}
            value={formatCurrency(summary.value)}
            icon={CircleDollarSign}
            tone="danger"
          />
        ) : (
          <KpiCard label="Unidades detenidas" value={qty(summary.units)} icon={PackageSearch} tone="danger" />
        )}
        <KpiCard
          label="Nunca vendidos"
          labelExtra={<InfoTooltip text="Productos que tienen stock en esta bodega y nunca han salido por venta de ella." />}
          value={String(summary.neverSold)}
          icon={PackageSearch}
          tone="info"
        />
        <KpiCard
          label="Vencidos o por vencer"
          labelExtra={<InfoTooltip text="Productos detenidos con un lote vencido o que vence dentro de 30 días: lo primero a mover." />}
          value={String(summary.expiring)}
          icon={CalendarClock}
          tone="accent"
        />
      </section>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        {rows.length === 0 ? (
          <EmptyState title="Sin stock muerto" description={`En ${warehouse.name} todo lo que tiene stock rotó en los últimos ${settings.deadStockDays} días.`} />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden" aria-label="Productos detenidos">
              {rows.map((row) => {
                const expiry = expiryLabel(row.daysToExpiry);
                return (
                  <li key={row.productId} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{row.name}</p>
                        <p className="text-xs break-words text-muted-foreground">
                          <span className="font-mono">{row.sku}</span>
                          {row.category ? ` · ${row.category}` : ''}
                        </p>
                      </div>
                      <StatusBadge tone="warning" className="shrink-0 whitespace-nowrap">
                        {formatDays(row.daysStopped)}
                      </StatusBadge>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Stock</dt>
                        <dd className="font-medium tabular-nums">
                          {qty(row.stock)} {row.unit}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Última venta</dt>
                        <dd className="font-medium tabular-nums">{lastSale(row)}</dd>
                      </div>
                      {row.value !== null && (
                        <div>
                          <dt className="text-muted-foreground">Valor</dt>
                          <dd className="font-medium tabular-nums">{formatCurrency(row.value)}</dd>
                        </div>
                      )}
                      {expiry && (
                        <div>
                          <dt className="text-muted-foreground">Vencimiento</dt>
                          <dd className="font-medium">{expiry.text}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="text-xs text-muted-foreground">{DEAD_STOCK_SUGGESTIONS[row.suggestion]}</p>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm" data-testid="dead-stock-table">
                <thead className="bg-muted text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">Producto</th>
                    <th scope="col" className="px-3 py-2 text-right">Stock</th>
                    <th scope="col" className="px-3 py-2 text-right">Sin rotar</th>
                    <th scope="col" className="px-3 py-2 text-right">Última venta</th>
                    <th scope="col" className="px-3 py-2">Vencimiento</th>
                    {includeCosts && <th scope="col" className="px-3 py-2 text-right">Valor</th>}
                    <th scope="col" className="px-3 py-2">Sugerencia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const expiry = expiryLabel(row.daysToExpiry);
                    return (
                      <tr key={row.productId} className="border-t border-border align-top hover:bg-muted/60">
                        <td className="max-w-64 px-3 py-2">
                          <span className="block font-medium break-words">{row.name}</span>
                          <span className="block text-xs break-words text-muted-foreground">
                            <span className="font-mono">{row.sku}</span>
                            {row.brand ? ` · ${row.brand}` : ''}
                            {row.category ? ` · ${row.category}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                          {qty(row.stock)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatDays(row.daysStopped)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">{lastSale(row)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{expiry ? <StatusBadge tone={expiry.tone}>{expiry.text}</StatusBadge> : <span className="text-muted-foreground">—</span>}</td>
                        {includeCosts && <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(row.value ?? 0)}</td>}
                        <td className="max-w-80 px-3 py-2 text-xs text-muted-foreground">{DEAD_STOCK_SUGGESTIONS[row.suggestion]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Rotar es salir por venta o por traslado a otra bodega; las mermas no cuentan. La sugerencia es una pista según el vencimiento, si alguna vez se vendió y cuánto lleva detenido.
      </p>
    </div>
  );
}
