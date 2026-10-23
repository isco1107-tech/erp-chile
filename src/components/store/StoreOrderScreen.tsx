import { Check, Circle } from 'lucide-react';
import type { StoreFulfillmentStatus } from '@prisma/client';
import { FULFILLMENT_STATUS_LABELS } from '@/lib/ecommerce/order-state';
import { PAYMENT_PROVIDER_INFO } from '@/lib/ecommerce/payment';
import { storeScreenHref } from '@/lib/ecommerce/store-href';
import type { PublicOrderView } from '@/modules/ecommerce/services/store-orders.service';
import { cx } from '@/components/web-sites/site/parts';
import OrderLive from './OrderLive';
import { Notice, ProductImage, StoreFrame, StoreTitle, money } from './ui';

const DATE = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Santiago' });

function headline(order: PublicOrderView): { title: string; intro: string } {
  if (order.status === 'CANCELLED') return { title: 'Pedido cancelado', intro: order.cancelReason ? `Motivo: ${order.cancelReason}` : 'Este pedido fue cancelado.' };
  if (order.status === 'EXPIRED') return { title: 'Pedido vencido', intro: 'No recibimos el pago a tiempo, así que liberamos los productos. Puedes volver a la tienda y comprar de nuevo.' };
  if (order.paymentStatus === 'REFUNDED') return { title: 'Pedido reembolsado', intro: 'Te devolvimos el dinero de este pedido.' };
  if (order.paymentStatus === 'PAID') {
    const done: Record<StoreFulfillmentStatus, string> = {
      UNFULFILLED: '¡Gracias por tu compra! Recibimos tu pago y vamos a preparar tu pedido.',
      PREPARING: 'Estamos preparando tu pedido.',
      READY_FOR_PICKUP: 'Tu pedido está listo para retirar.',
      SHIPPED: 'Tu pedido va en camino.',
      DELIVERED: 'Tu pedido fue entregado. ¡Gracias por comprar con nosotros!',
    };
    return { title: `Pedido #${order.number}`, intro: done[order.fulfillmentStatus] };
  }
  if (order.payment?.mode === 'ONLINE' && order.paymentStatus === 'FAILED') {
    return { title: `Pedido #${order.number}`, intro: order.payment.canRetry ? 'No pudimos confirmar tu pago. Puedes intentarlo de nuevo mientras reservamos tus productos.' : 'No pudimos confirmar tu pago y el tiempo de reserva terminó.' };
  }
  if (order.payment?.mode === 'ONLINE') return { title: `Pedido #${order.number}`, intro: 'Estamos esperando la confirmación de tu pago. Esta página se actualiza sola.' };
  return { title: `Pedido #${order.number}`, intro: 'Recibimos tu pedido. Sigue las instrucciones para completar tu pago.' };
}

