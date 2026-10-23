import Link from 'next/link';
import { Download, Hourglass, PackageX, Percent, ShoppingCart, Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { LiveRefresh } from '@/components/shared/LiveRefresh';
import { LiveMetricsTable } from '@/components/retail/LiveMetricsTable';
import { formatPct } from '@/lib/intelligence/format';
import { LIVE_REFRESH_MS, LOW_COVERAGE_OPTIONS, PERIOD_OPTIONS, parseLowCoverage, parsePeriod } from '@/lib/retail/live-metrics';
import { getWarehouseOf, listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { getLiveMetrics, liveMetricsFacets } from '@/modules/retail/services/live-metrics.service';

export const metadata = { title: 'Retail en vivo' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;
const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/**
 * Sell-through y días de inventario restante de UNA bodega a la vez, con el
 * kardex de ese momento. La pantalla se vuelve a pedir sola cada minuto
 * mientras está a la vista; los filtros viajan por la dirección.
 */
export default async function RetailLivePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  // El layout ya muestra el bloqueo; esto evita además calcular las métricas
  // cuando el usuario no puede verlas (la página corre aunque el layout no la pinte).
  if (!context.features.hasRetailMetrics || !can(context, 'retail:read')) return null;

  const warehouses = await listWarehousesForLog(context.companyId);
  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Métricas de retail" title="Retail en vivo" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega en Inventario para empezar a medir ventas y stock." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const periodDays = parsePeriod(one(params.periodo));
  const lowCoverageDays = parseLowCoverage(one(params.umbral));
  const categoryId = one(params.categoria);
  const supplierId = one(params.proveedor);

  const [data, facets] = await Promise.all([
    getLiveMetrics(context.companyId, { warehouseId: warehouse.id, periodDays, lowCoverageDays, categoryId, supplierId }),
    liveMetricsFacets(context.companyId),
  ]);
  const { summary } = data;

  const query = (overrides: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      bodega: warehouse.id,
      periodo: String(periodDays),
      umbral: String(lowCoverageDays),
      categoria: categoryId,
      proveedor: supplierId,
      ...overrides,
    };
    return new URLSearchParams(Object.entries(base).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  };
  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Métricas de retail"
        title="Retail en vivo"
        description="Cuánto del stock disponible ya se vendió y para cuántos días alcanza lo que queda, producto por producto, en cada bodega."
        actions={
          <a href={`/api/retail/metrics/export?${query({})}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            <Download className="size-4" aria-hidden="true" /> Descargar Excel
          </a>
        }
      />

      <LiveRefresh generatedAt={data.generatedAt} intervalMs={LIVE_REFRESH_MS} />

      {/* Una pestaña por bodega: el saldo de cada producto corre por bodega. */}
      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={`/dashboard/retail?${query({ bodega: entry.id })}`}
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
          Período
          <select name="periodo" defaultValue={String(periodDays)} className={selectClass}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                Últimos {option} días
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Se agota pronto si alcanza para
          <select name="umbral" defaultValue={String(lowCoverageDays)} className={selectClass}>
            {LOW_COVERAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} días o menos
              </option>
            ))}
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
          <Link href={`/dashboard/retail?${new URLSearchParams({ bodega: warehouse.id }).toString()}`} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Vendido hoy"
          labelExtra={<InfoTooltip text={`Unidades vendidas hoy en esta bodega, descontadas las devoluciones. En los últimos ${periodDays} días: ${qty(summary.sold)}.`} />}
          value={qty(summary.soldToday)}
          icon={ShoppingCart}
          tone="accent"
        />
        <KpiCard
          label={`Sell-through (${periodDays} días)`}
          labelExtra={<InfoTooltip text="Lo vendido dividido por lo que hubo para vender: el stock al empezar el período más lo que entró. Suma unidades, kilos y litros por igual; para comparar productos, usa la tabla." />}
          value={formatPct(summary.sellThroughPct, 1)}
          icon={Percent}
          tone="info"
        />
        <KpiCard
          label={`Se agotan en ${lowCoverageDays} días o menos`}
          labelExtra={<InfoTooltip text="Productos con stock que, al ritmo de venta de los días en que tuvieron stock, se acaban dentro del plazo elegido." />}
          value={String(summary.low)}
          icon={Hourglass}
          tone="warning"
        />
        <KpiCard
          label="Agotados con demanda"
          labelExtra={<InfoTooltip text={`Productos sin stock que sí se vendieron en el período: ventas que se están perdiendo. Agotados en total: ${summary.out}.`} />}
          value={String(summary.outWithDemand)}
          icon={PackageX}
          tone="danger"
        />
      </section>

      <LiveMetricsTable rows={data.rows} periodDays={periodDays} />

      <p className="text-xs text-muted-foreground">
        La venta diaria se mide con los días completos en que el producto tuvo stock (los días agotados y el de hoy, que va a medias, no cuentan). Lo vendido descuenta notas de crédito y anulaciones; mermas, degustaciones y traslados no son venta. Sin ventas no se calculan días restantes.
      </p>
    </div>
  );
}
