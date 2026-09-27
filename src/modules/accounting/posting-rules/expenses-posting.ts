import { createAndPostEntry, type TxClient } from '../services/journal.service';
import { resolveOrCreateMappedAccount } from '../chart-of-accounts';
import { isLedgerActive } from './shared';

/**
 * Asiento al reembolsar una rendición de gastos aprobada (auditoría
 * 2026-09-27, hallazgo C-1): reconoce el gasto contra caja/banco.
 *
 * No crea `Payment` de Tesorería: `Payment.contactId` es obligatorio y
 * apunta a `Contact` (clientes/proveedores), y quien rinde gastos es un
 * `User` interno, no un contacto — conciliarlo requiere decidir si se
 * relaja esa columna o se resuelve/crea un contacto por trabajador, y esa
 * decisión quedó pendiente en la auditoría. Este asiento sí dejar de estar
 * invisible en el libro mayor y el estado de resultados, que era la mitad
 * más grave del hallazgo; la visibilidad en el flujo de caja de Tesorería
 * queda para cuando se resuelva lo del `contactId`.
 *
 * El formulario de reembolso no pide medio de pago — se asume banco
 * (transferencia), el medio más común para un reembolso a un trabajador.
 */
export async function postExpenseReimbursementEntry(
  tx: TxClient,
  companyId: string,
  reportId: string,
  title: string,
  amount: number,
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  if (amount <= 0) return;

  const [gastoAccountId, bancoAccountId] = await Promise.all([
    resolveOrCreateMappedAccount(tx, companyId, 'GASTO_REEMBOLSOS', '6109'),
    resolveOrCreateMappedAccount(tx, companyId, 'BANCO', '1102'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: new Date(),
    description: `Reembolso de gastos — ${title}`,
    sourceType: 'EXPENSE_REPORT',
    sourceId: reportId,
    createdByUserId: opts.createdByUserId,
    lines: [
      { accountId: gastoAccountId, debit: amount, credit: 0 },
      { accountId: bancoAccountId, debit: 0, credit: amount },
    ],
  });
}
