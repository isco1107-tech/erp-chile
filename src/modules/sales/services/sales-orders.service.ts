import { prisma } from '@/lib/prisma';
import type { Contact, DteType, Prisma, SalesDocument, SalesOrder, SalesOrderItem, SalesOrderStatus, User, Warehouse } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { computeDocument } from '../calc';
import { applyDocumentToOrder, deriveOrderStatus, documentProgressEffect, ORDER_DOCUMENT_TYPES, reservedQuantity } from '../orders';
import type { SalesOrderCreateInput } from '../schema';

/**
 * Notas de venta (pedidos): se crean desde cero o desde una cotización,
 * reservan stock mientras están abiertas y se facturan o despachan por
 * partes. La contabilidad y el Kardex NO se tocan acá: los mueve el
 * documento tributario que se emite desde la nota (`createSalesDocument`),
 * que llama a `applyOrderProgress` dentro de su propia transacción.
 */

export type SalesOrderListItem = SalesOrder & {
  contact: Pick<Contact, 'id' | 'rut' | 'razonSocial' | 'nombreFantasia'>;
  seller: Pick<User, 'id' | 'name'> | null;
  items: Pick<SalesOrderItem, 'quantity' | 'quantityInvoiced' | 'quantityDispatched' | 'unitPrice'>[];
};

export type SalesOrderDetail = SalesOrder & {
  contact: Contact;
  warehouse: Warehouse;
  seller: Pick<User, 'id' | 'name' | 'email'> | null;
  quote: Pick<SalesDocument, 'id' | 'folio' | 'issueDate'> | null;
  items: SalesOrderItem[];
  salesDocuments: Pick<SalesDocument, 'id' | 'dteType' | 'folio' | 'status' | 'totalAmount' | 'issueDate'>[];
};

const OPEN_STATUSES: SalesOrderStatus[] = ['PENDING', 'IN_PROGRESS'];

/** Un vendedor debe pertenecer a la empresa (usuario propio o miembro). */
export async function assertSellerInCompany(db: Prisma.TransactionClient | typeof prisma, companyId: string, sellerId: string): Promise<void> {
  const seller = await db.user.findFirst({
    where: { id: sellerId, OR: [{ companyId }, { companyMemberships: { some: { companyId } } }] },
    select: { id: true },
  });
  if (!seller) throw new Error('El vendedor no pertenece a esta empresa');
}

export async function createSalesOrder(companyId: string, userId: string, input: SalesOrderCreateInput): Promise<SalesOrder> {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId } });
    if (!contact) throw new Error('Cliente no encontrado');
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } });
    if (!warehouse) throw new Error('Bodega no encontrada');

    const sellerId = input.sellerId ?? userId;
    await assertSellerInCompany(tx, companyId, sellerId);

    if (input.quoteId) {
      const quote = await tx.salesDocument.findFirst({ where: { id: input.quoteId, companyId, dteType: 'COTIZACION' }, select: { contactId: true } });
      if (!quote) throw new Error('Cotización no encontrada');
      if (quote.contactId !== input.contactId) throw new Error('La cotización es de otro cliente');
    }

    // La exención sale del catálogo, nunca del formulario (CLAUDE.md §3).
    const productIds = input.items.map((item) => item.productId).filter((id): id is string => Boolean(id));
    const products = productIds.length
      ? await tx.product.findMany({ where: { id: { in: productIds }, companyId }, select: { id: true, isExempt: true } })
      : [];
    if (products.length !== new Set(productIds).size) throw new Error('Uno o más productos no pertenecen a esta empresa');
    const exemptById = new Map(products.map((product) => [product.id, product.isExempt]));

    const lines = input.items.map((item) => ({
      ...item,
      isExempt: item.productId ? (exemptById.get(item.productId) ?? false) : (item.isExempt ?? false),
    }));
    const { items: computed, totals } = computeDocument(lines);

    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'SALES_ORDER' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'SALES_ORDER', currentFolio: 1 },
    });

    return tx.salesOrder.create({
      data: {
        companyId,
        folio: seq.currentFolio,
        contactId: input.contactId,
        warehouseId: input.warehouseId,
        sellerId,
        quoteId: input.quoteId,
        priceListId: contact.priceListId,
        paymentMethod: input.paymentMethod,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
        notes: input.notes,
        netAmount: totals.netAmount,
        exemptAmount: totals.exemptAmount,
        ivaAmount: totals.ivaAmount,
        totalAmount: totals.totalAmount,
        items: {
          create: computed.map((item) => ({
            companyId,
            productId: item.productId || undefined,
            sku: item.sku,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent ?? 0,
            isExempt: item.isExempt ?? false,
            subtotal: item.subtotal,
          })),
        },
      },
    });
  }, LOCKING_TX_OPTIONS);
}

