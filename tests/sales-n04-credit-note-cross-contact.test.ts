import { prisma } from '@/lib/prisma';

/**
 * N-04 (auditoría 2026-09-14): una Nota de Crédito podía referenciar el folio
 * de OTRO cliente (reduciendo su saldo, no el del cliente correcto) y no
 * tenía tope monetario contra lo que quedaba por acreditar del original.
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

import { createSalesDocument } from '@/modules/sales/services/sales.service';
import type { SalesDocumentCreateInput } from '@/modules/sales/schema';

/** Corta el flujo al crear el documento: lo que se prueba ocurre antes. */
const STOP = 'STOP_ANTES_DE_CREAR';

const originalInvoiceForCliente1 = {
  id: 'fac1',
  dteType: 'FACTURA_33',
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
      findFirst: jest.fn().mockImplementation((args: { where: { contactId?: string } }) => {
        if (args?.where?.contactId && args.where.contactId !== originalInvoiceForCliente1.contactId) return Promise.resolve(null);
        return Promise.resolve(originalInvoiceForCliente1);
      }),
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

function creditNote(quantities: number[], overrides: Partial<SalesDocumentCreateInput> = {}): SalesDocumentCreateInput {
  return {
    contactId: 'cli1',
    warehouseId: 'w1',
    dteType: 'NOTA_CREDITO_61',
    paymentMethod: 'CREDITO_30',
    referenceType: 'FACTURA_33',
    referenceFolio: 55,
    items: quantities.map((quantity) => ({ productId: 'p1', description: 'Polera', quantity, unitPrice: 20000 })),
    ...overrides,
  } as SalesDocumentCreateInput;
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('N-04: notas de crédito no cruzan cliente ni exceden el original', () => {
  it('rechaza una NC contra el folio de otro cliente', async () => {
    fakeTx();
    await expect(createSalesDocument('c1', creditNote([1], { contactId: 'cli2' }), 'ISSUED')).rejects.toThrow(
      'no pertenece al cliente'
    );
  });

  it('rechaza una NC cuyo monto, sumado a las previas, supera el total del original', async () => {
    const tx = fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValue(originalInvoiceForCliente1),
        // Ya se acreditaron $90.000 en una NC anterior sobre un original de $119.000.
        findMany: jest.fn().mockResolvedValue([{ totalAmount: 90000, items: [{ productId: 'p1', quantity: 1 }] }]),
        create: jest.fn().mockRejectedValue(new Error(STOP)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    // NC nueva de servicio libre (sin producto, así que no la limita el tope de unidades) por $40.000: 90.000 + 40.000 > 119.000.
    const note = creditNote([], {
      items: [{ description: 'Ajuste', quantity: 1, unitPrice: 40000 }],
    } as Partial<SalesDocumentCreateInput>);
    await expect(createSalesDocument('c1', note, 'ISSUED')).rejects.toThrow('supera lo que queda por acreditar');
    expect(tx.salesDocument.create).not.toHaveBeenCalled();
  });

  it('una NC dentro del saldo disponible sigue pasando (no es un falso rechazo)', async () => {
    fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValue(originalInvoiceForCliente1),
        findMany: jest.fn().mockResolvedValue([{ totalAmount: 90000, items: [{ productId: 'p1', quantity: 1 }] }]),
        create: jest.fn().mockRejectedValue(new Error(STOP)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    // 90.000 previos + 20.000 nueva = 110.000, dentro de 119.000.
    await expect(createSalesDocument('c1', creditNote([1]), 'ISSUED')).rejects.toThrow(STOP);
  });
});
