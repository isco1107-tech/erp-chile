import type { DteType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constraintInvolves } from '@/lib/prisma-errors';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { TAXABLE_SALES_DTE_TYPES } from '@/lib/chile/document-sign';
import { resolveCommissionBps, splitConsignmentSale, summarizeSettlementLines } from '@/lib/consignment/commission';
import { settlementPeriodBounds } from '@/lib/consignment/period';
import type { AssignProductInput, CreateProducerInput, UpdateProducerInput } from '../schema';

export class ConsignmentError extends Error {}

/**
 * Documentos que son una venta real y devengan para el productor: los tipos
 * tributables de ventas (`TAXABLE_SALES_DTE_TYPES`) sin las notas. Quedan fuera
 * la Guía de Despacho (la Factura que la formaliza es la que cuenta; si no,
 * se debería dos veces), la Cotización y los borradores. La Nota de Crédito no
 * devenga: reversa (ver `consignment-hook.service.ts`); la de Débito no se
 * trata aún. Modelo A1, criterio a validar por contador.
 */
export const CONSIGNMENT_SALE_DTE_TYPES: DteType[] = TAXABLE_SALES_DTE_TYPES.filter(
  (type) => type !== 'NOTA_CREDITO_61' && type !== 'NOTA_DEBITO_56'
);

export interface ProducerRow {
  id: string;
  contactId: string;
  contactName: string;
  contactRut: string;
  defaultCommissionBps: number;
  commissionBase: 'NET' | 'GROSS';
  isActive: boolean;
  notes: string | null;
  paymentNotes: string | null;
  productCount: number;
}

