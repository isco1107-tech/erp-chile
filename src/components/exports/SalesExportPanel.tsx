import Link from 'next/link';
import { Banknote, FileText, Receipt, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { describeRange, type RangePresetId } from '@/lib/exports/ranges';
import {
  SALES_GROUPS,
  SALES_GROUP_LABELS,
  SALES_STATUSES,
  SALES_STATUS_LABELS,
  readRange,
  readSalesFilter,
  salesQuery,
  type ParamReader,
} from '@/lib/exports/filters';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { MAX_SALES_EXPORT_DOCS, SALES_PAGE_SIZE, listSalesDocuments, summarizeSales } from '@/modules/exports/services/sales-export.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DownloadButton, FIELD_CLASS, Pager, RangePresets, clampPage, exportsHref } from './ExportChrome';

function when(date: Date): string {
  return date.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Boletas y documentos de venta de toda la empresa. Los filtros viajan por la dirección (formulario
 * GET): la vista se puede compartir y el botón de Excel descarga exactamente lo que se ve.
 */
export async function SalesExportPanel({ companyId, read }: { companyId: string; read: ParamReader }) {
  const today = santiagoDateParts(new Date());
  const filter = readSalesFilter(read, today);
  const { preset } = readRange(read, today);
  const page = clampPage(read('pagina'));
  const [{ rows, total }, summary, warehouses] = await Promise.all([
    listSalesDocuments(companyId, filter, page),
    summarizeSales(companyId, filter),
    listWarehousesForLog(companyId),
  ]);

  const base = { datos: 'boletas', tipo: filter.group, estado: filter.status, bodega: filter.warehouseId, q: filter.q };
  const hrefFor = (overrides: Record<string, string | undefined>) => exportsHref({ ...base, ...(filter.from || filter.to ? { desde: filter.from, hasta: filter.to } : { rango: 'todo' }), ...overrides });
  const presetHref = (id: RangePresetId) => exportsHref({ ...base, rango: id });
  const truncated = total > MAX_SALES_EXPORT_DOCS;

  return (
    <div className="space-y-6">
      <RangePresets active={preset} hrefFor={presetHref} />

      <form method="get" action="/dashboard/exports" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros de boletas y documentos">
        <input type="hidden" name="datos" value="boletas" />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Documento
          <select name="tipo" defaultValue={filter.group} className={FIELD_CLASS}>
            {SALES_GROUPS.map((group) => <option key={group} value={group}>{SALES_GROUP_LABELS[group]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Estado
          <select name="estado" defaultValue={filter.status} className={FIELD_CLASS}>
            {SALES_STATUSES.map((status) => <option key={status} value={status}>{SALES_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Bodega
          <select name="bodega" defaultValue={filter.warehouseId ?? ''} className={FIELD_CLASS}>
            <option value="">Todas las bodegas</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Folio, cliente o RUT
          <input type="search" name="q" defaultValue={filter.q ?? ''} placeholder="Ej.: 1520 o Ana Soto" className={FIELD_CLASS} />
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
          <Link href={exportsHref({ datos: 'boletas' })} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">Limpiar</Link>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="sales-summary">
        <KpiCard label="Documentos" value={total.toLocaleString('es-CL')} icon={FileText} hint={SALES_STATUS_LABELS[filter.status]} />
        <KpiCard label="Total vendido" value={formatCurrency(summary.issued.total)} icon={Banknote} tone="success" hint="Emitidos; las notas de crédito restan" />
        <KpiCard label="Neto" value={formatCurrency(summary.issued.net + summary.issued.exempt)} icon={Receipt} tone="info" hint={`IVA ${formatCurrency(summary.issued.iva)}`} />
        <KpiCard label="Anulados" value={summary.cancelledDocuments.toLocaleString('es-CL')} icon={XCircle} tone={summary.cancelledDocuments > 0 ? 'warning' : 'neutral'} hint="No suman a lo vendido" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{SALES_GROUP_LABELS[filter.group]} · {describeRange(filter)}</CardTitle>
            <CardDescription>
              El Excel trae tres hojas: Documentos, Detalle de productos (una fila por línea) y Resumen por tipo y medio de pago.
            </CardDescription>
          </div>
          <DownloadButton href={`/api/exports/sales?${salesQuery(filter)}`} label={`Descargar Excel (${Math.min(total, MAX_SALES_EXPORT_DOCS).toLocaleString('es-CL')})`} disabled={total === 0} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {truncated && (
            <p role="status" className="mb-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
              Hay {total.toLocaleString('es-CL')} documentos con estos filtros y un archivo trae como máximo los {MAX_SALES_EXPORT_DOCS.toLocaleString('es-CL')} más recientes. Acota las fechas (por mes, por ejemplo) para bajar el resto.
            </p>
          )}
          {rows.length === 0 ? (
            <EmptyState title="Sin documentos" description="No hay documentos con los filtros elegidos. Prueba con otro rango de fechas o con «Todo el historial»." />
          ) : (
            <table className="w-full min-w-[860px] text-sm" data-testid="sales-export-table">
              <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2">Fecha</th>
                  <th scope="col" className="p-2">Documento</th>
                  <th scope="col" className="p-2">Cliente</th>
                  <th scope="col" className="p-2">Bodega · caja</th>
                  <th scope="col" className="p-2">Pago</th>
                  <th scope="col" className="p-2 text-right">Total</th>
                  <th scope="col" className="p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="p-2 whitespace-nowrap">{when(row.date)}</td>
                    <td className="p-2">
                      <span className="font-medium">{row.typeLabel}</span>
                      <span className="block text-xs text-muted-foreground">N° {row.folio ?? 's/f'}</span>
                    </td>
                    <td className="p-2">
                      <span className="font-medium">{row.customer}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{row.rut}</span>
                    </td>
                    <td className="p-2">
                      {row.warehouse}
                      {row.register && <span className="block text-xs text-muted-foreground">{row.register}</span>}
                    </td>
                    <td className="p-2">{row.payment}</td>
                    <td className="p-2 text-right tabular-nums">{row.dteType === 'NOTA_CREDITO_61' ? '−' : ''}{formatCurrency(row.total)}</td>
                    <td className="p-2">
                      <StatusBadge tone={row.status === 'ISSUED' ? 'success' : row.status === 'CANCELLED' ? 'danger' : 'neutral'}>{row.status === 'ISSUED' ? 'Emitido' : row.status === 'CANCELLED' ? 'Anulado' : 'Borrador'}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager page={page} pageSize={SALES_PAGE_SIZE} total={total} hrefFor={(next) => hrefFor({ pagina: String(next) })} />
        </CardContent>
      </Card>
    </div>
  );
}
