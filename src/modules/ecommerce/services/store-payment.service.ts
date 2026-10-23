import 'server-only';

import type { Prisma, StorePaymentProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { captureException, captureMessage } from '@/lib/observability';
import { getAppUrl } from '@/lib/email/mailer';
import { canConfirmManualPayment, type OrderSnapshot } from '@/lib/ecommerce/order-state';
import { holdMinutes } from '@/lib/ecommerce/payment';
import { evaluateWebpayResult, isWebpayUrl, webpayPaymentMethod } from '@/lib/ecommerce/webpay-verdict';
import { decryptPaymentCredential } from '@/lib/payments/crypto';
import { createKhipuPayment, getKhipuPayment } from '@/lib/payments/khipu';
import { WebpayApiError, commitWebpayTransaction, createWebpayTransaction, getWebpayTransaction, type WebpayCredentials, type WebpayTransaction } from '@/lib/payments/webpay';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { evaluateKhipuPayment, type ProviderVerdict } from '@/modules/payment-plans/online-payment-calc';
import { StoreError, StoreNotFoundError, OutOfStockError } from '../errors';
import { cancelOrderInternal, type Actor } from './store-fulfillment.service';
import { notifyNewOrder, notifyOrderProblem, sendOrderEmail } from './store-notifications.service';
import { isErpPaymentMethod, issueSaleForOrder, type ErpPaymentMethod } from './store-sale.service';
import { holdReservations, reserveForOrder } from './store-stock.service';
import { orderPageUrl, webpayStartUrl } from './store-urls';

/**
 * Cobro de los pedidos. Regla central (igual que el pago de cuotas): un pedido SOLO pasa a
 * pagado en `markOrderPaid`, y solo después de CONSULTAR el cobro a la pasarela con las
 * credenciales de la empresa y comprobar estado, monto, moneda y referencia exactos. Ni la
 * notificación de Khipu ni el regreso del navegador desde Webpay se creen: sirven para saber
 * QUÉ cobro consultar, nada más. Un cobro que no calza con el pedido nunca se aplica: se
 * escala para revisión humana.
 *
 * Los medios manuales (transferencia, pagar al retirar) los confirma una persona del equipo.
 */

/** Margen tras el vencimiento antes de dar por vencido un pedido pagado en línea: una transferencia puede quedar «verificando» unos minutos. */
const EXPIRY_GRACE_MS = 15 * 60_000;

const ORDER_FOR_PAYMENT = {
  items: { select: { name: true, quantity: true } },
  site: {
    select: {
      name: true,
      slug: true,
      status: true,
      customDomain: true,
      customDomainVerifiedAt: true,
      company: { select: { businessName: true, status: true, features: { select: { hasEcommerce: true } }, settings: { select: { khipuApiCredential: true } } } },
      store: { select: { webpayCommerceCode: true, webpayApiSecret: true, webpayProduction: true, transferHoldHours: true } },
    },
  },
} satisfies Prisma.StoreOrderInclude;

type PaymentOrder = Prisma.StoreOrderGetPayload<{ include: typeof ORDER_FOR_PAYMENT }>;

async function loadPaymentOrder(orderId: string, companyId?: string): Promise<PaymentOrder | null> {
  return prisma.storeOrder.findFirst({ where: { id: orderId, ...(companyId ? { companyId } : {}) }, include: ORDER_FOR_PAYMENT });
}

function webpayCredentials(order: PaymentOrder): WebpayCredentials | null {
  const store = order.site.store;
  if (!store?.webpayCommerceCode || !store.webpayApiSecret) return null;
  return { commerceCode: store.webpayCommerceCode, apiSecret: decryptPaymentCredential(store.webpayApiSecret), production: store.webpayProduction };
}

function khipuApiKey(order: PaymentOrder): string | null {
  const stored = order.site.company.settings?.khipuApiCredential;
  return stored ? decryptPaymentCredential(stored) : null;
}

// ---------------------------------------------------------------------------
// Abrir el cobro
// ---------------------------------------------------------------------------

/**
 * Abre el cobro de un pedido en su pasarela y devuelve a dónde mandar al comprador, o `null`
 * si el medio es manual (la página del pedido le dice cómo pagar). Si la pasarela falla,
 * lanza: quien llama cancela el pedido.
 */
export async function startOrderPayment(orderId: string, companyId: string): Promise<string | null> {
  const order = await loadPaymentOrder(orderId, companyId);
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  if (!order.paymentProvider || order.paymentProvider === 'TRANSFER' || order.paymentProvider === 'PAY_ON_PICKUP') return null;
  if (order.status !== 'OPEN' || order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') throw new StoreError('Este pedido ya no se puede pagar.', 409);
  const expiresAt = order.paymentExpiresAt ?? new Date(Date.now() + holdMinutes(order.paymentProvider, order.site.store?.transferHoldHours ?? 48) * 60_000);

  if (order.paymentProvider === 'KHIPU') {
    const apiKey = khipuApiKey(order);
    if (!apiKey) throw new StoreError('Este medio de pago no está configurado.', 503);
    const appUrl = getAppUrl();
    const created = await createKhipuPayment(apiKey, {
      subject: `Pedido #${order.number} — ${order.site.company.businessName}`,
      amount: order.total,
      transactionId: order.id,
      returnUrl: orderPageUrl(order.site, order.accessToken),
      cancelUrl: orderPageUrl(order.site, order.accessToken),
      notifyUrl: `${appUrl}/api/public/store/khipu/notify`,
      expiresAt,
      payerName: order.customerName,
      payerEmail: order.customerEmail,
      body: `Compra en ${order.site.company.businessName}`,
    });
    const url = await claimPaymentSlot(order, { providerPaymentId: created.paymentId, paymentUrl: created.paymentUrl });
    return url ?? created.paymentUrl;
  }

  const credentials = webpayCredentials(order);
  if (!credentials) throw new StoreError('Este medio de pago no está configurado.', 503);
  const created = await createWebpayTransaction(credentials, {
    buyOrder: order.id,
    sessionId: order.id,
    amount: order.total,
    returnUrl: `${getAppUrl()}/api/public/store/webpay/return`,
  });
  if (!isWebpayUrl(created.url)) throw new StoreError('Webpay respondió una dirección inesperada.', 502);
  // `paymentUrl` guarda la dirección de Transbank; al comprador se lo manda por la página puente (formulario POST con el token).
  await claimPaymentSlot(order, { providerPaymentId: created.token, paymentUrl: created.url });
  return webpayStartUrl(order.accessToken);
}

/**
 * Guarda el cobro recién abierto SOLO si el pedido sigue abierto, sin pagar y con el mismo cobro
 * anterior que vimos al empezar. Si dos solicitudes abren un cobro a la vez (doble clic en
 * «Pagar ahora»), gana una; la otra devuelve el cobro del ganador (el suyo vence solo en la
 * pasarela) y así el pedido nunca queda ligado a un cobro distinto del que ve el comprador.
 * Devuelve la dirección del cobro ganador cuando perdió la carrera, o `null` si ganó.
 */
async function claimPaymentSlot(order: PaymentOrder, charge: { providerPaymentId: string; paymentUrl: string }): Promise<string | null> {
  const claimed = await prisma.storeOrder.updateMany({
    where: { id: order.id, companyId: order.companyId, status: 'OPEN', paymentStatus: { in: ['PENDING', 'FAILED'] }, providerPaymentId: order.providerPaymentId },
    data: { providerPaymentId: charge.providerPaymentId, paymentUrl: charge.paymentUrl, paymentStatus: 'PENDING' },
  });
  if (claimed.count > 0) return null;
  const current = await prisma.storeOrder.findFirst({
    where: { id: order.id, companyId: order.companyId },
    select: { status: true, paymentStatus: true, providerPaymentId: true, paymentUrl: true },
  });
  if (current && current.status === 'OPEN' && current.paymentStatus === 'PENDING' && current.paymentUrl && current.providerPaymentId) {
    return order.paymentProvider === 'WEBPAY' ? webpayStartUrl(order.accessToken) : current.paymentUrl;
  }
  throw new StoreError('Este pedido ya no se puede pagar.', 409);
}

/**
 * El comprador vuelve a su pedido sin pagar (cerró la ventana, falló la tarjeta): se le abre un
 * cobro nuevo mientras el pedido siga abierto y con stock apartado. Si el cobro anterior sigue
 * vigente se reutiliza.
 */
export async function restartOrderPayment(accessToken: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(accessToken)) throw new StoreNotFoundError();
  const order = await prisma.storeOrder.findUnique({ where: { accessToken }, include: ORDER_FOR_PAYMENT });
  if (!order) throw new StoreNotFoundError();
  if (order.status !== 'OPEN' || order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') throw new StoreError('Este pedido ya no se puede pagar.', 409);
  if (order.paymentProvider !== 'KHIPU' && order.paymentProvider !== 'WEBPAY') throw new StoreError('Este pedido no se paga en línea.', 409);
  // Abrir un cobro nuevo exige que el sitio siga publicado y la empresa operando con el módulo (cobros ya abiertos se siguen registrando).
  const { company } = order.site;
  if (order.site.status !== 'PUBLISHED' || (company.status !== 'ACTIVE' && company.status !== 'TRIAL') || !company.features?.hasEcommerce) {
    throw new StoreError('Esta tienda no está disponible en este momento. Intenta más tarde.', 409);
  }
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) throw new StoreError('El tiempo para pagar este pedido terminó. Vuelve a la tienda y compra de nuevo.', 409);

  // Un cobro pendiente que sigue abierto se reutiliza; uno fallido se reemplaza.
  if (order.paymentStatus === 'PENDING' && order.paymentUrl && order.providerPaymentId) {
    return order.paymentProvider === 'WEBPAY' ? webpayStartUrl(order.accessToken) : order.paymentUrl;
  }
  const url = await startOrderPayment(order.id, order.companyId);
  if (!url) throw new StoreError('No pudimos abrir el pago.', 502);
  return url;
}

/**
 * Datos para mandar al comprador a Webpay: la dirección de Transbank (guardada al abrir el
 * cobro) y el token. Solo mientras el pedido siga abierto con un cobro de Webpay pendiente;
 * y solo si la dirección es de Transbank: jamás se manda al comprador a otro destino.
 */
export async function getWebpayBridge(accessToken: string): Promise<{ url: string; token: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(accessToken)) return null;
  const order = await prisma.storeOrder.findUnique({
    where: { accessToken },
    select: { status: true, paymentStatus: true, paymentProvider: true, paymentUrl: true, providerPaymentId: true, paymentExpiresAt: true },
  });
  if (!order || order.status !== 'OPEN' || order.paymentStatus !== 'PENDING' || order.paymentProvider !== 'WEBPAY') return null;
  if (!order.paymentUrl || !order.providerPaymentId || !isWebpayUrl(order.paymentUrl)) return null;
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) return null;
  return { url: order.paymentUrl, token: order.providerPaymentId };
}

