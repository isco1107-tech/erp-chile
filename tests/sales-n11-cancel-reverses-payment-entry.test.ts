import { prisma } from '@/lib/prisma';

/**
 * N-11 (auditoría 2026-09-14): anular una venta con un cobro posterior (a
 * crédito, pagado después vía `registerSalesPayment`) reversaba el asiento
 * de la venta pero no el asiento propio del cobro (`sourceType PAYMENT`),
 * dejando efectivo contable retenido sin dinero real.
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

import { reverseDocumentEntries } from '@/modules/accounting/posting-rules/shared';
import { cancelSalesDocument } from '@/modules/sales/services/sales.service';

function fakeTx(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'cli1', creditLimit: null }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', costPricePMP: 1000, isExempt: false, isTrackable: true }) },
    salesDocument: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    company: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    ...overrides,
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  return tx;
}

afterEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());

describe('N-11: anular una venta con un cobro posterior reversa también el asiento de ese cobro', () => {
  it('reversa el asiento PAYMENT de cada cobro vinculado, no solo el de la venta', async () => {
    const issuedInvoice = {
      id: 'fac4',
      dteType: 'FACTURA_33',
      status: 'ISSUED',
      contactId: 'cli1',
      warehouseId: 'w1',
      folio: 300,
      totalAmount: 119000,
      paidAmount: 119000,
      referenceFolio: null,
      referenceType: null,
      cashShift: null,
      items: [{ productId: 'p1', quantity: 1, unitCostPMP: 1000 }],
    };
    const linkedPayment = { id: 'pay1', type: 'INCOME', amount: 119000, paymentMethod: 'TRANSFERENCIA' };

    fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValueOnce(issuedInvoice).mockResolvedValueOnce({ ...issuedInvoice, status: 'CANCELLED' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([linkedPayment]),
        create: jest.fn(),
      },
    });

    await cancelSalesDocument('c1', 'fac4', 'cliente devolvió la mercadería');

    // El cobro posterior (registrado en Tesorería) posteó su propio asiento
    // `sourceType PAYMENT` con `sourceId` del pago — reversarlo es lo que
    // faltaba: reversar solo `SALES_DOCUMENT` deja ese asiento vivo.
    expect(reverseDocumentEntries).toHaveBeenCalledWith(expect.anything(), 'c1', 'PAYMENT', 'pay1', expect.any(String));
  });

  it('sin cobros vinculados, no intenta reversar ningún asiento PAYMENT', async () => {
    const issuedInvoice = {
      id: 'fac5',
      dteType: 'FACTURA_33',
      status: 'ISSUED',
      contactId: 'cli1',
      warehouseId: 'w1',
      folio: 301,
      totalAmount: 119000,
      paidAmount: 0,
      referenceFolio: null,
      referenceType: null,
      cashShift: null,
      items: [{ productId: 'p1', quantity: 1, unitCostPMP: 1000 }],
    };
    fakeTx({
      salesDocument: {
        findFirst: jest.fn().mockResolvedValueOnce(issuedInvoice).mockResolvedValueOnce({ ...issuedInvoice, status: 'CANCELLED' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await cancelSalesDocument('c1', 'fac5', 'nunca se cobró');

    expect(reverseDocumentEntries).not.toHaveBeenCalled();
  });
});
