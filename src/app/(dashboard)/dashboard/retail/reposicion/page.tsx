import Link from 'next/link';
import { AlarmClock, CalendarClock, CircleCheck, CircleDashed, Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { ReorderTable } from '@/components/retail/ReorderTable';
import { ReorderSettingsForm } from '@/components/retail/ReorderSettingsForm';
import { getWarehouseOf, listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { liveMetricsFacets } from '@/modules/retail/services/live-metrics.service';
import { getReorderPlan } from '@/modules/retail/services/reorder.service';
import { getRetailSettings } from '@/modules/retail/services/retail-settings.service';

export const metadata = { title: 'Reposición predictiva' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;

/**
 * Cuándo se agota cada producto de UNA bodega y cuánto pedir. Con Compras y
 * el permiso de pedir, las cantidades sugeridas se pasan a una solicitud de
 * compra en borrador.
 */
export default async function ReorderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!moduleEnabled(context.features, 'hasSmartReorder') || !can(context, 'retail:read')) return null;

  const warehouses = await listWarehousesForLog(context.companyId);
  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Métricas de retail" title="Reposición predictiva" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega en Inventario para empezar a planificar la reposición." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const isDefaultWarehouse = warehouses.find((entry) => entry.id === warehouse.id)?.isDefault ?? false;
  const categoryId = one(params.categoria);
  const supplierId = one(params.proveedor);
  const canManage = can(context, 'retail:manage');
  const canRequest = context.features.hasPurchases && can(context, 'purchases:request');

  const [data, facets, settings] = await Promise.all([
    getReorderPlan(context.companyId, { warehouseId: warehouse.id, isDefaultWarehouse, categoryId, supplierId }),
    liveMetricsFacets(context.companyId),
    getRetailSettings(context.companyId),
  ]);

  const query = (overrides: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries({ bodega: warehouse.id, categoria: categoryId, proveedor: supplierId, ...overrides }).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Métricas de retail"
        title="Reposición predictiva"
        description="Cuándo se agota cada producto y cuánto pedir, según su venta real, el día de la semana, los días de pago y lo que tarda su proveedor en entregar."
      />

      <section className="rounded-xl border border-border bg-card p-4 shadow-card" aria-label="Ajustes de reposición">
        {canManage ? (
          <ReorderSettingsForm leadDays={settings.reorderLeadDays} coverDays={settings.reorderCoverDays} supplierLeadDays={settings.supplierLeadDays} suppliers={facets.suppliers} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Cada pedido cubre {settings.reorderCoverDays} días de venta. Si un proveedor no tiene un tiempo de entrega configurado ni medido en sus órdenes de compra, se asumen {settings.reorderLeadDays} días. Lo ajustan los administradores.
          </p>
        )}
      </section>

      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={`/dashboard/retail/reposicion?${query({ bodega: entry.id })}`}
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
          <Link href={`/dashboard/retail/reposicion?${new URLSearchParams({ bodega: warehouse.id }).toString()}`} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pedir ya"
          labelExtra={<InfoTooltip text="Si se pide hoy, llega cuando ya se agotó o justo antes: el tiempo de entrega es mayor que lo que alcanza el stock." />}
          value={String(data.counts.NOW)}
          icon={AlarmClock}
          tone="danger"
        />
        <KpiCard label="Pedir esta semana" value={String(data.counts.SOON)} icon={CalendarClock} tone="warning" />
        <KpiCard label="Al día" value={String(data.counts.OK)} icon={CircleCheck} tone="success" />
        <KpiCard
          label="Sin ritmo de venta"
          labelExtra={<InfoTooltip text="Productos con menos de 7 días con stock o sin ventas: no hay con qué proyectar y no se inventa un número." />}
          value={String(data.counts.NO_RATE)}
          icon={CircleDashed}
          tone="neutral"
        />
      </section>

      <ReorderTable rows={data.rows} canRequest={canRequest} warehouseName={warehouse.name} today={data.today} coverDays={data.coverDays} />

      <p className="text-xs text-muted-foreground">
        La venta diaria es la de los días completos con stock de las últimas 4 semanas; un patrón por día de la semana o por días de pago (fin de mes y quincena) se usa solo si hay datos para sostenerlo. El tiempo de entrega es el configurado para el proveedor, o el medido entre sus órdenes de compra y su recepción, o el de por defecto.
        {data.countsIncoming
          ? ' Lo pendiente en órdenes de compra enviadas se cuenta como si ya estuviera en esta bodega.'
          : ' Las órdenes de compra pendientes se cuentan solo en la bodega principal.'}{' '}
        El clima todavía no se considera.
      </p>
    </div>
  );
}