// ---------------------------------------------------------------------------
// Confirmar el pago
// ---------------------------------------------------------------------------

export type SyncOutcome = 'PAID' | 'PENDING' | 'FAILED' | 'CLOSED';

interface SyncHint {
  /** El comprador acaba de volver de Webpay con este token: hay que confirmar la transacción. */
  webpayToken?: string;
}

/**
 * Consulta el cobro a la pasarela y lleva el pedido al estado que corresponda. Es el ÚNICO
 * camino automático que marca un pedido como pagado. Idempotente: notificación y regreso del
 * navegador a la vez aplican el pago una sola vez gracias al lock y al chequeo de estado.
 */
export async function syncOrderPayment(orderId: string, companyId?: string, hint: SyncHint = {}): Promise<SyncOutcome> {
  const order = await loadPaymentOrder(orderId, companyId);
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  if (order.paymentStatus === 'PAID') return 'PAID';
  // Reembolsado es definitivo: un aviso repetido de la pasarela no lo vuelve a «pagado».
  if (order.paymentStatus === 'REFUNDED') return 'CLOSED';
  if (order.status !== 'OPEN') {
    // Cerrado sin pagar: solo se mira si la pasarela cobró de todos modos (llegó tarde).
    if (order.paymentProvider !== 'KHIPU' && order.paymentProvider !== 'WEBPAY') return 'CLOSED';
  }

  let verdict: ProviderVerdict;
  let reference: string | null = null;
  let method: ErpPaymentMethod = 'TRANSFERENCIA';
  let providerLabel = '';

  try {
    if (order.paymentProvider === 'KHIPU') {
      const apiKey = khipuApiKey(order);
      if (!apiKey || !order.providerPaymentId) return await expireIfStale(order);
      const payment = await getKhipuPayment(apiKey, order.providerPaymentId);
      verdict = evaluateKhipuPayment(payment, { id: order.id, amount: order.total });
      reference = payment.payment_id;
      method = 'TRANSFERENCIA';
      providerLabel = 'Khipu';
      if (verdict.outcome === 'PENDING' && payment.status === 'pending') return await expireIfStale(order);
    } else if (order.paymentProvider === 'WEBPAY') {
      const credentials = webpayCredentials(order);
      if (!credentials || !order.providerPaymentId) return await expireIfStale(order);
      let transaction: WebpayTransaction;
      // Solo se CONFIRMA (commit) un pedido abierto; en uno cerrado se lee el resultado sin tocar la transacción.
      if (hint.webpayToken && hint.webpayToken === order.providerPaymentId && order.status === 'OPEN') {
        try {
          transaction = await commitWebpayTransaction(credentials, order.providerPaymentId);
        } catch (error) {
          // 422 = ya se confirmó antes (recarga de la página de retorno): se lee el resultado.
          if (error instanceof WebpayApiError && error.status === 422) transaction = await getWebpayTransaction(credentials, order.providerPaymentId);
          else throw error;
        }
      } else {
        transaction = await getWebpayTransaction(credentials, order.providerPaymentId);
      }
      verdict = evaluateWebpayResult(transaction, { id: order.id, amount: order.total });
      reference = transaction.authorization_code ? `Webpay · autorización ${transaction.authorization_code}` : 'Webpay';
      method = webpayPaymentMethod(transaction.payment_type_code);
      providerLabel = 'Webpay';
      if (verdict.outcome === 'PENDING') return await expireIfStale(order);
    } else {
      return order.status === 'OPEN' ? await expireIfStale(order) : 'CLOSED';
    }
  } catch (error) {
    captureException(error, { module: 'tienda-en-linea', companyId: order.companyId, extra: { orderId, provider: order.paymentProvider, reason: 'sync-payment' } });
    return 'PENDING';
  }

  switch (verdict.outcome) {
    case 'PAID':
      await markOrderPaid(order.id, order.companyId, { reference, method, source: providerLabel });
      return 'PAID';
    case 'FAILED': {
      const failed = await prisma.storeOrder.updateMany({ where: { id: order.id, companyId: order.companyId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
      // El evento queda UNA vez: recargar la página del pedido vuelve a consultar y no debe repetirlo.
      if (failed.count > 0) {
        await prisma.storeOrderEvent.create({ data: { companyId: order.companyId, orderId: order.id, type: 'PAYMENT_FAILED', message: `${providerLabel}: el pago no se completó (${verdict.reason}).` } });
      }
      return 'FAILED';
    }
    case 'MISMATCH':
      // Plata posiblemente recibida que no calza con el pedido: no se aplica a ciegas, se escala.
      captureMessage('tienda-en-linea:cobro-no-calza', 'error', { module: 'tienda-en-linea', companyId: order.companyId, extra: { orderId, provider: order.paymentProvider, reason: verdict.reason } });
      await prisma.storeOrderEvent.create({ data: { companyId: order.companyId, orderId: order.id, type: 'PAYMENT_MISMATCH', message: `${providerLabel}: el cobro no calza con el pedido (${verdict.reason}). No se aplicó.` } });
      await notifyOrderProblem(order.companyId, order.id, `${providerLabel} informa un cobro que no calza con el pedido (${verdict.reason}). Revísalo en la pasarela.`).catch(() => undefined);
      return 'PENDING';
    case 'PENDING':
      return order.status === 'OPEN' ? await expireIfStale(order) : 'CLOSED';
  }
}

/** Vence un pedido sin pagar cuya reserva terminó (con margen para pagos en línea que quedan «verificando»). */
async function expireIfStale(order: PaymentOrder): Promise<SyncOutcome> {
  if (order.status !== 'OPEN' || order.paymentStatus === 'PAID') return order.status === 'OPEN' ? 'PENDING' : 'CLOSED';
  const online = order.paymentProvider === 'KHIPU' || order.paymentProvider === 'WEBPAY';
  const limit = (order.paymentExpiresAt?.getTime() ?? 0) + (online ? EXPIRY_GRACE_MS : 0);
  if (limit > Date.now()) return 'PENDING';
  try {
    await cancelOrderInternal(order.companyId, order.id, { reason: 'No se recibió el pago a tiempo', actor: null, status: 'EXPIRED', notifyCustomer: true });
  } catch (error) {
    // Cambió justo ahora (por ejemplo, entró el pago): no se vence; la próxima consulta lo resuelve.
    if (error instanceof StoreError) return 'PENDING';
    throw error;
  }
  return 'CLOSED';
}

interface PaidInfo {
  reference: string | null;
  method: ErpPaymentMethod;
  /** Quién confirmó: la pasarela («Khipu», «Webpay») o una persona. */
  source: string;
  actor?: Actor;
  note?: string;
}

/**
 * Marca el pedido como pagado (UNA sola vez) y dispara lo que sigue: emitir la venta,
 * avisar al equipo y al comprador. Si el pedido ya estaba cerrado cuando llegó el pago
 * (venció o se canceló), el pago se registra igual pero la venta NO se emite: queda a la
 * vista, en rojo, para que alguien decida si reabrirlo o reembolsar.
 */
export async function markOrderPaid(orderId: string, companyId: string, info: PaidInfo): Promise<void> {
  const now = new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StoreOrder" WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
    const order = await tx.storeOrder.findFirst({ where: { id: orderId, companyId }, select: { id: true, status: true, paymentStatus: true } });
    if (!order || order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') return null;
    const closed = order.status !== 'OPEN';

    await tx.storeOrder.updateMany({
      where: { id: orderId, companyId, paymentStatus: { in: ['PENDING', 'FAILED'] } },
      data: {
        paymentStatus: 'PAID',
        paidAt: now,
        paymentReference: info.reference,
        paymentMethodCode: info.method,
        ...(closed ? { documentError: 'El pago llegó cuando el pedido ya estaba cerrado. Reábrelo (si hay stock) o reembolsa al comprador.' } : {}),
      },
    });
    // Un pedido pagado conserva su stock apartado hasta que se emite la venta.
    if (!closed) await holdReservations(tx, companyId, orderId);
    await tx.storeOrderEvent.create({
      data: {
        companyId,
        orderId,
        type: closed ? 'PAID_AFTER_CLOSE' : 'PAID',
        message: `${closed ? 'Pago recibido con el pedido ya cerrado' : 'Pago confirmado'} (${info.source}${info.reference ? ` · ${info.reference}` : ''}).${info.note ? ` ${info.note}` : ''}`.slice(0, 500),
        userId: info.actor?.id ?? null,
        userName: info.actor?.name ?? null,
      },
    });
    return { closed };
  }, LOCKING_TX_OPTIONS);
  if (!outcome) return;

  if (outcome.closed) {
    await notifyOrderProblem(companyId, orderId, 'Recibimos el pago de un pedido que ya estaba cerrado. Reábrelo o reembolsa al comprador.').catch(() => undefined);
    return;
  }

  await issueSaleForOrder(companyId, orderId);
  void afterPaid(companyId, orderId);
}

async function afterPaid(companyId: string, orderId: string): Promise<void> {
  try {
    const order = await prisma.storeOrder.findFirst({
      where: { id: orderId, companyId },
      select: { id: true, number: true, customerName: true, customerEmail: true, total: true, paymentProvider: true, deliveryMethod: true, items: { select: { quantity: true } }, site: { select: { name: true } } },
    });
    if (!order) return;
    await Promise.allSettled([
      notifyNewOrder(companyId, orderId, 'paid'),
      sendOrderEmail(companyId, orderId, 'paid'),
      emitWorkflowEvent(companyId, 'STORE_ORDER_PAID', {
        orderId: order.id,
        orderNumber: order.number,
        siteName: order.site.name,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        totalAmount: order.total,
        paymentProvider: order.paymentProvider ?? '',
        deliveryMethod: order.deliveryMethod,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      }),
    ]);
  } catch (error) {
    captureException(error, { module: 'tienda-en-linea', companyId, extra: { orderId, reason: 'after-paid' } });
  }
}

// ---------------------------------------------------------------------------
// Entradas: notificación de Khipu, regreso de Webpay, confirmación manual
// ---------------------------------------------------------------------------

/** Aviso de Khipu: solo se usa para ubicar el pedido; el estado real se consulta a Khipu. */
export async function handleKhipuNotification(paymentId: string): Promise<'processed' | 'unknown'> {
  const order = await prisma.storeOrder.findFirst({ where: { providerPaymentId: paymentId, paymentProvider: 'KHIPU' }, select: { id: true, companyId: true } });
  if (!order) return 'unknown';
  await syncOrderPayment(order.id, order.companyId);
  return 'processed';
}

/**
 * Regreso del comprador desde Webpay. Con `token_ws` se confirma la transacción; con
 * `TBK_TOKEN` el comprador anuló el pago en el sitio de Transbank. Devuelve la dirección de
 * su pedido, o `null` si el token no es de este sistema.
 */
export async function handleWebpayReturn(params: { tokenWs?: string | null; tbkToken?: string | null }): Promise<string | null> {
  const token = params.tokenWs || params.tbkToken;
  if (!token || token.length > 100) return null;
  const order = await prisma.storeOrder.findFirst({
    where: { providerPaymentId: token, paymentProvider: 'WEBPAY' },
    include: { site: { select: { slug: true, customDomain: true, customDomainVerifiedAt: true } } },
  });
  if (!order) return null;

  if (params.tokenWs) {
    await syncOrderPayment(order.id, order.companyId, { webpayToken: params.tokenWs });
  } else if (order.paymentStatus === 'PENDING') {
    await prisma.storeOrder.updateMany({ where: { id: order.id, companyId: order.companyId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
    await prisma.storeOrderEvent.create({ data: { companyId: order.companyId, orderId: order.id, type: 'PAYMENT_CANCELLED', message: 'El comprador anuló el pago en Webpay.' } });
  }
  return orderPageUrl(order.site, order.accessToken);
}

/** Una persona del equipo confirma un pago por transferencia o al retirar. Emite la venta con la forma de pago indicada. */
export async function confirmManualPayment(companyId: string, orderId: string, actor: Actor, method: string | null, note: string): Promise<void> {
  const order = await prisma.storeOrder.findFirst({
    where: { id: orderId, companyId },
    select: { status: true, paymentStatus: true, fulfillmentStatus: true, deliveryMethod: true, paymentProvider: true },
  });
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  const snapshot: OrderSnapshot = { status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, deliveryMethod: order.deliveryMethod, paymentProvider: order.paymentProvider };
  const allowed = canConfirmManualPayment(snapshot);
  if (!allowed.ok) throw new StoreError(allowed.reason, 409);

  const provider: StorePaymentProvider | null = order.paymentProvider;
  const erpMethod: ErpPaymentMethod = isErpPaymentMethod(method) ? method : provider === 'TRANSFER' ? 'TRANSFERENCIA' : 'EFECTIVO';
  await markOrderPaid(orderId, companyId, { reference: note || null, method: erpMethod, source: 'Confirmado por el equipo', actor });
}

/** Reintento de la emisión de la venta de un pedido ya pagado (por ejemplo, después de reponer stock). */
export async function retryIssueSale(companyId: string, orderId: string, actor: Actor): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, companyId }, select: { status: true, paymentStatus: true, salesDocumentId: true } });
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  if (order.paymentStatus !== 'PAID') throw new StoreError('El pedido todavía no está pagado.', 409);
  if (order.status !== 'OPEN') throw new StoreError('El pedido está cerrado: reábrelo antes de emitir la venta.', 409);
  if (order.salesDocumentId) return { ok: true };
  const result = await issueSaleForOrder(companyId, orderId);
  await prisma.storeOrderEvent.create({ data: { companyId, orderId, type: 'SALE_RETRY', message: `Reintento de emisión de la venta: ${result.status === 'ISSUED' ? 'listo' : 'falló'}.`, userId: actor.id, userName: actor.name } });
  return result.status === 'FAILED' ? { ok: false, error: result.error } : { ok: true };
}

/**
 * Reabre un pedido que se pagó después de cerrarse: vuelve a apartar el stock (si alcanza) y
 * emite la venta. Si el stock ya no alcanza, no hay forma de cumplir el pedido: se debe reembolsar.
 */
export async function reopenPaidOrder(companyId: string, orderId: string, actor: Actor): Promise<void> {
  const order = await prisma.storeOrder.findFirst({
    where: { id: orderId, companyId },
    include: { items: true, site: { select: { store: { select: { warehouseId: true } } } } },
  });
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  if (order.paymentStatus !== 'PAID' || order.status === 'OPEN') throw new StoreError('Solo se reabre un pedido pagado que quedó cerrado.', 409);
  const warehouseId = order.site.store?.warehouseId;
  if (!warehouseId) throw new StoreError('La tienda no tiene bodega: elige una en los ajustes.', 409);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StoreOrder" WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
      const reopened = await tx.storeOrder.updateMany({ where: { id: orderId, companyId, status: { in: ['CANCELLED', 'EXPIRED'] } }, data: { status: 'OPEN', cancelledAt: null, cancelReason: null, documentError: null } });
      if (reopened.count === 0) throw new StoreError('El pedido ya fue reabierto.', 409);
      await reserveForOrder(tx, {
        companyId,
        warehouseId,
        orderId,
        lines: order.items.map((item) => ({ productId: item.productId, name: item.name, quantity: item.quantity })),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
      await holdReservations(tx, companyId, orderId);
      await tx.storeOrderEvent.create({ data: { companyId, orderId, type: 'REOPENED', message: 'Pedido reabierto: se volvió a apartar el stock.', userId: actor.id, userName: actor.name } });
    }, LOCKING_TX_OPTIONS);
  } catch (error) {
    if (error instanceof OutOfStockError) throw new StoreError(`${error.message} No se puede cumplir el pedido: reembolsa al comprador.`, 409);
    throw error;
  }
  await issueSaleForOrder(companyId, orderId);
}

