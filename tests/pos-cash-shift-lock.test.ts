import { prisma } from '@/lib/prisma';

/**
 * N-07 (auditoría 2026-09-14): venta, movimiento de caja y cierre de un mismo
 * turno deben serializarse por un lock de fila sobre `CashShift`, con el
 * resumen del cierre calculado DENTRO de esa misma transacción — nunca antes
 * de ella. Sin esto, una venta que confirma entre el cálculo del resumen y el
 * UPDATE del cierre queda fuera del arqueo congelado.
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockOut: jest.fn(),
}));
jest.mock('@/modules/dte/services/stamping.service', () => ({
  assignSalesFolio: jest.fn().mockResolvedValue({ folio: 1, stamping: null, cafId: null }),
  stampDocument: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/sales-posting', () => ({
  postSalesDocumentIssued: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/inventory-posting', () => ({
  postCashShiftDifference: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { createPosSale } from '@/modules/pos/services/pos.service';
import { closeShift, registerCashMovement } from '@/modules/pos/services/cash.service';
import type { PosSaleInput } from '@/modules/pos/schema';

const saleInput: PosSaleInput = {
  items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
  paymentMethod: 'EFECTIVO',
  cashReceived: 1000,
};

/** Igual patrón que `tests/sales-credit-note-integrity.test.ts`. */
function fakeTx(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    salesDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    cashShift: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    cashMovement: {
      groupBy: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    contact: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    ...overrides,
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  return tx;
}

afterEach(() => jest.restoreAllMocks());

describe('createPosSale bloquea el turno antes de operar (N-07)', () => {
  it('toma el lock de CashShift antes de leer su estado y rechaza si no está OPEN', async () => {
    const tx = fakeTx();

    await expect(createPosSale('c1', 'u1', 's1', saleInput)).rejects.toThrow('No tienes un turno de caja abierto');

    expect(tx.$queryRaw).toHaveBeenCalled();
    // El lock se toma antes de cualquier lectura del estado del turno.
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const readOrder = tx.cashShift.findFirst.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(readOrder);
  });
});

describe('registerCashMovement bloquea el turno antes de crear el movimiento (N-07)', () => {
  it('rechaza un movimiento sobre un turno que ya no está OPEN, tras tomar el lock', async () => {
    const tx = fakeTx({
      cashShift: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1', companyId: 'c1', status: 'CLOSED' }),
        updateMany: jest.fn(),
      },
    });

    await expect(
      registerCashMovement('c1', 's1', 'u1', { type: 'INFLOW', amount: 1000, reason: 'Retiro de prueba' })
    ).rejects.toThrow('El turno ya está cerrado');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });
});

describe('closeShift calcula el resumen dentro de la misma transacción bloqueada (N-07)', () => {
  it('bloquea el turno antes de leer sus ventas/movimientos, sin usar el cliente global de Prisma', async () => {
    const shiftBeforeClose = {
      id: 's1',
      companyId: 'c1',
      status: 'OPEN',
      initialAmount: 1000,
      openedAt: new Date(),
      cashRegisterId: 'reg1',
    };
    const shiftAfterClose = {
      ...shiftBeforeClose,
      status: 'CLOSED',
      expectedAmount: 1500,
      actualAmount: 1500,
      difference: 0,
    };

    const tx = fakeTx({
      cashShift: {
        // 1ª lectura: dentro de `getShiftSummary(tx)`. 2ª lectura: tras el UPDATE.
        findFirst: jest.fn().mockResolvedValueOnce(shiftBeforeClose).mockResolvedValueOnce(shiftAfterClose),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      salesDocument: {
        findUnique: jest.fn(),
        // 1ª llamada: ventas ISSUED. 2ª llamada: ventas CANCELLED.
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ paymentMethod: 'EFECTIVO', _sum: { totalAmount: 500 }, _count: { _all: 1 } }])
          .mockResolvedValueOnce([]),
      },
    });

    // El resumen debe calcularse enteramente sobre el `tx` de la transacción
    // de cierre: si el código volviera a usar el cliente global de Prisma (el
    // bug original), esta llamada se dispararía contra una base sin mockear.
    const globalCashShiftFindFirst = jest.spyOn(prisma.cashShift, 'findFirst');
    const globalSalesDocumentGroupBy = jest.spyOn(prisma.salesDocument, 'groupBy');
    jest.spyOn(prisma.cashRegister, 'findFirst').mockResolvedValue({ name: 'Caja Principal' } as never);

    const result = await closeShift('c1', 's1', { actualAmount: 1500 });

    expect(tx.$queryRaw).toHaveBeenCalled();
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const firstReadOrder = tx.cashShift.findFirst.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(firstReadOrder);

    expect(globalCashShiftFindFirst).not.toHaveBeenCalled();
    expect(globalSalesDocumentGroupBy).not.toHaveBeenCalled();

    expect(result.summary.expectedAmount).toBe(1500);
    expect(tx.cashShift.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1', companyId: 'c1', status: 'OPEN' },
        data: expect.objectContaining({ expectedAmount: 1500, actualAmount: 1500, difference: 0 }),
      })
    );
  });
});
