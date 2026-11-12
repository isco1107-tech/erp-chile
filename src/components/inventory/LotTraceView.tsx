import { ArrowDownToLine, ArrowUpFromLine, Factory, Users } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { dayTimeLabel, roundQty } from '@/lib/retail/live-metrics';
import type { CustomerHit } from '@/lib/inventory/genealogy';
import type { LotMovementRow, LotTrace } from '@/modules/inventory/services/genealogy.service';

const qty = (value: number) => roundQty(value).toLocaleString('es-CL');

function MovementList({ rows, empty, unit }: { rows: LotMovementRow[]; empty: string; unit: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="space-y-0.5 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="min-w-0 break-words font-medium">
              {row.label}
              {row.cancelled && <StatusBadge tone="neutral" className="ml-2">Documento anulado</StatusBadge>}
            </p>
            <span className="font-semibold tabular-nums">{qty(row.quantity)} {unit}</span>
          </div>
          <p className="break-words text-xs text-muted-foreground">
            {[dayTimeLabel(row.at), row.warehouse, row.document ?? (row.reference ? `${row.reference} (sin documento enlazado)` : 'Sin documento enlazado'), row.counterparty, row.reason, row.actor]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {row.note && <p className="break-words text-xs text-muted-foreground">{row.note}</p>}
          {row.evidenceUrl && isAllowedBlobUrl(row.evidenceUrl) && (
            <a href={row.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary underline">Ver foto de respaldo</a>
          )}
        </li>
      ))}
    </ul>
  );
}

function CustomerList({ customers, unit }: { customers: CustomerHit[]; unit: string }) {
  return (
    <ul className="divide-y divide-border">
      {customers.map((c) => (
        <li key={c.contactId} className="space-y-0.5 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="min-w-0 break-words font-medium">{c.name} <span className="font-normal text-muted-foreground">· {c.rut}</span></p>
            <span className="font-semibold tabular-nums">{qty(c.quantity)} {unit}</span>
          </div>
          <p className="break-words text-xs text-muted-foreground">{c.documents.slice(0, 6).join(', ')}{c.documents.length > 6 ? ` y ${c.documents.length - 6} más` : ''} · {dayTimeLabel(c.firstAt)}{c.firstAt.getTime() !== c.lastAt.getTime() ? ` a ${dayTimeLabel(c.lastAt)}` : ''}</p>
        </li>
      ))}
    </ul>
  );
}

/** Genealogía de un lote: de dónde vino, adónde fue y cuánto queda. Para un retiro del mercado o una auditoría. */
export default function LotTraceView({ trace }: { trace: LotTrace }) {
  const unit = trace.product.unit;
  const rec = trace.reconciliation;
  const downstreamCustomers = trace.usedInProduction.reduce((sum, link) => sum + link.customers.length, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Recibido" value={`${qty(rec.received)} ${unit}`} icon={ArrowDownToLine} tone="neutral" hint={trace.suppliers.length ? trace.suppliers.join(' · ') : 'Sin documento enlazado'} />
        <KpiCard label="Despachado" value={`${qty(rec.dispatched)} ${unit}`} icon={ArrowUpFromLine} tone="neutral" hint={`${trace.distributedPercent.toLocaleString('es-CL')}% llegó a clientes`} />
        <KpiCard label="Queda en bodega" value={`${qty(rec.inStock)} ${unit}`} icon={Factory} tone={rec.inStock > 0 ? 'warning' : 'success'} hint={rec.inStock > 0 ? 'Aíslalo si se retira el lote' : 'Nada por retirar'} />
        <KpiCard
          label="Clientes alcanzados"
          value={trace.customersHidden ? '—' : String(trace.customers.length + downstreamCustomers)}
          icon={Users}
          tone="neutral"
          hint={trace.customersHidden ? 'Requiere permiso de ventas' : downstreamCustomers ? `${downstreamCustomers} vía producción` : 'Compraron este lote'}
        />
      </div>

      {rec.balanced ? (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">El lote cuadra: lo recibido menos lo despachado es igual a lo que hay en bodega.</p>
      ) : (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          El lote no cuadra: hay {qty(Math.abs(rec.unexplained))} {unit} {rec.unexplained > 0 ? 'recibidas sin destino registrado' : 'despachadas sin entrada registrada'}. Puede haber movimientos anteriores al seguimiento por documento o hechos sin lote.
        </p>
      )}
      {trace.truncated && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Este lote tiene más movimientos de los que se leen; la lista queda incompleta.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>De dónde vino</CardTitle>
            <CardDescription>Entradas del lote y el documento de origen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MovementList rows={trace.entries} empty="No hay entradas registradas para este lote." unit={unit} />
            {trace.madeIn.map((order) => (
              <div key={order.orderId} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">Fabricado en la orden de producción N° {order.folio}</p>
                {order.inputs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin insumos registrados.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {order.inputs.map((input, i) => (
                      <li key={`${input.productName}-${input.lotNumber}-${i}`} className="break-words">
                        {input.productName} · lote {input.lotNumber} · {qty(input.quantity)}{input.suppliers.length ? ` · proveedor: ${input.suppliers.join(', ')}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dónde está hoy</CardTitle>
            <CardDescription>Existencias del lote por bodega.</CardDescription>
          </CardHeader>
          <CardContent>
            {trace.stock.length === 0 ? (
              <p className="text-sm text-muted-foreground">No queda stock de este lote.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {trace.stock.map((s) => (
                  <li key={s.warehouse} className="flex justify-between gap-2 py-2">
                    <span className="min-w-0 break-words">{s.warehouse}</span>
                    <span className="font-semibold tabular-nums">{qty(s.quantity)} {unit}</span>
                  </li>
                ))}
              </ul>
            )}
            {trace.transfers.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-sm font-medium">Traslados</p>
                <MovementList rows={trace.transfers} empty="" unit={unit} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>A quién llegó</CardTitle>
          <CardDescription>Ventas del lote y los clientes que lo recibieron (netos de devoluciones).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {trace.customersHidden ? (
            <EmptyState title="Sin permiso para ver clientes" description="Pide a un administrador con acceso a Ventas que revise esta sección." />
          ) : trace.customers.length === 0 && trace.sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este lote no registra ventas enlazadas a un documento.</p>
          ) : (
            <>
              {trace.customers.length > 0 && <CustomerList customers={trace.customers} unit={unit} />}
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Ver las {trace.sales.length + trace.returns.length} ventas y devoluciones</summary>
                <MovementList rows={[...trace.sales, ...trace.returns]} empty="" unit={unit} />
              </details>
            </>
          )}
          {trace.usedInProduction.map((link) => (
            <div key={`${link.orderId}-${link.outputProductId}-${link.outputLot}`} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">Usado en producción N° {link.folio}: {link.outputProduct}{link.outputLot ? ` (lote ${link.outputLot})` : ''}</p>
              {!link.outputLot && <p className="text-xs text-muted-foreground">El producto terminado se ingresó sin lote: no se puede seguir hasta el cliente. Informa el lote al terminar la producción.</p>}
              {link.customers.length > 0 && <CustomerList customers={link.customers} unit={link.outputProduct} />}
            </div>
          ))}
        </CardContent>
      </Card>

      {trace.writeOffs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pérdidas y otras salidas</CardTitle>
            <CardDescription>Mermas, vencidos, devoluciones al proveedor y ajustes.</CardDescription>
          </CardHeader>
          <CardContent>
            <MovementList rows={trace.writeOffs} empty="" unit={unit} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
