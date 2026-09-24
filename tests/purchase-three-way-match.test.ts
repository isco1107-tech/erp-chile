import { prisma } from '@/lib/prisma';

/**
 * N-06 (auditoría 2026-09-14): matching de 3 vías de compras contra Orden de
 * Compra.
 *
 * - Una línea de la factura sin `purchaseOrderItemId` no puede quedar
 *   MATCHED por omisión: antes `if (!orderItemId) continue;` la dejaba pasar
 *   como si no existiera.
 * - Dos líneas de la factura que apuntan a la misma línea de OC deben sumar
 *   su cantidad antes de comparar contra el saldo disponible
 *   (`receivedQuantity - invoicedQuantity`): antes cada línea se validaba
 *   por separado contra el mismo saldo, así que dos líneas de 50 c/u contra
 *   un saldo de 80 pasaban ambas el chequeo individual.
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockIn: jest.fn(),
  applyStockOut: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));
jest.mock('@/modules/accounting/posting-rules/purchases-posting', () => ({
  postPurchaseDocumentIssued: jest.fn(),
  postPurchaseCreditNoteIssued: jest.fn(),
  reversePurchaseDocumentPosting: jest.fn(),
}));

import { createPurchaseDocument } from '@/modules/purchases/services/purchases.service';

const orderItem = {
  id: 'oi1',
  orderId: 'po1',
  productId: 'p1',
  unitCost: 1000,
  receivedQuantity: 80,
  invoicedQuantity: 0,
};

const purchaseOrder = {
  id: 'po1',
  companyId: 'c1',
  contactId: 'sup1',
  items: [orderItem],
};

type FakeTx = {
  $queryRaw: jest.Mock;
  contact: { findFirst: jest.Mock };
  warehouse: { findFirst: jest.Mock };
  product: { findFirst: jest.Mock };
  purchaseDocument: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  purchaseOrder: { findFirst: jest.Mock };
  purchaseOrderItem: { updateMany: jest.Mock };
  companySettings: { findUnique: jest.Mock };
};

function useFakeTransaction(): FakeTx {
  const tx: FakeTx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    contact: { findFirst: jest.fn().mockResolvedValue({ id: 'sup1', isSupplier: true, razonSocial: 'Proveedor SA' }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', isTrackable: true }) },
    purchaseDocument: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'doc1',
          ...data,
          items: data.items.create,
        })
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseOrder: { findFirst: jest.fn().mockResolvedValue(purchaseOrder) },
    purchaseOrderItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    companySettings: { findUnique: jest.fn().mockResolvedValue({ purchaseApprovalThreshold: null }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: FakeTx) => unknown) => callback(tx)) as never);
  return tx;
}

const baseInput = {
  contactId: 'sup1',
  warehouseId: 'w1',
  documentType: 'FACTURA' as const,
  folio: '1001',
  issueDate: '2026-09-24',
  paymentMethod: 'TRANSFERENCIA' as const,
  purchaseOrderId: 'po1',
};

afterEach(() => jest.restoreAllMocks());

describe('Matching de 3 vías de compras contra OC (N-06)', () => {
  it('marca MISMATCHED una línea de producto sin enlace a la OC, no MATCHED', async () => {
    useFakeTransaction();

    const doc = await createPurchaseDocument(
      'c1',
      {
        ...baseInput,
        items: [
          { description: 'Tela sin enlace', productId: 'p1', quantity: 10, unitCost: 1000 },
        ],
      },
      'ISSUED'
    );

    expect(doc.matchStatus).toBe('MISMATCHED');
  });

  it('suma cantidades repetidas del mismo ítem de OC antes de validar el saldo disponible', async () => {
    useFakeTransaction();

    // Saldo disponible: 80. Dos líneas de 50 c/u = 100 facturadas, exceden el
    // saldo aunque cada línea individual (50 < 80) pasara el chequeo viejo.
    const doc = await createPurchaseDocument(
      'c1',
      {
        ...baseInput,
        items: [
          { description: 'Tela (parte 1)', productId: 'p1', quantity: 50, unitCost: 1000, purchaseOrderItemId: 'oi1' },
          { description: 'Tela (parte 2)', productId: 'p1', quantity: 50, unitCost: 1000, purchaseOrderItemId: 'oi1' },
        ],
      },
      'ISSUED'
    );

    expect(doc.matchStatus).toBe('MISMATCHED');
    expect(doc.matchNotes).toContain('100');
  });

  it('queda MATCHED cuando las líneas suman exactamente el saldo disponible', async () => {
    useFakeTransaction();

    const doc = await createPurchaseDocument(
      'c1',
      {
        ...baseInput,
        items: [
          { description: 'Tela (parte 1)', productId: 'p1', quantity: 30, unitCost: 1000, purchaseOrderItemId: 'oi1' },
          { description: 'Tela (parte 2)', productId: 'p1', quantity: 50, unitCost: 1000, purchaseOrderItemId: 'oi1' },
        ],
      },
      'ISSUED'
    );

    expect(doc.matchStatus).toBe('MATCHED');
  });
});
