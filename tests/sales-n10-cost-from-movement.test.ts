import { prisma } from '@/lib/prisma';

/**
 * N-10 (auditoría 2026-09-14): Ventas persistía el PMP leído antes del lock
 * de `applyStockOut`, en vez del costo real del movimiento de Kardex — igual
 * al bug que el POS ya no tiene (`pos.service.ts` usa `movement.unitCost`).
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockIn: jest.fn(),
  applyStockOut: jest.fn(),
}));
jest.mock('@/modules/dte/services/stamping.service', () => ({
  assignSalesFolio: jest.fn().mockResolvedValue({ folio: 900, stamping: null }),
  stampDocument: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/sales-posting', () => ({
  postCreditNoteIssued: jest.fn(),
  postSalesDocumentIssued: jest.fn(),
  reverseSalesDocumentPosting: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/shared', () => ({
  reverseDocumentEntries: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { applyStockOut } from '@/modules/inventory/services/stock.service';
import { createSalesDocument } from '@/modules/sales/services/sales.service';
import type { SalesDocumentCreateInput } from '@/modules/sales/schema';

/** Corta el flujo al crear el documento: lo que se prueba ocurre antes. */
const STOP = 'STOP_ANTES_DE_CREAR';

function fakeTx(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'cli1', creditLimit: null }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', costPricePMP: 1000, isExempt: false, isTrackable: true }) },
    salesDocument: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockRejectedValue(new Error(STOP)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    company: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    ...overrides,
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  return tx;
}

function plainSale(): SalesDocumentCreateInput {
  return {
    contactId: 'cli1',
    warehouseId: 'w1',
    dteType: 'FACTURA_33',
    paymentMethod: 'CREDITO_30',
    items: [{ productId: 'p1', description: 'Polera', quantity: 2, unitPrice: 20000 }],
  } as SalesDocumentCreateInput;
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('N-10: el costo persistido es el del movimiento de Kardex, no el PMP leído antes del lock', () => {
  it('usa unitCost del movimiento aunque el PMP del catálogo haya cambiado bajo el lock', async () => {
    const tx = fakeTx();
    // El catálogo se lee con PMP=1000 antes del lock, pero `applyStockOut`
    // (bajo lock de fila) reporta que el PMP vigente real ya subió a 1500
    // porque una compra confirmó entre la lectura y la salida.
    (applyStockOut as jest.Mock).mockResolvedValue({ unitCost: 1500 });

    await expect(createSalesDocument('c1', plainSale(), 'ISSUED')).rejects.toThrow(STOP);

    const createCall = tx.salesDocument.create.mock.calls[0][0];
    expect(createCall.data.items.create[0].unitCostPMP).toBe(1500);
  });
});
