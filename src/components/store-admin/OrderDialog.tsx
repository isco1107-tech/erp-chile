'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { FULFILLMENT_ACTION_LABELS, type FulfillmentAction } from '@/lib/ecommerce/order-state';
import { PAYMENT_PROVIDER_INFO } from '@/lib/ecommerce/payment';
import {
  cancelStoreOrderAction,
  confirmOrderPaymentAction,
  fulfillOrderAction,
  getStoreOrderAction,
  markOrderRefundedAction,
  reopenPaidOrderAction,
  retryOrderSaleAction,
} from '@/modules/ecommerce/actions/store.actions';
import type { StoreOrderDetail } from '@/modules/ecommerce/services/store-orders.service';
import { ACTION_ERROR, FULFILLMENT_BADGE, ORDER_STATUS_BADGE, PAYMENT_BADGE, formatDateTime } from './store-admin-shared';

const ERP_METHODS = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA_DEBITO', label: 'Tarjeta de débito' },
  { value: 'TARJETA_CREDITO', label: 'Tarjeta de crédito' },
] as const;

/** Documento de venta que emite la tienda al cobrar. */
const SALE_LABELS: Record<string, string> = { BOLETA_39: 'Boleta', BOLETA_EXENTA_41: 'Boleta exenta', FACTURA_33: 'Factura', FACTURA_EXENTA_34: 'Factura exenta' };

type Panel = 'confirm' | 'ship' | 'cancel' | 'refund' | null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export interface OrderDialogProps {
  orderId: string | null;
  onClose: () => void;
  onChanged: () => void;
  canWrite: boolean;
  canFulfill: boolean;
  canManage: boolean;
}

