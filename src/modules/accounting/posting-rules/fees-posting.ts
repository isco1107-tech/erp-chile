import type { FeeDocument } from '@prisma/client';
import { createAndPostEntry, type TxClient } from '../services/journal.service';
import { resolveOrCreateMappedAccount } from '../chart-of-accounts';
import { isLedgerActive } from './shared';

/**
 * Asiento al pagar una boleta de honorarios (auditoría 2026-09-27, hallazgo
 * C-1): reconoce el gasto por el bruto, la retención que queda por pagar al
 * SII (misma cuenta que usa el F29, `RETENCION_HONORARIOS`, ya existente en
 * el plan) y el líquido pagado. No hay asiento de devengo previo al emitir
 * la boleta (la deuda con el prestador vive solo en `FeeDocument`, no en el
 * mayor), así que este único asiento cubre gasto + retención + salida de
 * caja de una vez: `grossAmount = retentionAmount + netToPay` siempre cuadra.
 *
 * A diferencia de remuneraciones y reembolsos, el `FeeDocument.contactId`
 * sí es un `Contact` real (el prestador de servicios), así que este flujo
 * SÍ crea el `Payment` de Tesorería — la corrección queda completa.
 */
export async function postFeeDocumentPaymentEntry(
  tx: TxClient,
  companyId: string,
  fee: FeeDocument,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  const payment = await tx.payment.create({
    data: {
      companyId,
      type: 'EXPENSE',
      contactId: fee.contactId,
      feeDocumentId: fee.id,
      amount: fee.netToPay,
      paymentMethod: 'TRANSFERENCIA',
      paymentDate: fee.paymentDate ?? new Date(),
      referenceNumber: fee.folioNumber,
    },
  });

  if (!(await isLedgerActive(tx, companyId))) return;
  if (fee.grossAmount <= 0) return;

  const [gastoAccountId, retencionAccountId, bancoAccountId] = await Promise.all([
    resolveOrCreateMappedAccount(tx, companyId, 'GASTO_HONORARIOS', '6108'),
    resolveOrCreateMappedAccount(tx, companyId, 'RETENCION_HONORARIOS', '2106'),
    resolveOrCreateMappedAccount(tx, companyId, 'BANCO', '1102'),
  ]);

  const lines = [{ accountId: gastoAccountId, debit: fee.grossAmount, credit: 0 }];
  if (fee.retentionAmount > 0) lines.push({ accountId: retencionAccountId, debit: 0, credit: fee.retentionAmount });
  if (fee.netToPay > 0) lines.push({ accountId: bancoAccountId, debit: 0, credit: fee.netToPay });

  await createAndPostEntry(tx, {
    companyId,
    date: fee.paymentDate ?? new Date(),
    description: `Pago boleta de honorarios ${fee.folioNumber}`,
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    createdByUserId: opts.createdByUserId,
    lines,
  });
}
