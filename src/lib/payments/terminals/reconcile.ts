import type { TerminalPayment } from './types';

/**
 * Decisión pura: ¿este pago de terminal paga esta venta/orden?
 *
 * Misma disciplina que `evaluateKhipuPayment` (payment-plans): el aviso solo
 * propone; únicamente un pago APPROVED con monto EXACTO y misma moneda puede
 * marcar algo como pagado, y todo lo dudoso se escala a una persona en vez de
 * "arreglarse" solo. Aplicar el pago (transacción, caja, asiento) es del
 * servicio que llame a esta función; para dinero real, ese servicio debería
 * pasarle un `payment` obtenido con `fetchCharge` cuando el proveedor lo ofrece.
 */

export type ExpectedPaymentState = 'OPEN' | 'PAID' | 'CLOSED';

export interface ExpectedPayment {
  /** Monto que la venta/orden espera recibir, CLP entero. */
  amountClp: number;
  /** OPEN: espera pago. PAID: ya se pagó. CLOSED: anulada/vencida, ya no acepta pagos. */
  state: ExpectedPaymentState;
  /** Id de la orden/venta; se contrasta con `payment.reference` cuando ambos existen. */
  reference?: string;
  /** Si es true, un pago sin referencia no se aplica solo (flujos donde el proveedor sí la devuelve). */
  requireReference?: boolean;
  /** `externalId` del pago que ya la pagó (state PAID). Distingue reintento de doble cobro. */
  paidByExternalId?: string | null;
}

export type ReconcileDecision =
  /** Es seguro marcar pagado. */
  | { action: 'APPLY' }
  /** Mismo pago ya aplicado (reintento del aviso): no hacer nada. */
  | { action: 'IGNORE_DUPLICATE' }
  /** Dinero recibido que no calza en monto o moneda: nunca se aplica, se escala. */
  | { action: 'AMOUNT_MISMATCH'; reason: string }
  /** El pago aún no es un hecho consumado (pendiente, rechazado, anulado, devuelto). */
  | { action: 'NOT_FINAL'; reason: 'PENDING' | 'REJECTED' | 'CANCELLED' | 'REFUNDED' }
  /**
   * Pago aprobado que no se puede aplicar sin criterio humano: doble cobro de
   * una venta ya pagada, venta cerrada, o referencia de otra orden.
   */
  | { action: 'NEEDS_REVIEW'; reason: 'DOUBLE_PAYMENT' | 'ORDER_CLOSED' | 'REFERENCE_MISMATCH' | 'REFERENCE_MISSING' };

export function reconcileTerminalPayment(payment: TerminalPayment, expected: ExpectedPayment): ReconcileDecision {
  // 1) Estado: solo APPROVED es un hecho de dinero recibido.
  if (payment.status !== 'APPROVED') {
    return { action: 'NOT_FINAL', reason: payment.status };
  }

  // 2) Ya pagada. El mismo externalId es un reintento inocuo; otro distinto
  //    es plata cobrada dos veces y no se oculta como "duplicado".
  if (expected.state === 'PAID') {
    if (expected.paidByExternalId && expected.paidByExternalId !== payment.externalId) {
      return { action: 'NEEDS_REVIEW', reason: 'DOUBLE_PAYMENT' };
    }
    return { action: 'IGNORE_DUPLICATE' };
  }
  if (expected.state === 'CLOSED') {
    return { action: 'NEEDS_REVIEW', reason: 'ORDER_CLOSED' };
  }

  // 3) Moneda y monto exactos (sin tolerancia ni redondeo).
  if (payment.currency !== 'CLP') {
    return { action: 'AMOUNT_MISMATCH', reason: `moneda ${String(payment.currency)}` };
  }
  if (!Number.isSafeInteger(payment.amountClp) || payment.amountClp !== expected.amountClp) {
    return { action: 'AMOUNT_MISMATCH', reason: `monto ${payment.amountClp} ≠ ${expected.amountClp}` };
  }

  // 4) Referencia cruzada: un pago de OTRA orden no paga esta.
  if (expected.reference && payment.reference) {
    if (payment.reference !== expected.reference) return { action: 'NEEDS_REVIEW', reason: 'REFERENCE_MISMATCH' };
  } else if (expected.reference && expected.requireReference) {
    return { action: 'NEEDS_REVIEW', reason: 'REFERENCE_MISSING' };
  }

  return { action: 'APPLY' };
}
