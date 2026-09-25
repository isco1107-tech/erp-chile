import { prisma } from '@/lib/prisma';
import type { Contact, Prisma, PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import type { PurchaseOrderCreateInput } from '../schema';

export type PurchaseOrderWithItems = PurchaseOrder & { items: PurchaseOrderItem[] };
export type PurchaseOrderWithRelations = PurchaseOrderWithItems & { contact: Contact };
export type PurchaseOrderListItem = PurchaseOrder & { contact: Contact; _count: { items: number } };

/**
 * Inserta la OC dentro de una transacción ya abierta. Existe aparte de
 * `createPurchaseOrder` para que el comparativo de cotizaciones pueda generar
 * varias OC (una por proveedor adjudicado) en una sola transacción: o salen
 * todas, o ninguna.
 */
export async function insertPurchaseOrder(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: PurchaseOrderCreateInput,
  options: { purchaseRequestId?: string } = {}
): Promise<PurchaseOrderWithItems> {
  const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId } });
  if (!contact) throw new Error('Proveedor no encontrado');

  const productIds = input.items.map((item) => item.productId).filter((id): id is string => Boolean(id));
  if (productIds.length > 0) {
    const found = await tx.product.count({ where: { id: { in: productIds }, companyId } });
    if (found !== new Set(productIds).size) throw new Error('Uno o más productos no pertenecen a esta empresa');
  }

  // Mismo patrón que FolioSequence: una fila por contador, incrementada
  // atómicamente — el valor nuevo ES el folio asignado.
  const seq = await tx.internalDocumentSequence.upsert({
    where: { companyId_kind: { companyId, kind: 'PURCHASE_ORDER' } },
    update: { currentFolio: { increment: 1 } },
    create: { companyId, kind: 'PURCHASE_ORDER', currentFolio: 1 },
  });

  return tx.purchaseOrder.create({
    data: {
      companyId,
      contactId: input.contactId,
      folio: seq.currentFolio,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      notes: input.notes,
      purchaseRequestId: options.purchaseRequestId,
      items: {
        create: input.items.map((item) => ({
          companyId,
          productId: item.productId || undefined,
          description: item.description,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
      },
    },
    include: { items: true },
  });
}

export async function createPurchaseOrder(
  companyId: string,
  input: PurchaseOrderCreateInput
): Promise<PurchaseOrderWithItems> {
  return prisma.$transaction((tx) => insertPurchaseOrder(tx, companyId, input), LOCKING_TX_OPTIONS);
}

/** Enviar es solo una bandera informativa (proveedor notificado) — recién desde `SENT` se pueden registrar recepciones. */
export async function sendPurchaseOrder(companyId: string, id: string): Promise<PurchaseOrder> {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, companyId } });
  if (!order) throw new Error('Orden de compra no encontrada');
  if (order.status !== 'DRAFT') throw new Error('Solo se puede enviar una orden en borrador');

  const result = await prisma.purchaseOrder.updateMany({ where: { id, companyId, status: 'DRAFT' }, data: { status: 'SENT' } });
  if (result.count === 0) throw new Error('No se pudo enviar la orden');
  return prisma.purchaseOrder.findFirstOrThrow({ where: { id, companyId } });
}

export async function cancelPurchaseOrder(companyId: string, id: string): Promise<PurchaseOrder> {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, companyId }, include: { items: true } });
  if (!order) throw new Error('Orden de compra no encontrada');
  if (order.status === 'CANCELLED' || order.status === 'CLOSED') throw new Error('Esta orden ya está cerrada o anulada');
  if (order.items.some((item) => item.receivedQuantity > 0)) {
    throw new Error('No se puede anular: ya tiene mercadería recibida contra esta orden');
  }

  const result = await prisma.purchaseOrder.updateMany({
    where: { id, companyId, status: { notIn: ['CANCELLED', 'CLOSED'] } },
    data: { status: 'CANCELLED' },
  });
  if (result.count === 0) throw new Error('No se pudo anular la orden');
  return prisma.purchaseOrder.findFirstOrThrow({ where: { id, companyId } });
}

export async function listPurchaseOrders(
  companyId: string,
  options?: { status?: PurchaseOrderStatus; query?: string }
): Promise<PurchaseOrderListItem[]> {
  const where: Prisma.PurchaseOrderWhereInput = { companyId };
  if (options?.status) where.status = options.status;
  const trimmed = options?.query?.trim();
  if (trimmed) {
    where.contact = {
      OR: [
        { razonSocial: { contains: trimmed, mode: 'insensitive' } },
        { rut: { contains: trimmed, mode: 'insensitive' } },
      ],
    };
  }
  return prisma.purchaseOrder.findMany({
    where,
    include: { contact: true, _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function getPurchaseOrder(companyId: string, id: string): Promise<PurchaseOrderWithRelations | null> {
  return prisma.purchaseOrder.findFirst({ where: { id, companyId }, include: { items: true, contact: true } });
}

/** Órdenes disponibles para registrar una nueva recepción o para vincular una factura (no cerradas/anuladas). */
export async function listReceivableOrders(companyId: string): Promise<PurchaseOrderListItem[]> {
  return prisma.purchaseOrder.findMany({
    where: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } },
    include: { contact: true, _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
