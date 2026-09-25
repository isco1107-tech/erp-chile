import type { ImportShipmentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { computeLandedCost, IMPORT_COST_LABELS, type AllocationMethod, type ImportCostKind, type LandedCostResult } from '@/lib/purchases/landed-cost';
import { applyStockIn } from '@/modules/inventory/services/stock.service';
import { createAndPostEntry, resolveMappedAccountId } from '@/modules/accounting/services/journal.service';
import { isLedgerActive } from '@/modules/accounting/posting-rules/shared';
import type { ImportShipmentInput } from '../schema';

/**
 * Carpetas de importación: valor FOB + costos hasta la bodega = costo real de
 * la mercadería importada, que entra al kardex (PMP) al cerrar la carpeta.
 *
 * Contabilidad (si la empresa la tiene activa): las facturas del proveedor
 * extranjero, flete, agente y puerto se registran en Compras sin enlazar
 * productos, así que postean a gasto. Al cerrar la carpeta, ese valor se
 * reclasifica: D Existencias / H Gastos operacionales por el costo total
 * puesto en bodega. El stock entra solo una vez: por la carpeta, nunca por
 * esas facturas.
 */

export class ImportShipmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportShipmentError';
  }
}

type Tx = Prisma.TransactionClient;

function day(value: string | undefined): Date | null {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

async function assertRefs(tx: Tx | typeof prisma, companyId: string, input: Pick<ImportShipmentInput, 'contactId' | 'warehouseId'>) {
  if (input.contactId) {
    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
    if (!contact) throw new ImportShipmentError('Proveedor no encontrado');
  }
  if (input.warehouseId) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } });
    if (!warehouse) throw new ImportShipmentError('Bodega no encontrada');
  }
}

function headerData(input: ImportShipmentInput) {
  return {
    reference: input.reference,
    contactId: input.contactId || null,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    incoterm: input.incoterm || null,
    dinNumber: input.dinNumber || null,
    arrivalDate: day(input.arrivalDate),
    warehouseId: input.warehouseId || null,
    allocationMethod: input.allocationMethod,
    notes: input.notes || null,
  };
}

export async function createImportShipment(companyId: string, input: ImportShipmentInput): Promise<{ id: string; folio: number }> {
  return prisma.$transaction(async (tx) => {
    await assertRefs(tx, companyId, input);
    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'IMPORT_SHIPMENT' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'IMPORT_SHIPMENT', currentFolio: 1 },
    });
    return tx.importShipment.create({ data: { companyId, folio: seq.currentFolio, ...headerData(input) }, select: { id: true, folio: true } });
  }, LOCKING_TX_OPTIONS);
}

async function lockOpen(tx: Tx, companyId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "ImportShipment" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const shipment = await tx.importShipment.findFirst({ where: { id, companyId } });
  if (!shipment) throw new ImportShipmentError('Carpeta no encontrada');
  if (shipment.status !== 'OPEN') throw new ImportShipmentError('La carpeta ya está cerrada: no se puede modificar');
  return shipment;
}

export async function updateImportShipment(companyId: string, id: string, input: ImportShipmentInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, companyId, id);
    await assertRefs(tx, companyId, input);
    await tx.importShipment.updateMany({ where: { id, companyId }, data: headerData(input) });
  }, LOCKING_TX_OPTIONS);
}

export async function saveImportItems(
  companyId: string,
  id: string,
  items: { productId: string; quantity: number; unitPriceForeign: number }[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, companyId, id);
    const productIds = Array.from(new Set(items.map((item) => item.productId)));
    const products = await tx.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true, name: true, isTrackable: true } });
    if (products.length !== productIds.length) throw new ImportShipmentError('Uno de los productos no existe en tu catálogo');
    const untracked = products.find((product) => !product.isTrackable);
    if (untracked) throw new ImportShipmentError(`${untracked.name} no controla stock: no se puede ingresar por importación`);
    const names = new Map(products.map((product) => [product.id, product.name]));
    await tx.importShipmentItem.deleteMany({ where: { companyId, shipmentId: id } });
    await tx.importShipmentItem.createMany({
      data: items.map((item, position) => ({
        companyId,
        shipmentId: id,
        productId: item.productId,
        description: names.get(item.productId) ?? '',
        quantity: item.quantity,
        unitPriceForeign: item.unitPriceForeign,
        position,
      })),
    });
  }, LOCKING_TX_OPTIONS);
}

