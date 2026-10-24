import Link from 'next/link';
import { Download, PackageX, Scale, Store, Truck, Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import { formatCurrency } from '@/lib/chile/tax';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { LIABILITY_STATES, LIABILITY_STATE_LABELS, SHRINKAGE_REASON_KEYS, isLiabilityState, resolvePeriod, type ShrinkageReasonKey } from '@/lib/inventory/shrinkage';
import { dayKey, dayTimeLabel } from '@/lib/retail/live-metrics';
import { WASTE_REASON_LABELS } from '@/lib/warehouse-mobile/modes';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LiabilityCell } from '@/components/inventory/LiabilityCell';
import { ApplySuggestionsButton } from '@/components/inventory/ApplySuggestionsButton';
import { ShrinkageSettingsForm } from '@/components/inventory/ShrinkageSettingsForm';
import { getWarehouseOf, listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { MAX_SHRINKAGE_ROWS, getShrinkageSettings, listShrinkage, listSuppliersForShrinkage } from '@/modules/inventory/services/shrinkage.service';

export const metadata = { title: 'Mermas y responsables' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;
const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
const reasonName = (key: ShrinkageReasonKey) => (key === 'NONE' ? 'Sin motivo' : WASTE_REASON_LABELS[key]);

/**
 * Pérdidas del kardex de UNA bodega (mermas, roturas, vencidos, faltantes) con
 * quién responde por cada una: la tienda o el proveedor. Sirve para la
 * liquidación con cada productor sin discutir pérdida por pérdida.
 */
export default async function ShrinkagePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!moduleEnabled(context.features, 'hasShrinkageLiability') || !can(context, 'products:read')) return null;

  const warehouses = await listWarehousesForLog(context.companyId);
  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Inventario" title="Mermas y responsables" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega para empezar a registrar movimientos." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const parts = santiagoDateParts(new Date());
  const period = resolvePeriod(one(params.desde), one(params.hasta), dayKey(parts.year, parts.month, parts.day));
  const reasonParam = one(params.motivo);
  const reason = reasonParam && (SHRINKAGE_REASON_KEYS as readonly string[]).includes(reasonParam) ? (reasonParam as ShrinkageReasonKey) : undefined;
  const stateParam = one(params.responsable);
  const state = isLiabilityState(stateParam) ? stateParam : undefined;
  const supplierId = one(params.proveedor);
  const includeCosts = can(context, 'products:costs');
  const canEdit = can(context, 'inventory:write');
  const canConfigure = can(context, 'settings:company');

  const [{ rows, summary, truncated }, settings, suppliers] = await Promise.all([
    listShrinkage(context.companyId, { warehouseId: warehouse.id, ...period, reason, state, supplierId }, { includeCosts }),
    getShrinkageSettings(context.companyId),
    listSuppliersForShrinkage(context.companyId),
  ]);
  const suggestible = rows.filter((row) => !row.liability && row.suggestion && (row.suggestion.party === 'STORE' || row.suggestion.supplier)).length;

  const query = (overrides: Record<string, string | undefined>) =>
    new URLSearchParams(
      Object.entries({ bodega: warehouse.id, desde: period.from, hasta: period.to, motivo: reason, responsable: state, proveedor: supplierId, ...overrides }).filter((entry): entry is [string, string] => Boolean(entry[1]))
    ).toString();
  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';
  const amount = (bucket: { units: number; cost: number | null }) => (bucket.cost !== null ? formatCurrency(bucket.cost) : `${qty(bucket.units)} u.`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Mermas y responsables"
        description="Cada pérdida de la bodega —merma, rotura, vencido, faltante de un conteo— con quién responde por ella: la tienda o el proveedor. Así la liquidación con cada productor sale sin discusión."
        actions={
          <a href={`/api/inventory/shrinkage/export?${query({})}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            <Download className="size-4" aria-hidden="true" /> Descargar Excel
          </a>
        }
      />

      {canConfigure ? (
        <details className="group rounded-xl border border-border bg-card shadow-card" open={Object.keys(settings.defaults).length === 0}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
            Acuerdos por motivo y avisos de vencimiento
            <span className="block text-xs font-normal text-muted-foreground">
              {Object.keys(settings.defaults).length > 0 ? `${Object.keys(settings.defaults).length} motivos con responsable por defecto` : 'Aún no defines quién responde por cada motivo'} ·{' '}
              {settings.expiryAlerts ? `aviso de lotes a ${settings.expiryAlertDays} días` : 'avisos de vencimiento apagados'}. Toca para ver o cambiar.
            </span>
          </summary>
          <div className="border-t border-border p-4">
            <ShrinkageSettingsForm defaults={settings.defaults} expiryAlerts={settings.expiryAlerts} expiryAlertDays={settings.expiryAlertDays} />
          </div>
        </details>
      ) : (
        <section className="rounded-xl border border-border bg-card p-4 shadow-card" aria-label="Acuerdos por motivo y avisos">
          <p className="text-sm text-muted-foreground">
            {Object.keys(settings.defaults).length > 0 ? 'Los responsables sugeridos salen de los acuerdos por motivo de la empresa.' : 'La empresa aún no define quién responde por cada motivo: cada pérdida se asigna a mano.'}{' '}
            {settings.expiryAlerts ? `Se avisa por la campanita cuando a un lote le quedan ${settings.expiryAlertDays} días y el día que vence.` : 'Los avisos de vencimiento están apagados.'} Lo ajustan los administradores.
          </p>
        </section>
      )}

      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={`/dashboard/inventory/mermas?${query({ bodega: entry.id })}`}
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
          Desde
          <input type="date" name="desde" defaultValue={period.from} className={selectClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={period.to} className={selectClass} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Motivo
          <select name="motivo" defaultValue={reason ?? ''} className={selectClass}>
            <option value="">Todos los motivos</option>
            {SHRINKAGE_REASON_KEYS.map((key) => (
              <option key={key} value={key}>
                {reasonName(key)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Responsable
          <select name="responsable" defaultValue={state ?? ''} className={selectClass}>
            <option value="">Todos</option>
            {LIABILITY_STATES.map((option) => (
              <option key={option} value={option}>
                {LIABILITY_STATE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Proveedor que responde
          <select name="proveedor" defaultValue={supplierId ?? ''} className={selectClass}>
            <option value="">Todos</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Aplicar filtros
          </button>
          <Link href={`/dashboard/inventory/mermas?${new URLSearchParams({ bodega: warehouse.id }).toString()}`} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pérdidas del período"
          labelExtra={<InfoTooltip text={includeCosts ? 'Costo de las pérdidas al costo promedio (PMP) del momento en que salieron.' : 'Unidades perdidas en el período filtrado.'} />}
          value={amount(summary)}
          icon={PackageX}
          tone="danger"
        />
        <KpiCard label="A cargo de la tienda" value={amount(summary.byState.STORE)} icon={Store} tone="neutral" />
        <KpiCard label="A cargo de proveedores" value={amount(summary.byState.SUPPLIER)} icon={Truck} tone="info" />
        <KpiCard
          label="Sin asignar"
          labelExtra={<InfoTooltip text="Pérdidas a las que nadie les ha dicho quién responde. No entran en la cuenta de ningún proveedor hasta asignarlas." />}
          value={String(summary.byState.UNASSIGNED.movements)}
          icon={Scale}
          tone="warning"
        />
      </section>

      {summary.bySupplier.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Por proveedor</CardTitle>
            <CardDescription>Pérdidas asignadas a cada proveedor en el período: lo que se descuenta o se conversa en su liquidación.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="shrinkage-by-supplier">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1.5 pr-3">Proveedor</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">Pérdidas</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">Unidades</th>
                  {includeCosts && <th scope="col" className="py-1.5 text-right">Costo</th>}
                </tr>
              </thead>
              <tbody>
                {summary.bySupplier.map((entry) => (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 break-words">
                      <Link href={`/dashboard/inventory/mermas?${query({ proveedor: entry.id, responsable: 'SUPPLIER' })}`} className="font-medium hover:underline">
                        {entry.name}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{entry.movements}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{qty(entry.units)}</td>
                    {includeCosts && <td className="py-1.5 text-right tabular-nums">{formatCurrency(entry.cost ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>Pérdidas de {warehouse.name}</CardTitle>
            <CardDescription>
              {summary.movements === 1 ? '1 pérdida' : `${summary.movements} pérdidas`} · {qty(summary.units)} unidades
              {truncated ? ` · se muestran las ${MAX_SHRINKAGE_ROWS} más recientes: acota las fechas para ver el resto` : ''}
            </CardDescription>
          </div>
          {canEdit && suggestible > 0 && <ApplySuggestionsButton count={suggestible} warehouseId={warehouse.id} from={period.from} to={period.to} reason={reason} />}
        </CardHeader>
        <CardContent className="p-0 md:px-6 md:pb-6">
          {rows.length === 0 ? (
            <EmptyState title="Sin pérdidas" description={`No hay mermas, roturas ni faltantes en ${warehouse.name} con los filtros elegidos.`} />
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden" aria-label="Pérdidas">
                {rows.map((row) => (
                  <li key={row.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{row.productName}</p>
                        <p className="text-xs break-words text-muted-foreground">
                          <span className="font-mono">{row.sku}</span> · {dayTimeLabel(new Date(row.createdAt))}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium whitespace-nowrap tabular-nums">
                        −{qty(row.quantity)} {row.unit}
                      </span>
                    </div>
                    <p className="text-xs break-words text-muted-foreground">
                      {row.reasonLabel}
                      {row.operator ? ` · ${row.operator}` : ''}
                      {row.totalCost !== null ? ` · ${formatCurrency(row.totalCost)}` : ''}
                    </p>
                    {row.note && <p className="text-xs break-words text-muted-foreground">{row.note}</p>}
                    <LiabilityCell row={row} canEdit={canEdit} />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-sm" data-testid="shrinkage-table">
                  <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <tr>
                      <th scope="col" className="p-2">Fecha</th>
                      <th scope="col" className="p-2">Producto</th>
                      <th scope="col" className="p-2 text-right">Cantidad</th>
                      <th scope="col" className="p-2">Motivo</th>
                      <th scope="col" className="p-2">Operario</th>
                      <th scope="col" className="p-2">Foto</th>
                      {includeCosts && <th scope="col" className="p-2 text-right">Costo</th>}
                      <th scope="col" className="p-2">Quién responde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="p-2 whitespace-nowrap tabular-nums">{dayTimeLabel(new Date(row.createdAt))}</td>
                        <td className="max-w-64 p-2">
                          <span className="block font-medium break-words">{row.productName}</span>
                          <span className="block font-mono text-xs break-words text-muted-foreground">{row.sku}</span>
                        </td>
                        <td className="p-2 text-right whitespace-nowrap tabular-nums">
                          −{qty(row.quantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                        </td>
                        <td className="max-w-56 p-2">
                          <span className="block break-words">{row.reasonLabel}</span>
                          {row.note && <span className="block text-xs break-words text-muted-foreground">{row.note}</span>}
                        </td>
                        <td className="p-2">{row.operator ?? <span className="text-muted-foreground">—</span>}</td>
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
                        {includeCosts && <td className="p-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(row.totalCost ?? 0)}</td>}
                        <td className="w-60 p-2">
                          <LiabilityCell row={row} canEdit={canEdit} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cuenta como pérdida toda salida con motivo (salvo la devolución al proveedor, que no es pérdida), los ajustes de salida hechos por una persona y los faltantes de las tomas de inventario. El consumo de producción y las devoluciones por nota de crédito no aparecen.
      </p>
    </div>
  );
}
