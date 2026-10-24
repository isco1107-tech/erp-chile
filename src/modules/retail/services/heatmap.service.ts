import 'server-only';

import { prisma } from '@/lib/prisma';
import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';
import { dailySeries, roundQty } from '@/lib/retail/live-metrics';
import {
  HEATMAP_PRODUCT_LIMIT,
  PRICE_LOOKBACK_DAYS,
  bucketSeries,
  detectPriceChanges,
  heatmapColumns,
  lastDays,
  modalPrices,
  priceReaction,
  type HeatmapCell,
  type HeatmapColumn,
  type HeatmapGrain,
  type HeatmapOrder,
  type PricePoint,
  type PriceReaction,
} from '@/lib/retail/heatmap';
import { dailyKardex } from './live-metrics.service';

/**
 * Mapa de calor de UNA bodega: venta neta por producto y semana (o día), con
 * los períodos sin stock marcados aparte, y la reacción de la venta a cada
 * cambio de precio cobrado en los últimos 90 días. Solo lectura.
 */

export interface HeatmapFilter {
  warehouseId: string;
  grain: HeatmapGrain;
  order: HeatmapOrder;
  categoryId?: string;
  supplierId?: string;
}

export interface HeatmapRow {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  cells: HeatmapCell[];
  total: number;
}

export interface PriceReactionRow extends PriceReaction {
  productId: string;
  name: string;
  sku: string;
}

export interface HeatmapResult {
  generatedAt: string;
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
  /** Venta más alta de una celda: tope de la escala de color. */
  max: number;
  /** Productos que calzan con los filtros (el mapa muestra hasta `HEATMAP_PRODUCT_LIMIT`). */
  candidates: number;
  reactions: PriceReactionRow[];
}

/** Ventas emitidas que sacan mercadería al cliente (las notas de crédito no traen precio de venta). */
const SALE_TYPES = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const;
const MAX_REACTIONS = 30;

async function soldPrices(companyId: string, warehouseId: string, since: Date): Promise<Map<string, PricePoint[]>> {
  const rows = await prisma.$queryRaw<Array<{ productId: string; day: string; price: number; quantity: number }>>`
    SELECT i."productId",
           to_char((d."issueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS "day",
           ROUND(i."unitPrice" * (1 - i."discountPercent" / 100.0))::int AS "price",
           SUM(i."quantity")::float8 AS "quantity"
    FROM "SalesDocumentItem" i
    JOIN "SalesDocument" d ON d."id" = i."documentId"
    WHERE d."companyId" = ${companyId}
      AND i."companyId" = ${companyId}
      AND d."warehouseId" = ${warehouseId}
      AND d."status" = 'ISSUED'
      AND d."dteType"::text IN (${SALE_TYPES[0]}, ${SALE_TYPES[1]}, ${SALE_TYPES[2]}, ${SALE_TYPES[3]})
      AND d."issueDate" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND i."productId" IS NOT NULL
      AND i."quantity" > 0
    GROUP BY 1, 2, 3`;
  const byProduct = new Map<string, PricePoint[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({ day: row.day, price: row.price, quantity: row.quantity });
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

export async function getHeatmap(companyId: string, filter: HeatmapFilter, now: Date = new Date()): Promise<HeatmapResult> {
  const today = santiagoDateParts(now);
  const keys = lastDays(today, PRICE_LOOKBACK_DAYS + 1);
  const todayKey = keys[keys.length - 1]!;
  const [year, month, day] = keys[0]!.split('-').map(Number) as [number, number, number];
  const since = santiagoMidnightUtc(year, month, day);
  const columns = heatmapColumns(today, filter.grain);

  const [stocks, kardex, prices] = await Promise.all([
    prisma.stock.findMany({
      where: {
        companyId,
        warehouseId: filter.warehouseId,
        product: {
          companyId,
          isTrackable: true,
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
          ...(filter.supplierId ? { suppliers: { some: { supplierId: filter.supplierId, companyId } } } : {}),
        },
      },
      select: { productId: true, quantity: true, product: { select: { name: true, sku: true, unit: true } } },
    }),
    dailyKardex(companyId, filter.warehouseId, since),
    soldPrices(companyId, filter.warehouseId, since),
  ]);

  const all: HeatmapRow[] = [];
  const seriesOf = new Map<string, ReturnType<typeof dailySeries>>();
  for (const stock of stocks) {
    const days = kardex.get(stock.productId) ?? [];
    // Sin saldo ni movimientos en 90 días no hay nada que mirar.
    if (days.length === 0 && Math.abs(stock.quantity) < 1e-9) continue;
    const series = dailySeries(stock.quantity, days, keys);
    seriesOf.set(stock.productId, series);
    const cells = bucketSeries(series, columns).map((cell) => ({ ...cell, sold: roundQty(cell.sold) }));
    all.push({ productId: stock.productId, name: stock.product.name, sku: stock.product.sku, unit: stock.product.unit, cells, total: roundQty(cells.reduce((sum, cell) => sum + cell.sold, 0)) });
  }

  // "Más vendidos": lo que sí se vendió, de más a menos. "Menos vendidos": lo que tiene stock, de menos a más.
  const stockOf = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const pool = filter.order === 'mas' ? all.filter((row) => row.total > 0) : all.filter((row) => (stockOf.get(row.productId) ?? 0) > 0);
  pool.sort((a, b) => (filter.order === 'mas' ? b.total - a.total : a.total - b.total) || a.name.localeCompare(b.name, 'es'));
  const rows = pool.slice(0, HEATMAP_PRODUCT_LIMIT);
  const max = Math.max(0, ...rows.flatMap((row) => row.cells.map((cell) => cell.sold)));

  const productOf = new Map(stocks.map((stock) => [stock.productId, stock.product]));
  const reactions: PriceReactionRow[] = [];
  for (const [productId, points] of prices) {
    const product = productOf.get(productId);
    const series = seriesOf.get(productId);
    if (!product || !series) continue;
    const changes = detectPriceChanges(modalPrices(points));
    changes.forEach((change, index) => {
      const reaction = priceReaction(change, series, { previousChange: changes[index - 1]?.day ?? null, nextChange: changes[index + 1]?.day ?? null, today: todayKey });
      reactions.push({ ...reaction, productId, name: product.name, sku: product.sku });
    });
  }
  reactions.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.name.localeCompare(b.name, 'es')));

  return { generatedAt: now.toISOString(), columns, rows, max, candidates: pool.length, reactions: reactions.slice(0, MAX_REACTIONS) };
}
