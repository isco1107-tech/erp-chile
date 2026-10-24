import 'server-only';

import { prisma } from '@/lib/prisma';
import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';
import { lastDays } from '@/lib/retail/heatmap';
import {
  MAX_BASKET_PRODUCTS,
  MAX_PAIRS,
  RELATED_MIN_LIFT,
  comboCandidates,
  rankPairs,
  type BasketPeriod,
  type MinTogether,
  type PairMetrics,
} from '@/lib/retail/basket';

/**
 * Canasta cruzada de UNA bodega: qué productos van juntos en la misma boleta o
 * factura emitida. El conteo de pares se hace en Postgres (una fila por par
 * con el mínimo de boletas), el navegador recibe solo los pares rankeados.
 */

export interface BasketFilter {
  warehouseId: string;
  periodDays: BasketPeriod;
  minTogether: MinTogether;
  /** Solo pares de productos con proveedores distintos (cada uno con un único proveedor conocido). */
  differentSuppliers: boolean;
}

export interface BasketProduct {
  id: string;
  name: string;
  sku: string;
  /** Proveedor, si el producto tiene uno solo. */
  supplier: string | null;
}

export interface BasketPair extends PairMetrics {
  productA: BasketProduct;
  productB: BasketProduct;
}

export interface BasketResult {
  /** Boletas y facturas analizadas (sin las de más de `MAX_BASKET_PRODUCTS` productos). */
  tickets: number;
  /** Boletas con dos productos o más: las únicas que pueden mostrar un par. */
  multiTickets: number;
  avgProducts: number | null;
  related: number;
  pairs: BasketPair[];
  combos: BasketPair[];
}

const SALE_TYPES = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const;

interface RawRow {
  kind: 'T' | 'M' | 'P' | 'X';
  a: string | null;
  b: string | null;
  n: number;
}

export async function getBasket(companyId: string, filter: BasketFilter, now: Date = new Date()): Promise<BasketResult> {
  const [first] = lastDays(santiagoDateParts(now), filter.periodDays);
  const [year, month, day] = first!.split('-').map(Number) as [number, number, number];
  const since = santiagoMidnightUtc(year, month, day);

  const raw = await prisma.$queryRaw<RawRow[]>`
    WITH lines AS (
      SELECT DISTINCT i."documentId", i."productId"
      FROM "SalesDocumentItem" i
      JOIN "SalesDocument" d ON d."id" = i."documentId"
      WHERE d."companyId" = ${companyId}
        AND i."companyId" = ${companyId}
        AND d."warehouseId" = ${filter.warehouseId}
        AND d."status" = 'ISSUED'
        AND d."dteType"::text IN (${SALE_TYPES[0]}, ${SALE_TYPES[1]}, ${SALE_TYPES[2]}, ${SALE_TYPES[3]})
        AND d."issueDate" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND i."productId" IS NOT NULL
        AND i."quantity" > 0
    ),
    sizes AS (
      SELECT "documentId", COUNT(*) AS size FROM lines GROUP BY 1 HAVING COUNT(*) <= ${MAX_BASKET_PRODUCTS}
    ),
    kept AS (
      SELECT l."documentId", l."productId", s.size FROM lines l JOIN sizes s ON s."documentId" = l."documentId"
    )
    SELECT 'T' AS "kind", NULL AS "a", NULL AS "b", COUNT(*)::int AS "n" FROM sizes
    UNION ALL
    SELECT 'M', NULL, NULL, COUNT(*)::int FROM sizes WHERE size >= 2
    UNION ALL
    SELECT 'P', "productId", NULL, COUNT(*)::int FROM kept GROUP BY "productId"
    UNION ALL
    SELECT 'X', x."productId", y."productId", COUNT(*)::int
    FROM kept x JOIN kept y ON x."documentId" = y."documentId" AND x."productId" < y."productId"
    WHERE x.size >= 2
    GROUP BY x."productId", y."productId"
    HAVING COUNT(*) >= ${filter.minTogether}`;

  let tickets = 0;
  let multiTickets = 0;
  const perProduct = new Map<string, number>();
  const pairCounts: Array<{ a: string; b: string; together: number }> = [];
  for (const row of raw) {
    if (row.kind === 'T') tickets = row.n;
    else if (row.kind === 'M') multiTickets = row.n;
    else if (row.kind === 'P' && row.a) perProduct.set(row.a, row.n);
    else if (row.kind === 'X' && row.a && row.b) pairCounts.push({ a: row.a, b: row.b, together: row.n });
  }
  const lineCount = [...perProduct.values()].reduce((sum, n) => sum + n, 0);

  let ranked = rankPairs(
    pairCounts.map((pair) => ({ ...pair, withA: perProduct.get(pair.a) ?? 0, withB: perProduct.get(pair.b) ?? 0 })),
    tickets,
    filter.minTogether
  );

  const ids = [...new Set(ranked.flatMap((pair) => [pair.a, pair.b]))];
  const products = ids.length
    ? await prisma.product.findMany({
        where: { companyId, id: { in: ids } },
        select: { id: true, name: true, sku: true, suppliers: { where: { companyId }, select: { supplier: { select: { razonSocial: true } } } } },
      })
    : [];
  const productOf = new Map<string, BasketProduct>(
    products.map((product) => [product.id, { id: product.id, name: product.name, sku: product.sku, supplier: product.suppliers.length === 1 ? product.suppliers[0]!.supplier.razonSocial : null }])
  );

  if (filter.differentSuppliers) {
    ranked = ranked.filter((pair) => {
      const a = productOf.get(pair.a)?.supplier;
      const b = productOf.get(pair.b)?.supplier;
      return Boolean(a && b && a !== b);
    });
  }
  const withProducts = (pair: PairMetrics): BasketPair[] => {
    const productA = productOf.get(pair.a);
    const productB = productOf.get(pair.b);
    return productA && productB ? [{ ...pair, productA, productB }] : [];
  };
  const pairs = ranked.flatMap(withProducts);

  return {
    tickets,
    multiTickets,
    avgProducts: tickets > 0 ? lineCount / tickets : null,
    related: pairs.filter((pair) => pair.lift >= RELATED_MIN_LIFT).length,
    pairs: pairs.slice(0, MAX_PAIRS),
    combos: comboCandidates(pairs),
  };
}
