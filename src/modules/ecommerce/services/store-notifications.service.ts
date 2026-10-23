import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildStoreOrderEmail, buildStoreTeamOrderEmail, type StoreOrderEmailInput, type StoreOrderEmailKind } from '@/lib/email/templates';
import { formatCurrency } from '@/lib/chile/tax';
import { captureException } from '@/lib/observability';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { orderPageUrl } from './store-urls';

/**
 * Avisos del pedido: correos al comprador en cada hito y avisos al equipo (campanita,
 * push y, si la tienda tiene uno configurado, correo). Siempre DESPUÉS de que la
 * operación de negocio confirmó y sin poder frenarla: un correo caído no revierte un pago.
 */

const ORDER_INCLUDE = {
  items: { select: { name: true, quantity: true, grossUnit: true } },
  site: {
    select: {
      name: true,
      slug: true,
      customDomain: true,
      customDomainVerifiedAt: true,
      company: { select: { businessName: true, email: true } },
      store: { select: { notifyEmail: true, supportPhone: true, pickupAddress: true, pickupInstructions: true, bankTransferInfo: true } },
    },
  },
} satisfies Prisma.StoreOrderInclude;

type OrderForNotice = Prisma.StoreOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function chileDate(date: Date | null): string {
  return date ? date.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : '';
}

function addressLine(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const { street, extra, comuna, region } = raw as Record<string, unknown>;
  return [street, extra, comuna, region].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(', ');
}

/** Datos del correo al comprador, armados desde el pedido tal como quedó. Pura salvo la fecha, por eso se prueba sola. */
export function buildOrderEmailInput(order: OrderForNotice, kind: StoreOrderEmailKind): StoreOrderEmailInput {
  const store = order.site.store;
  const displaySubtotal = order.items.reduce((sum, item) => sum + item.grossUnit * item.quantity, 0);
  const details: string[] = [];

  if (order.deliveryMethod === 'SHIPPING') {
    const address = addressLine(order.shippingAddress);
    if (address) details.push(`Despacho a: ${address}`);
    if (order.shippingRateName) details.push(`Forma de despacho: ${order.shippingRateName}`);
  } else if (store?.pickupAddress) {
    details.push(`Retiro en: ${store.pickupAddress}`);
    if (store.pickupInstructions) details.push(store.pickupInstructions);
  }

  if (kind === 'received') {
    if (order.paymentProvider === 'TRANSFER') {
      details.push(`Transfiere ${formatCurrency(order.total)} con estos datos:`);
      for (const line of (store?.bankTransferInfo ?? '').split('\n')) if (line.trim()) details.push(line.trim());
      if (order.paymentExpiresAt) details.push(`Tienes hasta el ${chileDate(order.paymentExpiresAt)} para pagar; después liberamos tu pedido.`);
    } else if (order.paymentProvider === 'PAY_ON_PICKUP') {
      details.push(`Pagas al retirar${order.paymentExpiresAt ? `, a más tardar el ${chileDate(order.paymentExpiresAt)}` : ''}.`);
    } else {
      details.push('Si aún no terminaste de pagar, puedes retomarlo desde el enlace de tu pedido.');
    }
  }
  if (kind === 'shipped') {
    if (order.carrier) details.push(`Transportista: ${order.carrier}`);
    if (order.trackingNumber) details.push(`N° de seguimiento: ${order.trackingNumber}`);
    if (order.trackingUrl) details.push(`Seguimiento: ${order.trackingUrl}`);
  }
  if (kind === 'cancelled' && order.paymentStatus === 'PAID') details.push('Como ya habías pagado, nos pondremos en contacto contigo para devolver tu dinero.');

  return {
    kind,
    companyName: order.site.company.businessName,
    customerName: order.customerName,
    orderNumber: order.number,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, total: item.grossUnit * item.quantity })),
    subtotal: displaySubtotal,
    shippingTotal: order.shippingTotal,
    shippingLabel: order.deliveryMethod === 'SHIPPING' ? order.shippingRateName ?? 'Despacho' : null,
    rounding: order.total - displaySubtotal - order.shippingTotal,
    total: order.total,
    details,
    orderUrl: orderPageUrl(order.site, order.accessToken),
    supportPhone: store?.supportPhone ?? null,
  };
}

async function loadOrder(companyId: string, orderId: string): Promise<OrderForNotice | null> {
  return prisma.storeOrder.findFirst({ where: { id: orderId, companyId }, include: ORDER_INCLUDE });
}

export async function sendOrderEmail(companyId: string, orderId: string, kind: StoreOrderEmailKind): Promise<void> {
  const order = await loadOrder(companyId, orderId);
  if (!order) return;
  const email = buildStoreOrderEmail(buildOrderEmailInput(order, kind));
  const result = await sendEmail({
    to: order.customerEmail,
    ...email,
    companyId,
    replyTo: order.site.store?.notifyEmail || order.site.company.email || undefined,
  });
  if (result.status === 'failed') {
    captureException(new Error(result.error ?? 'No se pudo enviar el correo del pedido'), { module: 'tienda-en-linea', companyId, extra: { orderId, kind } });
  }
}

export const sendOrderReceivedEmail = (companyId: string, orderId: string) => sendOrderEmail(companyId, orderId, 'received');

/** Aviso al equipo de un pedido nuevo (por confirmar o ya pagado). */
export async function notifyNewOrder(companyId: string, orderId: string, mode: 'pending' | 'paid'): Promise<void> {
  const order = await loadOrder(companyId, orderId);
  if (!order) return;
  const paid = mode === 'paid';
  await notifyCompany(companyId, {
    severity: 'INFO',
    title: paid ? 'Nuevo pedido pagado en tu tienda' : 'Nuevo pedido por confirmar en tu tienda',
    message: `#${order.number} · ${order.customerName} · ${formatCurrency(order.total)} · ${order.site.name}`.slice(0, 500),
    // El push se ve en la pantalla bloqueada: sin nombre del comprador.
    pushMessage: `Pedido #${order.number} en "${order.site.name}" por ${formatCurrency(order.total)}.`,
    href: `/dashboard/store?pedido=${order.id}`,
  });

  const to = order.site.store?.notifyEmail;
  if (to) {
    const email = buildStoreTeamOrderEmail({
      companyName: order.site.company.businessName,
      siteName: order.site.name,
      orderNumber: order.number,
      customerName: order.customerName,
      total: order.total,
      paid,
      deliveryLabel: order.deliveryMethod === 'PICKUP' ? 'Retiro' : `Despacho${order.shippingRateName ? ` (${order.shippingRateName})` : ''}`,
      panelUrl: `${getAppUrl()}/dashboard/store?pedido=${order.id}`,
    });
    await sendEmail({ to, ...email, companyId });
  }
}

/** Algo exige atención humana (p. ej. un pago recibido que no se pudo convertir en venta). Visible y fuerte. */
export async function notifyOrderProblem(companyId: string, orderId: string, message: string): Promise<void> {
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, companyId }, select: { id: true, number: true, site: { select: { name: true } } } });
  if (!order) return;
  await notifyCompany(companyId, {
    severity: 'CRITICAL',
    title: `Pedido #${order.number} necesita tu atención`,
    message: `${order.site.name}: ${message}`.slice(0, 500),
    pushMessage: `El pedido #${order.number} de "${order.site.name}" necesita tu atención.`,
    href: `/dashboard/store?pedido=${order.id}`,
  });
}
