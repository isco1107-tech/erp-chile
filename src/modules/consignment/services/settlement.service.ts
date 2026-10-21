import type { ConsignmentSettlementStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { summarizeSettlementLines } from '@/lib/consignment/commission';
import { ConsignmentError } from './consignment.service';

export interface SettlementRow {
  id: string;
  producerId: string;
  producerName: string;
  periodStart: Date;
  periodEnd: Date;
  totalSold: number;
  totalCommission: number;
  totalDue: number;
  producerNetAffected: number;
  producerExempt: number;
  producerIva: number;
  totalPayable: number;
  status: ConsignmentSettlementStatus;
  paidAt: Date | null;
  lineCount: number;
}

export async function listSettlements(
  companyId: string,
  filter: { producerId?: string; status?: ConsignmentSettlementStatus } = {}
): Promise<SettlementRow[]> {
  const rows = await prisma.consignmentSettlement.findMany({
    where: { companyId, producerId: filter.producerId, status: filter.status },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      producerId: true,
      periodStart: true,
      periodEnd: true,
      totalSold: true,
      totalCommission: true,
      totalDue: true,
      producerNetAffected: true,
      producerExempt: true,
      producerIva: true,
      totalPayable: true,
      status: true,
      paidAt: true,
      producer: { select: { contact: { select: { razonSocial: true } } } },
      _count: { select: { lines: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    producerId: row.producerId,
    producerName: row.producer.contact.razonSocial,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    totalSold: row.totalSold,
    totalCommission: row.totalCommission,
    totalDue: row.totalDue,
    producerNetAffected: row.producerNetAffected,
    producerExempt: row.producerExempt,
    producerIva: row.producerIva,
    totalPayable: row.totalPayable,
    status: row.status,
    paidAt: row.paidAt,
    lineCount: row._count.lines,
  }));
}

export interface SettlementLineRow {
  id: string;
  productName: string;
  productSku: string;
  documentLabel: string | null;
  isReversal: boolean;
  soldNet: number;
  commissionBps: number;
  commissionAmount: number;
  producerAmount: number;
  createdAt: Date;
}

export interface SettlementDetail extends SettlementRow {
  lines: SettlementLineRow[];
  payable: { id: string; folio: string; totalAmount: number; paidAmount: number; paymentStatus: PaymentStatus } | null;
}

export async function getSettlementDetail(companyId: string, settlementId: string): Promise<SettlementDetail | null> {
  const row = await prisma.consignmentSettlement.findFirst({
    where: { id: settlementId, companyId },
    select: {
      id: true,
      producerId: true,
      periodStart: true,
      periodEnd: true,
      totalSold: true,
      totalCommission: true,
      totalDue: true,
      producerNetAffected: true,
      producerExempt: true,
      producerIva: true,
      totalPayable: true,
      status: true,
      paidAt: true,
      producer: { select: { contact: { select: { razonSocial: true } } } },
      payableDocument: { select: { id: true, folio: true, totalAmount: true, paidAmount: true, paymentStatus: true } },
      lines: {
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          soldNet: true,
          commissionBps: true,
          commissionAmount: true,
          producerAmount: true,
          reversesLineId: true,
          createdAt: true,
          product: { select: { name: true, sku: true } },
          salesDocumentItem: { select: { document: { select: { dteType: true, folio: true } } } },
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    producerId: row.producerId,
    producerName: row.producer.contact.razonSocial,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    totalSold: row.totalSold,
    totalCommission: row.totalCommission,
    totalDue: row.totalDue,
    producerNetAffected: row.producerNetAffected,
    producerExempt: row.producerExempt,
    producerIva: row.producerIva,
    totalPayable: row.totalPayable,
    status: row.status,
    paidAt: row.paidAt,
    lineCount: row.lines.length,
    payable: row.payableDocument,
    lines: row.lines.map((line) => {
      const document = line.salesDocumentItem?.document;
      return {
        id: line.id,
        productName: line.product.name,
        productSku: line.product.sku,
        documentLabel: document ? `${document.dteType} #${document.folio ?? '-'}` : null,
        isReversal: line.reversesLineId !== null,
        soldNet: line.soldNet,
        commissionBps: line.commissionBps,
        commissionAmount: line.commissionAmount,
        producerAmount: line.producerAmount,
        createdAt: line.createdAt,
      };
    }),
  };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * DRAFT -> CONFIRMED. Congela los totales desde las líneas y crea la cuenta por
 * pagar al productor.
 *
 * Cómo se modela la CxP: Tesorería solo conoce deudas con proveedores como
 * `PurchaseDocument` (`listPayables`, pagos, lotes de pago). La opción menos
 * invasiva es un documento tipo OTRO con el desglose de lo que el productor
 * debe facturar (neto afecto, exento, IVA calculado una vez sobre el neto
 * agregado): queda fuera del F29 (`TAXABLE_PURCHASE_DOCUMENT_TYPES`) y del RCV,
 * no mueve stock y no genera asiento propio (no pasa por
 * `createPurchaseDocument`). El crédito fiscal se toma cuando se registra la
 * factura real del productor en Compras (sin líneas de producto: ver el
 * rechazo de productos en consignación). Vincularla a esta liquidación y
 * saldar la 2110 al pagar quedan pendientes (criterio a validar por contador).
 */
export async function confirmSettlement(companyId: string, settlementId: string): Promise<{ payableDocumentId: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ConsignmentSettlement" WHERE id = ${settlementId} AND "companyId" = ${companyId} FOR UPDATE`;
    const settlement = await tx.consignmentSettlement.findFirst({
      where: { id: settlementId, companyId },
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        producer: { select: { contactId: true } },
      },
    });
    if (!settlement) throw new ConsignmentError('Liquidación no encontrada');
    if (settlement.status !== 'DRAFT') throw new ConsignmentError('Solo se puede confirmar una liquidación en borrador');

    const lines = await tx.consignmentSettlementLine.findMany({
      where: { companyId, settlementId },
      select: { soldNet: true, commissionAmount: true, producerAmount: true, isExempt: true },
    });
    const totals = summarizeSettlementLines(lines);
    if (totals.totalPayable <= 0) {
      throw new ConsignmentError(
        'El saldo a pagar al productor es cero o negativo: no se puede confirmar. Descarta el borrador para devolver sus ventas a pendientes y liquídalas junto a un período con más ventas.'
      );
    }

    const payable = await tx.purchaseDocument.create({
      data: {
        companyId,
        contactId: settlement.producer.contactId,
        documentType: 'OTRO',
        folio: `LIQ-${settlementId.slice(-8).toUpperCase()}`,
        status: 'ISSUED',
        issueDate: new Date(),
        netAmount: totals.producerNetAffected,
        exemptAmount: totals.producerExempt,
        ivaAmount: totals.producerIva,
        totalAmount: totals.totalPayable,
        notes: `Liquidación de consignación ${isoDay(settlement.periodStart)} al ${isoDay(settlement.periodEnd)}`,
      },
      select: { id: true },
    });

    const updated = await tx.consignmentSettlement.updateMany({
      where: { id: settlementId, companyId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', ...totals, payableDocumentId: payable.id },
    });
    if (updated.count !== 1) throw new ConsignmentError('La liquidación ya no está en borrador: otra persona la modificó recién');
    return { payableDocumentId: payable.id };
  }, LOCKING_TX_OPTIONS);
}

/**
 * CONFIRMED -> PAID. El dinero se mueve en Tesorería (Cuentas por pagar) sobre
 * la CxP de la liquidación; aquí solo se deja constancia cuando esa deuda ya
 * está saldada, para no tener dos fuentes de verdad sobre el pago.
 */
export async function markSettlementPaid(companyId: string, settlementId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ConsignmentSettlement" WHERE id = ${settlementId} AND "companyId" = ${companyId} FOR UPDATE`;
    const settlement = await tx.consignmentSettlement.findFirst({
      where: { id: settlementId, companyId },
      select: { status: true, payableDocument: { select: { paymentStatus: true } } },
    });
    if (!settlement) throw new ConsignmentError('Liquidación no encontrada');
    if (settlement.status !== 'CONFIRMED') throw new ConsignmentError('Solo se puede marcar como pagada una liquidación confirmada');
    if (settlement.payableDocument?.paymentStatus !== 'PAID') {
      throw new ConsignmentError('Registra primero el pago al productor en Tesorería (Cuentas por pagar); luego marca la liquidación como pagada.');
    }
    const updated = await tx.consignmentSettlement.updateMany({
      where: { id: settlementId, companyId, status: 'CONFIRMED' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (updated.count !== 1) throw new ConsignmentError('La liquidación ya no está confirmada: otra persona la modificó recién');
  }, LOCKING_TX_OPTIONS);
}

/** Descarta un borrador: sus ventas vuelven a pendientes. Solo en DRAFT. */
export async function discardSettlement(companyId: string, settlementId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ConsignmentSettlement" WHERE id = ${settlementId} AND "companyId" = ${companyId} FOR UPDATE`;
    const settlement = await tx.consignmentSettlement.findFirst({ where: { id: settlementId, companyId }, select: { status: true } });
    if (!settlement) throw new ConsignmentError('Liquidación no encontrada');
    if (settlement.status !== 'DRAFT') throw new ConsignmentError('Solo se puede descartar una liquidación en borrador');
    await tx.consignmentSettlementLine.updateMany({ where: { companyId, settlementId }, data: { settlementId: null } });
    const deleted = await tx.consignmentSettlement.deleteMany({ where: { id: settlementId, companyId, status: 'DRAFT' } });
    if (deleted.count !== 1) throw new ConsignmentError('La liquidación ya no está en borrador: otra persona la modificó recién');
  }, LOCKING_TX_OPTIONS);
}

export interface ConsignmentOverview {
  activeProducers: number;
  consignmentProducts: number;
  /** Devengado al productor y aún sin liquidar (neto de reversas). */
  pendingToSettle: number;
  /** Liquidaciones confirmadas, aún no pagadas. */
  confirmedUnpaid: number;
  pendingByProducer: Record<string, number>;
}

export async function getConsignmentOverview(companyId: string): Promise<ConsignmentOverview> {
  const [activeProducers, consignmentProducts, pending, confirmed, byProducer] = await Promise.all([
    prisma.producer.count({ where: { companyId, isActive: true } }),
    prisma.product.count({ where: { companyId, supplyMode: 'CONSIGNMENT' } }),
    prisma.consignmentSettlementLine.aggregate({ where: { companyId, settlementId: null }, _sum: { producerAmount: true } }),
    prisma.consignmentSettlement.aggregate({ where: { companyId, status: 'CONFIRMED' }, _sum: { totalDue: true } }),
    prisma.consignmentSettlementLine.groupBy({ by: ['producerId'], where: { companyId, settlementId: null }, _sum: { producerAmount: true } }),
  ]);
  const pendingByProducer: Record<string, number> = {};
  for (const row of byProducer) pendingByProducer[row.producerId] = row._sum.producerAmount ?? 0;
  return {
    activeProducers,
    consignmentProducts,
    pendingToSettle: pending._sum.producerAmount ?? 0,
    confirmedUnpaid: confirmed._sum.totalDue ?? 0,
    pendingByProducer,
  };
}

export interface ConsignmentProductRow {
  id: string;
  sku: string;
  name: string;
  producerId: string | null;
  commissionBpsOverride: number | null;
}

/** Productos del catálogo para asignar: los del productor y los de stock propio. */
export async function listAssignableProducts(companyId: string, producerId: string): Promise<{ assigned: ConsignmentProductRow[]; available: ConsignmentProductRow[] }> {
  const select = { id: true, sku: true, name: true, producerId: true, commissionBpsOverride: true } as const;
  const [assigned, available] = await Promise.all([
    prisma.product.findMany({ where: { companyId, producerId }, orderBy: { name: 'asc' }, select }),
    prisma.product.findMany({ where: { companyId, producerId: null }, orderBy: { name: 'asc' }, take: 500, select }),
  ]);
  return { assigned, available };
}

export async function listActiveProducerOptions(companyId: string): Promise<{ id: string; name: string; defaultCommissionBps: number }[]> {
  const rows = await prisma.producer.findMany({
    where: { companyId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, defaultCommissionBps: true, contact: { select: { razonSocial: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: row.contact.razonSocial, defaultCommissionBps: row.defaultCommissionBps }));
}

/** Proveedores que aún no son productores, para el alta. */
export async function listProducerCandidateContacts(companyId: string): Promise<{ id: string; name: string; rut: string }[]> {
  const rows = await prisma.contact.findMany({
    where: { companyId, isSupplier: true, producers: { none: {} } },
    orderBy: { razonSocial: 'asc' },
    take: 500,
    select: { id: true, razonSocial: true, rut: true },
  });
  return rows.map((row) => ({ id: row.id, name: row.razonSocial, rut: row.rut }));
}

export async function getProducer(companyId: string, producerId: string) {
  const rows = await prisma.producer.findFirst({
    where: { id: producerId, companyId },
    select: {
      id: true,
      defaultCommissionBps: true,
      commissionBase: true,
      isActive: true,
      notes: true,
      paymentNotes: true,
      contact: { select: { razonSocial: true, rut: true } },
    },
  });
  return rows;
}

export interface ProductConsignmentState {
  producers: { id: string; name: string; defaultCommissionBps: number }[];
  current: { producerId: string | null; supplyMode: 'OWN' | 'CONSIGNMENT'; commissionBpsOverride: number | null };
}

/** Estado de abastecimiento de un producto y los productores elegibles (ficha de producto). */
export async function getProductConsignment(companyId: string, productId: string): Promise<ProductConsignmentState | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { producerId: true, supplyMode: true, commissionBpsOverride: true },
  });
  if (!product) return null;
  return { producers: await listActiveProducerOptions(companyId), current: product };
}
