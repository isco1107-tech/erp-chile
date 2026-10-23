import type { ProviderVerdict } from '@/modules/payment-plans/online-payment-calc';

/**
 * Qué hacer con un pedido a partir de lo que Transbank responde de una transacción de
 * Webpay Plus. Puro: es lo que decide si entra plata. Además del estado exige que la
 * orden de compra y el monto coincidan con el pedido: una transacción válida de OTRO
 * pedido (u otro monto) no puede pagar este.
 */

export interface WebpayResultSnapshot {
  status: string;
  response_code?: number;
  amount: number;
  buy_order: string;
  authorization_code?: string;
  payment_type_code?: string;
}

const FAILED_STATUSES = new Set(['FAILED', 'REVERSED', 'NULLIFIED', 'PARTIALLY_NULLIFIED']);

export function evaluateWebpayResult(result: WebpayResultSnapshot, order: { id: string; amount: number }): ProviderVerdict {
  if (FAILED_STATUSES.has(result.status)) return { outcome: 'FAILED', reason: result.status };
  if (result.status !== 'AUTHORIZED' && result.status !== 'CAPTURED') return { outcome: 'PENDING' };
  if (result.response_code !== 0) return { outcome: 'FAILED', reason: `response_code ${result.response_code ?? '(vacío)'}` };
  if (result.buy_order !== order.id) return { outcome: 'MISMATCH', reason: `buy_order ${result.buy_order || '(vacío)'} ≠ pedido ${order.id}` };
  // Webpay devuelve el monto como número; CLP no tiene decimales.
  if (Math.round(Number(result.amount)) !== order.amount) return { outcome: 'MISMATCH', reason: `monto ${result.amount} ≠ ${order.amount}` };
  return { outcome: 'PAID' };
}

/** Forma de pago del ERP según el tipo de pago de Transbank (VD = débito, VP = prepago, el resto crédito). */
export function webpayPaymentMethod(paymentTypeCode: string | undefined): 'TARJETA_DEBITO' | 'TARJETA_CREDITO' {
  return paymentTypeCode === 'VD' || paymentTypeCode === 'VP' ? 'TARJETA_DEBITO' : 'TARJETA_CREDITO';
}

/** Hosts a los que la tienda manda al comprador a pagar con tarjeta; cualquier otro destino se rechaza. */
export const WEBPAY_HOSTS: readonly string[] = ['webpay3g.transbank.cl', 'webpay3gint.transbank.cl'];

export function isWebpayUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && WEBPAY_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}
