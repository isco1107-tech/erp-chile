import { prisma } from '@/lib/prisma';
import type { InventoryMovement, MovementType, Prisma, Warehouse } from '@prisma/client';
import { calculateNewPmp } from '@/lib/inventory/pmp';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { postInventoryAdjustmentEntry } from '@/modules/accounting/posting-rules/inventory-posting';
import type { WarehouseCreateInput } from '../schema';

export type TxClient = Prisma.TransactionClient;

export interface StockInParams {
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  unitCost: number;
  reference?: string;
  notes?: string;
}

export interface StockOutParams {
  productId: string;
  warehouseId: string;
  type: MovementType;
  quantity: number;
  reference?: string;
  notes?: string;
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

  const stock = await tx.stock.findUnique({
    where: { companyId_productId_warehouseId: { companyId, productId, warehouseId } },
  });
  const localPreviousStock = stock?.quantity ?? 0;
  const companyPreviousStock = await getCompanyStockTotal(tx, companyId, productId);

  const { newPmp } = calculateNewPmp({
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

  await tx.product.update({ where: { id: productId }, data: { costPricePMP: newPmp } });

  return tx.inventoryMovement.create({
    data: {
      companyId,
      productId,
      warehouseId,
      type,
      quantity,
      unitCost,
      totalCost: Math.round(quantity * unitCost),
      previousStock: localPreviousStock,
      newStock: localNewStock,
      previousPmp: product.costPricePMP,
      newPmp,
      reference,
      notes,
    },
  });
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
  if (localPreviousStock < quantity && !settings?.allowNegativeStock) {
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
      ...(settings?.allowNegativeStock ? {} : { quantity: { gte: quantity } }),
    },
    data: { quantity: { decrement: quantity } },
  });
  if (updated.count !== 1) {
    throw new Error(`Stock insuficiente en ${warehouse.name} (disponible: ${localPreviousStock})`);
  }

  const unitCost = product.costPricePMP;

  return tx.inventoryMovement.create({
    data: {
      companyId,
      productId,
      warehouseId,
      type,
      quantity,
      unitCost,
      totalCost: Math.round(quantity * unitCost),
      previousStock: localPreviousStock,
      newStock: localNewStock,
      previousPmp: product.costPricePMP,
      newPmp: product.costPricePMP,
      reference,
      notes,
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
export async function registerStockIn(companyId: string, params: StockInParams): Promise<InventoryMovement> {
  return prisma.$transaction(async (tx) => {
    const movement = await applyStockIn(tx, companyId, params);
    await postInventoryAdjustmentEntry(tx, companyId, movement, true);
    return movement;
  }, LOCKING_TX_OPTIONS);
}

export async function registerStockOut(companyId: string, params: StockOutParams): Promise<InventoryMovement> {
  return prisma.$transaction(async (tx) => {
    const movement = await applyStockOut(tx, companyId, params);
    await postInventoryAdjustmentEntry(tx, companyId, movement, false);
    return movement;
  }, LOCKING_TX_OPTIONS);
}

export async function registerTransfer(
  companyId: string,
  params: {
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    reference?: string;
    notes?: string;
  }
): Promise<{ out: InventoryMovement; in: InventoryMovement }> {
  const { productId, fromWarehouseId, toWarehouseId, quantity, reference, notes } = params;
  if (fromWarehouseId === toWarehouseId) {
    throw new Error('La bodega de origen y destino deben ser distintas');
  }

  return prisma.$transaction(async (tx) => {
    const out = await applyStockOut(tx, companyId, {
      productId,
      warehouseId: fromWarehouseId,
      type: 'TRANSFER',
      quantity,
      reference,
      notes,
    });
    const inMove = await applyStockIn(tx, companyId, {
      productId,
      warehouseId: toWarehouseId,
      type: 'TRANSFER',
      quantity,
      unitCost: out.unitCost,
      reference,
      notes,
    });
    return { out, in: inMove };
  }, LOCKING_TX_OPTIONS);
}

export async function listMovements(
  companyId: string,
  productId: string,
  options?: { warehouseId?: string; take?: number }
): Promise<InventoryMovement[]> {
  return prisma.inventoryMovement.findMany({
    where: { companyId, productId, warehouseId: options?.warehouseId },
    orderBy: { createdAt: 'desc' },
    take: options?.take ?? 100,
  });
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
