import type { Prisma, PurchaseRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { compareQuotes, groupAward, type Comparison, type ComparisonQuote } from '@/lib/purchases/quote-comparison';
import type { PurchaseRequestInput, SupplierQuoteInput } from '../schema';
import { insertPurchaseOrder } from './purchase-order.service';

/**
 * Solicitudes de compra → cotizaciones → órdenes de compra.
 *
 * Flujo: alguien pide (DRAFT → SUBMITTED), jefatura aprueba o rechaza,
 * compras carga las cotizaciones de cada proveedor, el comparativo propone el
 * mejor precio por ítem y "Generar OC" crea una orden por proveedor
 * adjudicado, todas en una sola transacción.
 */

export class PurchaseRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseRequestError';
  }
}

type Tx = Prisma.TransactionClient;

function day(value: string | undefined): Date | null {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

async function lockRequest(tx: Tx, companyId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const request = await tx.purchaseRequest.findFirst({ where: { id, companyId } });
  if (!request) throw new PurchaseRequestError('Solicitud no encontrada');
  return request;
}

async function buildItems(tx: Tx, companyId: string, items: PurchaseRequestInput['items']) {
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id))));
  const products = productIds.length
    ? await tx.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true, costPricePMP: true, unit: true } })
    : [];
  if (products.length !== productIds.length) throw new PurchaseRequestError('Uno de los productos no existe en tu catálogo');
  const byId = new Map(products.map((product) => [product.id, product]));
  return items.map((item, position) => {
    const product = item.productId ? byId.get(item.productId) : undefined;
    return {
      companyId,
      productId: item.productId ?? null,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit || product?.unit || null,
      // Referencia para quien aprueba: el costo promedio vigente del producto.
      estimatedUnitCost: product && product.costPricePMP > 0 ? Math.round(product.costPricePMP) : null,
      position,
    };
  });
}

export async function createPurchaseRequest(
  companyId: string,
  user: { id: string; name: string },
  input: PurchaseRequestInput,
  submit: boolean
): Promise<{ id: string; folio: number }> {
  return prisma.$transaction(async (tx) => {
    const items = await buildItems(tx, companyId, input.items);
    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'PURCHASE_REQUEST' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'PURCHASE_REQUEST', currentFolio: 1 },
    });
    const request = await tx.purchaseRequest.create({
      data: {
        companyId,
        folio: seq.currentFolio,
        title: input.title,
        neededBy: day(input.neededBy),
        notes: input.notes || null,
        status: submit ? 'SUBMITTED' : 'DRAFT',
        requestedById: user.id,
        requestedByName: user.name,
        items: { create: items },
      },
      select: { id: true, folio: true },
    });
    return request;
  }, LOCKING_TX_OPTIONS);
}

/** Editar solo mientras es borrador o fue rechazada (vuelve a borrador). */
export async function updatePurchaseRequest(companyId: string, userId: string, id: string, input: PurchaseRequestInput, canManageAll: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, companyId, id);
    if (!canManageAll && request.requestedById !== userId) throw new PurchaseRequestError('Solo quien creó la solicitud puede editarla');
    if (request.status !== 'DRAFT' && request.status !== 'REJECTED') {
      throw new PurchaseRequestError('Solo se edita una solicitud en borrador o rechazada');
    }
    const items = await buildItems(tx, companyId, input.items);
    await tx.purchaseRequestItem.deleteMany({ where: { companyId, requestId: id } });
    await tx.purchaseRequestItem.createMany({ data: items.map((item) => ({ ...item, requestId: id })) });
    await tx.purchaseRequest.updateMany({
      where: { id, companyId },
      data: { title: input.title, neededBy: day(input.neededBy), notes: input.notes || null, status: 'DRAFT', rejectionReason: null },
    });
  }, LOCKING_TX_OPTIONS);
}

export async function submitPurchaseRequest(companyId: string, userId: string, id: string, canManageAll: boolean): Promise<void> {
  const request = await prisma.purchaseRequest.findFirst({ where: { id, companyId }, select: { requestedById: true, status: true } });
  if (!request) throw new PurchaseRequestError('Solicitud no encontrada');
  if (!canManageAll && request.requestedById !== userId) throw new PurchaseRequestError('Solo quien creó la solicitud puede enviarla');
  const { count } = await prisma.purchaseRequest.updateMany({
    where: { id, companyId, status: { in: ['DRAFT', 'REJECTED'] } },
    data: { status: 'SUBMITTED', rejectionReason: null },
  });
  if (count === 0) throw new PurchaseRequestError('La solicitud ya fue enviada');
}

