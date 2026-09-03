import { CASH_PAYMENT_METHODS } from './schema';

/**
 * Aritmética del arqueo, sin dependencias de servidor para que sea testeable.
 *
 * Es el cálculo que decide si un cajero tiene un faltante: enterrarlo dentro de
 * una consulta a Prisma lo dejaba fuera del alcance de cualquier test.
 */

export interface CashDrawerInput {
  initialAmount: number;
  cashSales: number;
  inflows: number;
  outflows: number;
}

/**
 * Efectivo que debería haber físicamente en el cajón.
 *
 * Solo entra lo que se pagó en efectivo: débito, crédito y transferencia se
 * concilian contra el banco. Sumarlos aquí haría que toda caja apareciera con
 * un faltante gigante igual al monto cobrado con tarjeta.
 */
export function computeExpectedAmount(input: CashDrawerInput): number {
  return input.initialAmount + input.cashSales + input.inflows - input.outflows;
}

/**
 * Descuadre: positivo es sobrante, negativo es faltante.
 * Siempre contado − esperado, nunca al revés: el signo es lo que distingue
 * "sobró plata" de "falta plata" en la bitácora.
 */
export function computeDifference(actualAmount: number, expectedAmount: number): number {
  return actualAmount - expectedAmount;
}

export interface PaymentTotal {
  method: string;
  total: number;
}

/** Suma solo lo cobrado en medios que entran al cajón. */
export function sumCashPayments(totals: PaymentTotal[]): number {
  return totals
    .filter((row) => (CASH_PAYMENT_METHODS as readonly string[]).includes(row.method))
    .reduce((sum, row) => sum + row.total, 0);
}

/** Vuelto a entregar. Nunca negativo: si falta dinero, la venta no debe cerrarse. */
export function computeChange(cashReceived: number, totalAmount: number): number {
  return Math.max(0, cashReceived - totalAmount);
}

export function isPaymentSufficient(cashReceived: number, totalAmount: number): boolean {
  return cashReceived >= totalAmount;
}