export async function listSalesOrders(companyId: string, filters: { status?: SalesOrderStatus | 'OPEN'; query?: string } = {}): Promise<SalesOrderListItem[]> {
  const query = filters.query?.trim();
  return prisma.salesOrder.findMany({
    where: {
      companyId,
      ...(filters.status === 'OPEN' ? { status: { in: OPEN_STATUSES } } : filters.status ? { status: filters.status } : {}),
      ...(query
        ? {
            OR: [
              { contact: { razonSocial: { contains: query, mode: 'insensitive' } } },
              { contact: { nombreFantasia: { contains: query, mode: 'insensitive' } } },
              { contact: { rut: { contains: query } } },
              ...(/^\d+$/.test(query) ? [{ folio: Number(query) }] : []),
            ],
          }
        : {}),
    },
    include: {
      contact: { select: { id: true, rut: true, razonSocial: true, nombreFantasia: true } },
      seller: { select: { id: true, name: true } },
      items: { select: { quantity: true, quantityInvoiced: true, quantityDispatched: true, unitPrice: true } },
    },
    orderBy: { folio: 'desc' },
    take: 500,
  });
}

export async function getSalesOrder(companyId: string, id: string): Promise<SalesOrderDetail | null> {
  return prisma.salesOrder.findFirst({
    where: { id, companyId },
    include: {
      contact: true,
      warehouse: true,
      seller: { select: { id: true, name: true, email: true } },
      quote: { select: { id: true, folio: true, issueDate: true } },
      items: { orderBy: { id: 'asc' } },
      salesDocuments: {
        select: { id: true, dteType: true, folio: true, status: true, totalAmount: true, issueDate: true },
        orderBy: { issueDate: 'asc' },
      },
    },
  });
}

/**
 * Cierra una nota: si no tiene avance queda anulada; si ya se facturó o
 * despachó una parte, queda concluida con el saldo cerrado (y deja de
 * reservar stock). El motivo queda registrado en `cancelReason`.
 */
export async function closeSalesOrder(companyId: string, id: string, reason: string): Promise<SalesOrder> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const order = await tx.salesOrder.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!order) throw new Error('Nota de venta no encontrada');
    if (!OPEN_STATUSES.includes(order.status)) throw new Error('La nota de venta ya está cerrada');
    const hasProgress = order.items.some((item) => item.quantityInvoiced > 0 || item.quantityDispatched > 0);
    const updated = await tx.salesOrder.updateMany({
      where: { id, companyId },
      data: { status: hasProgress ? 'COMPLETED' : 'CANCELLED', cancelReason: reason },
    });
    if (updated.count === 0) throw new Error('No se pudo cerrar la nota de venta');
    return tx.salesOrder.findFirstOrThrow({ where: { id, companyId } });
  }, LOCKING_TX_OPTIONS);
}

/**
 * Aplica (o revierte, con `sign = -1`) el avance de un documento sobre su nota
 * de venta. Corre DENTRO de la transacción del documento: si el documento
 * falla, el avance vuelve atrás con él. Lock explícito sobre la nota para que
 * dos facturas simultáneas no facturen dos veces el mismo saldo.
 */
