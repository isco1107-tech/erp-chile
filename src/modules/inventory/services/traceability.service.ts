import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { wasteReasonLabel } from '@/lib/warehouse-mobile/modes';
import { MOVEMENT_TYPE_LABELS } from '@/lib/inventory/movement-kinds';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import {
  allowedSerialTransitions,
  canTransitionSerial,
  describeLotAllocations,
  eventKindForTransition,
  MAX_SERIALS_PER_BATCH,
  normalizeSerial,
  pendingQuantity,
  SERIAL_EVENT_LABELS,
  SERIAL_STATUS_LABELS,
  serialCoverage,
  sortTimeline,
  stageOfMovement,
  summarizeMovementStages,
  windowStart,
  type FlowStage,
  type SerialCoverage,
  type SerialStatus,
  type StageTotal,
  type TimelineEntry,
} from '@/lib/inventory/traceability';
import { registerTransferTx } from './stock.service';

/**
 * Trazabilidad de un producto: el tablero por etapas (lo que ya está en el
 * kardex, las órdenes de compra y el stock) y las series por unidad. Todo
 * filtra por `companyId`; nada de lo que llega del navegador se usa sin
 * comprobar que pertenece a la empresa.
 */

const FLOW_FETCH_LIMIT = 1000;
const CARDS_PER_STAGE = 8;
const TIMELINE_LIMIT = 80;
export const MAX_SERIAL_LIST = 1000;

export interface TraceableProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  tracksLots: boolean;
}

export interface FlowCard {
  id: string;
  at: Date | null;
  title: string;
  subtitle: string | null;
  quantity: number;
  reference: string | null;
  actor: string | null;
  evidenceUrl: string | null;
}

export interface WarehouseStockCard {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  lots: Array<{ lotNumber: string; quantity: number; expiryDate: Date | null }>;
  serials: SerialCoverage;
}

export interface ProductFlow {
  product: TraceableProduct;
  days: number;
  /** El período trajo más movimientos de los que se leen: los totales quedan cortos. */
  truncated: boolean;
  inTransit: { total: number; cards: FlowCard[] };
  inWarehouse: { total: number; warehouses: WarehouseStockCard[] };
  received: StageTotal & { cards: FlowCard[] };
  transferred: StageTotal & { cards: FlowCard[] };
  sold: StageTotal & { cards: FlowCard[] };
  lost: StageTotal & { cards: FlowCard[] };
  timeline: TimelineEntry[];
}

export async function searchTraceableProducts(companyId: string, query: string): Promise<TraceableProduct[]> {
  const text = query.trim();
  return prisma.product.findMany({
    where: {
      companyId,
      ...(text
        ? { OR: [{ name: { contains: text, mode: 'insensitive' } }, { sku: { contains: text, mode: 'insensitive' } }, { barcode: { contains: text, mode: 'insensitive' } }] }
        : {}),
    },
    select: { id: true, sku: true, name: true, unit: true, tracksLots: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
}

export async function getTraceableProduct(companyId: string, productId: string): Promise<TraceableProduct | null> {
  return prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true, sku: true, name: true, unit: true, tracksLots: true },
  });
}

const supplierName = (c: { razonSocial: string; nombreFantasia: string | null } | null | undefined): string | null =>
  c ? c.nombreFantasia?.trim() || c.razonSocial : null;

