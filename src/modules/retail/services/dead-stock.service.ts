import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { daysToExpiry } from '@/lib/inventory/lots';
import { roundQty } from '@/lib/retail/live-metrics';
import {
  daysBetween,
  isAlertMilestone,
  stoppedSince,
  suggestFor,
  summarizeDeadStock,
  type DeadStockDays,
  type DeadStockRow,
  type DeadStockSummary,
} from '@/lib/retail/dead-stock';

/**
 * Stock muerto de UNA bodega: productos con stock que llevan el umbral de días
 * sin salir por venta ni por traslado, sin contar lo recién llegado (ver
 * `src/lib/retail/dead-stock.ts`). Primero se descartan con una consulta
 * acotada al umbral los que sí rotaron; la historia completa solo se lee para
 * los candidatos, que por definición tienen pocos movimientos recientes.
 */

export interface DeadStockFilter {
  warehouseId: string;
  thresholdDays: DeadStockDays;
  categoryId?: string;
  supplierId?: string;
}

export interface DeadStockResult {
  generatedAt: string;
  thresholdDays: DeadStockDays;
  rows: DeadStockRow[];
  summary: DeadStockSummary;
}

/** Salió por venta o por traslado hacia otra bodega. */
const ROTATED = Prisma.sql`("type" = 'SALE_OUT' OR ("type" = 'TRANSFER' AND "newStock" < "previousStock"))`;
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
/** Postgres admite hasta 65.535 parámetros por consulta. */
const CHUNK = 5000;

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) result.push(items.slice(i, i + CHUNK));
  return result;
}

interface RawTimeline {
  productId: string;
  lastOutAt: string | null;
  lastSaleAt: string | null;
  restockedAt: string | null;
  firstMovementAt: string | null;
}

const asDate = (iso: string | null) => (iso ? new Date(iso) : null);

