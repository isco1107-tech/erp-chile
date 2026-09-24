import { prisma } from '@/lib/prisma';

/**
 * N-19 (auditoría 2026-09-14): el esperado de caja de la conciliación sumaba
 * `actualAmount` de TODOS los turnos CLOSED, así que el mismo fondo fijo se
 * contaba una y otra vez cada vez que la caja se cerraba y se volvía a abrir.
 * Ahora usa el último arqueo por caja más la actividad posterior.
 */

jest.mock('@/lib/chile/f29', () => ({
  calculateAndStoreF29: jest.fn().mockResolvedValue({
    year: 2026,
    month: 9,
    debitVat: 0,
    creditVat: 0,
    previousRemanent: 0,
    remanentCredit: 0,
    ppmAmount: 0,
    determinedTax: 0,
    netSales: 0,
    honorariumRetentionAmount: 0,
  }),
}));
jest.mock('@/modules/accounting/services/ledger.service', () => ({
  getAccountBalance: jest.fn().mockResolvedValue({ net: 0 }),
}));

import { runReconciliation } from '@/modules/accounting/services/reconciliation.service';

interface SalesAggregateArgs {
  where: { paymentMethod?: unknown };
}

/** Solo mapea la cuenta CAJA; las demás quedan `null` y sus checks se omiten. */
function mockOnlyCajaMapped() {
  jest.spyOn(prisma.accountMapping, 'findUnique').mockImplementation((({ where }: { where: { companyId_key: { key: string } } }) => {
    const key = where.companyId_key.key;
    return Promise.resolve(key === 'CAJA' ? { id: 'map-caja', companyId: 'c1', key: 'CAJA', accountId: 'acc-caja' } : null);
  }) as never);
}

/** Deja en cero las otras fuentes operativas (existencias, CxC, CxP) que se calculan siempre, aunque su cuenta no esté mapeada. */
function mockOtherSourcesAtZero() {
  jest.spyOn(prisma.stock, 'findMany').mockResolvedValue([] as never);
  jest.spyOn(prisma.purchaseDocument, 'aggregate').mockResolvedValue({ _sum: { totalAmount: 0, paidAmount: 0 } } as never);
}

/** `clientesExpected` y las ventas en efectivo de caja comparten `salesDocument.aggregate`; se distinguen por la forma del `where`. */
function mockCashSalesAggregate(cashTotal: number) {
  jest.spyOn(prisma.salesDocument, 'aggregate').mockImplementation(((args: SalesAggregateArgs) => {
    const isCashSalesQuery = 'paymentMethod' in args.where;
    return Promise.resolve({ _sum: { totalAmount: isCashSalesQuery ? cashTotal : 0, paidAmount: 0 } });
  }) as never);
}

afterEach(() => jest.restoreAllMocks());

describe('cajaExpected no duplica el fondo fijo entre cierres sucesivos (N-19)', () => {
  it('dos turnos CLOSED con el mismo efectivo contado no suman su saldo', async () => {
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    jest.spyOn(prisma.cashRegister, 'findMany').mockResolvedValue([{ id: 'reg1' }] as never);

    // El último de dos cierres sucesivos contó $100.000 de fondo fijo:
    // el esperado NO debe ser 200.000 por sumar ambos arqueos.
    jest.spyOn(prisma.cashShift, 'findFirst').mockResolvedValue({
      id: 'shift2',
      actualAmount: 100_000,
      closedAt: new Date('2026-09-10T12:00:00Z'),
    } as never);
    mockCashSalesAggregate(0);
    jest.spyOn(prisma.cashMovement, 'aggregate').mockResolvedValue({ _sum: { amount: 0 } } as never);

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    expect(caja).toBeDefined();
    expect(caja!.expected).toBe(100_000);
  });

  it('suma al último arqueo la actividad de caja posterior a ese cierre', async () => {
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    jest.spyOn(prisma.cashRegister, 'findMany').mockResolvedValue([{ id: 'reg1' }] as never);
    jest.spyOn(prisma.cashShift, 'findFirst').mockResolvedValue({
      id: 'shift1',
      actualAmount: 50_000,
      closedAt: new Date('2026-09-10T12:00:00Z'),
    } as never);

    // $20.000 vendidos en efectivo y un retiro de $5.000 después del último cierre.
    mockCashSalesAggregate(20_000);
    const movementAgg = jest.spyOn(prisma.cashMovement, 'aggregate');
    movementAgg.mockResolvedValueOnce({ _sum: { amount: 0 } } as never); // INFLOW
    movementAgg.mockResolvedValueOnce({ _sum: { amount: 5_000 } } as never); // OUTFLOW

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    // 50.000 (último arqueo) + 20.000 (ventas efectivo) - 5.000 (retiro) = 65.000
    expect(caja!.expected).toBe(65_000);
  });

  it('sin ningún cierre previo, cuenta toda la actividad histórica de la caja', async () => {
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    jest.spyOn(prisma.cashRegister, 'findMany').mockResolvedValue([{ id: 'reg1' }] as never);
    jest.spyOn(prisma.cashShift, 'findFirst').mockResolvedValue(null);
    mockCashSalesAggregate(10_000);
    jest.spyOn(prisma.cashMovement, 'aggregate').mockResolvedValue({ _sum: { amount: 0 } } as never);

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    expect(caja!.expected).toBe(10_000);
  });
});