export async function getProductFlow(companyId: string, productId: string, options: { days: number; now?: Date }): Promise<ProductFlow | null> {
  const now = options.now ?? new Date();
  const since = windowStart(now, options.days);
  const product = await getTraceableProduct(companyId, productId);
  if (!product) return null;

  const [windowMovements, recentMovements, stocks, lots, orderItems, serialGroups, serialEvents] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { companyId, productId, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FLOW_FETCH_LIMIT,
      select: {
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
        lotAllocations: true,
        warehouse: { select: { name: true } },
        user: { select: { name: true } },
        supplier: { select: { razonSocial: true, nombreFantasia: true } },
      },
    }),
    prisma.inventoryMovement.findMany({
      where: { companyId, productId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: TIMELINE_LIMIT,
      select: {
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
        lotAllocations: true,
        warehouse: { select: { name: true } },
        user: { select: { name: true } },
        supplier: { select: { razonSocial: true, nombreFantasia: true } },
      },
    }),
    prisma.stock.findMany({
      where: { companyId, productId, quantity: { not: 0 } },
      select: { warehouseId: true, quantity: true, warehouse: { select: { name: true } } },
      orderBy: { warehouse: { name: 'asc' } },
    }),
    prisma.inventoryLot.findMany({
      where: { companyId, productId, quantity: { gt: 0 } },
      select: { warehouseId: true, lotNumber: true, quantity: true, expiryDate: true },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    }),
    prisma.purchaseOrderItem.findMany({
      where: { companyId, productId, order: { companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } } },
      select: {
        id: true,
        quantity: true,
        receivedQuantity: true,
        order: { select: { folio: true, issueDate: true, expectedDate: true, contact: { select: { razonSocial: true, nombreFantasia: true } } } },
      },
      orderBy: { order: { issueDate: 'desc' } },
      take: 50,
    }),
    prisma.productSerial.groupBy({
      by: ['warehouseId'],
      where: { companyId, productId, status: 'IN_STOCK' },
      _count: { _all: true },
    }),
    prisma.productSerialEvent.findMany({
      where: { companyId, serial: { productId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: TIMELINE_LIMIT,
      select: { id: true, kind: true, fromStatus: true, toStatus: true, reference: true, note: true, createdAt: true, userId: true, serial: { select: { serial: true } } },
    }),
  ]);

  type MovementRow = (typeof windowMovements)[number];
  const cardOf = (row: MovementRow): FlowCard => {
    const reason = wasteReasonLabel(row.reasonCode);
    const lot = describeLotAllocations(row.lotAllocations);
    const parts = [row.warehouse.name, supplierName(row.supplier), reason, lot].filter((part): part is string => Boolean(part));
    return {
      id: row.id,
      at: row.createdAt,
      title: MOVEMENT_TYPE_LABELS[row.type],
      subtitle: parts.length ? parts.join(' · ') : null,
      quantity: row.quantity,
      reference: row.reference,
      actor: row.user?.name ?? null,
      evidenceUrl: row.evidenceUrl,
    };
  };

  const totals = summarizeMovementStages(windowMovements);
  const cardsFor = (stage: FlowStage): FlowCard[] =>
    windowMovements.filter((row) => stageOfMovement(row) === stage).slice(0, CARDS_PER_STAGE).map(cardOf);

  const lotsByWarehouse = new Map<string, WarehouseStockCard['lots']>();
  for (const lot of lots) {
    const list = lotsByWarehouse.get(lot.warehouseId) ?? [];
    list.push({ lotNumber: lot.lotNumber, quantity: lot.quantity, expiryDate: lot.expiryDate });
    lotsByWarehouse.set(lot.warehouseId, list);
  }
  const serialsByWarehouse = new Map<string, number>();
  for (const group of serialGroups) if (group.warehouseId) serialsByWarehouse.set(group.warehouseId, group._count._all);
  const stockedWarehouses = new Set(stocks.map((stock) => stock.warehouseId));
  const warehouses: WarehouseStockCard[] = stocks.map((stock) => ({
    warehouseId: stock.warehouseId,
    warehouseName: stock.warehouse.name,
    quantity: stock.quantity,
    lots: lotsByWarehouse.get(stock.warehouseId) ?? [],
    serials: serialCoverage(stock.quantity, serialsByWarehouse.get(stock.warehouseId) ?? 0),
  }));
  // Series en una bodega que ya no tiene stock: se muestran para que no queden invisibles.
  const orphanIds = [...serialsByWarehouse.keys()].filter((id) => !stockedWarehouses.has(id));
  if (orphanIds.length) {
    const names = await prisma.warehouse.findMany({ where: { companyId, id: { in: orphanIds } }, select: { id: true, name: true } });
    for (const warehouse of names) {
      warehouses.push({
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        quantity: 0,
        lots: [],
        serials: serialCoverage(0, serialsByWarehouse.get(warehouse.id) ?? 0),
      });
    }
  }

  const inTransitCards: FlowCard[] = [];
  let inTransitTotal = 0;
  for (const item of orderItems) {
    const pending = pendingQuantity(item.quantity, item.receivedQuantity);
    if (pending <= 0) continue;
    inTransitTotal += pending;
    const expected = item.order.expectedDate ? `llega ${item.order.expectedDate.toISOString().slice(0, 10)}` : null;
    inTransitCards.push({
      id: item.id,
      at: item.order.issueDate,
      title: `Orden de compra #${item.order.folio}`,
      subtitle: [supplierName(item.order.contact), expected].filter((part): part is string => Boolean(part)).join(' · ') || null,
      quantity: pending,
      reference: `OC #${item.order.folio}`,
      actor: null,
      evidenceUrl: null,
    });
  }

  const userIds = [...new Set(serialEvents.map((event) => event.userId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds }, memberships: { some: { companyId } } }, select: { id: true, name: true } })
    : [];
  const userName = new Map(users.map((user) => [user.id, user.name]));

  const movementEntries: TimelineEntry[] = recentMovements.map((row) => {
    const card = cardOf(row);
    const forward = row.newStock >= row.previousStock;
    return {
      id: `m:${row.id}`,
      at: row.createdAt,
      source: 'movement',
      title: `${card.title} · ${forward ? '+' : '−'}${row.quantity}`,
      detail: [card.subtitle, row.notes].filter((part): part is string => Boolean(part)).join(' — ') || null,
      actor: card.actor,
      reference: row.reference,
      evidenceUrl: row.evidenceUrl,
      stage: stageOfMovement(row) ?? (row.type === 'TRANSFER' ? 'TRANSFERRED' : null),
    };
  });
  const serialEntries: TimelineEntry[] = serialEvents.map((event) => ({
    id: `s:${event.id}`,
    at: event.createdAt,
    source: 'serial',
    title: `Serie ${event.serial.serial} · ${SERIAL_EVENT_LABELS[event.kind]}`,
    detail: event.note,
    actor: event.userId ? (userName.get(event.userId) ?? null) : null,
    reference: event.reference,
    evidenceUrl: null,
    stage: null,
  }));

  return {
    product,
    days: options.days,
    truncated: windowMovements.length >= FLOW_FETCH_LIMIT,
    inTransit: { total: inTransitTotal, cards: inTransitCards.slice(0, CARDS_PER_STAGE) },
    inWarehouse: { total: warehouses.reduce((sum, w) => sum + w.quantity, 0), warehouses },
    received: { ...totals.RECEIVED, cards: cardsFor('RECEIVED') },
    transferred: { ...totals.TRANSFERRED, cards: cardsFor('TRANSFERRED') },
    sold: { ...totals.SOLD, cards: cardsFor('SOLD') },
    lost: { ...totals.LOST, cards: cardsFor('LOST') },
    timeline: sortTimeline([...movementEntries, ...serialEntries]).slice(0, TIMELINE_LIMIT),
  };
}

