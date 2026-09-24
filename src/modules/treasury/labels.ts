import type { Payment, PaymentSource } from '@prisma/client';

/**
 * Etiquetas de Tesorería sin dependencias de servidor: las usan tanto los
 * servicios como los componentes de cliente (flujo de caja, conciliación).
 */

export type CashFlowOrigin = 'SALES' | 'PURCHASES' | 'OTHER' | PaymentSource;

export const CASH_FLOW_ORIGIN_LABELS: Record<CashFlowOrigin, string> = {
  SALES: 'Ventas y cobranza',
  PURCHASES: 'Compras y proveedores',
  OTHER: 'Otros movimientos',
  FEE_DOCUMENT: 'Honorarios',
  EXPENSE_REPORT: 'Rendiciones de gastos',
  PAYROLL_SALARIES: 'Sueldos',
  PAYROLL_CONTRIBUTIONS: 'Cotizaciones previsionales',
  INSTALLMENT: 'Cuotas y mensualidades',
  TICKET_SALE: 'Venta de entradas',
  VOTE_ORDER: 'Votación del público',
  SPONSORSHIP: 'Auspicios',
  PROMISSORY_NOTE: 'Pagarés',
  SERVICE_CONTRACT: 'Contratos de servicio',
  BANK_STATEMENT: 'Movimientos de cartola',
  INVOICE_PAYMENT_LINK: 'Pagos en línea por sobre el saldo',
};

/** Origen legible de un movimiento: el módulo que lo generó. */
export function movementOriginOf(payment: Pick<Payment, 'source' | 'salesDocumentId' | 'purchaseDocumentId'>): CashFlowOrigin {
  if (payment.source) return payment.source;
  if (payment.salesDocumentId) return 'SALES';
  if (payment.purchaseDocumentId) return 'PURCHASES';
  return 'OTHER';
}
