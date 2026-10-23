import { wasteReasonLabel } from '@/lib/warehouse-mobile/modes';
import { prisma } from '@/lib/prisma';
import type { InventoryMovement, MovementType, Prisma, Warehouse } from '@prisma/client';
import { calculateNewPmp } from '@/lib/inventory/pmp';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { postInventoryAdjustmentEntry } from '@/modules/accounting/posting-rules/inventory-posting';
import { allocateFefo, normalizeLotNumber, NO_LOT, type LotAllocation } from '@/lib/inventory/lots';
import type { WarehouseCreateInput } from '../schema';

/** Tope de la columna `InventoryMovement.totalCost` (Int de Postgres). */
const MAX_MOVEMENT_TOTAL = 2_147_483_647;

/**
 * Costo total del movimiento, validado antes de escribir: una cantidad o un
 * costo con ceros de más (p. ej. 11.111.100.000) desbordaba la columna y el
 * usuario recibía un error genérico en vez de saber qué corregir.
 */
function movementTotalCost(quantity: number, unitCost: number): number {
  const total = Math.round(quantity * unitCost);
  if (!Number.isFinite(total) || Math.abs(total) > MAX_MOVEMENT_TOTAL) {
    throw new Error('El costo total del movimiento es demasiado grande (máximo $2.147.483.647). Revisa la cantidad y el costo unitario.');
  }
  return total;
}

export type TxClient = Prisma.TransactionClient;

/**
 * Quién, por qué y con qué respaldo se hizo un movimiento. Todo opcional: los
 * movimientos que nacen de un documento de venta o compra no lo llevan.
 */
export interface MovementAttribution {
  /** Operario que hizo el movimiento. */
  userId?: string;
  /** Motivo de una salida o ajuste (código de `WASTE_REASONS`). */
  reasonCode?: string;
  /** Foto de respaldo, ya subida a nuestro almacenamiento. */
  evidenceUrl?: string;
  /** Proveedor de quien llegó la mercadería (debe ser un contacto de la empresa). */
  supplierId?: string;
}

export interface StockInLot {
  lotNumber: string;
  expiryDate?: Date | null;
  quantity: number;
}

export interface StockInParams extends MovementAttribution {
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  unitCost: number;
  reference?: string;
  notes?: string;
  /**
   * Recepción de mercadería de un seller (consignación). Es la ÚNICA forma de hacer entrar como
   * `PURCHASE_IN` un producto que es del seller: Compras, recepciones, importaciones y la bodega
   * móvil no la pasan, así que no pueden "comprarlo" por error.
   */
  consignment?: boolean;
  /**
   * Reparto por lote de lo que entra (solo productos con `tracksLots`). Sin
   * reparto, todo entra al lote "SIN-LOTE". La suma debe igualar `quantity`.
   */
  lots?: StockInLot[];
}

export interface StockOutParams extends MovementAttribution {
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  reference?: string;
  notes?: string;
  /**
   * Nunca dejar el stock bajo cero, aunque la empresa permita vender con stock negativo. Para lo que
   * saca mercadería física que tiene que existir (devolverle algo a un seller), no para ventas.
   */
  forbidNegative?: boolean;
}

