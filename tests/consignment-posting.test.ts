/**
 * Devengo contable de consignación (D 5103 / H 2110) y su espejo en
 * devoluciones; sin Contabilidad activa no hace nada.
 */
jest.mock('@/modules/accounting/services/journal.service', () => ({ createAndPostEntry: jest.fn() }));
jest.mock('@/modules/accounting/posting-rules/shared', () => ({ isLedgerActive: jest.fn() }));
jest.mock('@/modules/accounting/chart-of-accounts', () => ({
  ...jest.requireActual('@/modules/accounting/chart-of-accounts'),
  resolveOrCreateMappedAccount: jest.fn(async (_tx: unknown, _co: string, key: string) => `acc-${key}`),
}));

import type { Prisma } from '@prisma/client';
import { createAndPostEntry } from '@/modules/accounting/services/journal.service';
import { isLedgerActive } from '@/modules/accounting/posting-rules/shared';
import { resolveOrCreateMappedAccount } from '@/modules/accounting/chart-of-accounts';
import { postConsignmentAccrual } from '@/modules/accounting/posting-rules/consignment-posting';
import { CHART_OF_ACCOUNTS } from '@/modules/accounting/chart-of-accounts';

const tx = {} as Prisma.TransactionClient;
const date = new Date('2026-10-20T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  (isLedgerActive as jest.Mock).mockResolvedValue(true);
});

describe('postConsignmentAccrual', () => {
  it('venta: D costo de ventas en consignación / H consignantes por pagar, balanceado', async () => {
    await postConsignmentAccrual(tx, 'co1', { sourceId: 'd1', date, producerAmount: 800, description: 'x' });
    expect(resolveOrCreateMappedAccount).toHaveBeenCalledWith(tx, 'co1', 'COSTO_VENTAS_CONSIGNACION', '5103');
    expect(resolveOrCreateMappedAccount).toHaveBeenCalledWith(tx, 'co1', 'CONSIGNANTES_POR_PAGAR', '2110');
    expect(createAndPostEntry).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        companyId: 'co1',
        sourceType: 'CONSIGNMENT',
        sourceId: 'd1',
        lines: [
          { accountId: 'acc-COSTO_VENTAS_CONSIGNACION', debit: 800, credit: 0 },
          { accountId: 'acc-CONSIGNANTES_POR_PAGAR', debit: 0, credit: 800 },
        ],
      })
    );
  });

  it('devolución (importe negativo): el espejo', async () => {
    await postConsignmentAccrual(tx, 'co1', { sourceId: 'nc1', date, producerAmount: -400, description: 'x' });
    const lines = (createAndPostEntry as jest.Mock).mock.calls[0][1].lines;
    expect(lines).toEqual([
      { accountId: 'acc-CONSIGNANTES_POR_PAGAR', debit: 400, credit: 0 },
      { accountId: 'acc-COSTO_VENTAS_CONSIGNACION', debit: 0, credit: 400 },
    ]);
  });

  it('sin Contabilidad activa o con importe cero: no postea', async () => {
    (isLedgerActive as jest.Mock).mockResolvedValue(false);
    await postConsignmentAccrual(tx, 'co1', { sourceId: 'd1', date, producerAmount: 800, description: 'x' });
    (isLedgerActive as jest.Mock).mockResolvedValue(true);
    await postConsignmentAccrual(tx, 'co1', { sourceId: 'd1', date, producerAmount: 0, description: 'x' });
    expect(createAndPostEntry).not.toHaveBeenCalled();
  });
});

describe('plan de cuentas', () => {
  it('incluye 2110 y 5103 con su clave de mapeo, bajo padres existentes', () => {
    const c2110 = CHART_OF_ACCOUNTS.find((a) => a.code === '2110');
    const c5103 = CHART_OF_ACCOUNTS.find((a) => a.code === '5103');
    expect(c2110).toMatchObject({ mappingKey: 'CONSIGNANTES_POR_PAGAR', parentCode: '21', type: 'LIABILITY' });
    expect(c5103).toMatchObject({ mappingKey: 'COSTO_VENTAS_CONSIGNACION', parentCode: '5', type: 'COST' });
  });
});
