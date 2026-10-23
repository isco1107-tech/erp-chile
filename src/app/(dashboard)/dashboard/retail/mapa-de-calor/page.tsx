import Link from 'next/link';
import { Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import { formatCurrency } from '@/lib/chile/tax';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HeatmapGrid, HeatmapLegend } from '@/components/retail/HeatmapGrid';
import {
  HEATMAP_DAYS,
  HEATMAP_PRODUCT_LIMIT,
  HEATMAP_WEEKS,
  PRICE_LOOKBACK_DAYS,
  PRICE_MIN_DAYS,
  PRICE_WINDOW_DAYS,
  describeReaction,
  parseGrain,
  parseOrder,
  shortDay,
} from '@/lib/retail/heatmap';
import { getWarehouseOf, listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { liveMetricsFacets } from '@/modules/retail/services/live-metrics.service';
import { getHeatmap } from '@/modules/retail/services/heatmap.service';

export const metadata = { title: 'Mapa de calor' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;
const rate = (value: number | null) => (value === null ? '—' : value.toLocaleString('es-CL', { maximumFractionDigits: value < 10 ? 1 : 0 }));

/**
 * Rotación de cada producto semana a semana (o día a día) en UNA bodega, y
 * qué pasó con la venta cuando cambió el precio cobrado.
 */
export default async function RetailHeatmapPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!moduleEnabled(context.features, 'hasRetailHeatmap') || !can(context, 'retail:read')) return null;

  const warehouses = await listWarehousesForLog(context.companyId);
  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Métricas de retail" title="Mapa de calor" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega en Inventario para empezar a medir la rotación." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const grain = parseGrain(one(params.vista));
  const order = parseOrder(one(params.orden));
  const categoryId = one(params.categoria);
  const supplierId = one(params.proveedor);

  const [data, facets] = await Promise.all([
    getHeatmap(context.companyId, { warehouseId: warehouse.id, grain, order, categoryId, supplierId }),
    liveMetricsFacets(context.companyId),
  ]);

  const query = (overrides: Record<string, string | undefined>) =>
    new URLSearchParams(
      Object.entries({ bodega: warehouse.id, vista: grain, orden: order, categoria: categoryId, proveedor: supplierId, ...overrides }).filter((entry): entry is [string, string] => Boolean(entry[1]))
    ).toString();
  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';
  const units = new Set(data.rows.map((row) => row.unit));
  const unitHint = units.size === 1 ? [...units][0]! : 'unidades';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Métricas de retail"
        title="Mapa de calor"
        description="Qué se vende más y qué menos, semana a semana o día a día, y cómo cambió la venta cuando cambió el precio. Los períodos sin stock se marcan aparte: no vender por no tener no es falta de demanda."
      />

      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={`/dashboard/retail/mapa-de-calor?${query({ bodega: entry.id })}`}
            aria-current={entry.id === warehouse.id ? 'page' : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${entry.id === warehouse.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
          >
            <WarehouseIcon className="size-4" aria-hidden="true" /> {entry.name}
          </Link>
        ))}
      </nav>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros">
        <input type="hidden" name="bodega" value={warehouse.id} />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Vista
          <select name="vista" defaultValue={grain} className={selectClass}>
            <option value="semana">Últimas {HEATMAP_WEEKS} semanas</option>
            <option value="dia">Últimos {HEATMAP_DAYS} días</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Mostrar
          <select name="orden" defaultValue={order} className={selectClass}>
            <option value="mas">Los más vendidos</option>
            <option value="menos">Los menos vendidos (con stock)</option>
          </select>
        </label>
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
          <Link href={`/dashboard/retail/mapa-de-calor?${new URLSearchParams({ bodega: warehouse.id }).toString()}`} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Rotación en {warehouse.name}</CardTitle>
          <CardDescription>
            {data.rows.length === 0
              ? 'Sin productos que mostrar con estos filtros.'
              : `Los ${data.rows.length} ${order === 'mas' ? 'más vendidos' : 'menos vendidos con stock'}${data.candidates > data.rows.length ? ` de ${data.candidates}` : ''} en ${grain === 'semana' ? `las últimas ${HEATMAP_WEEKS} semanas (de lunes a domingo; la última va a medias)` : `los últimos ${HEATMAP_DAYS} días`}. Unidades netas de devoluciones.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.rows.length === 0 ? (
            <EmptyState title="Sin datos de rotación" description={order === 'mas' ? 'No hubo ventas en esta bodega en el período.' : 'No hay productos con stock en esta bodega.'} />
          ) : (
            <>
              <HeatmapLegend max={data.max} unitHint={unitHint} />
              <HeatmapGrid rows={data.rows} columns={data.columns} max={data.max} grain={grain} />
              {data.candidates > HEATMAP_PRODUCT_LIMIT && (
                <p className="text-xs text-muted-foreground">Se muestran {HEATMAP_PRODUCT_LIMIT}. Usa los filtros de categoría o proveedor para ver otros.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo reaccionó la venta a los cambios de precio</CardTitle>
          <CardDescription>
            Cambios del precio cobrado (neto, con descuento) en los últimos {PRICE_LOOKBACK_DAYS} días en esta bodega. Compara la venta diaria de hasta {PRICE_WINDOW_DAYS} días con stock antes y después, y pide al menos {PRICE_MIN_DAYS} a cada lado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.reactions.length === 0 ? (
            <EmptyState title="Sin cambios de precio" description="No se detectaron cambios sostenidos del precio cobrado en el período." />
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden" aria-label="Cambios de precio">
                {data.reactions.map((reaction) => (
                  <li key={`${reaction.productId}-${reaction.day}`} className="space-y-1 py-3">
                    <p className="font-medium break-words">{reaction.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {shortDay(reaction.day)} · {formatCurrency(reaction.from)} → {formatCurrency(reaction.to)} · venta diaria {rate(reaction.velocityBefore)} → {rate(reaction.velocityAfter)}
                    </p>
                    <p className="text-sm">{describeReaction(reaction)}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-sm" data-testid="price-reactions">
                  <thead className="text-left text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3">Producto</th>
                      <th scope="col" className="py-2 pr-3">Desde</th>
                      <th scope="col" className="py-2 pr-3 text-right">Precio neto</th>
                      <th scope="col" className="py-2 pr-3 text-right">Venta diaria</th>
                      <th scope="col" className="py-2">Qué pasó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reactions.map((reaction) => (
                      <tr key={`${reaction.productId}-${reaction.day}`} className="border-t border-border align-top">
                        <td className="max-w-56 py-2 pr-3">
                          <span className="block font-medium break-words">{reaction.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{reaction.sku}</span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{shortDay(reaction.day)}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                          {formatCurrency(reaction.from)} → {formatCurrency(reaction.to)}
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                          {rate(reaction.velocityBefore)} → {rate(reaction.velocityAfter)}
                        </td>
                        <td className="py-2">
                          {reaction.status === 'INSUFFICIENT' && (
                            <StatusBadge tone="neutral" className="mb-1">
                              Faltan días para comparar
                            </StatusBadge>
                          )}
                          <span className="block">{describeReaction(reaction)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Es una comparación simple, no una medición de causa: la temporada, una promoción, la ubicación en la sala o un quiebre del competidor también mueven la venta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
