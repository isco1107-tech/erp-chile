import { prisma } from '@/lib/prisma';

/**
 * N-19 (auditoría 2026-09-14, segunda pasada): el esperado de caja de la
 * conciliación solo miraba las ventas del POS (ligadas a un `CashShift`) más
 * el fondo inicial y los movimientos sueltos de caja — pero ninguno de esos
 * dos últimos postea al mayor de CAJA (`openShift`/`registerCashMovement` no
 * generan asiento), y el mayor de CAJA también recibe ventas en efectivo
 * emitidas desde Ventas (no solo POS), cobros en efectivo de Tesorería sobre
 * documentos a crédito, y pagos a proveedores en efectivo. `cajaExpected`
 * ahora replica exactamente esas cuatro fuentes (ver el comentario en
 * `reconciliation.service.ts` para el detalle de qué postea cada una).
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

function mockPaymentAggregates(collections: number, supplierPayments: number) {
  jest.spyOn(prisma.payment, 'aggregate').mockImplementation(((args: { where: { type: 'INCOME' | 'EXPENSE' } }) => {
    const amount = args.where.type === 'INCOME' ? collections : supplierPayments;
    return Promise.resolve({ _sum: { amount } });
  }) as never);
}

function mockClosedShiftsDifference(totalDifference: number) {
  jest.spyOn(prisma.cashShift, 'aggregate').mockResolvedValue({ _sum: { difference: totalDifference } } as never);
}

afterEach(() => jest.restoreAllMocks());

describe('cajaExpected replica exactamente lo que postea al mayor de CAJA (N-19)', () => {
  it('cuenta una venta en efectivo emitida desde Ventas (sin CashShift), no solo las del POS', async () => {
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    mockCashSalesAggregate(150_000);
    mockPaymentAggregates(0, 0);
    mockClosedShiftsDifference(0);

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    expect(caja).toBeDefined();
    expect(caja!.expected).toBe(150_000);
  });

  it('suma cobros en efectivo de Tesorería sobre documentos a crédito y resta pagos a proveedores en efectivo', async () => {
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    mockCashSalesAggregate(0);
    mockPaymentAggregates(40_000, 15_000);
    mockClosedShiftsDifference(0);

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    // 40.000 cobrados - 15.000 pagados a proveedores = 25.000
    expect(caja!.expected).toBe(25_000);
  });

  it('suma los descuadres de cierre de turno ya posteados por postCashShiftDifference', async () => {
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    mockCashSalesAggregate(100_000);
    mockPaymentAggregates(0, 0);
    mockClosedShiftsDifference(-3_000); // faltante acumulado de cierres anteriores

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    expect(caja!.expected).toBe(97_000);
  });

  it('no cuenta el fondo inicial de un turno ni los movimientos sueltos de caja (no postean a CAJA)', async () => {
    // `CashMovement.aggregate`/`CashShift.initialAmount` ya no se consultan
    // en absoluto para el esperado: si el código volviera a sumarlos, este
    // mock (que no los stubea) haría fallar la prueba por una llamada real a
    // Prisma sin conexión disponible.
    mockOnlyCajaMapped();
    mockOtherSourcesAtZero();
    mockCashSalesAggregate(0);
    mockPaymentAggregates(0, 0);
    mockClosedShiftsDifference(0);

    const checks = await runReconciliation('c1');
    const caja = checks.find((check) => check.key === 'CAJA');

    expect(caja!.expected).toBe(0);
  });
});
