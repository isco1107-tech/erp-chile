import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';
import {
  SALE_REVERSAL_LIKE,
  computeLiveMetrics,
  liveWindow,
  roundQty,
  summarizeLive,
  type DayAggregate,
  type LiveMetrics,
  type LiveMetricsRow,
  type LiveSummary,
  type LowCoverageOption,
  type PeriodOption,
} from '@/lib/retail/live-metrics';

/**
 * Panel "Retail en vivo": sell-through y días de inventario restante de cada
 * producto en UNA bodega (el saldo corre por bodega, igual que en Movimientos
 * de bodega). Todo sale del kardex agregado por día en Postgres: el navegador
 * recibe una fila por producto, nunca los movimientos. Solo unidades: ni
 * costos ni precios.
 */

export interface LiveMetricsFilter {
  warehouseId: string;
  periodDays: PeriodOption;
  lowCoverageDays: LowCoverageOption;
  categoryId?: string;
  supplierId?: string;
}

export interface LiveMetricsResult {
  generatedAt: string;
  periodDays: PeriodOption;
  lowCoverageDays: LowCoverageOption;
  rows: LiveMetricsRow[];
  summary: LiveSummary;
}

interface RawDay {
  productId: string;
  day: string;
  sold: number;
  returned: number;
  received: number;
  delta: number;
  peak: number;
  close: number;
  lastSaleAt: string | null;
}

/** Ajuste de entrada sin operario con la referencia que escribe Ventas al acreditar o anular. */
const SALE_REVERSAL = Prisma.sql`("type" = 'ADJUSTMENT_IN' AND "userId" IS NULL AND (COALESCE("reference", '') LIKE ${SALE_REVERSAL_LIKE[0]} OR COALESCE("reference", '') LIKE ${SALE_REVERSAL_LIKE[1]}))`;

/**
 * El kardex de UNA bodega agregado por producto y día de Santiago desde `since`.
 * Lo comparten el panel en vivo, el mapa de calor y la reposición predictiva:
 * la misma regla de venta neta y de día con stock para todos.
 */
export async function dailyKardex(companyId: string, warehouseId: string, since: Date): Promise<Map<string, DayAggregate[]>> {
  const daysByProduct = new Map<string, DayAggregate[]>();
  for (const raw of await dailyAggregates(companyId, warehouseId, since)) {
    const list = daysByProduct.get(raw.productId) ?? [];
    list.push({ ...raw, lastSaleAt: raw.lastSaleAt ? new Date(raw.lastSaleAt) : null });
    daysByProduct.set(raw.productId, list);
  }
  return daysByProduct;
}

async function dailyAggregates(companyId: string, warehouseId: string, since: Date): Promise<RawDay[]> {
  return prisma.$queryRaw<RawDay[]>`
    SELECT "productId",
           to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS "day",
           COALESCE(SUM(CASE WHEN "type" = 'SALE_OUT' THEN "quantity" END), 0)::float8 AS "sold",
           COALESCE(SUM(CASE WHEN ${SALE_REVERSAL} THEN "quantity" END), 0)::float8 AS "returned",
           COALESCE(SUM(CASE WHEN "newStock" > "previousStock" AND NOT ${SALE_REVERSAL} THEN "newStock" - "previousStock" END), 0)::float8 AS "received",
           SUM("newStock" - "previousStock")::float8 AS "delta",
           MAX(GREATEST("previousStock", "newStock"))::float8 AS "peak",
           ((ARRAY_AGG("newStock" ORDER BY "createdAt" DESC, "id" DESC))[1])::float8 AS "close",
           to_char(MAX(CASE WHEN "type" = 'SALE_OUT' THEN "createdAt" END), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastSaleAt"
    FROM "InventoryMovement"
    WHERE "companyId" = ${companyId}
      AND "warehouseId" = ${warehouseId}
      AND "createdAt" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    GROUP BY 1, 2`;
}

export async function getLiveMetrics(companyId: string, filter: LiveMetricsFilter, now: Date = new Date()): Promise<LiveMetricsResult> {
  const today = santiagoDateParts(now);
  const window = liveWindow(today, filter.periodDays);
  const [year, month, day] = window.completeDays[0]!.split('-').map(Number) as [number, number, number];
  const since = santiagoMidnightUtc(year, month, day);

  const [stocks, daysByProduct] = await Promise.all([
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
      select: {
        productId: true,
        quantity: true,
        product: { select: { name: true, sku: true, brand: true, unit: true, category: { select: { name: true } } } },
      },
    }),
    dailyKardex(companyId, filter.warehouseId, since),
  ]);

  const rows: LiveMetricsRow[] = [];
  const computed: LiveMetrics[] = [];
  for (const stock of stocks) {
    const days = daysByProduct.get(stock.productId) ?? [];
    // Sin saldo ni movimientos en el período no hay nada que medir: es ruido.
    if (days.length === 0 && Math.abs(stock.quantity) < 1e-9) continue;
    const metrics = computeLiveMetrics(stock.quantity, days, window, { lowCoverageDays: filter.lowCoverageDays });
    computed.push(metrics);
    rows.push({
      productId: stock.productId,
      name: stock.product.name,
      sku: stock.product.sku,
      brand: stock.product.brand,
      unit: stock.product.unit,
      category: stock.product.category?.name ?? null,
      stock: roundQty(metrics.stock),
      soldToday: roundQty(metrics.soldToday),
      sold: roundQty(metrics.sold),
      received: roundQty(metrics.received),
      sellThroughPct: metrics.sellThroughPct,
      dailyVelocity: metrics.dailyVelocity,
      coverageDays: metrics.coverageDays,
      availableDays: metrics.availableDays,
      status: metrics.status,
      lastSaleAt: metrics.lastSaleAt?.toISOString() ?? null,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  // El resumen sale de las métricas sin redondear, no de las filas ya redondeadas.
  const summary = summarizeLive(computed);

  return { generatedAt: now.toISOString(), periodDays: filter.periodDays, lowCoverageDays: filter.lowCoverageDays, rows, summary };
}

/** Categorías y proveedores para los filtros de la pantalla, solo de la empresa. */
export async function liveMetricsFacets(companyId: string): Promise<{ categories: Array<{ id: string; name: string }>; suppliers: Array<{ id: string; name: string }> }> {
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.contact.findMany({
      where: { companyId, isSupplier: true, suppliedProducts: { some: { companyId } } },
      select: { id: true, razonSocial: true },
      orderBy: { razonSocial: 'asc' },
    }),
  ]);
  return { categories, suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.razonSocial })) };
}
