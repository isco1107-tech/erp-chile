import Link from 'next/link';
import { Download, Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { WASTE_REASONS, WASTE_REASON_LABELS } from '@/lib/warehouse-mobile/modes';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LOG_KINDS,
  LOG_KIND_LABELS,
  getWarehouseOf,
  listMovementLog,
  listWarehousesForLog,
  movementLogFacets,
  summarizeOutflows,
  type LogKind,
  type MovementLogFilter,
} from '@/modules/inventory/services/movement-log.service';

export const metadata = { title: 'Movimientos de bodega' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS = {
  PURCHASE_IN: 'Llegada',
  ADJUSTMENT_IN: 'Ajuste de entrada',
  SALE_OUT: 'Venta',
  ADJUSTMENT_OUT: 'Salida / merma',
  TRANSFER: 'Traslado',
} as const;

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;

function when(date: Date): string {
  return date.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

/**
 * Registro de movimientos de inventario, UNA bodega a la vez (nunca mezcladas): qué entró y salió,
 * quién hizo cada ajuste, por qué y con qué foto de respaldo. Los filtros viajan por la dirección
 * (formulario GET), así que la vista se puede compartir o guardar.
 */
export default async function MovementsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  const warehouses = await listWarehousesForLog(context.companyId);

  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Inventario" title="Movimientos de bodega" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega para empezar a registrar movimientos." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const kind = (LOG_KINDS as readonly string[]).includes(one(params.tipo) ?? '') ? (one(params.tipo) as LogKind) : 'ALL';
  const filter: MovementLogFilter = {
    warehouseId: warehouse.id,
    kind,
    reason: one(params.motivo),
    userId: one(params.operario),
    supplierId: one(params.proveedor),
    q: one(params.q),
    from: one(params.desde),
    to: one(params.hasta),
    cursor: one(params.desde_id),
  };
  const includeCosts = can(context, 'products:costs');

  const [{ rows, nextCursor }, summary, facets] = await Promise.all([
    listMovementLog(context.companyId, filter, { includeCosts }),
    summarizeOutflows(context.companyId, filter, { includeCosts }),
    movementLogFacets(context.companyId, warehouse.id),
  ]);

  /** Misma vista con otros parámetros (cambiar de bodega conserva los filtros de fecha y tipo). */
  const link = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      bodega: warehouse.id,
      tipo: kind === 'ALL' ? undefined : kind,
      motivo: filter.reason,
      operario: filter.userId,
      proveedor: filter.supplierId,
      q: filter.q,
      desde: filter.from,
      hasta: filter.to,
      ...overrides,
    };
    for (const [key, value] of Object.entries(base)) if (value) next.set(key, value);
    return `/dashboard/inventory/movements?${next.toString()}`;
  };

  const exportQuery = new URLSearchParams(
    Object.entries({ bodega: warehouse.id, tipo: kind === 'ALL' ? undefined : kind, motivo: filter.reason, operario: filter.userId, proveedor: filter.supplierId, q: filter.q, desde: filter.from, hasta: filter.to }).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();

  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';
  const totalOutUnits = summary.reduce((sum, row) => sum + row.units, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Movimientos de bodega"
        description="Cada bodega por separado: qué entró y salió, quién hizo el ajuste, el motivo y la foto del producto."
        actions={
          <a href={`/api/inventory/movements/export?${exportQuery}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            <Download className="size-4" aria-hidden="true" /> Descargar Excel
          </a>
        }
      />

      {/* Una pestaña por bodega: nunca se muestran mezcladas. */}
      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={link({ bodega: entry.id })}
            aria-current={entry.id === warehouse.id ? 'page' : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${entry.id === warehouse.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
          >
            <WarehouseIcon className="size-4" aria-hidden="true" /> {entry.name}
          </Link>
        ))}
      </nav>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros">
        <input type="hidden" name="bodega" value={warehouse.id} />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tipo
          <select name="tipo" defaultValue={kind} className={selectClass}>
            {LOG_KINDS.map((option) => (
              <option key={option} value={option}>
                {LOG_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Motivo
          <select name="motivo" defaultValue={filter.reason ?? ''} className={selectClass}>
            <option value="">Todos los motivos</option>
            {WASTE_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {WASTE_REASON_LABELS[reason]}
              </option>
            ))}
            <option value="NONE">Sin motivo</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Operario
          <select name="operario" defaultValue={filter.userId ?? ''} className={selectClass}>
            <option value="">Todos</option>
            {facets.operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Proveedor
          <select name="proveedor" defaultValue={filter.supplierId ?? ''} className={selectClass}>
            <option value="">Todos</option>
            {facets.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={filter.from ?? ''} className={selectClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={filter.to ?? ''} className={selectClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          Producto
          <input type="search" name="q" defaultValue={filter.q ?? ''} placeholder="Nombre, SKU o marca" className={selectClass} />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Aplicar filtros
          </button>
          <Link href={link({ tipo: undefined, motivo: undefined, operario: undefined, proveedor: undefined, q: undefined, desde: undefined, hasta: undefined })} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      {summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Salidas y mermas de {warehouse.name}</CardTitle>
            <CardDescription>
              {qty(totalOutUnits)} unidades en el período filtrado, por motivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Motivo</th>
                  <th className="py-1.5 pr-3 text-right">Movimientos</th>
                  <th className="py-1.5 pr-3 text-right">Unidades</th>
                  {includeCosts && <th className="py-1.5 text-right">Costo</th>}
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.reasonCode ?? 'none'} className="border-t border-border">
                    <td className="py-1.5 pr-3">{row.reasonLabel}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{row.movements}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{qty(row.units)}</td>
                    {includeCosts && <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.totalCost ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de {warehouse.name}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <EmptyState title="Sin movimientos" description="No hay movimientos en esta bodega con los filtros elegidos." />
          ) : (
            <table className="w-full min-w-[980px] text-sm" data-testid="movement-log">
              <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2">Fecha</th>
                  <th scope="col" className="p-2">Producto</th>
                  <th scope="col" className="p-2">Movimiento</th>
                  <th scope="col" className="p-2 text-right">Cantidad</th>
                  <th scope="col" className="p-2">Motivo</th>
                  <th scope="col" className="p-2">Operario</th>
                  <th scope="col" className="p-2">Proveedor</th>
                  <th scope="col" className="p-2">Foto</th>
                  <th scope="col" className="p-2">Detalle</th>
                  <th scope="col" className="p-2 text-right">Stock después</th>
                  {includeCosts && <th scope="col" className="p-2 text-right">Costo</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap">{when(row.createdAt)}</td>
                    <td className="p-2">
                      <span className="font-medium">{row.productName}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{row.sku}</span>
                    </td>
                    <td className="p-2">
                      <StatusBadge tone={row.direction === 'in' ? 'success' : 'warning'}>{TYPE_LABELS[row.type]}</StatusBadge>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {row.direction === 'in' ? '+' : '−'}
                      {qty(row.quantity)} {row.unit}
                    </td>
                    <td className="p-2">{row.reasonLabel ?? '—'}</td>
                    <td className="p-2">{row.operator ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{row.supplier ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">
                      {row.evidenceUrl && isAllowedBlobUrl(row.evidenceUrl) ? (
                        <a href={row.evidenceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Ver la foto de respaldo de ${row.productName}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={row.evidenceUrl} alt={`Foto de respaldo: ${row.productName}`} width={48} height={48} loading="lazy" className="size-12 rounded-md border border-border object-cover" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-xs p-2 text-xs text-muted-foreground">
                      {row.note ?? ''}
                      {row.reference ? ` · Ref. ${row.reference}` : ''}
                    </td>
                    <td className="p-2 text-right tabular-nums">{qty(row.stockAfter)}</td>
                    {includeCosts && <td className="p-2 text-right tabular-nums">{formatCurrency(row.totalCost ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <Link href={`${link({})}&desde_id=${encodeURIComponent(nextCursor)}`} className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
                Ver más antiguos
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