export async function saveImportCosts(
  companyId: string,
  id: string,
  costs: { kind: string; description: string; amount: number; purchaseDocumentId?: string | null }[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, companyId, id);
    const documentIds = Array.from(new Set(costs.map((cost) => cost.purchaseDocumentId).filter((value): value is string => Boolean(value))));
    if (documentIds.length > 0) {
      const found = await tx.purchaseDocument.count({ where: { companyId, id: { in: documentIds } } });
      if (found !== documentIds.length) throw new ImportShipmentError('Una de las facturas asociadas no existe');
    }
    await tx.importShipmentCost.deleteMany({ where: { companyId, shipmentId: id } });
    await tx.importShipmentCost.createMany({
      data: costs.map((cost) => ({
        companyId,
        shipmentId: id,
        kind: cost.kind,
        description: cost.description,
        amount: cost.amount,
        purchaseDocumentId: cost.purchaseDocumentId || null,
      })),
    });
  }, LOCKING_TX_OPTIONS);
}

export async function cancelImportShipment(companyId: string, id: string): Promise<void> {
  const { count } = await prisma.importShipment.updateMany({ where: { id, companyId, status: 'OPEN' }, data: { status: 'CANCELLED' } });
  if (count === 0) throw new ImportShipmentError('Solo se anula una carpeta abierta');
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export interface ImportShipmentRow {
  id: string;
  folio: number;
  reference: string;
  supplierName: string | null;
  currency: string;
  exchangeRate: number;
  arrivalDate: Date | null;
  status: ImportShipmentStatus;
  itemCount: number;
  fobTotal: number;
  landedTotal: number;
  upliftPercent: number;
}

function landedFor(shipment: {
  exchangeRate: number;
  allocationMethod: string;
  items: { id: string; quantity: number; unitPriceForeign: number }[];
  costs: { kind: string; amount: number }[];
}): LandedCostResult {
  return computeLandedCost({
    exchangeRate: shipment.exchangeRate,
    method: shipment.allocationMethod === 'QUANTITY' ? 'QUANTITY' : 'VALUE',
    items: shipment.items,
    costs: shipment.costs,
  });
}

export async function listImportShipments(companyId: string): Promise<ImportShipmentRow[]> {
  const rows = await prisma.importShipment.findMany({
    where: { companyId },
    orderBy: { folio: 'desc' },
    take: 200,
    include: {
      contact: { select: { razonSocial: true } },
      items: { select: { id: true, quantity: true, unitPriceForeign: true } },
      costs: { select: { kind: true, amount: true } },
    },
  });
  return rows.map((row) => {
    const landed = landedFor(row);
    return {
      id: row.id,
      folio: row.folio,
      reference: row.reference,
      supplierName: row.contact?.razonSocial ?? null,
      currency: row.currency,
      exchangeRate: row.exchangeRate,
      arrivalDate: row.arrivalDate,
      status: row.status,
      itemCount: row.items.length,
      fobTotal: landed.fobTotal,
      landedTotal: landed.landedTotal,
      upliftPercent: landed.upliftPercent,
    };
  });
}

export interface ImportShipmentDetail {
  id: string;
  folio: number;
  reference: string;
  contactId: string | null;
  supplierName: string | null;
  currency: string;
  exchangeRate: number;
  incoterm: string | null;
  dinNumber: string | null;
  arrivalDate: Date | null;
  warehouseId: string | null;
  warehouseName: string | null;
  allocationMethod: AllocationMethod;
  status: ImportShipmentStatus;
  closedAt: Date | null;
  notes: string | null;
  items: { id: string; productId: string; sku: string; description: string; unit: string; quantity: number; unitPriceForeign: number; landedUnitCost: number | null; currentPmp: number }[];
  costs: { id: string; kind: string; kindLabel: string; description: string; amount: number; purchaseDocumentId: string | null; purchaseLabel: string | null }[];
  landed: LandedCostResult;
}

export async function getImportShipment(companyId: string, id: string): Promise<ImportShipmentDetail | null> {
  const shipment = await prisma.importShipment.findFirst({
    where: { id, companyId },
    include: {
      contact: { select: { razonSocial: true } },
      warehouse: { select: { name: true } },
      items: { orderBy: { position: 'asc' }, include: { product: { select: { sku: true, unit: true, costPricePMP: true } } } },
      costs: { orderBy: { id: 'asc' }, include: { purchaseDocument: { select: { folio: true, documentType: true, contact: { select: { razonSocial: true } } } } } },
    },
  });
  if (!shipment) return null;
  return {
    id: shipment.id,
    folio: shipment.folio,
    reference: shipment.reference,
    contactId: shipment.contactId,
    supplierName: shipment.contact?.razonSocial ?? null,
    currency: shipment.currency,
    exchangeRate: shipment.exchangeRate,
    incoterm: shipment.incoterm,
    dinNumber: shipment.dinNumber,
    arrivalDate: shipment.arrivalDate,
    warehouseId: shipment.warehouseId,
    warehouseName: shipment.warehouse?.name ?? null,
    allocationMethod: shipment.allocationMethod === 'QUANTITY' ? 'QUANTITY' : 'VALUE',
    status: shipment.status,
    closedAt: shipment.closedAt,
    notes: shipment.notes,
    items: shipment.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.product.sku,
      description: item.description,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPriceForeign: item.unitPriceForeign,
      landedUnitCost: item.landedUnitCost,
      currentPmp: item.product.costPricePMP,
    })),
    costs: shipment.costs.map((cost) => ({
      id: cost.id,
      kind: cost.kind,
      kindLabel: IMPORT_COST_LABELS[cost.kind as ImportCostKind] ?? cost.kind,
      description: cost.description,
      amount: cost.amount,
      purchaseDocumentId: cost.purchaseDocumentId,
      purchaseLabel: cost.purchaseDocument ? `${cost.purchaseDocument.contact.razonSocial} · N° ${cost.purchaseDocument.folio}` : null,
    })),
    landed: landedFor(shipment),
  };
}