export async function getDeadStock(companyId: string, filter: DeadStockFilter, options: { includeCosts: boolean }, now: Date = new Date()): Promise<DeadStockResult> {
  const stocks = await prisma.stock.findMany({
    where: {
      companyId,
      warehouseId: filter.warehouseId,
      quantity: { gt: 0 },
      product: {
        companyId,
        isTrackable: true,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.supplierId ? { suppliers: { some: { supplierId: filter.supplierId, companyId } } } : {}),
      },
    },
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true, sku: true, brand: true, unit: true, costPricePMP: true, category: { select: { name: true } } } },
    },
  });

  const empty: DeadStockResult = { generatedAt: now.toISOString(), thresholdDays: filter.thresholdDays, rows: [], summary: summarizeDeadStock([], options.includeCosts) };
  if (stocks.length === 0) return empty;

  // Los que rotaron dentro del umbral no pueden estar muertos.
  const since = new Date(now.getTime() - filter.thresholdDays * 86_400_000);
  const rotated = await prisma.$queryRaw<Array<{ productId: string }>>`
    SELECT DISTINCT "productId"
    FROM "InventoryMovement"
    WHERE "companyId" = ${companyId}
      AND "warehouseId" = ${filter.warehouseId}
      AND "createdAt" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND ${ROTATED}`;
  const rotatedIds = new Set(rotated.map((row) => row.productId));
  const candidates = stocks.filter((stock) => !rotatedIds.has(stock.productId));
  if (candidates.length === 0) return empty;

  const timelines = new Map<string, RawTimeline>();
  const expiries = new Map<string, Date>();
  for (const ids of chunks(candidates.map((stock) => stock.productId))) {
    const [rows, lots] = await Promise.all([
      prisma.$queryRaw<RawTimeline[]>`
        SELECT "productId",
               to_char(MAX(CASE WHEN ${ROTATED} THEN "createdAt" END), ${ISO}) AS "lastOutAt",
               to_char(MAX(CASE WHEN "type" = 'SALE_OUT' THEN "createdAt" END), ${ISO}) AS "lastSaleAt",
               to_char(MAX(CASE WHEN "previousStock" <= 0 AND "newStock" > 0 THEN "createdAt" END), ${ISO}) AS "restockedAt",
               to_char(MIN("createdAt"), ${ISO}) AS "firstMovementAt"
        FROM "InventoryMovement"
        WHERE "companyId" = ${companyId}
          AND "warehouseId" = ${filter.warehouseId}
          AND "productId" IN (${Prisma.join(ids)})
        GROUP BY 1`,
      prisma.inventoryLot.groupBy({
        by: ['productId'],
        where: { companyId, warehouseId: filter.warehouseId, productId: { in: ids }, quantity: { gt: 0 }, expiryDate: { not: null } },
        _min: { expiryDate: true },
      }),
    ]);
    for (const row of rows) timelines.set(row.productId, row);
    for (const lot of lots) if (lot._min.expiryDate) expiries.set(lot.productId, lot._min.expiryDate);
  }

  const today = startOfTodaySantiago(now);
  const rows: DeadStockRow[] = [];
  for (const stock of candidates) {
    const timeline = timelines.get(stock.productId);
    const from = timeline
      ? stoppedSince({ lastOutAt: asDate(timeline.lastOutAt), restockedAt: asDate(timeline.restockedAt), firstMovementAt: asDate(timeline.firstMovementAt) })
      : null;
    // Sin kardex no se sabe desde cuándo está: no se inventa una antigüedad.
    if (!from) continue;
    const daysStopped = daysBetween(from, now);
    if (daysStopped < filter.thresholdDays) continue;
    const expiry = expiries.get(stock.productId);
    const toExpiry = expiry ? daysToExpiry(expiry, today) : null;
    const neverSold = !timeline?.lastSaleAt;
    rows.push({
      productId: stock.productId,
      name: stock.product.name,
      sku: stock.product.sku,
      brand: stock.product.brand,
      unit: stock.product.unit,
      category: stock.product.category?.name ?? null,
      stock: roundQty(stock.quantity),
      daysStopped,
      lastSaleAt: timeline?.lastSaleAt ?? null,
      neverSold,
      daysToExpiry: toExpiry,
      value: options.includeCosts ? Math.round(stock.quantity * stock.product.costPricePMP) : null,
      suggestion: suggestFor({ neverSold, daysStopped, thresholdDays: filter.thresholdDays, daysToExpiry: toExpiry }),
    });
  }

  // Lo que más plata tiene detenida primero (si se puede ver); si no, lo que lleva más tiempo.
  rows.sort((a, b) => (options.includeCosts ? (b.value ?? 0) - (a.value ?? 0) : 0) || b.daysStopped - a.daysStopped || a.name.localeCompare(b.name, 'es'));
  return { generatedAt: now.toISOString(), thresholdDays: filter.thresholdDays, rows, summary: summarizeDeadStock(rows, options.includeCosts) };
}

export interface DeadStockMilestone {
  warehouseId: string;
  warehouseName: string;
  sku: string;
  productName: string;
  stock: number;
  daysStopped: number;
  neverSold: boolean;
}

/**
 * Productos que HOY cumplen un hito de stock muerto (el umbral, el doble, el
 * triple…), en todas las bodegas. Lo usa la alerta operativa diaria para
 * avisar una vez por hito y no todos los días.
 */
export async function findDeadStockMilestones(companyId: string, thresholdDays: DeadStockDays, now: Date = new Date()): Promise<DeadStockMilestone[]> {
  const warehouses = await prisma.warehouse.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const result: DeadStockMilestone[] = [];
  for (const warehouse of warehouses) {
    const { rows } = await getDeadStock(companyId, { warehouseId: warehouse.id, thresholdDays }, { includeCosts: false }, now);
    for (const row of rows) {
      if (!isAlertMilestone(row.daysStopped, thresholdDays)) continue;
      result.push({ warehouseId: warehouse.id, warehouseName: warehouse.name, sku: row.sku, productName: row.name, stock: row.stock, daysStopped: row.daysStopped, neverSold: row.neverSold });
    }
  }
  return result;
}