export async function decidePurchaseRequest(
  companyId: string,
  user: { id: string; name: string; isOwner: boolean },
  id: string,
  approve: boolean,
  reason?: string
): Promise<void> {
  const request = await prisma.purchaseRequest.findFirst({ where: { id, companyId }, select: { requestedById: true } });
  if (!request) throw new PurchaseRequestError('Solicitud no encontrada');
  // Mismo criterio que la rendición de gastos: nadie aprueba lo que pidió,
  // salvo el dueño (en una empresa de una persona no hay a quién más pedirle).
  if (request.requestedById === user.id && !user.isOwner) throw new PurchaseRequestError('No puedes aprobar tu propia solicitud');
  if (!approve && !reason?.trim()) throw new PurchaseRequestError('Indica el motivo del rechazo');
  const { count } = await prisma.purchaseRequest.updateMany({
    where: { id, companyId, status: 'SUBMITTED' },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      decidedById: user.id,
      decidedByName: user.name,
      decidedAt: new Date(),
      rejectionReason: approve ? null : reason?.trim(),
    },
  });
  if (count === 0) throw new PurchaseRequestError('La solicitud no está pendiente de aprobación');
}

export async function cancelPurchaseRequest(companyId: string, userId: string, id: string, canManageAll: boolean): Promise<void> {
  const request = await prisma.purchaseRequest.findFirst({ where: { id, companyId }, select: { requestedById: true } });
  if (!request) throw new PurchaseRequestError('Solicitud no encontrada');
  if (!canManageAll && request.requestedById !== userId) throw new PurchaseRequestError('Solo quien creó la solicitud puede anularla');
  const { count } = await prisma.purchaseRequest.updateMany({
    where: { id, companyId, status: { notIn: ['ORDERED', 'CANCELLED'] } },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) throw new PurchaseRequestError('Una solicitud con órdenes de compra no se anula: anula las OC');
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export interface PurchaseRequestRow {
  id: string;
  folio: number;
  title: string;
  status: PurchaseRequestStatus;
  neededBy: Date | null;
  requestedByName: string | null;
  createdAt: Date;
  itemCount: number;
  quoteCount: number;
  estimatedTotal: number | null;
  orderFolios: number[];
}

export async function listPurchaseRequests(
  companyId: string,
  options: { status?: PurchaseRequestStatus | 'OPEN' | 'ALL'; onlyUserId?: string } = {}
): Promise<PurchaseRequestRow[]> {
  const where: Prisma.PurchaseRequestWhereInput = { companyId };
  if (options.onlyUserId) where.requestedById = options.onlyUserId;
  if (options.status === 'OPEN') where.status = { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] };
  else if (options.status && options.status !== 'ALL') where.status = options.status;

  const rows = await prisma.purchaseRequest.findMany({
    where,
    orderBy: { folio: 'desc' },
    take: 200,
    select: {
      id: true,
      folio: true,
      title: true,
      status: true,
      neededBy: true,
      requestedByName: true,
      createdAt: true,
      items: { select: { quantity: true, estimatedUnitCost: true } },
      _count: { select: { quotes: true } },
      purchaseOrders: { select: { folio: true }, orderBy: { folio: 'asc' } },
    },
  });
  return rows.map((row) => {
    const estimated = row.items.every((item) => item.estimatedUnitCost !== null)
      ? row.items.reduce((sum, item) => sum + Math.round(item.quantity * (item.estimatedUnitCost ?? 0)), 0)
      : null;
    return {
      id: row.id,
      folio: row.folio,
      title: row.title,
      status: row.status,
      neededBy: row.neededBy,
      requestedByName: row.requestedByName,
      createdAt: row.createdAt,
      itemCount: row.items.length,
      quoteCount: row._count.quotes,
      estimatedTotal: estimated,
      orderFolios: row.purchaseOrders.map((order) => order.folio),
    };
  });
}

export interface PurchaseRequestDetail {
  id: string;
  folio: number;
  title: string;
  status: PurchaseRequestStatus;
  neededBy: Date | null;
  notes: string | null;
  requestedById: string | null;
  requestedByName: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  items: { id: string; productId: string | null; productSku: string | null; description: string; quantity: number; unit: string | null; estimatedUnitCost: number | null }[];
  quotes: {
    id: string;
    contactId: string;
    supplierName: string;
    supplierRut: string;
    quoteNumber: string | null;
    validUntil: Date | null;
    leadTimeDays: number | null;
    paymentTerms: string | null;
    notes: string | null;
    prices: Record<string, number>;
  }[];
  orders: { id: string; folio: number; status: string; supplierName: string; total: number }[];
  comparison: Comparison;
}

export async function getPurchaseRequest(companyId: string, id: string): Promise<PurchaseRequestDetail | null> {
  const request = await prisma.purchaseRequest.findFirst({
    where: { id, companyId },
    include: {
      items: { orderBy: { position: 'asc' }, include: { product: { select: { sku: true } } } },
      quotes: { orderBy: { createdAt: 'asc' }, include: { contact: { select: { razonSocial: true, rut: true } }, lines: true } },
      purchaseOrders: { orderBy: { folio: 'asc' }, include: { contact: { select: { razonSocial: true } }, items: { select: { quantity: true, unitCost: true } } } },
    },
  });
  if (!request) return null;

  const quotes = request.quotes.map((quote) => ({
    id: quote.id,
    contactId: quote.contactId,
    supplierName: quote.contact.razonSocial,
    supplierRut: quote.contact.rut,
    quoteNumber: quote.quoteNumber,
    validUntil: quote.validUntil,
    leadTimeDays: quote.leadTimeDays,
    paymentTerms: quote.paymentTerms,
    notes: quote.notes,
    prices: Object.fromEntries(quote.lines.map((line) => [line.requestItemId, line.unitCost])),
  }));
  const items = request.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productSku: item.product?.sku ?? null,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    estimatedUnitCost: item.estimatedUnitCost,
  }));

  return {
    id: request.id,
    folio: request.folio,
    title: request.title,
    status: request.status,
    neededBy: request.neededBy,
    notes: request.notes,
    requestedById: request.requestedById,
    requestedByName: request.requestedByName,
    decidedByName: request.decidedByName,
    decidedAt: request.decidedAt,
    rejectionReason: request.rejectionReason,
    createdAt: request.createdAt,
    items,
    quotes,
    orders: request.purchaseOrders.map((order) => ({
      id: order.id,
      folio: order.folio,
      status: order.status,
      supplierName: order.contact.razonSocial,
      total: order.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCost), 0),
    })),
    comparison: compareQuotes(
      items.map((item) => ({ id: item.id, description: item.description, quantity: item.quantity })),
      quotes.map((quote): ComparisonQuote => ({ id: quote.id, contactId: quote.contactId, supplierName: quote.supplierName, leadTimeDays: quote.leadTimeDays, prices: quote.prices }))
    ),
  };
}