export async function applyOrderProgress(
  tx: Prisma.TransactionClient,
  companyId: string,
  params: {
    salesOrderId: string;
    contactId: string;
    dteType: DteType;
    formalizesIssuedGuide: boolean;
    lines: { salesOrderItemId: string; quantity: number }[];
    sign: 1 | -1;
  }
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${params.salesOrderId} AND "companyId" = ${companyId} FOR UPDATE`;
  const order = await tx.salesOrder.findFirst({ where: { id: params.salesOrderId, companyId }, include: { items: true } });
  if (!order) throw new Error('Nota de venta no encontrada');
  if (params.sign === 1) {
    if (!OPEN_STATUSES.includes(order.status)) throw new Error(`La nota de venta #${order.folio} ya está cerrada`);
    if (order.contactId !== params.contactId) throw new Error(`La nota de venta #${order.folio} es de otro cliente`);
    if (!ORDER_DOCUMENT_TYPES.includes(params.dteType)) throw new Error('Desde una nota de venta solo se emiten facturas, boletas o guías de despacho');
  }

  const effect = documentProgressEffect(params.dteType, params.formalizesIssuedGuide);
  const updates = applyDocumentToOrder(order.items, params.lines, effect, params.sign);
  for (const update of updates) {
    await tx.salesOrderItem.updateMany({
      where: { id: update.id, companyId, orderId: order.id },
      data: { quantityInvoiced: update.quantityInvoiced, quantityDispatched: update.quantityDispatched },
    });
  }

  // Una nota cerrada a mano (motivo registrado) no cambia de estado por el
  // avance de sus documentos; las demás derivan su estado de lo facturado.
  if (order.cancelReason === null) {
    const status = deriveOrderStatus(
      updates.map((update) => ({ ...update, quantity: order.items.find((item) => item.id === update.id)?.quantity ?? 0 })),
      order.status
    );
    if (status !== order.status) await tx.salesOrder.updateMany({ where: { id: order.id, companyId }, data: { status } });
  }
}

/**
 * Stock comprometido por notas abiertas, por producto (y por bodega si se
 * indica): lo que falta despachar.
 */
export async function getReservedStock(companyId: string, productIds: string[], warehouseId?: string): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const lines = await prisma.salesOrderItem.findMany({
    where: {
      companyId,
      productId: { in: productIds },
      order: { status: { in: OPEN_STATUSES }, ...(warehouseId ? { warehouseId } : {}) },
    },
    select: { productId: true, quantity: true, quantityDispatched: true },
  });
  const byProduct = new Map<string, { quantity: number; quantityDispatched: number }[]>();
  for (const line of lines) {
    if (!line.productId) continue;
    const list = byProduct.get(line.productId) ?? [];
    list.push(line);
    byProduct.set(line.productId, list);
  }
  return new Map([...byProduct.entries()].map(([productId, list]) => [productId, reservedQuantity(list)]));
}

export interface SalesOrderSummary {
  open: number;
  pendingAmount: number;
  overdueDeliveries: number;
}

/** Indicadores de la pantalla de notas: abiertas, monto por facturar, entregas atrasadas. */
export async function getSalesOrderSummary(companyId: string, now = new Date()): Promise<SalesOrderSummary> {
  const open = await prisma.salesOrder.findMany({
    where: { companyId, status: { in: OPEN_STATUSES } },
    select: { deliveryDate: true, totalAmount: true, items: { select: { quantity: true, quantityInvoiced: true, unitPrice: true, discountPercent: true } } },
  });
  let pendingAmount = 0;
  let overdueDeliveries = 0;
  for (const order of open) {
    const lineTotal = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice * (1 - item.discountPercent / 100), 0);
    const pendingLines = order.items.reduce(
      (sum, item) => sum + Math.max(0, item.quantity - item.quantityInvoiced) * item.unitPrice * (1 - item.discountPercent / 100),
      0
    );
    // Proporción de la nota que falta facturar, aplicada al total con IVA.
    pendingAmount += lineTotal > 0 ? Math.round(order.totalAmount * (pendingLines / lineTotal)) : 0;
    if (order.deliveryDate && order.deliveryDate < now) overdueDeliveries += 1;
  }
  return { open: open.length, pendingAmount, overdueDeliveries };
}
