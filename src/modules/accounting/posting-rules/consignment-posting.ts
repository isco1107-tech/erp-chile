import { createAndPostEntry, type TxClient } from '../services/journal.service';
import { resolveOrCreateMappedAccount } from '../chart-of-accounts';
import { isLedgerActive } from './shared';

/**
 * Devengo al productor de una venta en consignación (modelo A1, criterio a
 * validar por contador): la venta es de la empresa y ya postea su ingreso e
 * IVA como cualquier boleta/factura; aquí solo se reconoce lo que se le debe
 * al productor.
 *
 *   venta:      D 5103 Costo de ventas en consignación / H 2110 Consignantes por pagar
 *   devolución: el espejo (importe negativo)
 *
 * El asiento nace en la misma transacción que la venta; sin Contabilidad
 * activa no hace nada. PENDIENTE: el pago de la liquidación al productor
 * (Tesorería) aún postea contra Proveedores (2101), no contra 2110 — ver informe.
 */
export async function postConsignmentAccrual(
  tx: TxClient,
  companyId: string,
  input: { sourceId: string; date: Date; producerAmount: number; description: string }
): Promise<void> {
  if (input.producerAmount === 0) return;
  if (!(await isLedgerActive(tx, companyId))) return;

  const [costAccountId, payableAccountId] = await Promise.all([
    resolveOrCreateMappedAccount(tx, companyId, 'COSTO_VENTAS_CONSIGNACION', '5103'),
    resolveOrCreateMappedAccount(tx, companyId, 'CONSIGNANTES_POR_PAGAR', '2110'),
  ]);
  const amount = Math.abs(input.producerAmount);
  const accrual = input.producerAmount > 0;

  await createAndPostEntry(tx, {
    companyId,
    date: input.date,
    description: input.description,
    sourceType: 'CONSIGNMENT',
    sourceId: input.sourceId,
    lines: [
      { accountId: accrual ? costAccountId : payableAccountId, debit: amount, credit: 0 },
      { accountId: accrual ? payableAccountId : costAccountId, debit: 0, credit: amount },
    ],
  });
}