/** Detalle de un pedido con su historial y las acciones que el equipo puede hacer (según su permiso y el estado). */
export default function OrderDialog({ orderId, onClose, onChanged, canWrite, canFulfill, canManage }: OrderDialogProps) {
  const [order, setOrder] = useState<StoreOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [method, setMethod] = useState<string>('TRANSFERENCIA');
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [reason, setReason] = useState('');
  const [refunded, setRefunded] = useState(false);

  const load = useCallback(async (id: string) => {
    try {
      const result = await getStoreOrderAction(id);
      if (result.success) {
        setOrder(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch {
      setError(ACTION_ERROR);
    }
  }, []);

  useEffect(() => {
    setOrder(null);
    setError(null);
    setPanel(null);
    setNote('');
    setReason('');
    setRefunded(false);
    if (orderId) void load(orderId);
  }, [orderId, load]);

  async function run(task: () => Promise<{ success: true; message?: string } | { success: false; error: string }>) {
    if (!orderId) return;
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        toast.success(result.message ?? 'Listo');
        setPanel(null);
        setNote('');
        onChanged();
        await load(orderId);
      } else {
        toast.error(result.error);
        // El estado pudo cambiar bajo nuestros pies (otra persona avanzó el pedido): se vuelve a leer.
        await load(orderId);
      }
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const closedPaid = order && order.status !== 'OPEN' && order.paymentStatus === 'PAID';
  const needsSale = order && order.status === 'OPEN' && order.paymentStatus === 'PAID' && !order.salesDocument;

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order ? `Pedido #${order.number}` : 'Pedido'}</DialogTitle>
          <DialogDescription>{order ? `${order.siteName} · ${formatDateTime(order.createdAt)}` : 'Cargando…'}</DialogDescription>
        </DialogHeader>

        {error && !order && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {!order && !error && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Cargando el pedido…
          </p>
        )}

        {order && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={PAYMENT_BADGE[order.paymentStatus].tone}>{PAYMENT_BADGE[order.paymentStatus].label}</StatusBadge>
              {order.status === 'OPEN' ? <StatusBadge tone={FULFILLMENT_BADGE[order.fulfillmentStatus].tone}>{FULFILLMENT_BADGE[order.fulfillmentStatus].label}</StatusBadge> : <StatusBadge tone={ORDER_STATUS_BADGE[order.status].tone}>{ORDER_STATUS_BADGE[order.status].label}</StatusBadge>}
              <StatusBadge tone="neutral">{order.deliveryMethod === 'PICKUP' ? 'Retiro en tienda' : 'Despacho'}</StatusBadge>
              <StatusBadge tone="neutral">{order.documentType === 'FACTURA' ? 'Factura' : 'Boleta'}</StatusBadge>
            </div>

            {order.attention && (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                <p className="font-semibold">Requiere atención</p>
                <p>{order.attention}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <section aria-label="Cliente">
                <h3 className="mb-1 text-sm font-semibold">Cliente</h3>
                <dl>
                  <Row label="Nombre">{order.customerName}</Row>
                  <Row label="Correo"><span className="break-all">{order.customerEmail}</span></Row>
                  <Row label="Teléfono">{order.customerPhone}</Row>
                  {order.customerRut && <Row label="RUT">{order.customerRut}</Row>}
                  {order.customerNotes && <Row label="Indicaciones">{order.customerNotes}</Row>}
                </dl>
                {order.billing && (
                  <dl className="mt-2 border-t border-border pt-2">
                    <Row label="Razón social">{order.billing.razonSocial}</Row>
                    <Row label="RUT empresa">{order.billing.rut}</Row>
                    <Row label="Giro">{order.billing.giro}</Row>
                    <Row label="Dirección">{[order.billing.address, order.billing.comuna].filter(Boolean).join(', ')}</Row>
                  </dl>
                )}
              </section>
              <section aria-label="Entrega y pago">
                <h3 className="mb-1 text-sm font-semibold">Entrega y pago</h3>
                <dl>
                  {order.shippingAddress && <Row label="Dirección">{[order.shippingAddress.street, order.shippingAddress.extra, order.shippingAddress.comuna, order.shippingAddress.region].filter(Boolean).join(', ')}</Row>}
                  {order.shippingRateName && <Row label="Tarifa">{order.shippingRateName}</Row>}
                  {order.carrier && <Row label="Transportista">{order.carrier}</Row>}
                  {order.trackingNumber && <Row label="Seguimiento">{order.trackingNumber}</Row>}
                  <Row label="Medio de pago">{order.paymentProvider ? PAYMENT_PROVIDER_INFO[order.paymentProvider].label : '—'}</Row>
                  {order.paidAt && <Row label="Pagado el">{formatDateTime(order.paidAt)}</Row>}
                  {order.paymentReference && <Row label="Referencia">{order.paymentReference}</Row>}
                  {order.paymentStatus === 'PENDING' && order.paymentExpiresAt && <Row label="Se libera el stock">{formatDateTime(order.paymentExpiresAt)}</Row>}
                  {order.salesDocument && <Row label="Venta en el ERP">{SALE_LABELS[order.salesDocument.dteType] ?? 'Documento'} {order.salesDocument.folio ? `N° ${order.salesDocument.folio}` : '(sin folio autorizado)'}</Row>}
                  {order.cancelReason && <Row label="Motivo del cierre">{order.cancelReason}</Row>}
                </dl>
              </section>
            </div>

            <section aria-label="Productos">
              <h3 className="mb-1 text-sm font-semibold">Productos</h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {order.items.map((item) => (
                  <li key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 break-words">
                      {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
                      <span className="block text-xs text-muted-foreground">{item.sku}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatCurrency(item.total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-2">
                <Row label="Productos">{formatCurrency(order.subtotal)}</Row>
                <Row label="Despacho">{order.shippingTotal > 0 ? formatCurrency(order.shippingTotal) : 'Gratis'}</Row>
                {order.rounding !== 0 && <Row label="Ajuste por redondeo">{formatCurrency(order.rounding)}</Row>}
                <Row label="Total"><strong className="tabular-nums">{formatCurrency(order.total)}</strong></Row>
              </dl>
            </section>

            {/* ── Acciones ─────────────────────────────────────────────── */}
            <section aria-label="Acciones" className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                {order.canConfirmPayment && canWrite && (
                  <Button size="sm" onClick={() => { setPanel(panel === 'confirm' ? null : 'confirm'); setMethod(order.paymentProvider === 'TRANSFER' ? 'TRANSFERENCIA' : 'EFECTIVO'); }}>
                    Confirmar pago recibido
                  </Button>
                )}
                {canFulfill &&
                  order.actions.map((action: FulfillmentAction) =>
                    action === 'SHIP' ? (
                      <Button key={action} size="sm" variant="outline" onClick={() => setPanel(panel === 'ship' ? null : 'ship')}>
                        {FULFILLMENT_ACTION_LABELS[action]}
                      </Button>
                    ) : (
                      <Button key={action} size="sm" variant="outline" disabled={busy} onClick={() => run(() => fulfillOrderAction(order.id, { action }))}>
                        {FULFILLMENT_ACTION_LABELS[action]}
                      </Button>
                    )
                  )}
                {needsSale && canWrite && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => retryOrderSaleAction(order.id))}>
                    Reintentar emitir la venta
                  </Button>
                )}
                {closedPaid && canManage && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => reopenPaidOrderAction(order.id))}>
                      Reabrir el pedido
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'refund' ? null : 'refund')}>
                      Registrar reembolso
                    </Button>
                  </>
                )}
                {order.canCancel && canWrite && (order.paymentStatus !== 'PAID' || canManage) && (
                  <Button size="sm" variant="destructive" onClick={() => setPanel(panel === 'cancel' ? null : 'cancel')}>
                    Cancelar pedido
                  </Button>
                )}
                {order.canCancel && order.paymentStatus === 'PAID' && !canManage && <p className="text-xs text-muted-foreground">Cancelar un pedido ya pagado lo hace un administrador de la tienda.</p>}
                <a href={order.publicUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 self-center text-xs text-muted-foreground underline underline-offset-4">
                  Ver como lo ve el comprador <ExternalLink className="size-3" aria-hidden="true" />
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
              </div>

              {panel === 'confirm' && (
                <form className="space-y-3 rounded-lg bg-muted/50 p-3" onSubmit={(event) => { event.preventDefault(); void run(() => confirmOrderPaymentAction(order.id, { method, note })); }}>
                  <p className="text-sm">Confirma solo cuando el dinero ya esté en tu cuenta o en tu caja. Se emite la {order.documentType === 'FACTURA' ? 'factura' : 'boleta'} y se descuenta el stock.</p>
                  <label className="block space-y-1 text-sm font-medium">
                    Forma de pago en el ERP
                    <select className={nativeSelectClass} value={method} onChange={(event) => setMethod(event.target.value)}>
                      {ERP_METHODS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    Referencia (opcional)
                    <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="N° de transferencia, comprobante…" />
                  </label>
                  <Button type="submit" size="sm" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar pago'}</Button>
                </form>
              )}

              {panel === 'ship' && (
                <form className="space-y-3 rounded-lg bg-muted/50 p-3" onSubmit={(event) => { event.preventDefault(); void run(() => fulfillOrderAction(order.id, { action: 'SHIP', carrier, trackingNumber: tracking, trackingUrl })); }}>
                  <p className="text-sm">Anota cómo lo enviaste para que el comprador pueda seguirlo. Todo es opcional.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-sm font-medium">Transportista<Input value={carrier} onChange={(event) => setCarrier(event.target.value)} maxLength={60} placeholder="Starken, Chilexpress…" /></label>
                    <label className="block space-y-1 text-sm font-medium">N° de seguimiento<Input value={tracking} onChange={(event) => setTracking(event.target.value)} maxLength={60} /></label>
                  </div>
                  <label className="block space-y-1 text-sm font-medium">Enlace de seguimiento<Input value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} maxLength={500} placeholder="https://…" inputMode="url" /></label>
                  <Button type="submit" size="sm" disabled={busy}>{busy ? 'Guardando…' : 'Marcar despachado'}</Button>
                </form>
              )}

              {panel === 'cancel' && (
                <form className="space-y-3 rounded-lg bg-muted/50 p-3" onSubmit={(event) => { event.preventDefault(); void run(() => cancelStoreOrderAction(order.id, { reason, refunded, refundNote: note })); }}>
                  <p className="text-sm">El pedido se cierra, el stock apartado se libera y el comprador recibe un aviso.</p>
                  <label className="block space-y-1 text-sm font-medium">Motivo<textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} required minLength={3} /></label>
                  {order.paymentStatus === 'PAID' && (
                    <>
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={refunded} onChange={(event) => setRefunded(event.target.checked)} /> Ya le devolví el dinero al comprador (por la pasarela o el banco)</label>
                      <p className="text-xs text-muted-foreground">Aether no devuelve plata por la pasarela: hazlo en su portal y márcalo acá para dejar constancia.</p>
                    </>
                  )}
                  <Button type="submit" size="sm" variant="destructive" disabled={busy}>{busy ? 'Cancelando…' : 'Cancelar el pedido'}</Button>
                </form>
              )}

              {panel === 'refund' && (
                <form className="space-y-3 rounded-lg bg-muted/50 p-3" onSubmit={(event) => { event.preventDefault(); void run(() => markOrderRefundedAction(order.id, { note })); }}>
                  <p className="text-sm">Deja constancia de que ya le devolviste el dinero a este comprador.</p>
                  <label className="block space-y-1 text-sm font-medium">Detalle (opcional)<Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="Devolución por transferencia el…" /></label>
                  <Button type="submit" size="sm" disabled={busy}>{busy ? 'Guardando…' : 'Registrar reembolso'}</Button>
                </form>
              )}
            </section>

            <section aria-label="Historial">
              <h3 className="mb-1 text-sm font-semibold">Historial</h3>
              <ol className="space-y-2 border-l border-border pl-4">
                {order.events.map((event) => (
                  <li key={event.id} className="relative text-sm">
                    <span aria-hidden="true" className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" />
                    <p className="break-words">{event.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}{event.userName ? ` · ${event.userName}` : ''}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
