import 'server-only';

import type { Prisma, StoreDeliveryMethod, StoreFulfillmentStatus, StoreOrderStatus, StorePaymentProvider, StorePaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { availableFulfillmentActions, buildTimeline, canCancel, canConfirmManualPayment, type FulfillmentAction, type TimelineStep } from '@/lib/ecommerce/order-state';
import { StoreNotFoundError } from '../errors';
import type { OrderListQuery } from '../schema';
import { expireStaleOrders, syncOrderPayment } from './store-payment.service';
import { orderPageUrl } from './store-urls';

/**
 * Lectura de pedidos: la bandeja y el detalle del equipo (siempre con `companyId`) y la
 * página de seguimiento del comprador (que entra con el enlace secreto del pedido).
 */

export const ORDER_PAGE_SIZE = 25;

export interface StoreOrderRow {
  id: string;
  number: number;
  siteId: string;
  siteName: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  total: number;
  itemCount: number;
  status: StoreOrderStatus;
  paymentStatus: StorePaymentStatus;
  fulfillmentStatus: StoreFulfillmentStatus;
  deliveryMethod: StoreDeliveryMethod;
  paymentProvider: StorePaymentProvider | null;
  /** Qué requiere atención humana, si algo. */
  attention: string | null;
}

export interface StoreOrdersPage {
  rows: StoreOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<OrderListQuery['view'], number>;
}

const OPEN = { status: 'OPEN' } as const;

/** Filtro de cada vista de la bandeja. */
function viewWhere(view: OrderListQuery['view']): Prisma.StoreOrderWhereInput {
  switch (view) {
    case 'to-confirm':
      return { ...OPEN, paymentStatus: 'PENDING', paymentProvider: { in: ['TRANSFER', 'PAY_ON_PICKUP'] } };
    case 'to-prepare':
      return { ...OPEN, fulfillmentStatus: 'UNFULFILLED', OR: [{ paymentStatus: 'PAID' }, { paymentProvider: 'PAY_ON_PICKUP' }] };
    case 'to-ship':
      return { ...OPEN, fulfillmentStatus: { in: ['PREPARING', 'SHIPPED', 'READY_FOR_PICKUP'] }, paymentStatus: 'PAID' };
    case 'attention':
      return { OR: [{ documentError: { not: null } }, { status: { in: ['CANCELLED', 'EXPIRED'] }, paymentStatus: 'PAID' }] };
    case 'closed':
      return { status: { in: ['CANCELLED', 'EXPIRED'] } };
    case 'all':
      return {};
  }
}

function attentionOf(order: { documentError: string | null; status: StoreOrderStatus; paymentStatus: StorePaymentStatus }): string | null {
  if (order.documentError) return order.documentError;
  if (order.status !== 'OPEN' && order.paymentStatus === 'PAID') return 'Está pagado pero cerrado: reembolsa o reábrelo.';
  return null;
}

export async function listStoreOrders(companyId: string, query: OrderListQuery): Promise<StoreOrdersPage> {
  // De paso se ordenan los pedidos vencidos de esta empresa (barato y acotado).
  await expireStaleOrders(companyId, 25).catch(() => undefined);

  const search = query.q?.trim();
  const base: Prisma.StoreOrderWhereInput = {
    companyId,
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(search
      ? {
          OR: [
            ...(/^#?\d{1,9}$/.test(search) ? [{ number: Number(search.replace('#', '')) }] : []),
            { customerName: { contains: search, mode: 'insensitive' as const } },
            { customerEmail: { contains: search, mode: 'insensitive' as const } },
            { customerPhone: { contains: search } },
          ],
        }
      : {}),
  };

  const views: Array<OrderListQuery['view']> = ['all', 'to-confirm', 'to-prepare', 'to-ship', 'attention', 'closed'];
  const [total, orders, ...countValues] = await Promise.all([
    prisma.storeOrder.count({ where: { AND: [base, viewWhere(query.view)] } }),
    prisma.storeOrder.findMany({
      where: { AND: [base, viewWhere(query.view)] },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      select: {
        id: true, number: true, siteId: true, createdAt: true, customerName: true, customerEmail: true, total: true, status: true, paymentStatus: true, fulfillmentStatus: true,
        deliveryMethod: true, paymentProvider: true, documentError: true, site: { select: { name: true } }, items: { select: { quantity: true } },
      },
    }),
    ...views.map((view) => prisma.storeOrder.count({ where: { AND: [{ companyId, ...(query.siteId ? { siteId: query.siteId } : {}) }, viewWhere(view)] } })),
  ]);

  return {
    total,
    page: query.page,
    pageSize: ORDER_PAGE_SIZE,
    counts: Object.fromEntries(views.map((view, index) => [view, countValues[index]!])) as Record<OrderListQuery['view'], number>,
    rows: orders.map((order) => ({
      id: order.id,
      number: order.number,
      siteId: order.siteId,
      siteName: order.site.name,
      createdAt: order.createdAt,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      total: order.total,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      deliveryMethod: order.deliveryMethod,
      paymentProvider: order.paymentProvider,
      attention: attentionOf(order),
    })),
  };
}

export interface StoreStats {
  paidToday: number;
  salesToday: number;
  toConfirm: number;
  toPrepare: number;
  attention: number;
}

/** Indicadores del encabezado de la bandeja: lo vendido hoy (día de Chile) y lo que espera al equipo. */
export async function getStoreStats(companyId: string, siteId?: string): Promise<StoreStats> {
  const scope: Prisma.StoreOrderWhereInput = { companyId, ...(siteId ? { siteId } : {}) };
  const [today, toConfirm, toPrepare, attention] = await Promise.all([
    prisma.storeOrder.aggregate({ where: { ...scope, paymentStatus: 'PAID', paidAt: { gte: startOfTodaySantiago() }, status: 'OPEN' }, _sum: { total: true }, _count: { _all: true } }),
    prisma.storeOrder.count({ where: { AND: [scope, viewWhere('to-confirm')] } }),
    prisma.storeOrder.count({ where: { AND: [scope, viewWhere('to-prepare')] } }),
    prisma.storeOrder.count({ where: { AND: [scope, viewWhere('attention')] } }),
  ]);
  return { paidToday: today._count._all, salesToday: today._sum.total ?? 0, toConfirm, toPrepare, attention };
}

export interface StoreOrderDetail extends StoreOrderRow {
  customerPhone: string;
  customerRut: string | null;
  customerNotes: string | null;
  documentType: 'BOLETA' | 'FACTURA';
  billing: Record<string, string> | null;
  shippingAddress: Record<string, string> | null;
  shippingRateName: string | null;
  subtotal: number;
  shippingTotal: number;
  rounding: number;
  netAmount: number;
  ivaAmount: number;
  paymentReference: string | null;
  paidAt: Date | null;
  paymentExpiresAt: Date | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelReason: string | null;
  documentError: string | null;
  salesDocument: { id: string; folio: number | null; dteType: string; totalAmount: number } | null;
  items: Array<{ productId: string; sku: string; name: string; imageUrl: string | null; quantity: number; grossUnit: number; total: number }>;
  events: Array<{ id: string; type: string; message: string; userName: string | null; createdAt: Date }>;
  publicUrl: string;
  actions: FulfillmentAction[];
  canConfirmPayment: boolean;
  canCancel: boolean;
  /** Para pedir factura, retirar, etc.: la bodega de la que sale. */
  stockWarehouseId: string | null;
}

function toRecord(value: Prisma.JsonValue | null): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export async function getStoreOrder(companyId: string, orderId: string): Promise<StoreOrderDetail> {
  const order = await prisma.storeOrder.findFirst({
    where: { id: orderId, companyId },
    include: {
      items: true,
      events: { orderBy: { createdAt: 'desc' }, take: 100 },
      salesDocument: { select: { id: true, folio: true, dteType: true, totalAmount: true } },
      site: { select: { name: true, slug: true, customDomain: true, customDomainVerifiedAt: true, store: { select: { warehouseId: true } } } },
    },
  });
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  const snapshot = { status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, deliveryMethod: order.deliveryMethod, paymentProvider: order.paymentProvider };
  const displaySubtotal = order.items.reduce((sum, item) => sum + item.grossUnit * item.quantity, 0);
  return {
    id: order.id,
    number: order.number,
    siteId: order.siteId,
    siteName: order.site.name,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerRut: order.customerRut,
    customerNotes: order.customerNotes,
    documentType: order.documentType,
    billing: toRecord(order.billing),
    shippingAddress: toRecord(order.shippingAddress),
    shippingRateName: order.shippingRateName,
    total: order.total,
    subtotal: displaySubtotal,
    shippingTotal: order.shippingTotal,
    rounding: order.total - displaySubtotal - order.shippingTotal,
    netAmount: order.netAmount,
    ivaAmount: order.ivaAmount,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryMethod: order.deliveryMethod,
    paymentProvider: order.paymentProvider,
    paymentReference: order.paymentReference,
    paidAt: order.paidAt,
    paymentExpiresAt: order.paymentExpiresAt,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelReason: order.cancelReason,
    documentError: order.documentError,
    attention: attentionOf(order),
    salesDocument: order.salesDocument,
    items: order.items.map((item) => ({ productId: item.productId, sku: item.sku, name: item.name, imageUrl: item.imageUrl, quantity: item.quantity, grossUnit: item.grossUnit, total: item.grossUnit * item.quantity })),
    events: order.events.map((event) => ({ id: event.id, type: event.type, message: event.message, userName: event.userName, createdAt: event.createdAt })),
    publicUrl: orderPageUrl(order.site, order.accessToken),
    actions: availableFulfillmentActions(snapshot),
    canConfirmPayment: canConfirmManualPayment(snapshot).ok,
    canCancel: canCancel(snapshot).ok,
    stockWarehouseId: order.site.store?.warehouseId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Seguimiento del comprador
// ---------------------------------------------------------------------------

export interface PublicOrderView {
  number: number;
  createdAt: Date;
  status: StoreOrderStatus;
  paymentStatus: StorePaymentStatus;
  fulfillmentStatus: StoreFulfillmentStatus;
  deliveryMethod: StoreDeliveryMethod;
  paymentProvider: StorePaymentProvider | null;
  customerName: string;
  items: Array<{ name: string; imageUrl: string | null; quantity: number; grossUnit: number; total: number }>;
  subtotal: number;
  shippingTotal: number;
  shippingRateName: string | null;
  rounding: number;
  total: number;
  address: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  timeline: TimelineStep[];
  /** Cómo pagar, solo mientras haya algo por pagar. */
  payment: { mode: 'ONLINE'; canRetry: boolean } | { mode: 'TRANSFER'; instructions: string; deadline: Date | null } | { mode: 'PAY_ON_PICKUP'; deadline: Date | null } | null;
  pickup: { address: string; instructions: string } | null;
  supportPhone: string | null;
  termsText: string | null;
  cancelReason: string | null;
}

function addressText(value: Prisma.JsonValue | null): string | null {
  const record = toRecord(value);
  if (!record) return null;
  return [record.street, record.extra, record.comuna, record.region].filter(Boolean).join(', ') || null;
}

/**
 * Vista del pedido para quien lo compró. Entra con el enlace secreto (64 hex) y SOLO de la
 * tienda del sitio por el que llegó: el mismo token en otro sitio no existe. Si el pedido está
 * esperando un cobro en línea, de paso se consulta a la pasarela (el comprador pudo haber
 * pagado y recién volver).
 */
export async function getPublicOrder(siteId: string, accessToken: string, options: { sync?: boolean } = {}): Promise<PublicOrderView | null> {
  if (!/^[a-f0-9]{64}$/.test(accessToken)) return null;
  const found = await prisma.storeOrder.findUnique({ where: { accessToken }, select: { id: true, siteId: true, companyId: true, status: true, paymentStatus: true, paymentProvider: true } });
  if (!found || found.siteId !== siteId) return null;

  if (options.sync !== false && found.status === 'OPEN' && found.paymentStatus !== 'PAID' && (found.paymentProvider === 'KHIPU' || found.paymentProvider === 'WEBPAY')) {
    await syncOrderPayment(found.id, found.companyId).catch(() => undefined);
  }

  const order = await prisma.storeOrder.findUnique({
    where: { accessToken },
    include: { items: true, site: { select: { store: { select: { supportPhone: true, termsText: true, pickupAddress: true, pickupInstructions: true, bankTransferInfo: true } } } } },
  });
  if (!order || order.siteId !== siteId) return null;
  const store = order.site.store;
  const displaySubtotal = order.items.reduce((sum, item) => sum + item.grossUnit * item.quantity, 0);
  const unpaid = order.status === 'OPEN' && order.paymentStatus !== 'PAID';

  let payment: PublicOrderView['payment'] = null;
  if (unpaid) {
    if (order.paymentProvider === 'KHIPU' || order.paymentProvider === 'WEBPAY') payment = { mode: 'ONLINE', canRetry: !order.paymentExpiresAt || order.paymentExpiresAt.getTime() > Date.now() };
    else if (order.paymentProvider === 'TRANSFER') payment = { mode: 'TRANSFER', instructions: store?.bankTransferInfo ?? '', deadline: order.paymentExpiresAt };
    else if (order.paymentProvider === 'PAY_ON_PICKUP') payment = { mode: 'PAY_ON_PICKUP', deadline: order.paymentExpiresAt };
  }

  return {
    number: order.number,
    createdAt: order.createdAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryMethod: order.deliveryMethod,
    paymentProvider: order.paymentProvider,
    customerName: order.customerName,
    items: order.items.map((item) => ({ name: item.name, imageUrl: item.imageUrl, quantity: item.quantity, grossUnit: item.grossUnit, total: item.grossUnit * item.quantity })),
    subtotal: displaySubtotal,
    shippingTotal: order.shippingTotal,
    shippingRateName: order.shippingRateName,
    rounding: order.total - displaySubtotal - order.shippingTotal,
    total: order.total,
    address: addressText(order.shippingAddress),
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    timeline: buildTimeline({ status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, deliveryMethod: order.deliveryMethod, paymentProvider: order.paymentProvider }),
    payment,
    pickup: order.deliveryMethod === 'PICKUP' && store?.pickupAddress ? { address: store.pickupAddress, instructions: store.pickupInstructions ?? '' } : null,
    supportPhone: store?.supportPhone ?? null,
    termsText: store?.termsText ?? null,
    cancelReason: order.status === 'OPEN' ? null : order.cancelReason,
  };
}
