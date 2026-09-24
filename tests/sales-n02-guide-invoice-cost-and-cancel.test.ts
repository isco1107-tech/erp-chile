import { prisma } from '@/lib/prisma';

/**
 * N-02 (auditoría 2026-09-14): el ciclo Guía de Despacho → Factura diferida
 * no reconocía costo contable en ningún punto, y la anulación reponía stock
 * según el tipo de DTE en vez de según si el documento realmente lo movió.
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

import { applyStockIn, applyStockOut } from '@/modules/inventory/services/stock.service';
import { cancelSalesDocument, createSalesDocument } from '@/modules/sales/services/sales.service';
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

function plainSale(overrides: Partial<SalesDocumentCreateInput> = {}): SalesDocumentCreateInput {
  return {
    contactId: 'cli1',
    warehouseId: 'w1',
    dteType: 'FACTURA_33',
    paymentMethod: 'CREDITO_30',
    items: [{ productId: 'p1', description: 'Polera', quantity: 2, unitPrice: 20000 }],
    ...overrides,
  } as SalesDocumentCreateInput;
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('N-02: la factura que referencia una guía ya emitida no vuelve a descontar stock', () => {
  it('no llama applyStockOut cuando referencia una guía ISSUED', async () => {
    fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'guia1',
          dteType: 'GUIA_DESPACHO_52',
          contactId: 'cli1',
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

    await expect(
      createSalesDocument(
        'c1',
        plainSale({ referenceType: 'GUIA_DESPACHO_52', referenceFolio: 10 } as Partial<SalesDocumentCreateInput>),
        'ISSUED'
      )
    ).rejects.toThrow(STOP);

    expect(applyStockOut).not.toHaveBeenCalled();
  });
});

describe('N-02: la anulación repone stock solo si el documento realmente lo movió al emitirse', () => {
  it('anular una factura que referenció una guía ya emitida NO repone stock', async () => {
    const issuedInvoiceReferencingGuide = {
      id: 'fac2',
      dteType: 'FACTURA_33',
      status: 'ISSUED',
      contactId: 'cli1',
      warehouseId: 'w1',
      folio: 200,
      totalAmount: 40000,
      paidAmount: 40000,
      referenceFolio: 10,
      referenceType: 'GUIA_DESPACHO_52',
      cashShift: null,
      items: [{ productId: 'p1', quantity: 2, unitCostPMP: 1000 }],
    };
    fakeTx({
      salesDocument: {
        findFirst: jest
          .fn()
          // 1) el propio documento que se anula
          .mockResolvedValueOnce(issuedInvoiceReferencingGuide)
          // 2) la resolución de si el folio referenciado es una guía
          .mockResolvedValueOnce({ dteType: 'GUIA_DESPACHO_52' })
          // 3) relectura final tras el update
          .mockResolvedValueOnce({ ...issuedInvoiceReferencingGuide, status: 'CANCELLED' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await cancelSalesDocument('c1', 'fac2', 'anulación de prueba');

    expect(applyStockIn).not.toHaveBeenCalled();
  });

  it('anular una factura que SÍ descontó stock directamente (sin guía) repone normalmente', async () => {
    const plainIssuedInvoice = {
      id: 'fac3',
      dteType: 'FACTURA_33',
      status: 'ISSUED',
      contactId: 'cli1',
      warehouseId: 'w1',
      folio: 201,
      totalAmount: 40000,
      paidAmount: 40000,
      referenceFolio: null,
      referenceType: null,
      cashShift: null,
      items: [{ productId: 'p1', quantity: 2, unitCostPMP: 1000 }],
    };
    fakeTx({
      salesDocument: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(plainIssuedInvoice)
          .mockResolvedValueOnce({ ...plainIssuedInvoice, status: 'CANCELLED' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await cancelSalesDocument('c1', 'fac3', 'anulación de prueba');

    expect(applyStockIn).toHaveBeenCalledTimes(1);
  });
});