// ─── Series ──────────────────────────────────────────────────────────────────

export interface SerialRow {
  id: string;
  serial: string;
  status: SerialStatus;
  statusLabel: string;
  warehouseId: string | null;
  warehouseName: string | null;
  lotNumber: string | null;
  supplier: string | null;
  receivedAt: Date;
  soldAt: Date | null;
  saleLabel: string | null;
  warrantyUntil: Date | null;
  notes: string | null;
  allowedNext: SerialStatus[];
}

export async function listSerials(companyId: string, productId: string, options: { status?: SerialStatus; query?: string } = {}): Promise<SerialRow[]> {
  const where: Prisma.ProductSerialWhereInput = { companyId, productId };
  if (options.status) where.status = options.status;
  const text = options.query?.trim();
  if (text) where.serial = { contains: text.toUpperCase() };
  const rows = await prisma.productSerial.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: MAX_SERIAL_LIST,
    include: { warehouse: { select: { name: true } } },
  });
  const supplierIds = [...new Set(rows.map((row) => row.supplierId).filter((id): id is string => Boolean(id)))];
  const saleIds = [...new Set(rows.map((row) => row.salesDocumentId).filter((id): id is string => Boolean(id)))];
  const [suppliers, sales] = await Promise.all([
    supplierIds.length ? prisma.contact.findMany({ where: { companyId, id: { in: supplierIds } }, select: { id: true, razonSocial: true, nombreFantasia: true } }) : [],
    saleIds.length ? prisma.salesDocument.findMany({ where: { companyId, id: { in: saleIds } }, select: { id: true, dteType: true, folio: true } }) : [],
  ]);
  const supplierById = new Map(suppliers.map((c) => [c.id, supplierName(c)]));
  const saleById = new Map(sales.map((s) => [s.id, `${DTE_TYPE_LABELS[s.dteType as keyof typeof DTE_TYPE_LABELS] ?? s.dteType} #${s.folio ?? '—'}`]));
  return rows.map((row) => ({
    id: row.id,
    serial: row.serial,
    status: row.status,
    statusLabel: SERIAL_STATUS_LABELS[row.status],
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse?.name ?? null,
    lotNumber: row.lotNumber,
    supplier: row.supplierId ? (supplierById.get(row.supplierId) ?? null) : null,
    receivedAt: row.receivedAt,
    soldAt: row.soldAt,
    saleLabel: row.salesDocumentId ? (saleById.get(row.salesDocumentId) ?? null) : null,
    warrantyUntil: row.warrantyUntil,
    notes: row.notes,
    allowedNext: [...allowedSerialTransitions(row.status)],
  }));
}

