import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { wasteReasonLabel } from '@/lib/warehouse-mobile/modes';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { isMovementSourceKind, MOVEMENT_SOURCE_LABELS, type MovementSourceKind } from '@/lib/inventory/traceability-sources';
import {
  aggregateCustomers,
  classifyLotMovement,
  distributedShare,
  LOT_MOVEMENT_LABELS,
  lotsInAllocations,
  quantityForLot,
  reconcileLot,
  type CustomerHit,
  type CustomerMovementRow,
  type LotMovementClass,
  type LotReconciliation,
} from '@/lib/inventory/genealogy';

/**
 * Genealogía de un lote: hacia atrás (proveedor, recepción, producción) y hacia
 * adelante (clientes, producción, pérdidas), siguiendo el enlace
 * `InventoryMovement.sourceKind/sourceId`. Todo filtra por `companyId`. Lo que
 * entró antes de existir el enlace aparece con su referencia en texto.
 */

const MAX_MOVEMENTS = 2000;
const MAX_PRODUCTION_LINKS = 10;
const MAX_INPUT_LOTS = 30;

const MOVEMENT_SELECT = {
  id: true,
  createdAt: true,
  type: true,
  quantity: true,
  previousStock: true,
  newStock: true,
  reference: true,
  notes: true,
  reasonCode: true,
  evidenceUrl: true,
  sourceKind: true,
  sourceId: true,
  lotAllocations: true,
  productId: true,
  warehouse: { select: { name: true } },
  user: { select: { name: true } },
  supplier: { select: { razonSocial: true, nombreFantasia: true } },
  product: { select: { name: true } },
} satisfies Prisma.InventoryMovementSelect;

type MovementRecord = Prisma.InventoryMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;

interface Party {
  contactId: string;
  name: string;
  rut: string;
}

interface SourceInfo {
  label: string;
  party: Party | null;
  cancelled: boolean;
}

const contactName = (c: { razonSocial: string; nombreFantasia: string | null }): string => c.nombreFantasia?.trim() || c.razonSocial;
const partyOf = (c: { id: string; rut: string; razonSocial: string; nombreFantasia: string | null }): Party => ({ contactId: c.id, name: contactName(c), rut: c.rut });
const CONTACT_SELECT = { id: true, rut: true, razonSocial: true, nombreFantasia: true } as const;

/** Resuelve de una vez los documentos de origen de un grupo de movimientos. */
async function resolveSources(companyId: string, movements: readonly Pick<MovementRecord, 'sourceKind' | 'sourceId'>[]): Promise<Map<string, SourceInfo>> {
  const ids = new Map<MovementSourceKind, Set<string>>();
  for (const movement of movements) {
    if (!isMovementSourceKind(movement.sourceKind) || !movement.sourceId) continue;
    const set = ids.get(movement.sourceKind) ?? new Set<string>();
    set.add(movement.sourceId);
    ids.set(movement.sourceKind, set);
  }
  const list = (kind: MovementSourceKind): string[] => [...(ids.get(kind) ?? [])];
  const [sales, receipts, purchases, orders, counts] = await Promise.all([
    list('SALES_DOCUMENT').length
      ? prisma.salesDocument.findMany({ where: { companyId, id: { in: list('SALES_DOCUMENT') } }, select: { id: true, dteType: true, folio: true, status: true, contact: { select: CONTACT_SELECT } } })
      : [],
    list('GOODS_RECEIPT').length
      ? prisma.goodsReceipt.findMany({ where: { companyId, id: { in: list('GOODS_RECEIPT') } }, select: { id: true, folio: true, order: { select: { folio: true, contact: { select: CONTACT_SELECT } } } } })
      : [],
    list('PURCHASE_DOCUMENT').length
      ? prisma.purchaseDocument.findMany({ where: { companyId, id: { in: list('PURCHASE_DOCUMENT') } }, select: { id: true, documentType: true, folio: true, contact: { select: CONTACT_SELECT } } })
      : [],
    list('PRODUCTION_ORDER').length
      ? prisma.productionOrder.findMany({ where: { companyId, id: { in: list('PRODUCTION_ORDER') } }, select: { id: true, folio: true } })
      : [],
    list('INVENTORY_COUNT').length
      ? prisma.inventoryCount.findMany({ where: { companyId, id: { in: list('INVENTORY_COUNT') } }, select: { id: true, folio: true } })
      : [],
  ]);
  const map = new Map<string, SourceInfo>();
  for (const doc of sales) {
    const type = DTE_TYPE_LABELS[doc.dteType as keyof typeof DTE_TYPE_LABELS] ?? doc.dteType;
    map.set(`SALES_DOCUMENT:${doc.id}`, { label: `${type} #${doc.folio ?? '—'}`, party: partyOf(doc.contact), cancelled: doc.status === 'CANCELLED' });
  }
  for (const receipt of receipts) {
    map.set(`GOODS_RECEIPT:${receipt.id}`, { label: `Recepción #${receipt.folio} (OC #${receipt.order.folio})`, party: partyOf(receipt.order.contact), cancelled: false });
  }
  for (const doc of purchases) {
    map.set(`PURCHASE_DOCUMENT:${doc.id}`, { label: `Compra ${doc.documentType} #${doc.folio}`, party: partyOf(doc.contact), cancelled: false });
  }
  for (const order of orders) map.set(`PRODUCTION_ORDER:${order.id}`, { label: `Orden de producción N° ${order.folio}`, party: null, cancelled: false });
  for (const count of counts) map.set(`INVENTORY_COUNT:${count.id}`, { label: `Toma de inventario #${count.folio}`, party: null, cancelled: false });
  return map;
}

