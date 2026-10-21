/**
 * Candados de inventario y compras para productos en consignación: la
 * mercadería es del productor, así que no se compra y solo entra a costo 0.
 */
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));
jest.mock('@/modules/accounting/posting-rules/purchases-posting', () => ({
  postPurchaseDocumentIssued: jest.fn(),
  postPurchaseCreditNoteIssued: jest.fn(),
  reversePurchaseDocumentPosting: jest.fn(),
}));

import { createPurchaseDocument } from '@/modules/purchases/services/purchases.service';
import { applyStockIn } from '@/modules/inventory/services/stock.service';
import type { PurchaseDocumentCreateInput } from '@/modules/purchases/schema';
import type { Prisma } from '@prisma/client';

afterEach(() => jest.restoreAllMocks());

describe('compras: productos en consignación', () => {
  function purchaseTx(supplyMode: 'OWN' | 'CONSIGNMENT') {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      contact: { findFirst: jest.fn().mockResolvedValue({ id: 'sup1', isSupplier: true }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1', isDefault: true }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', isTrackable: true, supplyMode }) },
      purchaseDocument: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockRejectedValue(new Error('STOP')) },
      companySettings: { findUnique: jest.fn().mockResolvedValue({ purchaseApprovalThreshold: null }) },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
    return tx;
  }
  const input = {
    contactId: 'sup1',
    documentType: 'FACTURA',
    folio: '55',
    issueDate: '2026-10-20',
    items: [{ productId: 'p1', description: 'Vino reserva', quantity: 10, unitCost: 3000 }],
  } as PurchaseDocumentCreateInput;

  it('rechaza una línea con un producto en consignación, aun como borrador', async () => {
    const tx = purchaseTx('CONSIGNMENT');
    await expect(createPurchaseDocument('co1', input, 'DRAFT')).rejects.toThrow('producto en consignación');
    expect(tx.purchaseDocument.create).not.toHaveBeenCalled();
  });

  it('un producto propio no se rechaza por consignación', async () => {
    purchaseTx('OWN');
    const error = await createPurchaseDocument('co1', input, 'ISSUED').then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );
    expect(error ?? '').not.toContain('consignación');
  });
});

describe('inventario: ingreso de mercadería en consignación', () => {
  function stockTx(supplyMode: 'OWN' | 'CONSIGNMENT') {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', isTrackable: true, supplyMode, costPricePMP: 0 }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as Prisma.TransactionClient;
  }
  const params = { productId: 'p1', warehouseId: 'w1', type: 'PURCHASE_IN' as const, quantity: 5 };

  it('con costo mayor a cero se rechaza', async () => {
    await expect(applyStockIn(stockTx('CONSIGNMENT'), 'co1', { ...params, unitCost: 100 })).rejects.toThrow('costo 0');
  });

  it('con costo 0 pasa el candado (falla después, por la bodega simulada)', async () => {
    await expect(applyStockIn(stockTx('CONSIGNMENT'), 'co1', { ...params, unitCost: 0 })).rejects.toThrow('Bodega no encontrada');
  });

  it('un producto propio con costo no se ve afectado', async () => {
    await expect(applyStockIn(stockTx('OWN'), 'co1', { ...params, unitCost: 100 })).rejects.toThrow('Bodega no encontrada');
  });
});
