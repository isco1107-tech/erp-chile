import { prisma } from '@/lib/prisma';

/**
 * N-08 (auditoría 2026-09-14): una compra anulada mientras esperaba
 * aprobación no puede revivir como emitida ni volver a mover stock/PMP.
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockIn: jest.fn(),
  applyStockOut: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { applyStockIn } from '@/modules/inventory/services/stock.service';
import { approvePurchaseDocument, cancelPurchaseDocument } from '@/modules/purchases/services/purchases.service';

type FakeTx = {
  $queryRaw: jest.Mock;
  purchaseDocument: { findFirst: jest.Mock; updateMany: jest.Mock; findFirstOrThrow: jest.Mock };
  product: { findFirst: jest.Mock };
};

function useFakeTransaction(doc: Record<string, unknown>): FakeTx {
  const tx: FakeTx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    purchaseDocument: {
      findFirst: jest.fn().mockResolvedValue(doc),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue(doc),
    },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', isTrackable: true }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: FakeTx) => unknown) => callback(tx)) as never);
  return tx;
}

const pendingDoc = {
  id: 'doc1',
  companyId: 'c1',
  documentType: 'FACTURA_COMPRA',
  folio: '100',
  status: 'DRAFT',
  approvalStatus: 'PENDING',
  paidAmount: 0,
  items: [{ productId: 'p1', warehouseId: 'w1', quantity: 5, unitCost: 1000, description: 'Tela' }],
};

afterEach(() => jest.restoreAllMocks());

describe('Aprobación de compras anuladas (N-08)', () => {
  it('no aprueba un documento anulado aunque siga marcado como pendiente', async () => {
    const tx = useFakeTransaction({ ...pendingDoc, status: 'CANCELLED' });

    await expect(approvePurchaseDocument('c1', 'doc1', 'u1')).rejects.toThrow('anulado');
    expect(applyStockIn).not.toHaveBeenCalled();
    expect(tx.purchaseDocument.updateMany).not.toHaveBeenCalled();
  });

  it('al anular un documento pendiente, lo saca de la espera de aprobación y bloquea la fila', async () => {
    const tx = useFakeTransaction(pendingDoc);

    await cancelPurchaseDocument('c1', 'doc1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.purchaseDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc1', companyId: 'c1' },
      data: { status: 'CANCELLED', approvalStatus: 'NOT_REQUIRED' },
    });
  });
});
