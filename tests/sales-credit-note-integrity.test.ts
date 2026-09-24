import { prisma } from '@/lib/prisma';

/**
 * Integridad de notas de crédito y anulaciones de venta (auditoría 2026-09-14):
 * - N-01: una Nota de Crédito en borrador no devuelve mercadería a bodega.
 * - N-05: repetir un producto en varias líneas no permite acreditar más
 *   unidades de las vendidas.
 * - N-09: una anulación que pierde la carrera no repone stock dos veces.
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
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { applyStockIn } from '@/modules/inventory/services/stock.service';
import { cancelSalesDocument, createSalesDocument } from '@/modules/sales/services/sales.service';
import type { SalesDocumentCreateInput } from '@/modules/sales/schema';

/** Corta el flujo al crear el documento: lo que se prueba ocurre antes. */
const STOP = 'STOP_ANTES_DE_CREAR';

const originalInvoice = {
  id: 'fac1',
  dteType: 'FACTURA_33',
  // El filtro de cliente para NC/ND ahora se valida en código (N-04) contra
  // el `contactId` del documento resuelto, no en la cláusula `where` de la
  // consulta: el fixture necesita declararlo explícitamente.
  contactId: 'cli1',
  folio: 55,
  totalAmount: 119000,
  paidAmount: 0,
  items: [{ productId: 'p1', quantity: 5, unitCostPMP: 1000 }],
};

function fakeTx(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'cli1', creditLimit: null }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', costPricePMP: 1000, isExempt: false, isTrackable: true }) },
    salesDocument: {
      findFirst: jest.fn().mockResolvedValue(originalInvoice),
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

function creditNote(quantities: number[]): SalesDocumentCreateInput {
  return {
    contactId: 'cli1',
    warehouseId: 'w1',
    dteType: 'NOTA_CREDITO_61',
    paymentMethod: 'CREDITO_30',
    referenceType: 'FACTURA_33',
    referenceFolio: 55,
    items: quantities.map((quantity) => ({ productId: 'p1', description: 'Polera', quantity, unitPrice: 20000 })),
  } as SalesDocumentCreateInput;
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('Notas de crédito (N-01, N-05)', () => {
  it('una nota de crédito en borrador no mueve stock', async () => {
    fakeTx();
    await expect(createSalesDocument('c1', creditNote([2]), 'DRAFT')).rejects.toThrow(STOP);
    expect(applyStockIn).not.toHaveBeenCalled();
  });

  it('emitida, sí devuelve la mercadería', async () => {
    fakeTx();
    await expect(createSalesDocument('c1', creditNote([2]), 'ISSUED')).rejects.toThrow(STOP);
    expect(applyStockIn).toHaveBeenCalledTimes(1);
  });

  it('no permite acreditar más de lo vendido repartiéndolo en líneas repetidas', async () => {
    fakeTx();
    // Se vendieron 5: dos líneas de 3 suman 6. Precio bajo para no chocar
    // primero con el tope monetario (N-04): lo que se está probando acá es
    // el tope de unidades por producto.
    const note = creditNote([3, 3]);
    note.items = note.items.map((item) => ({ ...item, unitPrice: 5000 }));
    await expect(createSalesDocument('c1', note, 'ISSUED')).rejects.toThrow('No se puede acreditar');
  });
});

describe('Anulación de venta (N-09)', () => {
  it('si otra anulación ganó la carrera, falla en vez de confirmar una segunda anulación', async () => {
    const issued = { ...originalInvoice, status: 'ISSUED', items: [], cashShift: null, referenceFolio: null, referenceType: null, contactId: 'cli1' };
    const tx = fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValue(issued),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });

    await expect(cancelSalesDocument('c1', 'fac1')).rejects.toThrow('ya no está emitido');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.salesDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fac1', companyId: 'c1', status: 'ISSUED' } })
    );
  });
});

describe('Anulación de boleta del POS (N-07)', () => {
  it('relee el turno con lock: si otro cierre lo cerró recién, no anula', async () => {
    const posSale = { ...originalInvoice, status: 'ISSUED', items: [], cashShift: { id: 't1', status: 'OPEN', closedAt: null }, referenceFolio: null, referenceType: null, contactId: 'cli1' };
    const tx = fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValue(posSale),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    // Primer $queryRaw: lock de la venta; segundo: lock del turno, que ya está cerrado.
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 'CLOSED' }]);

    await expect(cancelSalesDocument('c1', 'fac1')).rejects.toThrow('turno de caja ya cerrado');
    expect(tx.salesDocument.updateMany).not.toHaveBeenCalled();
  });
});
