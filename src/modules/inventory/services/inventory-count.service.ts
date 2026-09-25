import { prisma } from '@/lib/prisma';
import type { InventoryCountStatus, Prisma } from '@prisma/client';
import { BATCH_TX_OPTIONS } from '@/lib/prisma-tx';
import { adjustmentAtPosting, summarizeCount, type CountSummary } from '@/lib/inventory/count';
import { postInventoryAdjustmentEntry } from '@/modules/accounting/posting-rules/inventory-posting';
import { applyStockIn, applyStockOut } from './stock.service';

/**
 * Toma de inventario: se abre con la foto del stock de una bodega (todos los
 * productos que llevan stock, o solo los de una categoría), se cuenta —a mano
 * o con lector— y al contabilizar cada diferencia se ajusta al PMP vigente.
 */

const MAX_COUNT_LINES = 20_000;

export interface InventoryCountListItem {
  id: string;
  folio: number;
  status: InventoryCountStatus;
  warehouseName: string;
  categoryName: string | null;
  notes: string | null;
  createdAt: Date;
  postedAt: Date | null;
  lines: number;
  counted: number;
}

export async function listInventoryCounts(companyId: string): Promise<InventoryCountListItem[]> {
  const counts = await prisma.inventoryCount.findMany({
    where: { companyId },
    include: { warehouse: { select: { name: true } }, _count: { select: { lines: true } } },
    orderBy: { folio: 'desc' },
    take: 200,
  });
  const ids = counts.map((count) => count.id);
  const [counted, categories] = await Promise.all([
    ids.length
      ? prisma.inventoryCountLine.groupBy({ by: ['countId'], where: { companyId, countId: { in: ids }, countedQuantity: { not: null } }, _count: { _all: true } })
      : Promise.resolve([]),
    prisma.category.findMany({
      where: { companyId, id: { in: counts.map((count) => count.categoryId).filter((id): id is string => !!id) } },
      select: { id: true, name: true },
    }),
  ]);
  const countedById = new Map(counted.map((row) => [row.countId, row._count._all]));
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  return counts.map((count) => ({
    id: count.id,
    folio: count.folio,
    status: count.status,
    warehouseName: count.warehouse.name,
    categoryName: count.categoryId ? (categoryById.get(count.categoryId) ?? null) : null,
    notes: count.notes,
    createdAt: count.createdAt,
    postedAt: count.postedAt,
    lines: count._count.lines,
    counted: countedById.get(count.id) ?? 0,
  }));
}

export interface InventoryCountLineView {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  barcode: string | null;
  packagings: { barcode: string; factor: number; name: string }[];
  systemQuantity: number;
  countedQuantity: number | null;
  stockAtPosting: number | null;
  adjustment: number | null;
  /** PMP vigente (abierto) o el aplicado al contabilizar. */
  unitCost: number;
}

export interface InventoryCountDetail {
  id: string;
  folio: number;
  status: InventoryCountStatus;
  warehouseId: string;
  warehouseName: string;
  categoryName: string | null;
  notes: string | null;
  createdAt: Date;
  postedAt: Date | null;
  lines: InventoryCountLineView[];
  summary: CountSummary;
}

