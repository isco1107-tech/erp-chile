import 'server-only';

import type { StoreFulfillmentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { captureException } from '@/lib/observability';
import {
  FULFILLMENT_ACTION_LABELS,
  canApplyFulfillment,
  canCancel,
  fulfillmentTarget,
  type FulfillmentAction,
  type OrderSnapshot,
} from '@/lib/ecommerce/order-state';
import { safeHref } from '@/lib/web-sites/urls';
import { cancelSalesDocument } from '@/modules/sales/services/sales.service';
import { StoreError, StoreNotFoundError } from '../errors';
import type { FulfillmentInput } from '../schema';
import { sendOrderEmail } from './store-notifications.service';
import { closeReservations } from './store-stock.service';

/**
 * Entrega y cierre de pedidos. Cada cambio se aplica con un `updateMany` condicionado al
 * estado de origen: un doble clic o dos personas a la vez no avanzan el pedido dos veces
 * ni lo pisan. Todo queda en el historial del pedido.
 */

export interface Actor {
  id: string;
  name: string;
}

function snapshotOf(order: { status: OrderSnapshot['status']; paymentStatus: OrderSnapshot['paymentStatus']; fulfillmentStatus: StoreFulfillmentStatus; deliveryMethod: OrderSnapshot['deliveryMethod']; paymentProvider: OrderSnapshot['paymentProvider'] }): OrderSnapshot {
  return { status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, deliveryMethod: order.deliveryMethod, paymentProvider: order.paymentProvider };
}

/** De qué estados de entrega parte cada acción (el servidor lo vuelve a aplicar en el `updateMany`). */
const FROM_STATUSES: Record<FulfillmentAction, StoreFulfillmentStatus[]> = {
  PREPARE: ['UNFULFILLED'],
  READY_FOR_PICKUP: ['UNFULFILLED', 'PREPARING'],
  SHIP: ['UNFULFILLED', 'PREPARING'],
  DELIVER: ['SHIPPED', 'READY_FOR_PICKUP'],
};

export async function applyFulfillment(companyId: string, orderId: string, input: FulfillmentInput, actor: Actor): Promise<void> {
  const order = await prisma.storeOrder.findFirst({
    where: { id: orderId, companyId },
    select: { id: true, status: true, paymentStatus: true, fulfillmentStatus: true, deliveryMethod: true, paymentProvider: true },
  });
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  const allowed = canApplyFulfillment(snapshotOf(order), input.action);
  if (!allowed.ok) throw new StoreError(allowed.reason, 409);

  const trackingUrl = input.trackingUrl ? safeHref(input.trackingUrl) : null;
  if (input.trackingUrl && (!trackingUrl || !/^https?:\/\//i.test(trackingUrl))) {
    throw new StoreError('El enlace de seguimiento debe empezar con https://', 400, 'trackingUrl');
  }

  const target = fulfillmentTarget(input.action);
  const now = new Date();
  const shipping = input.action === 'SHIP';
  const result = await prisma.storeOrder.updateMany({
    where: { id: orderId, companyId, status: 'OPEN', fulfillmentStatus: { in: FROM_STATUSES[input.action] } },
    data: {
      fulfillmentStatus: target,
      ...(shipping ? { shippedAt: now, carrier: input.carrier || null, trackingNumber: input.trackingNumber || null, trackingUrl } : {}),
      ...(input.action === 'DELIVER' ? { deliveredAt: now } : {}),
    },
  });
  if (result.count === 0) throw new StoreError('El pedido cambió mientras lo editabas. Recarga y vuelve a intentarlo.', 409);

  const detail = shipping && (input.carrier || input.trackingNumber) ? ` (${[input.carrier, input.trackingNumber].filter(Boolean).join(' · ')})` : '';
  await prisma.storeOrderEvent.create({
    data: { companyId, orderId, type: input.action, message: `${FULFILLMENT_ACTION_LABELS[input.action]}${detail}.`, userId: actor.id, userName: actor.name },
  });

  if (input.action === 'SHIP' || input.action === 'READY_FOR_PICKUP') {
    void sendOrderEmail(companyId, orderId, input.action === 'SHIP' ? 'shipped' : 'ready').catch((error: unknown) =>
      captureException(error, { module: 'tienda-en-linea', companyId, extra: { orderId, reason: 'fulfillment-email', action: input.action } })
    );
  }
}

interface CloseOptions {
  reason: string;
  /** Quien lo cerró; `null` = el sistema. */
  actor: Actor | null;
  status: 'CANCELLED' | 'EXPIRED';
  /** El dinero ya se devolvió por fuera: el pedido queda «Reembolsado». */
  refunded?: boolean;
  refundNote?: string;
  /** Avisar al comprador por correo. */
  notifyCustomer?: boolean;
}

/**
 * Cierra un pedido abierto (cancelado o vencido): libera el stock apartado y, si ya había
 * una venta emitida, la anula en el ERP (devuelve el stock y revierte el asiento y el cobro).
 * Si la venta no se puede anular (p. ej. ya fue al SII) se avisa y el pedido NO se cierra.
 */
export async function cancelOrderInternal(companyId: string, orderId: string, options: CloseOptions): Promise<void> {
  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, companyId }, select: { id: true, status: true, salesDocumentId: true, paymentStatus: true } });
  if (!order || order.status !== 'OPEN') return;

  if (order.salesDocumentId) {
    try {
      await cancelSalesDocument(companyId, order.salesDocumentId, `Tienda en línea: ${options.reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo anular la venta';
      // Ya anulada por otra vía (Ventas): se sigue. Cualquier otra causa frena el cierre.
      if (!/Solo se pueden anular documentos emitidos/i.test(message)) {
        throw new StoreError(`No se pudo anular la venta del ERP: ${message}`, 409);
      }
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StoreOrder" WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
    const closed = await tx.storeOrder.updateMany({
      where: { id: orderId, companyId, status: 'OPEN' },
      data: {
        status: options.status,
        cancelledAt: now,
        cancelReason: options.reason.slice(0, 300),
        ...(options.refunded && order.paymentStatus === 'PAID' ? { paymentStatus: 'REFUNDED' as const } : {}),
        // Una venta anulada ya no está enlazada a un documento vigente.
        ...(order.salesDocumentId ? { documentError: null } : {}),
      },
    });
    if (closed.count === 0) return;
    await closeReservations(tx, companyId, orderId, 'RELEASED');
    await tx.storeOrderEvent.create({
      data: {
        companyId,
        orderId,
        type: options.status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED',
        message: `${options.status === 'EXPIRED' ? 'Pedido vencido' : 'Pedido cancelado'}: ${options.reason}.${options.refunded ? ` Reembolso registrado${options.refundNote ? `: ${options.refundNote}` : ''}.` : ''}`.slice(0, 500),
        userId: options.actor?.id ?? null,
        userName: options.actor?.name ?? null,
      },
    });
  }, LOCKING_TX_OPTIONS);

  if (options.notifyCustomer) {
    void sendOrderEmail(companyId, orderId, options.status === 'EXPIRED' ? 'expired' : 'cancelled').catch((error: unknown) =>
      captureException(error, { module: 'tienda-en-linea', companyId, extra: { orderId, reason: 'close-email' } })
    );
  }
}

/** El equipo cancela un pedido. Si ya está pagado exige `canManage` (devolver plata es de administración). */
export async function cancelOrder(companyId: string, orderId: string, input: { reason: string; refunded: boolean; refundNote: string }, actor: Actor, canManage: boolean): Promise<void> {
  const order = await prisma.storeOrder.findFirst({
    where: { id: orderId, companyId },
    select: { status: true, paymentStatus: true, fulfillmentStatus: true, deliveryMethod: true, paymentProvider: true },
  });
  if (!order) throw new StoreNotFoundError('Pedido no encontrado');
  const allowed = canCancel(snapshotOf(order));
  if (!allowed.ok) throw new StoreError(allowed.reason, 409);
  if (allowed.needsManage && !canManage) throw new StoreError('Cancelar un pedido ya pagado lo hace un administrador de la tienda.', 403);

  await cancelOrderInternal(companyId, orderId, { reason: input.reason, actor, status: 'CANCELLED', refunded: input.refunded, refundNote: input.refundNote, notifyCustomer: true });
}

/** Registra que el dinero de un pedido cancelado ya se devolvió por fuera (pasarela o banco). */
export async function markRefunded(companyId: string, orderId: string, note: string, actor: Actor): Promise<void> {
  const result = await prisma.storeOrder.updateMany({ where: { id: orderId, companyId, paymentStatus: 'PAID', status: { in: ['CANCELLED', 'EXPIRED'] } }, data: { paymentStatus: 'REFUNDED' } });
  if (result.count === 0) throw new StoreError('Solo se registra el reembolso de un pedido pagado que ya está cancelado.', 409);
  await prisma.storeOrderEvent.create({ data: { companyId, orderId, type: 'REFUNDED', message: `Reembolso registrado${note ? `: ${note}` : ''}.`, userId: actor.id, userName: actor.name } });
}
