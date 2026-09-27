import { createAndPostEntry, type TxClient } from '../services/journal.service';
import { resolveOrCreateMappedAccount } from '../chart-of-accounts';
import { isLedgerActive } from './shared';

/**
 * Asiento de devengo al cerrar un período de remuneraciones (auditoría
 * 2026-09-27, hallazgo C-1): reconoce el gasto de sueldos (líquido + costo
 * empresa) contra la obligación con el personal, para que el libro mayor y
 * el flujo de caja dejen de ignorar el costo de remuneraciones del mes.
 *
 * Es un devengo, no un pago: no crea `Payment` de Tesorería. Hoy no existe
 * en el producto un paso explícito de "pagar remuneraciones" separado del
 * líquido depositado a cada trabajador — cuando ese paso se agregue, debe
 * rebajar `OBLIGACIONES_POR_PAGAR_RRHH` (esta misma cuenta), nunca volver a
 * cargar el gasto. Simplificación deliberada: un solo asiento agregado por
 * el total del período, no uno por trabajador ni desglosado por AFP/salud/
 * impuesto único — el detalle línea a línea ya vive en cada `Payslip`.
 */
export async function postPayrollClosingEntry(
  tx: TxClient,
  companyId: string,
  periodId: string,
  periodLabel: string,
  totals: { totalNetPay: number; totalEmployerCost: number },
  opts: { createdByUserId?: string } = {}
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  const totalExpense = totals.totalNetPay + totals.totalEmployerCost;
  if (totalExpense <= 0) return;

  const [gastoAccountId, obligacionAccountId] = await Promise.all([
    resolveOrCreateMappedAccount(tx, companyId, 'GASTO_REMUNERACIONES', '6101'),
    resolveOrCreateMappedAccount(tx, companyId, 'OBLIGACIONES_POR_PAGAR_RRHH', '2107'),
  ]);

  await createAndPostEntry(tx, {
    companyId,
    date: new Date(),
    description: `Remuneraciones ${periodLabel}`,
    sourceType: 'PAYROLL_PERIOD',
    sourceId: periodId,
    createdByUserId: opts.createdByUserId,
    lines: [
      { accountId: gastoAccountId, debit: totalExpense, credit: 0 },
      { accountId: obligacionAccountId, debit: 0, credit: totalExpense },
    ],
  });
}