export async function getInventoryCount(companyId: string, id: string): Promise<InventoryCountDetail | null> {
  const count = await prisma.inventoryCount.findFirst({
    where: { id, companyId },
    include: {
      warehouse: { select: { name: true } },
      lines: {
        include: {
          product: {
            select: {
              sku: true,
              name: true,
              unit: true,
              barcode: true,
              costPricePMP: true,
              packagings: { where: { barcode: { not: null } }, select: { barcode: true, factor: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!count) return null;
  const category = count.categoryId
    ? await prisma.category.findFirst({ where: { id: count.categoryId, companyId }, select: { name: true } })
    : null;

  const lines: InventoryCountLineView[] = count.lines
    .map((line) => ({
      id: line.id,
      productId: line.productId,
      sku: line.product.sku,
      name: line.product.name,
      unit: line.product.unit,
      barcode: line.product.barcode,
      packagings: line.product.packagings.flatMap((packaging) => (packaging.barcode ? [{ barcode: packaging.barcode, factor: packaging.factor, name: packaging.name }] : [])),
      systemQuantity: line.systemQuantity,
      countedQuantity: line.countedQuantity,
      stockAtPosting: line.stockAtPosting,
      adjustment: line.adjustment,
      unitCost: line.unitCost ?? line.product.costPricePMP,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return {
    id: count.id,
    folio: count.folio,
    status: count.status,
    warehouseId: count.warehouseId,
    warehouseName: count.warehouse.name,
    categoryName: category?.name ?? null,
    notes: count.notes,
    createdAt: count.createdAt,
    postedAt: count.postedAt,
    lines,
    summary: summarizeCount(lines),
  };
}

export async function createInventoryCount(
  companyId: string,
  userId: string,
  input: { warehouseId: string; categoryId?: string; notes?: string }
): Promise<{ id: string; folio: number; lines: number }> {
  const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } });
  if (!warehouse) throw new Error('Bodega no encontrada');
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, companyId }, select: { id: true } });
    if (!category) throw new Error('Categoría no encontrada');
  }

  const productWhere: Prisma.ProductWhereInput = { companyId, isTrackable: true, ...(input.categoryId ? { categoryId: input.categoryId } : {}) };
  const products = await prisma.product.findMany({
    where: productWhere,
    select: { id: true, stocks: { where: { warehouseId: input.warehouseId }, select: { quantity: true } } },
    take: MAX_COUNT_LINES + 1,
  });
  if (products.length === 0) throw new Error('No hay productos con stock para contar en esa selección');
  if (products.length > MAX_COUNT_LINES) throw new Error(`Son más de ${MAX_COUNT_LINES.toLocaleString('es-CL')} productos: divide el conteo por categoría`);

  return prisma.$transaction(async (tx) => {
    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'INVENTORY_COUNT' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'INVENTORY_COUNT', currentFolio: 1 },
    });
    const count = await tx.inventoryCount.create({
      data: {
        companyId,
        folio: seq.currentFolio,
        warehouseId: input.warehouseId,
        categoryId: input.categoryId || null,
        notes: input.notes || null,
        createdById: userId,
      },
    });
    await tx.inventoryCountLine.createMany({
      data: products.map((product) => ({
        companyId,
        countId: count.id,
        productId: product.id,
        systemQuantity: product.stocks[0]?.quantity ?? 0,
      })),
    });
    return { id: count.id, folio: count.folio, lines: products.length };
  }, BATCH_TX_OPTIONS);
}

async function assertOpen(companyId: string, id: string): Promise<void> {
  const count = await prisma.inventoryCount.findFirst({ where: { id, companyId }, select: { status: true } });
  if (!count) throw new Error('Conteo no encontrado');
  if (count.status !== 'OPEN') throw new Error('Este conteo ya está cerrado');
}

/** Guarda lo contado (varias líneas a la vez). `null` deja la línea sin contar. */
export async function saveCountEntries(
  companyId: string,
  id: string,
  entries: { lineId: string; countedQuantity: number | null }[]
): Promise<number> {
  await assertOpen(companyId, id);
  if (entries.length === 0) return 0;
  const results = await prisma.$transaction(
    entries.map((entry) =>
      prisma.inventoryCountLine.updateMany({
        where: { id: entry.lineId, countId: id, companyId, count: { status: 'OPEN' } },
        data: { countedQuantity: entry.countedQuantity },
      })
    )
  );
  return results.reduce((sum, result) => sum + result.count, 0);
}

export interface PostCountResult {
  folio: number;
  warehouseName: string;
  adjusted: number;
  surplusValue: number;
  shortageValue: number;
}

/**
 * Contabiliza el conteo. El ajuste se calcula contra el stock DEL MOMENTO (no
 * la foto de apertura), con los productos bloqueados, para que una venta
 * hecha durante el conteo no se descuente dos veces.
 */
export async function postInventoryCount(companyId: string, id: string, userId: string): Promise<PostCountResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InventoryCount" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const count = await tx.inventoryCount.findFirst({
      where: { id, companyId },
      include: {
        warehouse: { select: { name: true } },
        lines: { where: { countedQuantity: { not: null } }, select: { id: true, productId: true, countedQuantity: true } },
      },
    });
    if (!count) throw new Error('Conteo no encontrado');
    if (count.status !== 'OPEN') throw new Error('Este conteo ya está cerrado');
    if (count.lines.length === 0) throw new Error('Aún no hay productos contados');

    // Un solo lock, en orden de id, para todos los productos contados: evita
    // abrazos mortales con ventas que bloquean los mismos productos.
    const productIds = [...new Set(count.lines.map((line) => line.productId))].sort();
    await tx.$queryRaw`SELECT id FROM "Product" WHERE "companyId" = ${companyId} AND id = ANY(${productIds}) ORDER BY id FOR UPDATE`;

    const [stocks, products] = await Promise.all([
      tx.stock.findMany({ where: { companyId, warehouseId: count.warehouseId, productId: { in: productIds } }, select: { productId: true, quantity: true } }),
      tx.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true, costPricePMP: true, isTrackable: true } }),
    ]);
    const stockByProduct = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
    const productById = new Map(products.map((product) => [product.id, product]));

    const reference = `Toma de inventario #${count.folio}`;
    let adjusted = 0;
    let surplusValue = 0;
    let shortageValue = 0;

    for (const line of count.lines) {
      const product = productById.get(line.productId);
      const stockNow = stockByProduct.get(line.productId) ?? 0;
      const unitCost = product?.costPricePMP ?? 0;
      const adjustment = product?.isTrackable ? adjustmentAtPosting(line.countedQuantity ?? 0, stockNow) : 0;

      if (adjustment > 0) {
        const movement = await applyStockIn(tx, companyId, {
          productId: line.productId,
          warehouseId: count.warehouseId,
          type: 'ADJUSTMENT_IN',
          quantity: adjustment,
          unitCost,
          reference,
        });
        await postInventoryAdjustmentEntry(tx, companyId, movement, true, { createdByUserId: userId });
        surplusValue += movement.totalCost;
        adjusted += 1;
      } else if (adjustment < 0) {
        const movement = await applyStockOut(tx, companyId, {
          productId: line.productId,
          warehouseId: count.warehouseId,
          type: 'ADJUSTMENT_OUT',
          quantity: -adjustment,
          reference,
        });
        await postInventoryAdjustmentEntry(tx, companyId, movement, false, { createdByUserId: userId });
        shortageValue += movement.totalCost;
        adjusted += 1;
      }

      await tx.inventoryCountLine.updateMany({
        where: { id: line.id, companyId },
        data: { stockAtPosting: stockNow, adjustment, unitCost },
      });
    }

    await tx.inventoryCount.updateMany({
      where: { id, companyId },
      data: { status: 'POSTED', postedAt: new Date(), postedById: userId },
    });
    return { folio: count.folio, warehouseName: count.warehouse.name, adjusted, surplusValue, shortageValue };
  }, BATCH_TX_OPTIONS);
}

export async function cancelInventoryCount(companyId: string, id: string): Promise<void> {
  const result = await prisma.inventoryCount.updateMany({ where: { id, companyId, status: 'OPEN' }, data: { status: 'CANCELLED' } });
  if (result.count === 0) throw new Error('Solo se puede anular un conteo abierto');
}