export interface SaleOption {
  id: string;
  label: string;
  issueDate: Date;
  customer: string;
}

/** Ventas emitidas que llevan el producto: de ahí se elige a cuál se asocia una serie vendida. */
export async function listSalesForProduct(companyId: string, productId: string): Promise<SaleOption[]> {
  const docs = await prisma.salesDocument.findMany({
    where: { companyId, status: 'ISSUED', items: { some: { companyId, productId } } },
    orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
    take: 40,
    select: { id: true, dteType: true, folio: true, issueDate: true, contact: { select: { razonSocial: true, nombreFantasia: true } } },
  });
  return docs
    .filter((doc) => doc.dteType !== 'COTIZACION')
    .map((doc) => ({
      id: doc.id,
      label: `${DTE_TYPE_LABELS[doc.dteType as keyof typeof DTE_TYPE_LABELS] ?? doc.dteType} #${doc.folio ?? '—'}`,
      issueDate: doc.issueDate,
      customer: supplierName(doc.contact) ?? '',
    }));
}

export class TraceabilityError extends Error {}

export interface RegisterSerialsInput {
  productId: string;
  warehouseId: string;
  serials: string[];
  lotNumber?: string | null;
  supplierId?: string | null;
  notes?: string | null;
}

export async function registerSerials(companyId: string, userId: string, input: RegisterSerialsInput): Promise<{ created: number; existing: string[] }> {
  if (input.serials.length === 0) throw new TraceabilityError('Escribe al menos una serie');
  if (input.serials.length > MAX_SERIALS_PER_BATCH) throw new TraceabilityError(`Registra hasta ${MAX_SERIALS_PER_BATCH} series por vez`);
  const [product, warehouse, supplier] = await Promise.all([
    prisma.product.findFirst({ where: { id: input.productId, companyId }, select: { id: true } }),
    prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } }),
    input.supplierId ? prisma.contact.findFirst({ where: { id: input.supplierId, companyId, isSupplier: true }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!product) throw new TraceabilityError('Producto no encontrado');
  if (!warehouse) throw new TraceabilityError('Bodega no encontrada');
  if (input.supplierId && !supplier) throw new TraceabilityError('El proveedor no existe en tu empresa');

  const existing = await prisma.productSerial.findMany({
    where: { companyId, productId: input.productId, serial: { in: input.serials } },
    select: { serial: true },
  });
  const taken = new Set(existing.map((row) => row.serial));
  const fresh = input.serials.filter((serial) => !taken.has(serial));
  if (fresh.length === 0) return { created: 0, existing: [...taken] };

  await prisma.$transaction(async (tx) => {
    // `skipDuplicates` cubre la carrera de dos registros simultáneos con la misma serie.
    await tx.productSerial.createMany({
      data: fresh.map((serial) => ({
        companyId,
        productId: input.productId,
        serial,
        status: 'IN_STOCK' as const,
        warehouseId: input.warehouseId,
        lotNumber: input.lotNumber?.trim() || null,
        supplierId: input.supplierId || null,
        notes: input.notes?.trim() || null,
        createdById: userId,
      })),
      skipDuplicates: true,
    });
    const created = await tx.productSerial.findMany({
      where: { companyId, productId: input.productId, serial: { in: fresh }, createdById: userId, events: { none: {} } },
      select: { id: true },
    });
    await tx.productSerialEvent.createMany({
      data: created.map((row) => ({
        companyId,
        serialId: row.id,
        kind: 'REGISTERED' as const,
        toStatus: 'IN_STOCK' as const,
        warehouseId: input.warehouseId,
        userId,
        note: input.notes?.trim() || null,
      })),
    });
  });
  return { created: fresh.length, existing: [...taken] };
}

