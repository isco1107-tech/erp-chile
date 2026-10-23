import type { StoreDeliveryMethod, StoreFulfillmentStatus, StoreOrderStatus, StorePaymentProvider, StorePaymentStatus } from '@prisma/client';

/**
 * Ciclo de vida de un pedido. Pago y entrega van separados, como en las tiendas
 * conocidas: un pedido puede estar pagado y sin despachar. Estas reglas son puras;
 * el servidor las vuelve a aplicar al escribir (el navegador solo decide qué
 * botones mostrar).
 */

export interface OrderSnapshot {
  status: StoreOrderStatus;
  paymentStatus: StorePaymentStatus;
  fulfillmentStatus: StoreFulfillmentStatus;
  deliveryMethod: StoreDeliveryMethod;
  paymentProvider: StorePaymentProvider | null;
}

export const ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  OPEN: 'Abierto',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido',
};

export const PAYMENT_STATUS_LABELS: Record<StorePaymentStatus, string> = {
  PENDING: 'Pago pendiente',
  PAID: 'Pagado',
  FAILED: 'Pago fallido',
  REFUNDED: 'Reembolsado',
};

export const FULFILLMENT_STATUS_LABELS: Record<StoreFulfillmentStatus, string> = {
  UNFULFILLED: 'Sin preparar',
  PREPARING: 'Preparando',
  READY_FOR_PICKUP: 'Listo para retirar',
  SHIPPED: 'Despachado',
  DELIVERED: 'Entregado',
};

export type FulfillmentAction = 'PREPARE' | 'READY_FOR_PICKUP' | 'SHIP' | 'DELIVER';

const TARGET: Record<FulfillmentAction, StoreFulfillmentStatus> = {
  PREPARE: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  SHIP: 'SHIPPED',
  DELIVER: 'DELIVERED',
};

/** Desde qué estados de entrega se puede aplicar cada acción (solo hacia adelante). */
const FROM: Record<FulfillmentAction, StoreFulfillmentStatus[]> = {
  PREPARE: ['UNFULFILLED'],
  READY_FOR_PICKUP: ['UNFULFILLED', 'PREPARING'],
  SHIP: ['UNFULFILLED', 'PREPARING'],
  DELIVER: ['SHIPPED', 'READY_FOR_PICKUP'],
};

export const FULFILLMENT_ACTION_LABELS: Record<FulfillmentAction, string> = {
  PREPARE: 'Empezar a preparar',
  READY_FOR_PICKUP: 'Marcar listo para retirar',
  SHIP: 'Marcar despachado',
  DELIVER: 'Marcar entregado',
};

export function fulfillmentTarget(action: FulfillmentAction): StoreFulfillmentStatus {
  return TARGET[action];
}

/** Un pedido que se paga al retirar puede prepararse antes de cobrar; todo lo demás exige pago confirmado. */
function paymentAllowsAction(order: OrderSnapshot, action: FulfillmentAction): boolean {
  if (order.paymentStatus === 'PAID') return true;
  return order.paymentProvider === 'PAY_ON_PICKUP' && order.deliveryMethod === 'PICKUP' && action !== 'DELIVER' && action !== 'SHIP';
}

export function canApplyFulfillment(order: OrderSnapshot, action: FulfillmentAction): { ok: true } | { ok: false; reason: string } {
  if (order.status !== 'OPEN') return { ok: false, reason: 'El pedido está cerrado: ya no se puede avanzar.' };
  if (action === 'READY_FOR_PICKUP' && order.deliveryMethod !== 'PICKUP') return { ok: false, reason: 'Este pedido es con despacho, no con retiro.' };
  if (action === 'SHIP' && order.deliveryMethod !== 'SHIPPING') return { ok: false, reason: 'Este pedido es con retiro, no con despacho.' };
  if (!paymentAllowsAction(order, action)) {
    return { ok: false, reason: order.paymentStatus === 'PENDING' ? 'Primero confirma el pago del pedido.' : 'El pago del pedido no está confirmado.' };
  }
  if (!FROM[action].includes(order.fulfillmentStatus)) return { ok: false, reason: `El pedido ya está «${FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus]}».` };
  return { ok: true };
}

/** Acciones de entrega que el equipo puede aplicar hoy a un pedido (para mostrar los botones). */
export function availableFulfillmentActions(order: OrderSnapshot): FulfillmentAction[] {
  return (Object.keys(TARGET) as FulfillmentAction[]).filter((action) => canApplyFulfillment(order, action).ok);
}

/** Se puede cancelar mientras no esté entregado ni cerrado. Un pedido pagado exige permiso de administración. */
export function canCancel(order: OrderSnapshot): { ok: true; needsManage: boolean } | { ok: false; reason: string } {
  if (order.status !== 'OPEN') return { ok: false, reason: 'El pedido ya está cerrado.' };
  if (order.fulfillmentStatus === 'DELIVERED') return { ok: false, reason: 'El pedido ya fue entregado: para devolver, emite una nota de crédito.' };
  return { ok: true, needsManage: order.paymentStatus === 'PAID' };
}

/** El equipo confirma a mano un pago por transferencia o contra retiro. */
export function canConfirmManualPayment(order: OrderSnapshot): { ok: true } | { ok: false; reason: string } {
  if (order.status !== 'OPEN') return { ok: false, reason: 'El pedido está cerrado.' };
  if (order.paymentStatus === 'PAID') return { ok: false, reason: 'El pedido ya está pagado.' };
  if (order.paymentProvider !== 'TRANSFER' && order.paymentProvider !== 'PAY_ON_PICKUP') {
    return { ok: false, reason: 'Este pedido se paga en línea: el pago se confirma solo, consultando a la pasarela.' };
  }
  return { ok: true };
}

export interface TimelineStep {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
}

/** Pasos que ve el comprador en su página de seguimiento. */
export function buildTimeline(order: OrderSnapshot): TimelineStep[] {
  const paid = order.paymentStatus === 'PAID';
  const steps: Array<Omit<TimelineStep, 'current'>> = [
    { key: 'received', label: 'Pedido recibido', done: true },
    // Quien paga al retirar no tiene un paso de pago antes de recibir su pedido.
    ...(order.paymentProvider === 'PAY_ON_PICKUP' ? [] : [{ key: 'paid', label: paid ? 'Pago confirmado' : 'Pago pendiente', done: paid }]),
    { key: 'preparing', label: 'Preparando tu pedido', done: order.fulfillmentStatus !== 'UNFULFILLED' },
    order.deliveryMethod === 'PICKUP'
      ? { key: 'ready', label: 'Listo para retirar', done: order.fulfillmentStatus === 'READY_FOR_PICKUP' || order.fulfillmentStatus === 'DELIVERED' }
      : { key: 'shipped', label: 'En camino', done: order.fulfillmentStatus === 'SHIPPED' || order.fulfillmentStatus === 'DELIVERED' },
    { key: 'delivered', label: order.deliveryMethod === 'PICKUP' ? 'Retirado' : 'Entregado', done: order.fulfillmentStatus === 'DELIVERED' },
  ];
  const firstPending = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, current: index === firstPending }));
}
