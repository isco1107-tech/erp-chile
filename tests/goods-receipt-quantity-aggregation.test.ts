import { prisma } from '@/lib/prisma';

/**
 * N-05 (auditoría 2026-09-14): una recepción de mercadería con dos líneas
 * que apuntan al mismo ítem de la Orden de Compra debe sumar sus cantidades
 * antes de validar contra el saldo pendiente. Antes cada línea se validaba
 * por separado contra el mismo saldo leído de la OC, así que dos líneas de
 * 50 c/u contra un saldo de 80 pasaban ambas el chequeo individual y
 * sobre-recibían la orden.
 */

jest.mock('@/modules/inventory/services/stock.service', () => ({
  applyStockIn: jest.fn(),
  applyStockOut: jest.fn(),
}));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { createGoodsReceipt } from '@/modules/purchases/services/goods-receipt.service';

const orderItem = {
  id: 'oi1',
  orderId: 'po1',
  productId: 'p1',
  description: 'Tela',
  unitCost: 1000,
  quantity: 80,
  receivedQuantity: 0,
};

const order = {
  id: 'po1',
  companyId: 'c1',
  folio: 5,
  status: 'SENT',
  items: [orderItem],
};

type FakeTx = {
  $queryRaw: jest.Mock;
  purchaseOrder: { findFirst: jest.Mock; updateMany: jest.Mock };
  warehouse: { findFirst: jest.Mock };
  goodsReceipt: { create: jest.Mock };
  product: { findFirst: jest.Mock };
  purchaseOrderItem: { updateMany: jest.Mock; findMany: jest.Mock };
  internalDocumentSequence: { upsert: jest.Mock };
};

function useFakeTransaction(): FakeTx {
  const tx: FakeTx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    purchaseOrder: { findFirst: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    goodsReceipt: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'gr1', folio: 1, orderId: data.orderId, warehouseId: data.warehouseId, items: data.items.create })
      ),
    },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', isTrackable: true }) },
    purchaseOrderItem: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ ...orderItem, receivedQuantity: 80 }]),
    },
    internalDocumentSequence: { upsert: jest.fn().mockResolvedValue({ currentFolio: 1 }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: FakeTx) => unknown) => callback(tx)) as never);
  return tx;
}

afterEach(() => jest.restoreAllMocks());

describe('Agregación de cantidades por ítem de OC en recepciones (N-05)', () => {
  it('rechaza dos líneas del mismo ítem que en conjunto exceden lo pendiente', async () => {
    useFakeTransaction();

    // Saldo disponible: 80. Dos líneas de 50 c/u = 100, exceden el saldo
    // aunque cada línea individual (50 < 80) pasara el chequeo viejo.
    await expect(
      createGoodsReceipt('c1', {
        orderId: 'po1',
        warehouseId: 'w1',
        items: [
          { orderItemId: 'oi1', quantity: 50 },
          { orderItemId: 'oi1', quantity: 50 },
        ],
      })
    ).rejects.toThrow('100');
  });

  it('acepta dos líneas del mismo ítem cuyo total no excede lo pendiente', async () => {
    const tx = useFakeTransaction();

    const receipt = await createGoodsReceipt('c1', {
      orderId: 'po1',
      warehouseId: 'w1',
      items: [
        { orderItemId: 'oi1', quantity: 30 },
        { orderItemId: 'oi1', quantity: 50 },
      ],
    });

    expect(receipt.id).toBe('gr1');
    expect(tx.purchaseOrderItem.updateMany).toHaveBeenCalledTimes(2);
  });
});