export interface ChangeSerialStatusInput {
  serialId: string;
  to: SerialStatus;
  note?: string | null;
  salesDocumentId?: string | null;
  /** Bodega a la que vuelve (solo al pasar a «En bodega»). */
  warehouseId?: string | null;
}

export async function changeSerialStatus(companyId: string, userId: string, input: ChangeSerialStatusInput): Promise<void> {
  const serial = await prisma.productSerial.findFirst({ where: { id: input.serialId, companyId } });
  if (!serial) throw new TraceabilityError('Serie no encontrada');
  if (!canTransitionSerial(serial.status, input.to)) {
    throw new TraceabilityError(`Una serie «${SERIAL_STATUS_LABELS[serial.status]}» no puede pasar a «${SERIAL_STATUS_LABELS[input.to]}»`);
  }
  const note = input.note?.trim() || null;
  if (input.to === 'LOST' && !note) throw new TraceabilityError('Explica qué pasó con la serie perdida');
  if (input.to === 'IN_STOCK' && !input.warehouseId) throw new TraceabilityError('Elige la bodega a la que vuelve');

  let salesDocumentId: string | null = null;
  if (input.to === 'SOLD' && input.salesDocumentId) {
    const sale = await prisma.salesDocument.findFirst({
      where: { id: input.salesDocumentId, companyId, status: 'ISSUED', items: { some: { companyId, productId: serial.productId } } },
      select: { id: true },
    });
    if (!sale) throw new TraceabilityError('La venta elegida no existe o no incluye este producto');
    salesDocumentId = sale.id;
  }
  if (input.to === 'IN_STOCK') {
    const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId!, companyId }, select: { id: true } });
    if (!warehouse) throw new TraceabilityError('Bodega no encontrada');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Condicionado al estado leído: dos clics o dos personas no aplican el cambio dos veces.
    const updated = await tx.productSerial.updateMany({
      where: { id: serial.id, companyId, status: serial.status },
      data:
        input.to === 'IN_STOCK'
          ? { status: 'IN_STOCK', warehouseId: input.warehouseId, soldAt: null, salesDocumentId: null }
          : { status: input.to, warehouseId: null, soldAt: input.to === 'SOLD' ? now : null, salesDocumentId: input.to === 'SOLD' ? salesDocumentId : null },
    });
    if (updated.count !== 1) throw new TraceabilityError('La serie cambió mientras la editabas. Recarga e inténtalo de nuevo');
    await tx.productSerialEvent.create({
      data: {
        companyId,
        serialId: serial.id,
        kind: eventKindForTransition(serial.status, input.to),
        fromStatus: serial.status,
        toStatus: input.to,
        warehouseId: input.to === 'IN_STOCK' ? input.warehouseId : serial.warehouseId,
        userId,
        reference: salesDocumentId ? 'Venta' : null,
        note,
      },
    });
  });
}