/** Facturas de compra recientes para asociar a los costos de la carpeta. */
export async function listPurchaseDocumentOptions(companyId: string): Promise<{ id: string; label: string; netAmount: number }[]> {
  const documents = await prisma.purchaseDocument.findMany({
    where: { companyId, status: { in: ['ISSUED', 'DRAFT'] } },
    orderBy: { issueDate: 'desc' },
    take: 200,
    select: { id: true, folio: true, netAmount: true, exemptAmount: true, contact: { select: { razonSocial: true } } },
  });
  return documents.map((document) => ({
    id: document.id,
    label: `${document.contact.razonSocial} · N° ${document.folio}`,
    netAmount: document.netAmount + document.exemptAmount,
  }));
}

/**
 * Cierra la carpeta: fija el costo unitario puesto en bodega de cada línea y
 * la ingresa al kardex (PMP) en la bodega de la carpeta. Todo en una
 * transacción: o entra toda la mercadería, o nada.
 */
export async function closeImportShipment(companyId: string, userId: string, id: string): Promise<{ landedTotal: number; items: number }> {
  return prisma.$transaction(async (tx) => {
    const shipment = await lockOpen(tx, companyId, id);
    if (!shipment.warehouseId) throw new ImportShipmentError('Elige la bodega donde entra la mercadería');
    const [items, costs] = await Promise.all([
      tx.importShipmentItem.findMany({ where: { companyId, shipmentId: id }, orderBy: { position: 'asc' } }),
      tx.importShipmentCost.findMany({ where: { companyId, shipmentId: id } }),
    ]);
    if (items.length === 0) throw new ImportShipmentError('Agrega los productos de la carpeta antes de cerrarla');
    const landed = landedFor({ ...shipment, items, costs });
    const reference = `Importación N° ${shipment.folio} (${shipment.reference})`;

    for (const item of items) {
      const result = landed.items.find((line) => line.id === item.id)!;
      await applyStockIn(tx, companyId, {
        productId: item.productId,
        warehouseId: shipment.warehouseId,
        type: 'PURCHASE_IN',
        quantity: item.quantity,
        unitCost: result.landedUnitCost,
        reference,
        notes: `FOB ${shipment.currency} ${item.unitPriceForeign} × ${shipment.exchangeRate} + costos de importación`,
      });
      await tx.importShipmentItem.updateMany({ where: { id: item.id, companyId }, data: { landedUnitCost: result.landedUnitCost } });
    }

    await tx.importShipment.updateMany({ where: { id, companyId }, data: { status: 'CLOSED', closedAt: new Date(), closedById: userId } });

    if (landed.landedTotal > 0 && (await isLedgerActive(tx, companyId))) {
      const [existencias, gastos] = await Promise.all([
        resolveMappedAccountId(tx, companyId, 'EXISTENCIAS'),
        resolveMappedAccountId(tx, companyId, 'GASTOS_OPERACIONALES'),
      ]);
      await createAndPostEntry(tx, {
        companyId,
        date: new Date(),
        description: `Capitalización ${reference}`,
        sourceType: 'MANUAL',
        sourceId: `import:${id}`,
        createdByUserId: userId,
        lines: [
          { accountId: existencias, debit: landed.landedTotal, credit: 0 },
          { accountId: gastos, debit: 0, credit: landed.landedTotal },
        ],
      });
    }
    return { landedTotal: landed.landedTotal, items: items.length };
  }, LOCKING_TX_OPTIONS);
}
