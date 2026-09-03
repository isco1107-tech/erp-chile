import type { Payment, PaymentMethodType } from '@prisma/client';
import { createAndPostEntry, resolveMappedAccountId, type TxClient } from '../services/journal.service';

/**
 * Reglas de asiento de cobros/pagos manuales registrados en Tesorería
 * (`registerSalesPayment`/`registerPurchasePayment`). Deliberadamente NO se
 * enganchan al `Payment` que `sales.service.ts::createSalesDocument` crea
 * automáticamente para una venta al contado, ni al `Payment` compensatorio
 * que genera `cancelSalesDocument`: en ambos casos el asiento de venta ya
 * cargó/reversó `CAJA` directamente (ver `sales-posting.ts`), así que postear
 * también acá duplicaría el movimiento de caja. Esta regla existe solo para
 * el cobro/pago posterior de un documento que quedó pendiente (crédito).
 */

/** Efectivo va a `CAJA`; cualquier otro medio (transferencia, tarjeta, cheque) va a `BANCO`. */
function cashOrBankKey(method: PaymentMethodType): 'CAJA' | 'BANCO' {
  return method === 'EFECTIVO' ? 'CAJA' : 'BANCO';
}

export async function postSalesPaymentEntry(
  tx: TxClient,
  companyId: string,
  payment: Payment,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  const [debitAccountId, clientesAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, cashOrBankKey(payment.paymentMethod)),
    resolveMappedAccountId(tx, companyId, 'CLIENTES'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: payment.paymentDate,
    description: `Cobro documento de venta${payment.referenceNumber ? ` — ${payment.referenceNumber}` : ''}`,
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    createdByUserId: opts.createdByUserId,
    lines: [
      { accountId: debitAccountId, debit: payment.amount, credit: 0 },
      { accountId: clientesAccountId, debit: 0, credit: payment.amount },
    ],
  });
}

export async function postPurchasePaymentEntry(
  tx: TxClient,
  companyId: string,
  payment: Payment,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  const [proveedoresAccountId, creditAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'PROVEEDORES'),
    resolveMappedAccountId(tx, companyId, cashOrBankKey(payment.paymentMethod)),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: payment.paymentDate,
    description: `Pago documento de compra${payment.referenceNumber ? ` — ${payment.referenceNumber}` : ''}`,
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    createdByUserId: opts.createdByUserId,
    lines: [
      { accountId: proveedoresAccountId, debit: payment.amount, credit: 0 },
      { accountId: creditAccountId, debit: 0, credit: payment.amount },
    ],
  });
}