export interface TransferSerialsInput {
  productId: string;
  serialIds: string[];
  toWarehouseId: string;
  note?: string | null;
}

/**
 * Traslada series de una bodega a otra. Es el único cambio de series que mueve
 * stock: pasa por `registerTransferTx` (mismo kardex, lotes y PMP que el
 * traslado de siempre) y las series cambian de bodega en la misma transacción.
 */
export async function transferSerials(companyId: string, userId: string, input: TransferSerialsInput): Promise<{ moved: number; fromWarehouseId: string }> {
  const ids = [...new Set(input.serialIds)];
  if (ids.length === 0) throw new TraceabilityError('Elige al menos una serie');
  if (ids.length > MAX_SERIALS_PER_BATCH) throw new TraceabilityError(`Traslada hasta ${MAX_SERIALS_PER_BATCH} series por vez`);
  const [serials, destination] = await Promise.all([
    prisma.productSerial.findMany({ where: { id: { in: ids }, companyId, productId: input.productId, status: 'IN_STOCK' }, select: { id: true, warehouseId: true } }),
    prisma.warehouse.findFirst({ where: { id: input.toWarehouseId, companyId }, select: { id: true } }),
  ]);
  if (!destination) throw new TraceabilityError('Bodega de destino no encontrada');
  if (serials.length !== ids.length) throw new TraceabilityError('Alguna serie ya no está en bodega. Recarga e inténtalo de nuevo');
  const origins = new Set(serials.map((s) => s.warehouseId));
  if (origins.size !== 1) throw new TraceabilityError('Las series elegidas están en bodegas distintas: traslada de una bodega a la vez');
  const fromWarehouseId = serials[0]!.warehouseId;
  if (!fromWarehouseId) throw new TraceabilityError('La serie no tiene bodega de origen');
  if (fromWarehouseId === input.toWarehouseId) throw new TraceabilityError('La bodega de origen y destino deben ser distintas');
  const note = input.note?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await registerTransferTx(tx, companyId, {
      productId: input.productId,
      fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      quantity: ids.length,
      reference: `Traslado de series (${ids.length})`,
      notes: note ?? undefined,
      userId,
    });
    const updated = await tx.productSerial.updateMany({
      where: { id: { in: ids }, companyId, productId: input.productId, status: 'IN_STOCK', warehouseId: fromWarehouseId },
      data: { warehouseId: input.toWarehouseId },
    });
    if (updated.count !== ids.length) throw new TraceabilityError('Alguna serie cambió mientras trasladabas. Recarga e inténtalo de nuevo');
    await tx.productSerialEvent.createMany({
      data: ids.map((serialId) => ({
        companyId,
        serialId,
        kind: 'TRANSFERRED' as const,
        fromStatus: 'IN_STOCK' as const,
        toStatus: 'IN_STOCK' as const,
        warehouseId: input.toWarehouseId,
        userId,
        note,
      })),
    });
  }, LOCKING_TX_OPTIONS);
  return { moved: ids.length, fromWarehouseId };
}

// ─── Búsqueda de una serie en toda la empresa ────────────────────────────────

export interface SerialJourney {
  id: string;
  serial: string;
  product: { id: string; sku: string; name: string };
  status: SerialStatus;
  statusLabel: string;
  warehouse: string | null;
  lotNumber: string | null;
  supplier: string | null;
  receivedAt: Date;
  /** Recepción de mercadería por la que entró, si entró por una. */
  receipt: string | null;
  soldAt: Date | null;
  sale: string | null;
  customer: { name: string; rut: string } | null;
  warrantyUntil: Date | null;
  events: Array<{ id: string; at: Date; title: string; actor: string | null; reference: string | null; note: string | null }>;
  tickets: Array<{ folio: number; status: string; equipment: string; receivedAt: Date; warranty: boolean }>;
}

