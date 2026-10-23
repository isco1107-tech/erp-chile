import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError, toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { priceOrder } from '@/lib/ecommerce/pricing';
import { createSalesDocument } from '@/modules/sales/services/sales.service';
import { getOrCreateGenericCustomer } from '@/modules/pos/services/pos.service';
import type { SalesDocumentCreateInput } from '@/modules/sales/schema';
import { StoreError } from '../errors';
import { notifyOrderProblem } from './store-notifications.service';
import { closeReservations } from './store-stock.service';

/**
 * Convierte un pedido pagado en la VENTA del ERP. Es el mismo camino de Ventas y POS
 * (`createSalesDocument`): descuenta el kardex al PMP, postea el asiento, deja el cobro en
 * Tesorería y dispara `SALE_ISSUED`. La clave de idempotencia es el pedido: reintentar
 * jamás duplica la venta.
 *
 * Si la venta no se puede emitir (típico: alguien vendió ese stock por otro canal entre
 * el pedido y el pago), el pago queda registrado igual, el pedido muestra el motivo y se
 * avisa por campanita. La plata recibida nunca se pierde en silencio.
 */

export type ErpPaymentMethod = SalesDocumentCreateInput['paymentMethod'];

export const ERP_PAYMENT_METHODS_FOR_STORE: readonly ErpPaymentMethod[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO'];

export function isErpPaymentMethod(value: string | null | undefined): value is ErpPaymentMethod {
  return ERP_PAYMENT_METHODS_FOR_STORE.includes(value as ErpPaymentMethod);
}

/** Valor por omisión de la forma de pago del ERP según el medio con que pagó el comprador. */
export function defaultErpPaymentMethod(provider: string | null): ErpPaymentMethod {
  switch (provider) {
    case 'KHIPU':
    case 'TRANSFER':
      return 'TRANSFERENCIA';
    case 'WEBPAY':
      return 'TARJETA_CREDITO';
    default:
      return 'EFECTIVO';
  }
}

interface BillingData {
  rut: string;
  razonSocial: string;
  giro: string;
  address: string;
  comuna: string;
}

function readBilling(raw: Prisma.JsonValue | null): BillingData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { rut, razonSocial, giro, address, comuna } = raw as Record<string, unknown>;
  if (typeof rut !== 'string' || typeof razonSocial !== 'string') return null;
  return { rut, razonSocial, giro: typeof giro === 'string' ? giro : '', address: typeof address === 'string' ? address : '', comuna: typeof comuna === 'string' ? comuna : '' };
}

