import type { Payment, PaymentMethodType } from '@prisma/client';
import { resolveOrCreateMappedAccountId } from '../chart-of-accounts';
import { createAndPostEntry, resolveMappedAccountId, type TxClient } from '../services/journal.service';
import { isLedgerActive } from './shared';

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

/**
 * Cuenta contable donde entra o sale el dinero de un pago. Si el pago indica
 * una caja/cuenta bancaria de Tesorería con cuenta contable propia, esa manda;
 * si la indica sin cuenta propia, se usa `CAJA`/`BANCO` según su tipo; si no
 * indica ninguna, se decide por el medio de pago (comportamiento histórico).
 */
export async function resolveMoneyAccountId(
  tx: TxClient,
  companyId: string,
  payment: Pick<Payment, 'paymentMethod' | 'treasuryAccountId'>
): Promise<string> {
  if (payment.treasuryAccountId) {
    const account = await tx.treasuryAccount.findFirst({
      where: { id: payment.treasuryAccountId, companyId },
      select: { type: true, ledgerAccountId: true },
    });
    if (account?.ledgerAccountId) return account.ledgerAccountId;
    if (account) return resolveMappedAccountId(tx, companyId, account.type === 'CASH' ? 'CAJA' : 'BANCO');
  }
  return resolveMappedAccountId(tx, companyId, cashOrBankKey(payment.paymentMethod));
}

export async function postSalesPaymentEntry(
  tx: TxClient,
  companyId: string,
  payment: Payment,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  // Contabilidad apagada o sin plan de cuentas: la operación sigue, sin asiento.
  if (!(await isLedgerActive(tx, companyId))) return;
  const [debitAccountId, clientesAccountId] = await Promise.all([
    resolveMoneyAccountId(tx, companyId, payment),
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
      { accountId: debitAccountId, debit: payment.amount, credit: 0, customerId: payment.contactId ?? undefined },
      { accountId: clientesAccountId, debit: 0, credit: payment.amount, customerId: payment.contactId ?? undefined },
    ],
  });
}

export async function postPurchasePaymentEntry(
  tx: TxClient,
  companyId: string,
  payment: Payment,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  // Contabilidad apagada o sin plan de cuentas: la operación sigue, sin asiento.
  if (!(await isLedgerActive(tx, companyId))) return;
  const [proveedoresAccountId, creditAccountId] = await Promise.all([
    resolveMappedAccountId(tx, companyId, 'PROVEEDORES'),
    resolveMoneyAccountId(tx, companyId, payment),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: payment.paymentDate,
    description: `Pago documento de compra${payment.referenceNumber ? ` — ${payment.referenceNumber}` : ''}`,
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    createdByUserId: opts.createdByUserId,
    lines: [
      { accountId: proveedoresAccountId, debit: payment.amount, credit: 0, supplierId: payment.contactId ?? undefined },
      { accountId: creditAccountId, debit: 0, credit: payment.amount, supplierId: payment.contactId ?? undefined },
    ],
  });
}

/**
 * Un pago que se registró sin caja/banco y luego se concilia contra la
 * cartola de una cuenta cuyo ledger es otro: el asiento original cargó la
 * cuenta por medio de pago (`CAJA`/`BANCO`), pero el dinero está en la
 * cuenta de la cartola. Se mueve entre ambas con un asiento de
 * reclasificación (los asientos no se editan). No hace nada si la
 * Contabilidad está apagada, si el pago nunca tuvo asiento o si ambas
 * cuentas son la misma.
 */
export async function postMoneyReclassification(
  tx: TxClient,
  companyId: string,
  payment: Payment,
  newTreasuryAccountId: string,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  const posted = await tx.journalEntry.findFirst({
    where: {
      companyId,
      status: 'POSTED',
      OR: [{ sourceType: 'PAYMENT', sourceId: payment.id }, ...(payment.salesDocumentId ? [{ sourceType: 'SALES_DOCUMENT' as const, sourceId: payment.salesDocumentId }] : [])],
    },
    select: { id: true },
  });
  if (!posted) return;

  const [fromAccountId, toAccountId] = await Promise.all([
    resolveMoneyAccountId(tx, companyId, payment),
    resolveMoneyAccountId(tx, companyId, { paymentMethod: payment.paymentMethod, treasuryAccountId: newTreasuryAccountId }),
  ]);
  if (fromAccountId === toAccountId) return;

  const isIncome = payment.type === 'INCOME';
  await createAndPostEntry(tx, {
    companyId,
    date: new Date(),
    description: `Reclasificación de cuenta al conciliar${payment.description ? `: ${payment.description}` : ''}`.slice(0, 250),
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    createdByUserId: opts.createdByUserId,
    lines: isIncome
      ? [
          { accountId: toAccountId, debit: payment.amount, credit: 0 },
          { accountId: fromAccountId, debit: 0, credit: payment.amount },
        ]
      : [
          { accountId: fromAccountId, debit: payment.amount, credit: 0 },
          { accountId: toAccountId, debit: 0, credit: payment.amount },
        ],
  });
}

/**
 * Asiento de un movimiento de Tesorería que no nace de un documento de
 * venta/compra (sueldos, honorarios, cuotas, entradas…). La contrapartida es
 * la clave semántica que cada módulo indica: el pasivo que el pago cancela
 * (`HONORARIOS_POR_PAGAR`) o la cuenta que el cobro abona
 * (`COBROS_POR_DOCUMENTAR`). Si la empresa sembró su plan antes de que
 * existiera esa clave, se crea sola (`resolveOrCreateMappedAccountId`).
 */
export async function postTreasuryMovementEntry(
  tx: TxClient,
  companyId: string,
  payment: Payment,
  counterpartKey: string,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  const [moneyAccountId, counterpartAccountId] = await Promise.all([
    resolveMoneyAccountId(tx, companyId, payment),
    resolveOrCreateMappedAccountId(tx, companyId, counterpartKey),
  ]);
  const isIncome = payment.type === 'INCOME';
  const partner = payment.contactId ?? undefined;

  await createAndPostEntry(tx, {
    companyId,
    date: payment.paymentDate,
    description: payment.description ?? (isIncome ? 'Cobro registrado en Tesorería' : 'Pago registrado en Tesorería'),
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    createdByUserId: opts.createdByUserId,
    lines: isIncome
      ? [
          { accountId: moneyAccountId, debit: payment.amount, credit: 0, customerId: partner },
          { accountId: counterpartAccountId, debit: 0, credit: payment.amount, customerId: partner },
        ]
      : [
          { accountId: counterpartAccountId, debit: payment.amount, credit: 0, supplierId: partner },
          { accountId: moneyAccountId, debit: 0, credit: payment.amount, supplierId: partner },
        ],
  });
}