/** Todo lo que se sabe de un número de serie: origen, ventas, garantía, historia y servicio técnico. */
export async function lookupSerial(companyId: string, rawSerial: string, options: { includeCustomer: boolean }): Promise<SerialJourney[]> {
  const serial = normalizeSerial(rawSerial);
  if (!serial) return [];
  const rows = await prisma.productSerial.findMany({
    where: { companyId, serial },
    take: 10,
    include: {
      product: { select: { id: true, sku: true, name: true } },
      warehouse: { select: { name: true } },
      events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 },
    },
  });
  if (rows.length === 0) return [];
  const receiptIds = [...new Set(rows.map((r) => r.goodsReceiptId).filter((id): id is string => Boolean(id)))];
  const saleIds = [...new Set(rows.map((r) => r.salesDocumentId).filter((id): id is string => Boolean(id)))];
  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(rows.flatMap((r) => r.events.map((e) => e.userId)).filter((id): id is string => Boolean(id)))];
  const [receipts, sales, suppliers, users, tickets] = await Promise.all([
    receiptIds.length ? prisma.goodsReceipt.findMany({ where: { companyId, id: { in: receiptIds } }, select: { id: true, folio: true, order: { select: { folio: true } } } }) : [],
    saleIds.length
      ? prisma.salesDocument.findMany({ where: { companyId, id: { in: saleIds } }, select: { id: true, dteType: true, folio: true, contact: { select: { razonSocial: true, nombreFantasia: true, rut: true } } } })
      : [],
    supplierIds.length ? prisma.contact.findMany({ where: { companyId, id: { in: supplierIds } }, select: { id: true, razonSocial: true, nombreFantasia: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds }, memberships: { some: { companyId } } }, select: { id: true, name: true } }) : [],
    prisma.serviceTicket.findMany({
      where: { companyId, serialNumber: { equals: serial, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { folio: true, status: true, equipment: true, createdAt: true, warranty: true },
    }),
  ]);
  const receiptLabel = new Map(receipts.map((r) => [r.id, `Recepción #${r.folio} (OC #${r.order.folio})`]));
  const saleInfo = new Map(sales.map((s) => [s.id, s]));
  const supplierLabel = new Map(suppliers.map((c) => [c.id, supplierName(c)]));
  const userLabel = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((row) => {
    const sale = row.salesDocumentId ? saleInfo.get(row.salesDocumentId) : undefined;
    return {
      id: row.id,
      serial: row.serial,
      product: row.product,
      status: row.status,
      statusLabel: SERIAL_STATUS_LABELS[row.status],
      warehouse: row.warehouse?.name ?? null,
      lotNumber: row.lotNumber,
      supplier: row.supplierId ? (supplierLabel.get(row.supplierId) ?? null) : null,
      receivedAt: row.receivedAt,
      receipt: row.goodsReceiptId ? (receiptLabel.get(row.goodsReceiptId) ?? null) : null,
      soldAt: row.soldAt,
      sale: sale ? `${DTE_TYPE_LABELS[sale.dteType as keyof typeof DTE_TYPE_LABELS] ?? sale.dteType} #${sale.folio ?? '—'}` : null,
      customer: sale && options.includeCustomer ? { name: supplierName(sale.contact) ?? '', rut: sale.contact.rut } : null,
      warrantyUntil: row.warrantyUntil,
      events: row.events.map((event) => ({
        id: event.id,
        at: event.createdAt,
        title: SERIAL_EVENT_LABELS[event.kind],
        actor: event.userId ? (userLabel.get(event.userId) ?? null) : null,
        reference: event.reference,
        note: event.note,
      })),
      tickets: tickets.map((t) => ({ folio: t.folio, status: t.status, equipment: t.equipment, receivedAt: t.createdAt, warranty: t.warranty })),
    };
  });
}