const sourceKey = (m: Pick<MovementRecord, 'sourceKind' | 'sourceId'>): string | null => (m.sourceKind && m.sourceId ? `${m.sourceKind}:${m.sourceId}` : null);

export interface LotMovementRow {
  id: string;
  at: Date;
  cls: LotMovementClass;
  label: string;
  /** Unidades de ESTE lote que movió. */
  quantity: number;
  warehouse: string;
  actor: string | null;
  reference: string | null;
  /** Documento enlazado (`null` = movimiento anterior al seguimiento o ajuste manual). */
  document: string | null;
  documentKind: string | null;
  counterparty: string | null;
  reason: string | null;
  note: string | null;
  evidenceUrl: string | null;
  cancelled: boolean;
}

async function movementsOfLot(companyId: string, productId: string, lotNumber: string): Promise<MovementRecord[]> {
  return prisma.inventoryMovement.findMany({
    where: { companyId, productId, lotAllocations: { array_contains: [{ lotNumber }] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_MOVEMENTS,
    select: MOVEMENT_SELECT,
  });
}

function toRow(movement: MovementRecord, lotNumber: string, sources: Map<string, SourceInfo>): LotMovementRow {
  const cls = classifyLotMovement(movement);
  const key = sourceKey(movement);
  const source = key ? sources.get(key) : undefined;
  const supplier = movement.supplier ? contactName(movement.supplier) : null;
  return {
    id: movement.id,
    at: movement.createdAt,
    cls,
    label: LOT_MOVEMENT_LABELS[cls],
    quantity: quantityForLot(movement.lotAllocations, lotNumber),
    warehouse: movement.warehouse.name,
    actor: movement.user?.name ?? null,
    reference: movement.reference,
    document: source?.label ?? null,
    documentKind: isMovementSourceKind(movement.sourceKind) ? MOVEMENT_SOURCE_LABELS[movement.sourceKind] : null,
    counterparty: source?.party?.name ?? supplier,
    reason: wasteReasonLabel(movement.reasonCode),
    note: movement.notes,
    evidenceUrl: movement.evidenceUrl,
    cancelled: source?.cancelled ?? false,
  };
}

export interface LotOption {
  lotNumber: string;
  expiryDate: Date | null;
  quantity: number;
}

export async function listLotOptions(companyId: string, productId: string): Promise<LotOption[]> {
  const rows = await prisma.inventoryLot.findMany({
    where: { companyId, productId },
    select: { lotNumber: true, expiryDate: true, quantity: true },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { lotNumber: 'asc' }],
    take: 500,
  });
  const byLot = new Map<string, LotOption>();
  for (const row of rows) {
    const current = byLot.get(row.lotNumber);
    if (current) {
      current.quantity += row.quantity;
      if (!current.expiryDate || (row.expiryDate && row.expiryDate < current.expiryDate)) current.expiryDate = row.expiryDate ?? current.expiryDate;
    } else {
      byLot.set(row.lotNumber, { lotNumber: row.lotNumber, expiryDate: row.expiryDate, quantity: row.quantity });
    }
  }
  return [...byLot.values()];
}

export interface ProductionInput {
  productName: string;
  lotNumber: string;
  quantity: number;
  suppliers: string[];
}

export interface ProductionOrigin {
  orderId: string;
  folio: number;
  completedAt: Date | null;
  inputs: ProductionInput[];
}

export interface ProductionDestination {
  orderId: string;
  folio: number;
  outputProductId: string;
  outputProduct: string;
  outputLot: string | null;
  quantity: number;
  customers: CustomerHit[];
}

export interface LotTrace {
  product: { id: string; sku: string; name: string; unit: string };
  lotNumber: string;
  expiryDate: Date | null;
  entries: LotMovementRow[];
  suppliers: string[];
  madeIn: ProductionOrigin[];
  sales: LotMovementRow[];
  returns: LotMovementRow[];
  writeOffs: LotMovementRow[];
  transfers: LotMovementRow[];
  usedInProduction: ProductionDestination[];
  stock: Array<{ warehouse: string; quantity: number }>;
  customers: CustomerHit[];
  /** Quien mira no tiene permiso para ver clientes: la lista va vacía y la pantalla lo avisa. */
  customersHidden: boolean;
  reconciliation: LotReconciliation;
  distributedPercent: number;
  truncated: boolean;
}

async function suppliersOfLot(companyId: string, productId: string, lotNumber: string): Promise<string[]> {
  const entries = (await movementsOfLot(companyId, productId, lotNumber)).filter((m) => classifyLotMovement(m) === 'ENTRY' && m.sourceKind !== 'PRODUCTION_ORDER');
  const sources = await resolveSources(companyId, entries);
  const names = new Set<string>();
  for (const movement of entries) {
    const key = sourceKey(movement);
    const name = (key ? sources.get(key)?.party?.name : null) ?? (movement.supplier ? contactName(movement.supplier) : null);
    if (name) names.add(name);
  }
  return [...names];
}

function customerRows(rows: LotMovementRow[], movements: Map<string, MovementRecord>, sources: Map<string, SourceInfo>): CustomerMovementRow[] {
  const result: CustomerMovementRow[] = [];
  for (const row of rows) {
    if (row.cancelled) continue;
    const movement = movements.get(row.id);
    const key = movement ? sourceKey(movement) : null;
    const party = key ? sources.get(key)?.party : null;
    if (!party || !row.document) continue;
    result.push({ contactId: party.contactId, name: party.name, rut: party.rut, quantity: row.cls === 'RETURN' ? -row.quantity : row.quantity, document: row.document, at: row.at });
  }
  return result;
}

export async function traceLot(companyId: string, productId: string, lotNumber: string, options: { includeCustomers: boolean }): Promise<LotTrace | null> {
  const [product, lotRows] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true, sku: true, name: true, unit: true } }),
    prisma.inventoryLot.findMany({ where: { companyId, productId, lotNumber }, select: { quantity: true, expiryDate: true, warehouse: { select: { name: true } } } }),
  ]);
  if (!product) return null;
  const movements = await movementsOfLot(companyId, productId, lotNumber);
  if (movements.length === 0 && lotRows.length === 0) return null;
  const sources = await resolveSources(companyId, movements);
  const byId = new Map(movements.map((m) => [m.id, m]));
  const rows = movements.map((m) => toRow(m, lotNumber, sources));

  const entries = rows.filter((r) => r.cls === 'ENTRY' || r.cls === 'OTHER_IN');
  const sales = rows.filter((r) => r.cls === 'SALE');
  const returns = rows.filter((r) => r.cls === 'RETURN');
  const writeOffs = rows.filter((r) => r.cls === 'WRITE_OFF' || r.cls === 'OTHER_OUT');
  const transfers = rows.filter((r) => r.cls === 'TRANSFER_OUT' || r.cls === 'TRANSFER_IN');

  // Hacia atrás: las órdenes de producción que hicieron este lote y de qué lotes de insumo salieron.
  const madeIn: ProductionOrigin[] = [];
  const producedBy = [...new Set(movements.filter((m) => m.sourceKind === 'PRODUCTION_ORDER' && classifyLotMovement(m) === 'ENTRY').map((m) => m.sourceId!))].slice(0, MAX_PRODUCTION_LINKS);
  for (const orderId of producedBy) {
    const [order, inputMovements] = await Promise.all([
      prisma.productionOrder.findFirst({ where: { id: orderId, companyId }, select: { folio: true, completedAt: true } }),
      prisma.inventoryMovement.findMany({ where: { companyId, sourceKind: 'PRODUCTION_ORDER', sourceId: orderId, type: 'ADJUSTMENT_OUT' }, select: MOVEMENT_SELECT, take: MAX_INPUT_LOTS }),
    ]);
    if (!order) continue;
    const inputs: ProductionInput[] = [];
    for (const input of inputMovements) {
      for (const lot of lotsInAllocations(input.lotAllocations)) {
        inputs.push({ productName: input.product.name, lotNumber: lot.lotNumber, quantity: lot.quantity, suppliers: await suppliersOfLot(companyId, input.productId, lot.lotNumber) });
      }
      if (!input.lotAllocations) inputs.push({ productName: input.product.name, lotNumber: 'sin lote', quantity: input.quantity, suppliers: [] });
    }
    madeIn.push({ orderId, folio: order.folio, completedAt: order.completedAt, inputs });
  }

  // Hacia adelante: lo que se fabricó con este lote y a quién llegó.
  const usedInProduction: ProductionDestination[] = [];
  const usedIn = [...new Set(movements.filter((m) => m.sourceKind === 'PRODUCTION_ORDER' && classifyLotMovement(m) === 'PRODUCTION_USE').map((m) => m.sourceId!))].slice(0, MAX_PRODUCTION_LINKS);
  for (const orderId of usedIn) {
    const [order, outputs] = await Promise.all([
      prisma.productionOrder.findFirst({ where: { id: orderId, companyId }, select: { folio: true } }),
      prisma.inventoryMovement.findMany({ where: { companyId, sourceKind: 'PRODUCTION_ORDER', sourceId: orderId, type: 'ADJUSTMENT_IN' }, select: MOVEMENT_SELECT, take: 5 }),
    ]);
    if (!order) continue;
    for (const output of outputs) {
      const outLots = lotsInAllocations(output.lotAllocations);
      const targets = outLots.length ? outLots : [{ lotNumber: null as string | null, quantity: output.quantity }];
      for (const target of targets) {
        let customers: CustomerHit[] = [];
        if (target.lotNumber && options.includeCustomers) {
          const downstream = await movementsOfLot(companyId, output.productId, target.lotNumber);
          const downSources = await resolveSources(companyId, downstream);
          const downById = new Map(downstream.map((m) => [m.id, m]));
          const downRows = downstream.map((m) => toRow(m, target.lotNumber!, downSources)).filter((r) => r.cls === 'SALE' || r.cls === 'RETURN');
          customers = aggregateCustomers(customerRows(downRows, downById, downSources));
        }
        usedInProduction.push({ orderId, folio: order.folio, outputProductId: output.productId, outputProduct: output.product.name, outputLot: target.lotNumber, quantity: target.quantity, customers });
      }
    }
  }

  const stock = lotRows.filter((l) => Math.abs(l.quantity) > 1e-9).map((l) => ({ warehouse: l.warehouse.name, quantity: l.quantity }));
  const inStock = lotRows.reduce((sum, l) => sum + l.quantity, 0);
  const reconciliation = reconcileLot(rows.map((r) => ({ cls: r.cls, quantity: r.quantity })), inStock);
  const customers = options.includeCustomers ? aggregateCustomers(customerRows([...sales, ...returns], byId, sources)) : [];
  const soldNet = sales.filter((s) => !s.cancelled).reduce((sum, s) => sum + s.quantity, 0) - returns.reduce((sum, r) => sum + r.quantity, 0);
  const suppliers = [...new Set(entries.filter((e) => e.documentKind !== MOVEMENT_SOURCE_LABELS.PRODUCTION_ORDER).map((e) => e.counterparty).filter((n): n is string => Boolean(n)))];
  return {
    product,
    lotNumber,
    expiryDate: lotRows.find((l) => l.expiryDate)?.expiryDate ?? null,
    entries,
    suppliers,
    madeIn,
    sales,
    returns,
    writeOffs,
    transfers,
    usedInProduction,
    stock,
    customers,
    customersHidden: !options.includeCustomers,
    reconciliation,
    distributedPercent: distributedShare(reconciliation.received, soldNet),
    truncated: movements.length >= MAX_MOVEMENTS,
  };
}
