import type { PaymentStatus } from '@prisma/client';

/**
 * Lógica pura del pago en línea de cuotas. Sin Prisma ni `fetch`, para poder
 * probarla sin mocks: es lo que decide si entra plata a una cuota.
 */

/** Minutos que la pasarela mantiene abierto un cobro antes de expirarlo. */
export const ONLINE_PAYMENT_TTL_MINUTES = 60;

/**
 * Detalles de Khipu que significan que el dinero NO quedó (o dejó de estar)
 * en la cuenta de la empresa aunque `status` diga otra cosa.
 */
const KHIPU_FAILED_DETAILS = new Set(['rejected-by-payer', 'marked-as-abuse', 'reversed']);

export type ProviderVerdict =
  | { outcome: 'PAID' }
  | { outcome: 'PENDING' }
  | { outcome: 'FAILED'; reason: string }
  /** El cobro dice pagado pero no calza con la orden: nunca se aplica, se escala. */
  | { outcome: 'MISMATCH'; reason: string };

export interface ProviderPaymentSnapshot {
  status: string;
  status_detail?: string;
  amount: number;
  currency: string;
  transaction_id?: string;
}

/**
 * Decide qué hacer con una orden a partir del cobro consultado a Khipu.
 * Además del estado, exige que monto, moneda y `transaction_id` coincidan
 * con la orden: un `payment_id` válido de OTRA orden (o de otro cobro de la
 * misma cuenta) no puede pagar esta.
 */
export function evaluateKhipuPayment(payment: ProviderPaymentSnapshot, order: { id: string; amount: number }): ProviderVerdict {
  if (payment.status_detail && KHIPU_FAILED_DETAILS.has(payment.status_detail)) {
    return { outcome: 'FAILED', reason: payment.status_detail };
  }
  if (payment.status !== 'done') return { outcome: 'PENDING' };

  if (payment.transaction_id !== order.id) {
    return { outcome: 'MISMATCH', reason: `transaction_id ${payment.transaction_id ?? '(vacío)'} ≠ orden ${order.id}` };
  }
  if (payment.currency !== 'CLP') return { outcome: 'MISMATCH', reason: `moneda ${payment.currency}` };
  // Khipu devuelve el monto como número; CLP no tiene decimales.
  if (Math.round(Number(payment.amount)) !== order.amount) {
    return { outcome: 'MISMATCH', reason: `monto ${payment.amount} ≠ ${order.amount}` };
  }
  return { outcome: 'PAID' };
}

export interface InstallmentBalance {
  id: string;
  amount: number;
  paidAmount: number;
}

export interface Allocation {
  installmentId: string;
  applied: number;
  newPaidAmount: number;
  paymentStatus: PaymentStatus;
}

/**
 * Reparte el pago confirmado entre las cuotas de la orden. Cada cuota recibe
 * lo que la orden le asignó al crearse, recortado a su saldo ACTUAL: si
 * entretanto alguien registró un pago manual, lo que sobra no se inventa en
 * otra cuota, se devuelve como `excess` para que el equipo lo devuelva.
 */
export function allocateOrderPayment(
  items: Array<{ installmentId: string; amount: number }>,
  balances: InstallmentBalance[]
): { allocations: Allocation[]; excess: number } {
  const byId = new Map(balances.map((b) => [b.id, b]));
  let excess = 0;
  const allocations: Allocation[] = [];

  for (const item of items) {
    const balance = byId.get(item.installmentId);
    if (!balance) {
      excess += item.amount;
      continue;
    }
    const pending = Math.max(balance.amount - balance.paidAmount, 0);
    const applied = Math.min(item.amount, pending);
    excess += item.amount - applied;
    const newPaidAmount = balance.paidAmount + applied;
    allocations.push({
      installmentId: item.installmentId,
      applied,
      newPaidAmount,
      paymentStatus: newPaidAmount <= 0 ? 'UNPAID' : newPaidAmount >= balance.amount ? 'PAID' : 'PARTIAL',
    });
  }

  return { allocations, excess };
}

/**
 * Nombre que ve quien paga: primer nombre completo + iniciales del resto
 * ("María José González" → "María J. G."). Basta para confirmar que es la
 * candidata correcta sin publicar el nombre completo a cualquiera que tenga
 * el RUT.
 */
export function maskPersonName(fullName: string): string {
  const [first, ...rest] = fullName.trim().split(/\s+/).filter(Boolean);
  if (!first) return '';
  const initials = rest.map((part) => `${part.charAt(0).toUpperCase()}.`);
  return [first, ...initials].join(' ');
}

export function formatReceiptNumber(receiptNumber: number): string {
  return `N° ${String(receiptNumber).padStart(6, '0')}`;
}
