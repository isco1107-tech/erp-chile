import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, CheckCircle2, Truck, Wallet } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getSalesOrderAction } from '@/modules/sales/actions/sales-orders.actions';
import { SALES_ORDER_STATUS_LABELS, orderProgressPercent, remainingToDispatch, remainingToInvoice } from '@/modules/sales/orders';
import { DTE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import type { Tone } from '@/components/ui/tone';
import SalesOrderActions from '@/components/sales/SalesOrderActions';

export const metadata = { title: 'Nota de venta' };

const STATUS_TONE: Record<string, Tone> = { PENDING: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' };

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : '—';
}

function qty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [context, result] = await Promise.all([getAuthContext(), getSalesOrderAction(id)]);
  if (!result.success) notFound();
  const order = result.data;

  const isOpen = order.status === 'PENDING' || order.status === 'IN_PROGRESS';
  const progress = orderProgressPercent(order.items);
  const pendingToInvoice = order.items.some((item) => remainingToInvoice(item) > 0);
  const pendingToDispatch = order.items.some((item) => remainingToDispatch(item) > 0);
  const hasProgress = order.items.some((item) => item.quantityInvoiced > 0 || item.quantityDispatched > 0);
  const today = new Date();
  const late = isOpen && order.deliveryDate && order.deliveryDate < today;
  const invoicedAmount = order.salesDocuments
    .filter((doc) => doc.status === 'ISSUED' && doc.dteType !== 'GUIA_DESPACHO_52')
    .reduce((sum, doc) => sum + doc.totalAmount, 0);
  const client = order.contact.nombreFantasia ?? order.contact.razonSocial;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/sales/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Notas de venta
      </Link>

      <PageHeader
        eyebrow={`Nota de venta #${order.folio}`}
        title={client}
        description={
          <>
            {order.contact.rut} · {PAYMENT_METHOD_LABELS[order.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? order.paymentMethod} · bodega {order.warehouse.name}
            {order.seller && <> · vendedor {order.seller.name}</>}
          </>
        }
        actions={
          isOpen && can(context, 'sales:write') ? (
            <SalesOrderActions orderId={order.id} hasProgress={hasProgress} pendingToInvoice={pendingToInvoice} pendingToDispatch={pendingToDispatch} />
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={STATUS_TONE[order.status] ?? 'neutral'}>{SALES_ORDER_STATUS_LABELS[order.status]}</StatusBadge>
        {order.quote && (
          <Link href={`/dashboard/sales/${order.quote.id}`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Desde cotización #{order.quote.folio ?? '—'}
          </Link>
        )}
        {order.cancelReason && <span className="text-xs text-muted-foreground">Motivo de cierre: {order.cancelReason}</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total de la nota" value={formatCurrency(order.totalAmount)} icon={Wallet} tone="accent" hint={`Neto ${formatCurrency(order.netAmount + order.exemptAmount)}`} />
        <KpiCard label="Facturado" value={`${progress}%`} icon={CheckCircle2} tone={progress >= 100 ? 'success' : 'info'} hint={formatCurrency(invoicedAmount)} />
        <KpiCard
          label="Despacho"
          value={pendingToDispatch ? 'Pendiente' : 'Completo'}
          icon={Truck}
          tone={pendingToDispatch ? 'warning' : 'success'}
          hint={`${order.salesDocuments.filter((doc) => doc.dteType === 'GUIA_DESPACHO_52' && doc.status === 'ISSUED').length} guía(s) emitida(s)`}
        />
        <KpiCard label="Entrega" value={formatDate(order.deliveryDate)} icon={CalendarClock} tone={late ? 'danger' : 'neutral'} hint={late ? 'Atrasada' : `Pedido del ${formatDate(order.orderDate)}`} />
      </div>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-labelledby="order-lines">
        <h2 id="order-lines" className="border-b border-border px-5 py-3 text-sm font-semibold">
          Productos
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 font-medium">Producto</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedido</th>
                <th className="px-3 py-2.5 text-right font-medium">Despachado</th>
                <th className="px-3 py-2.5 text-right font-medium">Facturado</th>
                <th className="px-3 py-2.5 text-right font-medium">Precio neto</th>
                <th className="px-5 py-2.5 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item) => {
                const done = item.quantityInvoiced >= item.quantity;
                return (
                  <tr key={item.id}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.sku ? <span className="font-mono">{item.sku}</span> : 'Línea libre'}
                        {item.discountPercent > 0 && ` · ${item.discountPercent}% desc.`}
                        {item.isExempt && ' · exento'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qty(item.quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{qty(item.quantityDispatched)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${done ? 'font-medium text-success' : ''}`}>{qty(item.quantityInvoiced)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{formatCurrency(item.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {order.notes && <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">{order.notes}</p>}
      </section>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-labelledby="order-docs">
        <h2 id="order-docs" className="border-b border-border px-5 py-3 text-sm font-semibold">
          Documentos emitidos
        </h2>
        {order.salesDocuments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Aún no se emite ningún documento desde esta nota.</p>
        ) : (
          <ul className="divide-y divide-border">
            {order.salesDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/dashboard/sales/${doc.id}`} className="font-medium hover:underline">
                  {DTE_TYPE_LABELS[doc.dteType]} {doc.folio ? `#${doc.folio}` : '(borrador)'}
                </Link>
                <span className="flex items-center gap-3 text-muted-foreground tabular-nums">
                  {formatDate(doc.issueDate)}
                  <span className="font-medium text-foreground">{formatCurrency(doc.totalAmount)}</span>
                  {doc.status === 'CANCELLED' && <StatusBadge tone="neutral">Anulado</StatusBadge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isOpen && (
        <p className="text-sm text-muted-foreground">
          Esta nota está {SALES_ORDER_STATUS_LABELS[order.status].toLowerCase()}. <Link href="/dashboard/sales/orders/new" className={buttonVariants({ variant: 'link', size: 'sm' })}>Crear otra</Link>
        </p>
      )}
    </div>
  );
}
