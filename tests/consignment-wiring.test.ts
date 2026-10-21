/**
 * Enganche de consignación en Ventas (anulación) y POS (emisión): se llama
 * dentro de la transacción del documento y un fallo la revierte completa.
 */
import { prisma } from '@/lib/prisma';

jest.mock('@/modules/consignment/services/consignment-hook.service', () => ({
  applyConsignmentToIssuedDocument: jest.fn(),
  reverseConsignmentForCancelledDocument: jest.fn(),
}));
jest.mock('@/modules/inventory/services/stock.service', () => ({ applyStockIn: jest.fn(), applyStockOut: jest.fn().mockResolvedValue({ unitCost: 500 }) }));
jest.mock('@/modules/dte/services/stamping.service', () => ({
  assignSalesFolio: jest.fn().mockResolvedValue({ folio: 7, stamping: null, cafId: null }),
  stampDocument: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/sales-posting', () => ({
  postCreditNoteIssued: jest.fn(),
  postSalesDocumentIssued: jest.fn(),
  reverseSalesDocumentPosting: jest.fn(),
}));
jest.mock('@/modules/accounting/posting-rules/shared', () => ({ reverseDocumentEntries: jest.fn() }));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import {
  applyConsignmentToIssuedDocument,
  reverseConsignmentForCancelledDocument,
} from '@/modules/consignment/services/consignment-hook.service';
import { cancelSalesDocument } from '@/modules/sales/services/sales.service';
import { createPosSale } from '@/modules/pos/services/pos.service';

const applyMock = applyConsignmentToIssuedDocument as jest.Mock;
const reverseMock = reverseConsignmentForCancelledDocument as jest.Mock;

function useTx(tx: unknown) {
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: unknown) => unknown) => callback(tx)) as never);
}

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('anulación de venta', () => {
  const issued = {
    id: 'fac1',
    dteType: 'FACTURA_33',
    status: 'ISSUED',
    contactId: 'cli1',
    warehouseId: 'w1',
    folio: 10,
    totalAmount: 1190,
    paidAmount: 0,
    referenceFolio: null,
    referenceType: null,
    cashShift: null,
    siiStatus: null,
    siiTrackId: null,
    items: [],
  };

  function cancelTx(updateCount: number) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      salesDocument: {
        findFirst: jest.fn().mockResolvedValueOnce(issued).mockResolvedValueOnce({ ...issued, status: 'CANCELLED' }),
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
  }

  it('reversa la consignación del documento con el companyId de la sesión', async () => {
    useTx(cancelTx(1));
    await cancelSalesDocument('co1', 'fac1', 'error');
    expect(reverseMock).toHaveBeenCalledWith(expect.anything(), 'co1', 'fac1');
  });

  it('si otra persona ya anuló el documento, no reversa nada (ni dos veces)', async () => {
    useTx(cancelTx(0));
    await expect(cancelSalesDocument('co1', 'fac1')).rejects.toThrow('ya no está emitido');
    expect(reverseMock).not.toHaveBeenCalled();
  });

  it('un fallo de la reversa de consignación hace fallar la anulación completa', async () => {
    useTx(cancelTx(1));
    reverseMock.mockRejectedValueOnce(new Error('boom consignación'));
    await expect(cancelSalesDocument('co1', 'fac1')).rejects.toThrow('boom consignación');
  });
});

describe('venta POS', () => {
  function posTx() {
    const document = { id: 'doc1', dteType: 'BOLETA_39', referenceType: null, referenceFolio: null, totalAmount: 1190, items: [] };
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      salesDocument: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(document) },
      cashShift: { findFirst: jest.fn().mockResolvedValue({ id: 's1', cashRegister: { warehouseId: 'w1' } }) },
      contact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cli1', rut: '66.666.666-6', razonSocial: 'Cliente' }),
        create: jest.fn(),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', sku: 'S1', name: 'Vino', netPrice: 1000, isExempt: false, costPricePMP: 500, isTrackable: true }),
      },
      company: { findUnique: jest.fn().mockResolvedValue(null) },
      payment: { create: jest.fn() },
    };
  }
  const input = { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'EFECTIVO' as const, cashReceived: 5000 };

  it('devenga la venta dentro de la transacción, con el companyId y el documento creado', async () => {
    const tx = posTx();
    useTx(tx);
    await createPosSale('co1', 'u1', 's1', input as never);
    expect(applyMock).toHaveBeenCalledWith(tx, 'co1', { id: 'doc1', dteType: 'BOLETA_39', referenceType: null, referenceFolio: null });
    expect(tx.payment.create).toHaveBeenCalled();
  });

  it('si la consignación falla, el cobro no se registra (rollback de la venta)', async () => {
    const tx = posTx();
    useTx(tx);
    applyMock.mockRejectedValueOnce(new Error('boom'));
    await expect(createPosSale('co1', 'u1', 's1', input as never)).rejects.toThrow('boom');
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe('emisión en Ventas', () => {
  function issueTx() {
    const created = { id: 'doc9', dteType: 'FACTURA_33', referenceType: null, referenceFolio: null, totalAmount: 1190, items: [] };
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      contact: { findFirst: jest.fn().mockResolvedValue({ id: 'cli1', creditLimit: null, rut: '1-9', razonSocial: 'Cli' }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', costPricePMP: 500, isExempt: false, isTrackable: false }) },
      salesDocument: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      company: { findUnique: jest.fn().mockResolvedValue(null) },
      payment: { create: jest.fn() },
    };
  }
  const input = {
    contactId: 'cli1',
    warehouseId: 'w1',
    dteType: 'FACTURA_33',
    paymentMethod: 'CREDITO_30',
    items: [{ productId: 'p1', description: 'Vino', quantity: 1, unitPrice: 1000 }],
  };

  it('emitida: llama al enganche con el documento creado; borrador: no', async () => {
    const { createSalesDocument } = await import('@/modules/sales/services/sales.service');
    const tx = issueTx();
    useTx(tx);
    await createSalesDocument('co1', input as never, 'ISSUED');
    expect(applyMock).toHaveBeenCalledWith(tx, 'co1', { id: 'doc9', dteType: 'FACTURA_33', referenceType: null, referenceFolio: null });

    applyMock.mockClear();
    useTx(issueTx());
    await createSalesDocument('co1', input as never, 'DRAFT');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('si el enganche falla, la emisión falla', async () => {
    const { createSalesDocument } = await import('@/modules/sales/services/sales.service');
    useTx(issueTx());
    applyMock.mockRejectedValueOnce(new Error('boom'));
    await expect(createSalesDocument('co1', input as never, 'ISSUED')).rejects.toThrow('boom');
  });
});
