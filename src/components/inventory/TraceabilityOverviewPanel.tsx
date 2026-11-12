import Link from 'next/link';
import { AlertOctagon, Barcode, CalendarClock, Link2, PackageSearch, Truck, Download } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { roundQty } from '@/lib/retail/live-metrics';
import { LINK_RATE_TARGET } from '@/lib/inventory/traceability-overview';
import type { TraceabilityOverview } from '@/modules/inventory/services/traceability-overview.service';

const n = (value: number) => value.toLocaleString('es-CL');

/** Estado de la trazabilidad de toda la empresa: qué tan seguible es el inventario y qué atender. */
export default function TraceabilityOverviewPanel({ overview }: { overview: TraceabilityOverview }) {
  const { products, lots, unlot, serials, orders, linkage, attention } = overview;
  return (
    <section className="space-y-4" aria-label="Estado de la trazabilidad">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Productos con lotes" value={n(products.withLots)} icon={PackageSearch} tone="neutral" hint={`de ${n(products.tracked)} con stock`} />
        <KpiCard label="Productos con series" value={n(products.withSerials)} icon={Barcode} tone="neutral" hint={`${n(serials.inStock)} series en bodega`} />
        <KpiCard label="Lotes vencidos" value={n(lots.expired)} icon={AlertOctagon} tone={lots.expired > 0 ? 'danger' : 'success'} hint={lots.expired ? `${roundQty(lots.expiredUnits).toLocaleString('es-CL')} unidades` : 'Ninguno con saldo'} />
        <KpiCard label={`Vencen en ${lots.expiryDays} días`} value={n(lots.soon)} icon={CalendarClock} tone={lots.soon > 0 ? 'warning' : 'success'} hint={lots.soon ? `${roundQty(lots.soonUnits).toLocaleString('es-CL')} unidades` : 'Ninguno'} />
        <KpiCard label="Órdenes en camino" value={n(orders.inTransit)} icon={Truck} tone={orders.overdueCount > 0 ? 'warning' : 'neutral'} hint={orders.overdueCount ? `${n(orders.overdueCount)} atrasadas` : 'Ninguna atrasada'} />
        <KpiCard
          label="Con documento enlazado"
          value={linkage.ratePercent === null ? '—' : `${linkage.ratePercent.toLocaleString('es-CL')}%`}
          icon={Link2}
          tone={linkage.ratePercent === null ? 'neutral' : linkage.ratePercent >= LINK_RATE_TARGET ? 'success' : 'warning'}
          hint={linkage.ratePercent === null ? 'Faltan movimientos para medirlo' : `${n(linkage.linked)} de ${n(linkage.total)} ventas y llegadas, 30 días`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Qué atender</CardTitle>
              <a href="/api/inventory/traceability/export" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">
                <Download className="size-4" aria-hidden="true" /> Excel
              </a>
            </div>
            <CardDescription>Lo que hoy impide seguir bien el inventario.</CardDescription>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada urgente: no hay lotes vencidos, stock sin lote ni series desalineadas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((item) => (
                  <li key={item.id} className="py-2.5">
                    <Link href={item.href} className="block space-y-0.5 text-sm hover:underline">
                      <span className="flex items-center gap-2">
                        <StatusBadge tone={item.tone}>{item.tone === 'danger' ? 'Urgente' : item.tone === 'warning' ? 'Revisar' : 'Aviso'}</StatusBadge>
                        <span className="min-w-0 break-words font-medium">{item.title}</span>
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">{item.detail}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock sin lote</CardTitle>
            <CardDescription>Productos que manejan lotes pero tienen unidades en «SIN-LOTE»: en un retiro no se sabría de dónde vinieron.</CardDescription>
          </CardHeader>
          <CardContent>
            {unlot.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todo el stock de productos con lotes tiene su lote.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {unlot.top.map((p) => (
                  <li key={p.productId} className="flex items-baseline justify-between gap-2 py-2">
                    <Link href={`/dashboard/inventory/trazabilidad?producto=${encodeURIComponent(p.productId)}`} className="min-w-0 break-words hover:underline">
                      {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
                    </Link>
                    <span className="shrink-0 font-semibold tabular-nums">{roundQty(p.quantity).toLocaleString('es-CL')} {p.unit}</span>
                  </li>
                ))}
              </ul>
            )}
            {orders.overdue.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-1 text-sm font-medium">Órdenes de compra atrasadas</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {orders.overdue.slice(0, 5).map((o) => (
                    <li key={o.folio} className="break-words">OC #{o.folio} · {o.supplier} · {o.daysLate} {o.daysLate === 1 ? 'día' : 'días'} de atraso</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