async function getCompanyStockTotal(tx: TxClient, companyId: string, productId: string): Promise<number> {
  const agg = await tx.stock.aggregate({ where: { companyId, productId }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

/**
 * Toma un lock exclusivo sobre la fila del producto hasta el fin de la
 * transacción. Sin esto, el patrón leer → calcular en JS → escribir valor
 * absoluto pierde actualizaciones bajo Read Committed (el aislamiento por
 * defecto de Postgres): dos ventas concurrentes de 6 sobre stock 10 leían ambas
 * 10, ambas pasaban la validación y ambas escribían 4, sobrevendiendo 2
 * unidades en silencio. Serializando por producto, tanto el stock como el PMP
 * quedan consistentes.
 */
async function lockProductRow(tx: TxClient, companyId: string, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} AND "companyId" = ${companyId} FOR UPDATE`;
}

export async function applyStockIn(tx: TxClient, companyId: string, params: StockInParams): Promise<InventoryMovement> {
  const { productId, warehouseId, type, quantity, unitCost, reference, notes } = params;
  if (quantity <= 0) throw new Error('La cantidad debe ser mayor a cero');
  if (unitCost < 0) throw new Error('El costo unitario no puede ser negativo');

  await lockProductRow(tx, companyId, productId);
  const product = await tx.product.findFirst({ where: { id: productId, companyId } });
  if (!product) throw new Error('Producto no encontrado');
  if (!product.isTrackable) throw new Error('Este producto no gestiona stock (no es trackeable)');

  const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId } });
  if (!warehouse) throw new Error('Bodega no encontrada');

  // Un producto de seller es del seller hasta que se vende: no se compra ni se valoriza. Su costo
  // es siempre 0 (sin PMP, sin asiento, sin valor de inventario).
  const isConsigned = product.consignorId !== null;
  if (isConsigned && type === 'PURCHASE_IN' && !params.consignment) {
    throw new Error(`"${product.name}" está en consignación: la mercadería es del seller y no se compra. Regístrala desde Inventario → Consignación.`);
  }
  if (params.consignment && !isConsigned) {
    throw new Error(`"${product.name}" no es un producto de seller: asígnale su seller en el catálogo antes de recibirlo en consignación.`);
  }

  // En una recepción de consignación el seller es el dueño del producto TAL COMO QUEDÓ bajo el
  // bloqueo (no el que se leyó antes): así el kardex nunca atribuye la entrada a un dueño anterior.
  const supplierId = params.consignment ? product.consignorId ?? undefined : params.supplierId;
  if (supplierId) {
    const supplier = await tx.contact.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
    if (!supplier) throw new Error('Proveedor no encontrado');
  }

  const stock = await tx.stock.findUnique({
    where: { companyId_productId_warehouseId: { companyId, productId, warehouseId } },
  });
  const localPreviousStock = stock?.quantity ?? 0;
  const companyPreviousStock = await getCompanyStockTotal(tx, companyId, productId);

  const effectiveUnitCost = isConsigned ? 0 : unitCost;
  const { newPmp } = isConsigned
    ? { newPmp: 0 }
    : calculateNewPmp({
        previousStock: companyPreviousStock,
        previousPmp: product.costPricePMP,
        incomingQuantity: quantity,
        incomingUnitCost: unitCost,
      });
  const localNewStock = localPreviousStock + quantity;

  await tx.stock.upsert({
    where: { companyId_productId_warehouseId: { companyId, productId, warehouseId } },
    update: { quantity: localNewStock },
    create: { companyId, productId, warehouseId, quantity: localNewStock },
  });

  if (!isConsigned) await tx.product.update({ where: { id: productId }, data: { costPricePMP: newPmp } });

  const lotAllocations = product.tracksLots ? await addToLots(tx, companyId, productId, warehouseId, quantity, params.lots) : null;

  return tx.inventoryMovement.create({
    data: {
      companyId,
      productId,
      warehouseId,
      type,
      quantity,
      unitCost: effectiveUnitCost,
      totalCost: movementTotalCost(quantity, effectiveUnitCost),
      previousStock: localPreviousStock,
      newStock: localNewStock,
      previousPmp: product.costPricePMP,
      newPmp,
      reference,
      notes,
      lotAllocations: lotAllocations ?? undefined,
      userId: params.userId,
      reasonCode: params.reasonCode,
      evidenceUrl: params.evidenceUrl,
      supplierId,
    },
  });
}

/** Suma una entrada a los lotes del producto en la bodega (upsert por número de lote). */
async function addToLots(tx: TxClient, companyId: string, productId: string, warehouseId: string, quantity: number, lots: StockInLot[] | undefined): Promise<LotAllocation[]> {
  const entries = lots && lots.length > 0 ? lots : [{ lotNumber: NO_LOT, expiryDate: null, quantity }];
  const total = entries.reduce((sum, lot) => sum + lot.quantity, 0);
  if (Math.abs(total - quantity) > 1e-6) throw new Error('La suma de los lotes no coincide con la cantidad que entra');
  const allocations: LotAllocation[] = [];
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const lotNumber = normalizeLotNumber(entry.lotNumber);
    const expiryDate = entry.expiryDate ?? null;
    await tx.inventoryLot.upsert({
      where: { companyId_productId_warehouseId_lotNumber: { companyId, productId, warehouseId, lotNumber } },
      // El vencimiento de un lote existente solo se completa si no lo tenía.
      update: { quantity: { increment: entry.quantity }, ...(expiryDate ? { expiryDate } : {}) },
      create: { companyId, productId, warehouseId, lotNumber, expiryDate, quantity: entry.quantity },
    });
    allocations.push({ lotNumber, expiryDate: expiryDate?.toISOString() ?? null, quantity: entry.quantity });
  }
  return allocations;
}

/** Descuenta una salida de los lotes por FEFO (vence antes, sale antes). */
async function takeFromLots(tx: TxClient, companyId: string, productId: string, warehouseId: string, quantity: number): Promise<LotAllocation[]> {
  const lots = await tx.inventoryLot.findMany({
    where: { companyId, productId, warehouseId, quantity: { gt: 0 } },
    select: { id: true, lotNumber: true, expiryDate: true, quantity: true, createdAt: true },
  });
  const { allocations } = allocateFefo(lots, quantity);
  for (const allocation of allocations) {
    const lot = lots.find((candidate) => candidate.lotNumber === allocation.lotNumber);
    if (!lot) continue;
    await tx.inventoryLot.updateMany({ where: { id: lot.id, companyId }, data: { quantity: { decrement: allocation.quantity } } });
  }
  return allocations;
}

export async function applyStockOut(tx: TxClient, companyId: string, params: StockOutParams): Promise<InventoryMovement> {
  const { productId, warehouseId, type, quantity, reference, notes } = params;
  if (quantity <= 0) throw new Error('La cantidad debe ser mayor a cero');

  await lockProductRow(tx, companyId, productId);
  const product = await tx.product.findFirst({ where: { id: productId, companyId } });
  if (!product) throw new Error('Producto no encontrado');
  if (!product.isTrackable) throw new Error('Este producto no gestiona stock (no es trackeable)');

  const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId } });
  if (!warehouse) throw new Error('Bodega no encontrada');

  const stock = await tx.stock.findUnique({
    where: { companyId_productId_warehouseId: { companyId, productId, warehouseId } },
  });
  const localPreviousStock = stock?.quantity ?? 0;
  const settings = await tx.companySettings.findUnique({ where: { companyId } });
  const allowNegative = Boolean(settings?.allowNegativeStock) && !params.forbidNegative;
  if (localPreviousStock < quantity && !allowNegative) {
    throw new Error(`Stock insuficiente en ${warehouse.name} (disponible: ${localPreviousStock})`);
  }
  const localNewStock = localPreviousStock - quantity;

  // Decremento atómico con guarda `gte`: aunque el lock de arriba ya serializa
  // por producto, esto hace que la invariante "el stock nunca queda negativo"
  // la imponga la propia base de datos. Si otra transacción alcanzara a bajar el
  // stock, el update afecta 0 filas y fallamos fuerte en vez de sobrevender.
  const updated = await tx.stock.updateMany({
    where: {
      companyId,
      productId,
      warehouseId,
      ...(allowNegative ? {} : { quantity: { gte: quantity } }),
    },
    data: { quantity: { decrement: quantity } },
  });
  if (updated.count !== 1) {
    throw new Error(`Stock insuficiente en ${warehouse.name} (disponible: ${localPreviousStock})`);
  }

  const unitCost = product.costPricePMP;
  const lotAllocations = product.tracksLots ? await takeFromLots(tx, companyId, productId, warehouseId, quantity) : null;

  return tx.inventoryMovement.create({
    data: {
      companyId,
      productId,
      warehouseId,
      type,
      quantity,
      unitCost,
      totalCost: movementTotalCost(quantity, unitCost),
      previousStock: localPreviousStock,
      newStock: localNewStock,
      previousPmp: product.costPricePMP,
      newPmp: product.costPricePMP,
      reference,
      notes,
      lotAllocations: lotAllocations ?? undefined,
      userId: params.userId,
      reasonCode: params.reasonCode,
      evidenceUrl: params.evidenceUrl,
      supplierId: params.supplierId,
    },
  });
}

// Único camino "manual" al kardex: una entrada/salida ligada a una venta o
// compra siempre llama `applyStockIn`/`applyStockOut` directamente desde
// `sales.service.ts`/`purchases.service.ts` (esas ya postean su propia
// regla), nunca a través de estos wrappers — por eso acá se postea siempre,
// contra `DIFERENCIA_INVENTARIO`, sin mirar `params.type`: aunque el
// operador etiquete la entrada como "PURCHASE_IN" en el formulario de
// Inventario, no hay una Factura de proveedor detrás que abonar.
//
// Las variantes `...Tx` hacen lo mismo dentro de una transacción que ya abrió
// quien llama: la app del bodeguero (`warehouse-mobile`) necesita que el
// movimiento y su registro de idempotencia queden o no queden juntos.
export async function registerStockInTx(tx: TxClient, companyId: string, params: StockInParams): Promise<InventoryMovement> {
  const movement = await applyStockIn(tx, companyId, params);
  await postInventoryAdjustmentEntry(tx, companyId, movement, true);
  return movement;
}

export async function registerStockOutTx(tx: TxClient, companyId: string, params: StockOutParams): Promise<InventoryMovement> {
  const movement = await applyStockOut(tx, companyId, params);
  await postInventoryAdjustmentEntry(tx, companyId, movement, false);
  return movement;
}

export async function registerStockIn(companyId: string, params: StockInParams): Promise<InventoryMovement> {
  return prisma.$transaction((tx) => registerStockInTx(tx, companyId, params), LOCKING_TX_OPTIONS);
}

export async function registerStockOut(companyId: string, params: StockOutParams): Promise<InventoryMovement> {
  return prisma.$transaction((tx) => registerStockOutTx(tx, companyId, params), LOCKING_TX_OPTIONS);
}

export interface TransferParams extends Pick<MovementAttribution, 'userId' | 'evidenceUrl'> {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reference?: string;
  notes?: string;
}

export async function registerTransferTx(
  tx: TxClient,
  companyId: string,
  params: TransferParams
): Promise<{ out: InventoryMovement; in: InventoryMovement }> {
  const { productId, fromWarehouseId, toWarehouseId, quantity, reference, notes } = params;
  if (fromWarehouseId === toWarehouseId) {
    throw new Error('La bodega de origen y destino deben ser distintas');
  }

  const out = await applyStockOut(tx, companyId, {
    productId,
    warehouseId: fromWarehouseId,
    type: 'TRANSFER',
    quantity,
    reference,
    notes,
    userId: params.userId,
    evidenceUrl: params.evidenceUrl,
  });
  // Los lotes viajan con la mercadería: lo que salió de cada lote entra al
  // mismo lote en la bodega de destino; lo que salió sin lote, a SIN-LOTE.
  const moved = (out.lotAllocations as LotAllocation[] | null) ?? null;
  const movedTotal = moved?.reduce((sum, lot) => sum + lot.quantity, 0) ?? 0;
  const lots = moved
    ? [
        ...moved.map((lot) => ({ lotNumber: lot.lotNumber, expiryDate: lot.expiryDate ? new Date(lot.expiryDate) : null, quantity: lot.quantity })),
        ...(quantity - movedTotal > 1e-9 ? [{ lotNumber: NO_LOT, expiryDate: null, quantity: quantity - movedTotal }] : []),
      ]
    : undefined;
  const inMove = await applyStockIn(tx, companyId, {
    productId,
    warehouseId: toWarehouseId,
    type: 'TRANSFER',
    quantity,
    unitCost: out.unitCost,
    reference,
    notes,
    lots,
    userId: params.userId,
    evidenceUrl: params.evidenceUrl,
  });
  return { out, in: inMove };
}

export async function registerTransfer(companyId: string, params: TransferParams): Promise<{ out: InventoryMovement; in: InventoryMovement }> {
  if (params.fromWarehouseId === params.toWarehouseId) {
    throw new Error('La bodega de origen y destino deben ser distintas');
  }
  return prisma.$transaction((tx) => registerTransferTx(tx, companyId, params), LOCKING_TX_OPTIONS);
}

/** Una fila del kardex de un producto, con la bodega, quién la hizo, el motivo y la foto de respaldo. */
export interface KardexRow extends InventoryMovement {
  warehouseName: string;
  /** Nombre del operario que hizo el movimiento (`null` en los que nacen de un documento). */
  operator: string | null;
  supplier: string | null;
  reasonLabel: string | null;
}

export async function listMovements(
  companyId: string,
  productId: string,
  options?: { warehouseId?: string; take?: number }
): Promise<KardexRow[]> {
  const rows = await prisma.inventoryMovement.findMany({
    where: { companyId, productId, warehouseId: options?.warehouseId },
    orderBy: { createdAt: 'desc' },
    take: options?.take ?? 100,
    include: {
      warehouse: { select: { name: true } },
      user: { select: { name: true } },
      supplier: { select: { razonSocial: true, nombreFantasia: true } },
    },
  });
  return rows.map(({ warehouse, user, supplier, ...movement }) => ({
    ...movement,
    warehouseName: warehouse.name,
    operator: user?.name ?? null,
    supplier: supplier ? supplier.nombreFantasia?.trim() || supplier.razonSocial : null,
    reasonLabel: wasteReasonLabel(movement.reasonCode),
  }));
}

export async function listWarehouses(companyId: string): Promise<Warehouse[]> {
  return prisma.warehouse.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
}

export async function createWarehouse(companyId: string, input: WarehouseCreateInput): Promise<Warehouse> {
  return prisma.warehouse.create({
    data: {
      companyId,
      name: input.name,
      code: input.code,
      address: input.address || undefined,
      isDefault: input.isDefault ?? false,
    },
  });
}

export interface StockByWarehouseRow {
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  pmp: number;
  valued: number;
}

export async function listStockByWarehouse(
  companyId: string,
  options?: { query?: string; warehouseId?: string }
): Promise<StockByWarehouseRow[]> {
  const where: Prisma.StockWhereInput = { companyId };
  if (options?.warehouseId) where.warehouseId = options.warehouseId;
  const trimmed = options?.query?.trim();
  if (trimmed) {
    where.product = { OR: [{ sku: { contains: trimmed, mode: 'insensitive' } }, { name: { contains: trimmed, mode: 'insensitive' } }] };
  }

  const rows = await prisma.stock.findMany({
    where,
    include: { product: true, warehouse: true },
    orderBy: [{ product: { name: 'asc' } }, { warehouse: { name: 'asc' } }],
  });

  return rows.map((row) => ({
    productId: row.productId,
    productName: row.product.name,
    productSku: row.product.sku,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
    quantity: row.quantity,
    pmp: row.product.costPricePMP,
    valued: Math.round(row.quantity * row.product.costPricePMP),
  }));
}