export async function listProducers(companyId: string): Promise<ProducerRow[]> {
  const rows = await prisma.producer.findMany({
    where: { companyId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      contactId: true,
      defaultCommissionBps: true,
      commissionBase: true,
      isActive: true,
      notes: true,
      paymentNotes: true,
      contact: { select: { razonSocial: true, rut: true } },
      _count: { select: { products: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    contactId: row.contactId,
    contactName: row.contact.razonSocial,
    contactRut: row.contact.rut,
    defaultCommissionBps: row.defaultCommissionBps,
    commissionBase: row.commissionBase,
    isActive: row.isActive,
    notes: row.notes,
    paymentNotes: row.paymentNotes,
    productCount: row._count.products,
  }));
}

export async function createProducer(companyId: string, input: CreateProducerInput): Promise<{ id: string }> {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
  if (!contact) throw new ConsignmentError('El contacto seleccionado no existe');
  try {
    return await prisma.producer.create({
      data: {
        companyId,
        contactId: input.contactId,
        defaultCommissionBps: input.defaultCommissionBps,
        commissionBase: input.commissionBase ?? 'NET',
        notes: input.notes || null,
        paymentNotes: input.paymentNotes || null,
      },
      select: { id: true },
    });
  } catch (error) {
    if (constraintInvolves(error, 'contactId')) throw new ConsignmentError('Ese contacto ya está registrado como productor');
    throw error;
  }
}

export async function updateProducer(companyId: string, producerId: string, input: UpdateProducerInput): Promise<void> {
  const data: Prisma.ProducerUpdateManyMutationInput = {};
  if (input.defaultCommissionBps !== undefined) data.defaultCommissionBps = input.defaultCommissionBps;
  if (input.commissionBase !== undefined) data.commissionBase = input.commissionBase;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.notes !== undefined) data.notes = input.notes || null;
  if (input.paymentNotes !== undefined) data.paymentNotes = input.paymentNotes || null;
  if (Object.keys(data).length === 0) return;
  const result = await prisma.producer.updateMany({ where: { id: producerId, companyId }, data });
  if (result.count === 0) throw new ConsignmentError('Productor no encontrado');
}

/**
 * Asigna un producto a un productor (consignación) o lo devuelve a stock
 * propio (`producerId: null`). La comisión propia del producto prima sobre la
 * del productor; al volver a stock propio se descarta.
 *
 * Cambiar entre OWN y CONSIGNMENT se rechaza si el producto tiene stock o PMP:
 * el stock propio tiene costo y valoración contable; el de consignación es de
 * un tercero y entra a costo 0. Mezclarlos corrompería el inventario valorizado.
 */
export async function assignProductToProducer(companyId: string, input: AssignProductInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${input.productId} AND "companyId" = ${companyId} FOR UPDATE`;
    const product = await tx.product.findFirst({
      where: { id: input.productId, companyId },
      select: { supplyMode: true, costPricePMP: true },
    });
    if (!product) throw new ConsignmentError('Producto no encontrado');

    if (input.producerId !== null) {
      const producer = await tx.producer.findFirst({ where: { id: input.producerId, companyId }, select: { isActive: true } });
      if (!producer) throw new ConsignmentError('Productor no encontrado');
      if (!producer.isActive) throw new ConsignmentError('El productor está inactivo; reactívalo para asignarle productos');
    }

    const targetMode = input.producerId === null ? 'OWN' : 'CONSIGNMENT';
    if (targetMode !== product.supplyMode) {
      const stock = await tx.stock.aggregate({ where: { companyId, productId: input.productId }, _sum: { quantity: true } });
      if ((stock._sum.quantity ?? 0) !== 0 || product.costPricePMP !== 0) {
        throw new ConsignmentError(
          'No se puede cambiar el tipo de abastecimiento de un producto con stock o costo promedio. Deja el stock en cero con un ajuste de inventario y vuelve a intentarlo.'
        );
      }
    }

    const result = await tx.product.updateMany({
      where: { id: input.productId, companyId },
      data:
        input.producerId === null
          ? { producerId: null, supplyMode: 'OWN', commissionBpsOverride: null }
          : { producerId: input.producerId, supplyMode: 'CONSIGNMENT', commissionBpsOverride: input.commissionBpsOverride ?? null },
    });
    if (result.count === 0) throw new ConsignmentError('Producto no encontrado');
  }, LOCKING_TX_OPTIONS);
}

export interface RecordedConsignment {
  /** Líneas nuevas creadas. */
  count: number;
  /** Suma con signo de lo devengado al productor por las líneas nuevas (CLP). */
  producerAmount: number;
}

/**
 * Registra, para un documento de venta EMITIDO, una línea de liquidación por
 * cada ítem de un producto en consignación. Idempotente: los ítems que ya
 * tienen su línea se omiten (y el unique `(salesDocumentItemId, kind)` es la
 * red de seguridad). Los montos quedan congelados con la comisión vigente.
 *
 * Se llama dentro de la misma transacción que emite el documento (vía
 * `applyConsignmentToIssuedDocument`).
 */
export async function recordConsignmentSales(tx: Prisma.TransactionClient, companyId: string, documentId: string): Promise<RecordedConsignment> {
  const none: RecordedConsignment = { count: 0, producerAmount: 0 };
  const document = await tx.salesDocument.findFirst({
    where: { id: documentId, companyId, status: 'ISSUED', dteType: { in: CONSIGNMENT_SALE_DTE_TYPES } },
    select: {
      issueDate: true,
      items: {
        where: { companyId, product: { is: { supplyMode: 'CONSIGNMENT', producerId: { not: null } } } },
        select: {
          id: true,
          productId: true,
          subtotal: true,
          iva: true,
          isExempt: true,
          product: {
            select: {
              producerId: true,
              commissionBpsOverride: true,
              producer: { select: { defaultCommissionBps: true, commissionBase: true } },
            },
          },
        },
      },
    },
  });
  if (!document || document.items.length === 0) return none;

  const existing = await tx.consignmentSettlementLine.findMany({
    where: { companyId, kind: 'SALE', salesDocumentItemId: { in: document.items.map((item) => item.id) } },
    select: { salesDocumentItemId: true },
  });
  const already = new Set(existing.map((line) => line.salesDocumentItemId));

  const data: Prisma.ConsignmentSettlementLineCreateManyInput[] = [];
  let producerAmount = 0;
  for (const item of document.items) {
    if (already.has(item.id)) continue;
    const product = item.product;
    if (!product || !item.productId || !product.producerId || !product.producer) continue;
    const bps = resolveCommissionBps(product.commissionBpsOverride, product.producer.defaultCommissionBps);
    const split = splitConsignmentSale(item.subtotal, bps, { base: product.producer.commissionBase, saleIva: item.iva });
    producerAmount += split.producerAmount;
    data.push({
      companyId,
      producerId: product.producerId,
      salesDocumentItemId: item.id,
      kind: 'SALE',
      productId: item.productId,
      soldNet: split.soldNet,
      commissionBps: split.commissionBps,
      commissionAmount: split.commissionAmount,
      producerAmount: split.producerAmount,
      isExempt: item.isExempt,
      saleIva: item.iva,
      documentDate: document.issueDate,
    });
  }
  if (data.length === 0) return none;
  const result = await tx.consignmentSettlementLine.createMany({ data, skipDuplicates: true });
  return { count: result.count, producerAmount };
}

/**
 * Agrupa las líneas pendientes (sin liquidación) de un productor cuyo documento
 * cae entre los días `from` y `to` (inclusive, calendario de Santiago, igual
 * que el F29) en una liquidación en borrador. Atómico: si otra liquidación se
 * llevó alguna línea en paralelo, se revierte entera.
 *
 * No se filtra por el estado del documento: las líneas solo existen para
 * documentos emitidos y una anulación o nota de crédito deja su propia línea
 * de contrapartida con signo contrario, de modo que el neto siempre cuadra.
 */
export async function buildSettlement(
  companyId: string,
  producerId: string,
  from: Date,
  to: Date
): Promise<{ id: string; lineCount: number; totalDue: number; totalPayable: number }> {
  const producer = await prisma.producer.findFirst({ where: { id: producerId, companyId }, select: { id: true } });
  if (!producer) throw new ConsignmentError('Productor no encontrado');
  const bounds = settlementPeriodBounds(from, to);

  return prisma.$transaction(async (tx) => {
    const lines = await tx.consignmentSettlementLine.findMany({
      where: { companyId, producerId, settlementId: null, documentDate: { gte: bounds.from, lt: bounds.toExclusive } },
      select: { id: true, soldNet: true, commissionAmount: true, producerAmount: true, isExempt: true },
    });
    if (lines.length === 0) throw new ConsignmentError('No hay ventas pendientes de liquidar para ese productor en el período');

    const totals = summarizeSettlementLines(lines);
    const settlement = await tx.consignmentSettlement.create({
      data: {
        companyId,
        producerId,
        periodStart: bounds.from,
        periodEnd: new Date(bounds.toExclusive.getTime() - 1),
        status: 'DRAFT',
        ...totals,
      },
      select: { id: true },
    });
    const claimed = await tx.consignmentSettlementLine.updateMany({
      where: { companyId, producerId, settlementId: null, id: { in: lines.map((l) => l.id) } },
      data: { settlementId: settlement.id },
    });
    if (claimed.count !== lines.length) throw new ConsignmentError('Otra liquidación tomó parte de estas ventas. Intenta de nuevo.');
    return { id: settlement.id, lineCount: lines.length, totalDue: totals.totalDue, totalPayable: totals.totalPayable };
  }, LOCKING_TX_OPTIONS);
}
