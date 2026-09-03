import { prisma } from '@/lib/prisma';
import type { Contact, GoodsReceipt, GoodsReceiptItem, PurchaseOrder, Warehouse } from '@prisma/client';
import { applyStockIn, applyStockOut } from '@/modules/inventory/services/stock.service';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import type { GoodsReceiptCreateInput } from '../schema';

export type GoodsReceiptWithItems = GoodsReceipt & { items: GoodsReceiptItem[] };
export type GoodsReceiptWithRelations = GoodsReceiptWithItems & {
  order: PurchaseOrder & { contact: Contact };
  warehouse: Warehouse;
};

/** Tolerancia para comparar cantidades `Float` acumuladas por sucesivas recepciones/facturas parciales — nunca igualdad estricta. */
export const QUANTITY_EPSILON = 0.0001;

export async function createGoodsReceipt(
  companyId: string,
  input: GoodsReceiptCreateInput
): Promise<GoodsReceiptWithItems> {
  return prisma.$transaction(async (tx) => {
    // Lock sobre la OC: sin esto, dos recepciones concurrentes contra la
    // misma orden podrían ambas leer el mismo `receivedQuantity` "antes" y
    // sobre-recibir más de lo pactado.
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${input.orderId} AND "companyId" = ${companyId} FOR UPDATE`;

    const order = await tx.purchaseOrder.findFirst({ where: { id: input.orderId, companyId }, include: { items: true } });
    if (!order) throw new Error('Orden de compra no encontrada');
    if (order.status === 'DRAFT') throw new Error('Envíe la orden de compra antes de registrar una recepción');
    if (order.status === 'CANCELLED' || order.status === 'CLOSED') throw new Error('Esta orden está cerrada o anulada');

    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId } });
    if (!warehouse) throw new Error('Bodega no encontrada');

    const itemsById = new Map(order.items.map((item) => [item.id, item]));
    for (const line of input.items) {
      const orderItem = itemsById.get(line.orderItemId);
      if (!orderItem) throw new Error('Una de las líneas no pertenece a esta orden de compra');
      const remaining = orderItem.quantity - orderItem.receivedQuantity;
      if (line.quantity > remaining + QUANTITY_EPSILON) {
        throw new Error(
          `No se puede recibir ${line.quantity} de "${orderItem.description}": quedan ${remaining} unidades pendientes`
        );
      }
    }

    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'GOODS_RECEIPT' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'GOODS_RECEIPT', currentFolio: 1 },
    });

    const receipt = await tx.goodsReceipt.create({
      data: {
        companyId,
        orderId: input.orderId,
        warehouseId: input.warehouseId,
        folio: seq.currentFolio,
        notes: input.notes,
        items: {
          create: input.items.map((line) => {
            const orderItem = itemsById.get(line.orderItemId)!;
            return {
              companyId,
              orderItemId: line.orderItemId,
              productId: orderItem.productId,
              description: orderItem.description,
              quantity: line.quantity,
              // Copiado de la OC, no tecleado de nuevo: el matching de 3 vías
              // compara contra este mismo número más adelante.
              unitCost: orderItem.unitCost,
            };
          }),
        },
      },
      include: { items: true },
    });

    // Acá es donde realmente se mueve stock/PMP en el flujo de 3 vías — la
    // factura que llegue después y referencie esta OC ya no lo hará de nuevo.
    for (const line of receipt.items) {
      if (!line.productId) continue;
      const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
      if (!product) throw new Error(`Producto no encontrado: ${line.description}`);
      if (!product.isTrackable) continue;

      await applyStockIn(tx, companyId, {
        productId: line.productId,
        warehouseId: input.warehouseId,
        type: 'PURCHASE_IN',
        quantity: line.quantity,
        unitCost: line.unitCost,
        reference: `Recepción #${receipt.folio} (OC #${order.folio})`,
      });
    }

    for (const line of input.items) {
      await tx.purchaseOrderItem.updateMany({
        where: { id: line.orderItemId, companyId },
        data: { receivedQuantity: { increment: line.quantity } },
      });
    }

    const updatedItems = await tx.purchaseOrderItem.findMany({ where: { orderId: input.orderId } });
    const fullyReceived = updatedItems.every((item) => item.receivedQuantity >= item.quantity - QUANTITY_EPSILON);
    await tx.purchaseOrder.updateMany({
      where: { id: input.orderId, companyId },
      data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
    });

    return receipt;
  }, LOCKING_TX_OPTIONS);
}

/**
 * Anula una recepción por error de digitación/conteo: revierte el stock/PMP
 * que aplicó y decrementa lo recibido en la OC. Bloqueada si alguna de sus
 * líneas ya fue facturada (`invoicedQuantity > 0`) — revertir stock que una
 * factura ya validó dejaría el matching de 3 vías comparando contra un
 * "recibido" que ya no existe.
 */
export async function cancelGoodsReceipt(companyId: string, id: string): Promise<GoodsReceipt> {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.goodsReceipt.findFirst({
      where: { id, companyId },
      include: { items: { include: { orderItem: true } } },
    });
    if (!receipt) throw new Error('Recepción no encontrada');
    if (receipt.status === 'CANCELLED') throw new Error('Esta recepción ya está anulada');

    const alreadyInvoiced = receipt.items.some((line) => line.orderItem.invoicedQuantity > 0);
    if (alreadyInvoiced) {
      throw new Error('No se puede anular: uno o más productos de esta recepción ya fueron facturados');
    }

    for (const line of receipt.items) {
      if (line.productId) {
        const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
        if (product?.isTrackable) {
          await applyStockOut(tx, companyId, {
            productId: line.productId,
            warehouseId: receipt.warehouseId,
            type: 'ADJUSTMENT_OUT',
            quantity: line.quantity,
            reference: `Anulación Recepción #${receipt.folio}`,
            notes: 'Recepción de mercadería anulada',
          });
        }
      }
      await tx.purchaseOrderItem.updateMany({
        where: { id: line.orderItemId, companyId },
        data: { receivedQuantity: { decrement: line.quantity } },
      });
    }

    await tx.goodsReceipt.updateMany({ where: { id, companyId }, data: { status: 'CANCELLED' } });

    // El estado de la OC puede haber bajado de RECEIVED a PARTIALLY_RECEIVED
    // (o a SENT si quedó en cero recibido) tras revertir.
    const updatedItems = await tx.purchaseOrderItem.findMany({ where: { orderId: receipt.orderId } });
    const anyReceived = updatedItems.some((item) => item.receivedQuantity > QUANTITY_EPSILON);
    const fullyReceived = updatedItems.every((item) => item.receivedQuantity >= item.quantity - QUANTITY_EPSILON);
    await tx.purchaseOrder.updateMany({
      where: { id: receipt.orderId, companyId, status: { notIn: ['CANCELLED', 'CLOSED'] } },
      data: { status: fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : 'SENT' },
    });

    return tx.goodsReceipt.findFirstOrThrow({ where: { id, companyId } });
  }, LOCKING_TX_OPTIONS);
}

export async function listGoodsReceipts(companyId: string, orderId?: string): Promise<GoodsReceiptWithRelations[]> {
  return prisma.goodsReceipt.findMany({
    where: { companyId, orderId },
    include: { order: { include: { contact: true } }, warehouse: true, items: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function getGoodsReceipt(companyId: string, id: string): Promise<GoodsReceiptWithRelations | null> {
  return prisma.goodsReceipt.findFirst({
    where: { id, companyId },
    include: { order: { include: { contact: true } }, warehouse: true, items: true },
  });
}