/** Receptor de la venta: la empresa que pidió factura, el comprador identificado por RUT, o el consumidor final. */
async function resolveCustomer(
  companyId: string,
  order: { documentType: 'BOLETA' | 'FACTURA'; customerName: string; customerEmail: string; customerPhone: string; customerRut: string | null; billing: Prisma.JsonValue | null }
): Promise<string> {
  const billing = order.documentType === 'FACTURA' ? readBilling(order.billing) : null;
  if (order.documentType === 'FACTURA' && !billing) throw new StoreError('El pedido pide factura pero no trae los datos de la empresa.');

  const rut = billing?.rut ?? order.customerRut;
  if (!rut) return getOrCreateGenericCustomer(prisma, companyId);

  const rutClean = cleanRut(rut);
  const existing = await prisma.contact.findFirst({ where: { companyId, rutClean }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await prisma.contact.create({
      data: {
        companyId,
        rut: formatRut(rutClean),
        rutClean,
        razonSocial: billing?.razonSocial ?? order.customerName,
        giro: billing?.giro || null,
        address: billing?.address || null,
        comuna: billing?.comuna || null,
        email: order.customerEmail,
        phone: order.customerPhone,
        isCustomer: true,
        isSupplier: false,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    // Dos pedidos del mismo comprador cobrándose a la vez: gana el primero.
    if (isUniqueConstraintError(error)) {
      const again = await prisma.contact.findFirst({ where: { companyId, rutClean }, select: { id: true } });
      if (again) return again.id;
    }
    throw error;
  }
}

export interface IssueSaleResult {
  status: 'ISSUED' | 'ALREADY_ISSUED' | 'FAILED' | 'NOT_PAID';
  salesDocumentId?: string;
  error?: string;
}

/**
 * Emite la venta de un pedido pagado. Idempotente: si ya hay venta, no hace nada. Nunca
 * lanza por un problema de negocio: lo deja en `documentError` y avisa.
 */
export async function issueSaleForOrder(companyId: string, orderId: string): Promise<IssueSaleResult> {
  const order = await prisma.storeOrder.findFirst({
    where: { id: orderId, companyId },
    include: { items: true, reservations: { select: { warehouseId: true }, take: 1 }, site: { select: { name: true, store: { select: { warehouseId: true } } } } },
  });
  if (!order) throw new StoreError('Pedido no encontrado', 404);
  if (order.salesDocumentId) return { status: 'ALREADY_ISSUED', salesDocumentId: order.salesDocumentId };
  if (order.paymentStatus !== 'PAID') return { status: 'NOT_PAID' };

  try {
    const warehouseId = order.reservations[0]?.warehouseId ?? order.site.store?.warehouseId;
    if (!warehouseId) throw new StoreError('La tienda no tiene bodega: elige una en los ajustes y reintenta.');

    // Se recalcula con los valores guardados y debe dar EXACTAMENTE lo que se cobró.
    const pricing = priceOrder(
      order.items.map((item) => ({ productId: item.productId, sku: item.sku, name: item.name, imageUrl: item.imageUrl, unit: item.unit, isExempt: item.isExempt, netUnit: item.netUnit, quantity: item.quantity })),
      order.shippingTotal
    );
    if (pricing.total !== order.total) throw new StoreError(`El total del pedido (${order.total}) no calza con el de la venta (${pricing.total}).`);

    const contactId = await resolveCustomer(companyId, order);
    const allExempt = pricing.netAmount === 0 && pricing.exemptAmount > 0;
    const dteType = order.documentType === 'FACTURA' ? (allExempt ? 'FACTURA_EXENTA_34' : 'FACTURA_33') : allExempt ? 'BOLETA_EXENTA_41' : 'BOLETA_39';

    const document = await createSalesDocument(
      companyId,
      {
        contactId,
        warehouseId,
        dteType,
        paymentMethod: isErpPaymentMethod(order.paymentMethodCode) ? order.paymentMethodCode : defaultErpPaymentMethod(order.paymentProvider),
        notes: `Tienda en línea · ${order.site.name} · Pedido #${order.number}`,
        idempotencyKey: `store-order:${order.id}`,
        items: [
          ...order.items.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            description: item.name,
            quantity: item.quantity,
            unitPrice: item.netUnit,
            isExempt: item.isExempt,
          })),
          ...(pricing.shippingNet > 0 ? [{ description: `Despacho${order.shippingRateName ? ` — ${order.shippingRateName}` : ''}`, quantity: 1, unitPrice: pricing.shippingNet, isExempt: false }] : []),
        ],
      },
      'ISSUED'
    );

    if (document.totalAmount !== order.total) {
      // No debería pasar (mismo cálculo), pero si pasara no se deja pasar en silencio.
      captureException(new Error('El total de la venta no calza con el del pedido'), { module: 'tienda-en-linea', companyId, extra: { orderId, documentTotal: document.totalAmount, orderTotal: order.total } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.storeOrder.updateMany({ where: { id: orderId, companyId, salesDocumentId: null }, data: { salesDocumentId: document.id, documentError: null } });
      await closeReservations(tx, companyId, orderId, 'CONSUMED');
      await tx.storeOrderEvent.create({
        data: { companyId, orderId, type: 'SALE_ISSUED', message: `Venta emitida en el ERP (${dteType === 'FACTURA_33' || dteType === 'FACTURA_EXENTA_34' ? 'factura' : 'boleta'} ${document.folio ? `N° ${document.folio}` : 'sin folio'}). El stock ya se descontó.` },
      });
    });
    return { status: 'ISSUED', salesDocumentId: document.id };
  } catch (error) {
    // Lo que se guarda en el pedido lo lee el equipo: un mensaje de negocio pasa tal cual; un error de base de datos se traduce (el detalle técnico va a observabilidad).
    const friendly = error instanceof StoreError ? error.message : `No se pudo emitir la venta en el ERP: ${toFriendlyErrorMessage(error)}`;
    if (!(error instanceof StoreError)) captureException(error, { module: 'tienda-en-linea', companyId, extra: { orderId, reason: 'issue-sale' } });
    await prisma.storeOrder.updateMany({ where: { id: orderId, companyId, salesDocumentId: null }, data: { documentError: friendly.slice(0, 500) } });
    await prisma.storeOrderEvent.create({ data: { companyId, orderId, type: 'SALE_FAILED', message: friendly.slice(0, 500) } }).catch(() => undefined);
    await notifyOrderProblem(companyId, orderId, `Cobramos el pedido pero no se pudo emitir la venta: ${friendly}`).catch((notifyError: unknown) =>
      captureException(notifyError, { module: 'tienda-en-linea', companyId, extra: { orderId, reason: 'sale-failed-notification' } })
    );
    return { status: 'FAILED', error: friendly };
  }
}