// ---------------------------------------------------------------------------
// Mantención
// ---------------------------------------------------------------------------

/**
 * Pone al día los pedidos sin pagar cuya reserva terminó: los pagados en línea se consultan
 * primero a la pasarela (el dinero pudo llegar), el resto vence y libera su stock. La
 * disponibilidad ya ignora las reservas vencidas, así que esto es orden, no corrección:
 * se corre a diario por cron y, de paso, cada vez que el equipo abre sus pedidos.
 */
export async function expireStaleOrders(companyId?: string, limit = 100): Promise<number> {
  const cutoff = new Date(Date.now() - EXPIRY_GRACE_MS);
  const stale = await prisma.storeOrder.findMany({
    where: { ...(companyId ? { companyId } : {}), status: 'OPEN', paymentStatus: { in: ['PENDING', 'FAILED'] }, paymentExpiresAt: { lt: cutoff } },
    select: { id: true, companyId: true },
    orderBy: { paymentExpiresAt: 'asc' },
    take: limit,
  });
  let closed = 0;
  for (const order of stale) {
    try {
      const outcome = await syncOrderPayment(order.id, order.companyId);
      if (outcome === 'CLOSED') closed += 1;
    } catch (error) {
      captureException(error, { module: 'tienda-en-linea', companyId: order.companyId, extra: { orderId: order.id, reason: 'expire-stale' } });
    }
  }
  return closed;
}