// ─── Cotizaciones ────────────────────────────────────────────────────────────

export async function saveSupplierQuote(companyId: string, requestId: string, input: SupplierQuoteInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, companyId, requestId);
    if (request.status !== 'SUBMITTED' && request.status !== 'APPROVED') {
      throw new PurchaseRequestError('Se cotiza una solicitud enviada o aprobada, antes de generar sus OC');
    }
    const supplier = await tx.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true, isSupplier: true } });
    if (!supplier) throw new PurchaseRequestError('Proveedor no encontrado');
    if (!supplier.isSupplier) throw new PurchaseRequestError('El contacto no está marcado como proveedor');

    const itemIds = new Set((await tx.purchaseRequestItem.findMany({ where: { companyId, requestId }, select: { id: true } })).map((item) => item.id));
    const lines = input.lines.filter((line) => itemIds.has(line.requestItemId));
    if (lines.length !== input.lines.length) throw new PurchaseRequestError('La cotización trae ítems que no son de esta solicitud');

    const data = {
      quoteNumber: input.quoteNumber || null,
      validUntil: day(input.validUntil),
      leadTimeDays: input.leadTimeDays ?? null,
      paymentTerms: input.paymentTerms || null,
      notes: input.notes || null,
    };
    const existing = await tx.supplierQuote.findFirst({ where: { companyId, requestId, contactId: input.contactId }, select: { id: true } });
    let quoteId: string;
    if (existing) {
      quoteId = existing.id;
      await tx.supplierQuote.updateMany({ where: { id: quoteId, companyId }, data });
      await tx.supplierQuoteLine.deleteMany({ where: { companyId, quoteId } });
    } else {
      quoteId = (await tx.supplierQuote.create({ data: { companyId, requestId, contactId: input.contactId, ...data }, select: { id: true } })).id;
    }
    await tx.supplierQuoteLine.createMany({ data: lines.map((line) => ({ companyId, quoteId, requestItemId: line.requestItemId, unitCost: line.unitCost })) });
    return { id: quoteId };
  }, LOCKING_TX_OPTIONS);
}

