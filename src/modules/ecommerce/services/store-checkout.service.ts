import 'server-only';

import crypto from 'crypto';
import type { Prisma, StoreDeliveryMethod, StorePaymentProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { calculateGrossPrice } from '@/lib/chile/tax';
import type { CheckoutInput } from '@/lib/ecommerce/checkout';
import { holdMinutes } from '@/lib/ecommerce/payment';
import { priceOrder } from '@/lib/ecommerce/pricing';
import { ratesForRegion, shippingPrice } from '@/lib/ecommerce/shipping';
import { OutOfStockError, StoreError } from '../errors';
import { notifyNewOrder, sendOrderReceivedEmail } from './store-notifications.service';
import { startOrderPayment } from './store-payment.service';
import type { PublicStoreContext } from './store-public.service';
import { cancelOrderInternal } from './store-fulfillment.service';
import { reserveForOrder } from './store-stock.service';

/**
 * Crea el pedido de un comprador. Todo lo que importa se resuelve acá, en el servidor,
 * con datos reales: precios del catálogo, stock de la bodega, tarifas de despacho y
 * medios de pago de la tienda. Del navegador solo se toman productos, cantidades y
 * datos de contacto.
 *
 * Orden de las cosas:
 *  1. se valida y se valoriza (sin tocar la base);
 *  2. UNA transacción numera el pedido, lo guarda y aparta el stock con el lock de las
 *     filas de stock (si no alcanza, no queda nada);
 *  3. recién después se abre el cobro en la pasarela (I/O externo): si falla, el pedido
 *     se cancela y el stock se libera, así nunca queda stock apartado sin forma de pagar.
 */

export interface CreatedOrder {
  orderId: string;
  number: number;
  accessToken: string;
  paymentProvider: StorePaymentProvider;
  /** Si el comprador debe ir a la pasarela, su dirección; si no, a la página del pedido. */
  redirectUrl: string | null;
  /** El mismo intento ya había creado este pedido (reintento): no se duplicó. */
  replayed: boolean;
}

function lineSignature(lines: ReadonlyArray<{ productId: string; quantity: number }>): string {
  return [...lines]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((line) => `${line.productId}:${line.quantity}`)
    .join('|');
}

async function existingOrder(ctx: PublicStoreContext, input: CheckoutInput): Promise<CreatedOrder | null> {
  const found = await prisma.storeOrder.findFirst({
    where: { siteId: ctx.siteId, companyId: ctx.companyId, idempotencyKey: input.idempotencyKey },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!found) return null;
  if (lineSignature(found.items) !== lineSignature(input.lines)) {
    throw new StoreError('Tu carrito cambió desde el último intento. Actualiza la página y vuelve a pagar.', 409);
  }
  const pending = found.status === 'OPEN' && found.paymentStatus === 'PENDING' && found.paymentProvider;
  return {
    orderId: found.id,
    number: found.number,
    accessToken: found.accessToken,
    paymentProvider: found.paymentProvider ?? input.paymentProvider,
    redirectUrl: pending && found.paymentUrl ? found.paymentUrl : null,
    replayed: true,
  };
}

export async function createStoreOrder(ctx: PublicStoreContext, input: CheckoutInput): Promise<CreatedOrder> {
  const previous = await existingOrder(ctx, input);
  if (previous) return previous;

  const { settings } = ctx;

  // ── Medio de pago y forma de entrega ─────────────────────────────────────
  if (!settings.paymentProviders.includes(input.paymentProvider)) throw new StoreError('Ese medio de pago no está disponible. Elige otro.', 400, 'paymentProvider');
  const delivery: StoreDeliveryMethod = input.deliveryMethod;
  if (input.paymentProvider === 'PAY_ON_PICKUP' && delivery !== 'PICKUP') throw new StoreError('«Pagar al retirar» solo sirve si retiras tu pedido.', 400, 'paymentProvider');
  if (delivery === 'PICKUP' && !settings.pickupEnabled) throw new StoreError('Esta tienda no ofrece retiro.', 400, 'deliveryMethod');
  if (delivery === 'SHIPPING' && !settings.shippingEnabled) throw new StoreError('Esta tienda no ofrece despacho.', 400, 'deliveryMethod');
  if (input.documentType === 'FACTURA' && !settings.invoiceEnabled) throw new StoreError('Esta tienda no emite facturas por internet.', 400, 'documentType');

  // ── Productos: solo publicados, activos y de ESTA tienda ─────────────────
  const ids = input.lines.map((line) => line.productId);
  const listings = await prisma.storeProduct.findMany({
    where: { companyId: ctx.companyId, siteId: ctx.siteId, published: true, productId: { in: ids }, product: { isActive: true } },
    include: { product: { select: { id: true, sku: true, name: true, unit: true, imageUrl: true, netPrice: true, isExempt: true } } },
  });
  const byProduct = new Map(listings.map((listing) => [listing.productId, listing]));
  for (const line of input.lines) {
    const listing = byProduct.get(line.productId);
    if (!listing) throw new StoreError('Un producto de tu carrito ya no está a la venta. Actualiza tu carrito.', 409);
    if (listing.maxPerOrder && line.quantity > listing.maxPerOrder) {
      throw new StoreError(`De «${listing.title?.trim() || listing.product.name}» puedes llevar hasta ${listing.maxPerOrder} por pedido.`, 400);
    }
  }

  const pricedInput = input.lines.map((line) => {
    const listing = byProduct.get(line.productId)!;
    return {
      productId: listing.productId,
      sku: listing.product.sku,
      name: listing.title?.trim() || listing.product.name,
      imageUrl: listing.product.imageUrl,
      unit: listing.product.unit,
      isExempt: listing.product.isExempt,
      netUnit: listing.product.netPrice,
      quantity: line.quantity,
    };
  });
  const productsSubtotal = pricedInput.reduce((sum, line) => sum + calculateGrossPrice(line.netUnit, line.isExempt) * line.quantity, 0);
  if (settings.minOrderAmount > 0 && productsSubtotal < settings.minOrderAmount) {
    throw new StoreError(`La compra mínima es de $${settings.minOrderAmount.toLocaleString('es-CL')}.`, 400);
  }

  // ── Despacho: la tarifa y su precio salen de la configuración, nunca del navegador ──
  let shippingGross = 0;
  let rateId: string | null = null;
  let rateName: string | null = null;
  if (delivery === 'SHIPPING') {
    const region = input.address!.region;
    const rate = ratesForRegion(settings.shippingRates, region).find((candidate) => candidate.id === input.shippingRateId);
    if (!rate) throw new StoreError('Esa forma de despacho no llega a tu región. Elige otra.', 400, 'shippingRateId');
    shippingGross = shippingPrice(rate, productsSubtotal);
    rateId = rate.id;
    rateName = rate.name;
  }
  const pricing = priceOrder(pricedInput, shippingGross);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + holdMinutes(input.paymentProvider, settings.transferHoldHours) * 60_000);
  const accessToken = crypto.randomBytes(32).toString('hex');
  const customerRut = input.customer.rut ? formatRut(cleanRut(input.customer.rut)) : null;

  // ── Pedido + reserva de stock, atómicos ──────────────────────────────────
  let created: { id: string; number: number };
  try {
    created = await prisma.$transaction(async (tx) => {
      const counter = await tx.$queryRaw<Array<{ orderCounter: number }>>`UPDATE "WebSiteStore" SET "orderCounter" = "orderCounter" + 1 WHERE "siteId" = ${ctx.siteId} AND "companyId" = ${ctx.companyId} RETURNING "orderCounter"`;
      const number = counter[0]?.orderCounter;
      if (!number) throw new StoreError('La tienda no está disponible en este momento.', 503);

      const order = await tx.storeOrder.create({
        data: {
          companyId: ctx.companyId,
          siteId: ctx.siteId,
          number,
          accessToken,
          idempotencyKey: input.idempotencyKey,
          customerName: input.customer.name,
          customerEmail: input.customer.email,
          customerPhone: input.customer.phone,
          customerRut,
          documentType: input.documentType,
          billing: input.documentType === 'FACTURA' && input.billing ? (input.billing as unknown as Prisma.InputJsonValue) : undefined,
          deliveryMethod: delivery,
          shippingAddress: delivery === 'SHIPPING' ? (input.address as unknown as Prisma.InputJsonValue) : undefined,
          shippingRateId: rateId,
          shippingRateName: rateName,
          customerNotes: input.notes || null,
          subtotal: pricing.subtotal,
          shippingTotal: pricing.shippingTotal,
          total: pricing.total,
          netAmount: pricing.netAmount,
          exemptAmount: pricing.exemptAmount,
          ivaAmount: pricing.ivaAmount,
          paymentProvider: input.paymentProvider,
          paymentExpiresAt: expiresAt,
          items: {
            create: pricing.lines.map((line) => ({
              companyId: ctx.companyId,
              productId: line.productId,
              sku: line.sku,
              name: line.name,
              imageUrl: line.imageUrl,
              unit: line.unit,
              quantity: line.quantity,
              netUnit: line.netUnit,
              grossUnit: line.grossUnit,
              isExempt: line.isExempt,
              subtotal: line.subtotal,
              iva: line.iva,
              total: line.total,
            })),
          },
          events: { create: { companyId: ctx.companyId, type: 'CREATED', message: `Pedido recibido. Medio de pago: ${input.paymentProvider}.` } },
        },
        select: { id: true, number: true },
      });

      await reserveForOrder(tx, {
        companyId: ctx.companyId,
        warehouseId: ctx.warehouseId,
        orderId: order.id,
        lines: pricing.lines.map((line) => ({ productId: line.productId, name: line.name, quantity: line.quantity })),
        expiresAt,
        now,
      });
      return order;
    }, LOCKING_TX_OPTIONS);
  } catch (error) {
    if (error instanceof OutOfStockError || error instanceof StoreError) throw error;
    // Dos envíos simultáneos del mismo intento: el segundo choca con la clave única y se queda con el pedido del primero.
    if (isUniqueConstraintError(error)) {
      const again = await existingOrder(ctx, input);
      if (again) return again;
    }
    throw error;
  }

  // ── Cobro en la pasarela (solo medios en línea) ──────────────────────────
  let redirectUrl: string | null = null;
  try {
    redirectUrl = await startOrderPayment(created.id, ctx.companyId);
  } catch (error) {
    // Sin cobro abierto el pedido no puede recibir plata: se cancela y el stock vuelve.
    await cancelOrderInternal(ctx.companyId, created.id, { reason: 'No se pudo abrir el cobro en la pasarela', actor: null, status: 'CANCELLED' }).catch((cancelError: unknown) =>
      captureException(cancelError, { module: 'tienda-en-linea', companyId: ctx.companyId, extra: { orderId: created.id, reason: 'cancel-after-gateway-failure' } })
    );
    if (error instanceof StoreError) throw error;
    captureException(error, { module: 'tienda-en-linea', companyId: ctx.companyId, extra: { orderId: created.id, reason: 'start-payment' } });
    throw new StoreError('No pudimos conectar con el medio de pago. Intenta de nuevo en unos minutos o elige otro.', 502);
  }

  // Avisos: fuera de la transacción y sin poder frenar la compra.
  void sendOrderReceivedEmail(ctx.companyId, created.id).catch((error: unknown) =>
    captureException(error, { module: 'tienda-en-linea', companyId: ctx.companyId, extra: { orderId: created.id, reason: 'received-email' } })
  );
  if (!(input.paymentProvider === 'KHIPU' || input.paymentProvider === 'WEBPAY')) {
    void notifyNewOrder(ctx.companyId, created.id, 'pending').catch((error: unknown) =>
      captureException(error, { module: 'tienda-en-linea', companyId: ctx.companyId, extra: { orderId: created.id, reason: 'new-order-notification' } })
    );
  }

  return { orderId: created.id, number: created.number, accessToken, paymentProvider: input.paymentProvider, redirectUrl, replayed: false };
}