/** Seguimiento del pedido para quien compró: estado, línea de tiempo, cómo pagar, detalle y datos de entrega. */
export default function StoreOrderScreen({ order, accessToken, basePath }: { order: PublicOrderView; accessToken: string; basePath: string }) {
  const { title, intro } = headline(order);
  const closed = order.status !== 'OPEN';
  const waitingOnline = !closed && order.payment?.mode === 'ONLINE';
  return (
    <StoreFrame label={`Pedido ${order.number}`} width="narrow">
      <StoreTitle eyebrow={DATE.format(order.createdAt)} title={title} intro={intro} />

      <div className="space-y-6">
        {order.payment?.mode === 'ONLINE' && <OrderLive accessToken={accessToken} waitingOnline={waitingOnline} canRetry={order.payment.canRetry} />}

        {order.payment?.mode === 'TRANSFER' && (
          <Notice>
            <h2 className="mb-1 font-semibold">Paga con transferencia bancaria</h2>
            <p>
              Total a transferir: <strong>{money(order.total)}</strong>. Reservamos tus productos{order.payment.deadline ? ` hasta el ${DATE.format(order.payment.deadline)}` : ''}; cuando recibamos el pago, confirmamos tu pedido.
            </p>
            {order.payment.instructions && <p className="mt-2 break-words whitespace-pre-line">{order.payment.instructions}</p>}
            <p className="mt-2">En el comentario de la transferencia escribe «Pedido #{order.number}».</p>
          </Notice>
        )}
        {order.payment?.mode === 'PAY_ON_PICKUP' && (
          <Notice>
            <h2 className="mb-1 font-semibold">Pagas al retirar</h2>
            <p>
              Reservamos tus productos{order.payment.deadline ? ` hasta el ${DATE.format(order.payment.deadline)}` : ''}. Paga <strong>{money(order.total)}</strong> cuando retires tu pedido.
            </p>
          </Notice>
        )}

        {!closed && (
          <ol aria-label="Estado de tu pedido" className="ws-card space-y-4 p-5">
            {order.timeline.map((step) => (
              <li key={step.key} aria-current={step.current ? 'step' : undefined} className="flex items-center gap-3">
                <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border', step.done ? 'border-[color:var(--s-mark)] bg-[color:var(--s-mark)] text-[color:var(--s-btn-fg)]' : 'border-[color:var(--s-line)]')}>
                  {step.done ? <Check className="size-4" aria-hidden="true" /> : <Circle className={cx('size-3', step.current && '[color:var(--s-mark)]')} aria-hidden="true" />}
                </span>
                <span className={cx(step.done || step.current ? 'font-semibold' : 'ws-muted')}>
                  {step.label}
                  <span className="sr-only">{step.done ? ' (listo)' : step.current ? ' (en curso)' : ''}</span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {(order.trackingNumber || order.carrier || order.trackingUrl) && (
          <Notice tone="success">
            <h2 className="mb-1 font-semibold">Seguimiento del envío</h2>
            {order.carrier && <p className="break-words">Transportista: {order.carrier}</p>}
            {order.trackingNumber && <p className="break-words">Número de seguimiento: {order.trackingNumber}</p>}
            {order.trackingUrl && /^https:\/\//i.test(order.trackingUrl) && (
              <p>
                <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
                  Seguir mi envío <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
              </p>
            )}
          </Notice>
        )}

        {order.pickup && order.status === 'OPEN' && (
          <section className="ws-card space-y-1 p-5 text-sm">
            <h2 className="ws-h text-base">Retiro en tienda</h2>
            <p className="break-words">{order.pickup.address}</p>
            {order.pickup.instructions && <p className="ws-muted break-words">{order.pickup.instructions}</p>}
          </section>
        )}
        {order.address && (
          <section className="ws-card space-y-1 p-5 text-sm">
            <h2 className="ws-h text-base">Dirección de despacho</h2>
            <p className="break-words">{order.address}</p>
            {order.shippingRateName && <p className="ws-muted">{order.shippingRateName}</p>}
          </section>
        )}

        <section aria-labelledby="order-detail" className="ws-card p-5">
          <h2 id="order-detail" className="ws-h mb-4 text-lg">
            Detalle
          </h2>
          <ul className="space-y-3">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex gap-3 text-sm">
                <ProductImage src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-[var(--ws-radius)] object-cover" />
                <span className="min-w-0 grow break-words">
                  {item.name} <span className="ws-muted">× {item.quantity}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(item.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-[color:var(--s-line)] pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="ws-muted">Productos</dt>
              <dd className="tabular-nums">{money(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="ws-muted">{order.deliveryMethod === 'PICKUP' ? 'Retiro' : 'Despacho'}</dt>
              <dd className="tabular-nums">{order.shippingTotal > 0 ? money(order.shippingTotal) : 'Gratis'}</dd>
            </div>
            {order.rounding !== 0 && (
              <div className="flex justify-between gap-3">
                <dt className="ws-muted">Ajuste por redondeo</dt>
                <dd className="tabular-nums">{money(order.rounding)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-[color:var(--s-line)] pt-3 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="ws-h font-bold [color:var(--s-mark)] tabular-nums">{money(order.total)}</dd>
            </div>
          </dl>
          <p className="ws-muted mt-3 text-xs">
            {order.paymentProvider ? `${PAYMENT_PROVIDER_INFO[order.paymentProvider].label} · ` : ''}
            {order.paymentStatus === 'PAID' ? 'Pagado' : order.paymentStatus === 'REFUNDED' ? 'Reembolsado' : 'Pago pendiente'} · {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <a href={storeScreenHref(basePath, 'catalog')} className="ws-btn ws-btn-alt ws-btn-sm">
            Seguir comprando
          </a>
          {order.supportPhone && (
            <p className="ws-muted">
              ¿Dudas? Llámanos al{' '}
              <a href={`tel:${order.supportPhone.replace(/[^\d+]/g, '')}`} className="font-semibold underline underline-offset-4">
                {order.supportPhone}
              </a>
              .
            </p>
          )}
        </div>
        <p className="ws-muted text-xs">Guarda esta dirección: es tu enlace para seguir el pedido. Quien la tenga puede verlo.</p>
      </div>
    </StoreFrame>
  );
}