export async function deleteSupplierQuote(companyId: string, requestId: string, quoteId: string): Promise<void> {
  const request = await prisma.purchaseRequest.findFirst({ where: { id: requestId, companyId }, select: { status: true } });
  if (!request) throw new PurchaseRequestError('Solicitud no encontrada');
  if (request.status === 'ORDERED') throw new PurchaseRequestError('La solicitud ya generó sus órdenes de compra');
  const { count } = await prisma.supplierQuote.deleteMany({ where: { id: quoteId, requestId, companyId } });
  if (count === 0) throw new PurchaseRequestError('Cotización no encontrada');
}

/**
 * Genera una OC por proveedor adjudicado. `award` asigna cada ítem a la
 * cotización elegida; los ítems no adjudicados quedan fuera (no se compran).
 */
export async function generatePurchaseOrders(
  companyId: string,
  requestId: string,
  award: Record<string, string>,
  expectedDate?: string
): Promise<{ orders: { id: string; folio: number }[] }> {
  return prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, companyId, requestId);
    if (request.status !== 'APPROVED') {
      throw new PurchaseRequestError(request.status === 'ORDERED' ? 'Esta solicitud ya generó sus órdenes de compra' : 'La solicitud debe estar aprobada para generar órdenes de compra');
    }
    const [items, quotes] = await Promise.all([
      tx.purchaseRequestItem.findMany({ where: { companyId, requestId } }),
      tx.supplierQuote.findMany({ where: { companyId, requestId }, include: { lines: true, contact: { select: { razonSocial: true } } } }),
    ]);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    for (const itemId of Object.keys(award)) {
      if (!itemsById.has(itemId)) throw new PurchaseRequestError('La adjudicación incluye un ítem que no es de esta solicitud');
    }
    let groups;
    try {
      groups = groupAward(
        award,
        quotes.map((quote) => ({
          id: quote.id,
          contactId: quote.contactId,
          supplierName: quote.contact.razonSocial,
          leadTimeDays: quote.leadTimeDays,
          prices: Object.fromEntries(quote.lines.map((line) => [line.requestItemId, line.unitCost])),
        }))
      );
    } catch (error) {
      throw new PurchaseRequestError(error instanceof Error ? error.message : 'Adjudicación inválida');
    }

    const orders: { id: string; folio: number }[] = [];
    for (const group of groups) {
      const quote = quotes.find((candidate) => candidate.id === group.quoteId);
      const order = await insertPurchaseOrder(
        tx,
        companyId,
        {
          contactId: group.contactId,
          expectedDate: expectedDate || undefined,
          notes: `Solicitud de compra N° ${request.folio}: ${request.title}${quote?.quoteNumber ? ` · Cotización ${quote.quoteNumber}` : ''}`,
          items: group.items.map((line) => {
            const item = itemsById.get(line.requestItemId)!;
            return { productId: item.productId ?? undefined, description: item.description, quantity: item.quantity, unitCost: line.unitCost };
          }),
        },
        { purchaseRequestId: requestId }
      );
      orders.push({ id: order.id, folio: order.folio });
    }
    await tx.purchaseRequest.updateMany({ where: { id: requestId, companyId }, data: { status: 'ORDERED' } });
    return { orders };
  }, LOCKING_TX_OPTIONS);
}
