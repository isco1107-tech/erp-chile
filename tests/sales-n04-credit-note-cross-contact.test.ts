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
        // Ya se acreditaron $90.000 en una NC anterior sobre un original de
        // $119.000, y no hay Notas de Débito que suban el techo.
        findMany: jest.fn().mockImplementation((args: { where: { dteType?: string } }) => {
          if (args?.where?.dteType === 'NOTA_DEBITO_56') return Promise.resolve([]);
          return Promise.resolve([{ totalAmount: 90000, items: [{ productId: 'p1', quantity: 1 }] }]);
        }),
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

  it('el tope de la NC suma las Notas de Débito ISSUED que referencian el mismo original', async () => {
    // Original de $119.000, ya se acreditaron $90.000 en NC previas: sola esa
    // deuda, una NC nueva de servicio libre por $40.000+IVA (~$47.600) supera
    // los $119.000 y debería rechazarse. Pero hay $30.000 en Notas de Débito
    // ISSUED contra el mismo original, que suben el techo acreditable a
    // $149.000 — dentro de ese techo, la NC sí debe pasar.
    fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValue(originalInvoiceForCliente1),
        findMany: jest.fn().mockImplementation((args: { where: { dteType?: string } }) => {
          if (args?.where?.dteType === 'NOTA_DEBITO_56') {
            return Promise.resolve([{ totalAmount: 30000 }]);
          }
          return Promise.resolve([{ totalAmount: 90000, items: [{ productId: 'p1', quantity: 1 }] }]);
        }),
        create: jest.fn().mockRejectedValue(new Error(STOP)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const note = creditNote([], {
      items: [{ description: 'Ajuste', quantity: 1, unitPrice: 40000 }],
    } as Partial<SalesDocumentCreateInput>);
    await expect(createSalesDocument('c1', note, 'ISSUED')).rejects.toThrow(STOP);
  });
});

describe('N-04: una Factura que formaliza una Guía de OTRO cliente se rechaza explícitamente', () => {
  it('rechaza en vez de tratar la guía como "no encontrada" (que duplicaría el descuento de stock)', async () => {
    fakeTx({
      salesDocument: {
        // La guía existe, está ISSUED, pero es de otro cliente ('cli9').
        findFirst: jest.fn().mockResolvedValue({
          id: 'guia1',
          dteType: 'GUIA_DESPACHO_52',
          contactId: 'cli9',
          folio: 10,
          totalAmount: 40000,
          paidAmount: 0,
          items: [{ productId: 'p1', quantity: 2, unitCostPMP: 1000 }],
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue(new Error(STOP)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    function plainSaleReferencingGuide(): SalesDocumentCreateInput {
      return {
        contactId: 'cli1',
        warehouseId: 'w1',
        dteType: 'FACTURA_33',
        paymentMethod: 'CREDITO_30',
        referenceType: 'GUIA_DESPACHO_52',
        referenceFolio: 10,
        items: [{ productId: 'p1', description: 'Polera', quantity: 2, unitPrice: 20000 }],
      } as SalesDocumentCreateInput;
    }

    await expect(createSalesDocument('c1', plainSaleReferencingGuide(), 'ISSUED')).rejects.toThrow('pertenece a otro cliente');
  });
});
