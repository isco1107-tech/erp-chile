import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { codeVariants, looksLikeCode } from '@/lib/warehouse-mobile/codes';
import { decideMatch, rankCandidates, searchTermsFor, type MatchSubject } from '@/lib/warehouse-mobile/match';
import type { MatchReason, MobileCandidate, MobileProduct } from '../types';

/**
 * Consultas de catálogo para la app del bodeguero. Todas filtran por
 * `companyId` y ninguna devuelve costos ni precios: el celular solo necesita
 * saber qué producto es y cuánto hay.
 */

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  brand: true,
  unit: true,
  barcode: true,
  imageUrl: true,
  tracksLots: true,
  isActive: true,
  stocks: { select: { warehouseId: true, quantity: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

export function toMobileProduct(row: ProductRow, warehouseId?: string): MobileProduct {
  const totalStock = row.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const stock = warehouseId ? row.stocks.filter((entry) => entry.warehouseId === warehouseId).reduce((sum, entry) => sum + entry.quantity, 0) : totalStock;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    unit: row.unit,
    barcode: row.barcode,
    imageUrl: row.imageUrl,
    tracksLots: row.tracksLots,
    isActive: row.isActive,
    stock,
    totalStock,
  };
}

function toCandidate(row: ProductRow, warehouseId: string | undefined, reason: MatchReason, score: number, factor = 1, packagingName: string | null = null): MobileCandidate {
  return { ...toMobileProduct(row, warehouseId), reason, score, factor, packagingName };
}

/**
 * Resuelve un código leído por cámara o lector: código de barras del producto,
 * de un empaque (caja de 12) o SKU exacto. Tolera el cero adelante que pierden
 * UPC-A y EAN-13. Mismo orden de prioridad que el escáner del escritorio
 * (`findProductByCode`).
 */
export async function findByCode(companyId: string, rawCode: string, warehouseId?: string): Promise<MobileCandidate | null> {
  const variants = codeVariants(rawCode);
  if (variants.length === 0) return null;

  const byBarcode = await prisma.product.findFirst({ where: { companyId, barcode: { in: variants } }, select: PRODUCT_SELECT });
  if (byBarcode) return toCandidate(byBarcode, warehouseId, 'barcode', 1);

  const packaging = await prisma.productPackaging.findFirst({
    where: { companyId, barcode: { in: variants } },
    select: { factor: true, name: true, product: { select: PRODUCT_SELECT } },
  });
  if (packaging) return toCandidate(packaging.product, warehouseId, 'packaging', 1, packaging.factor, packaging.name);

  const bySku = await prisma.product.findFirst({
    where: { companyId, OR: variants.map((variant) => ({ sku: { equals: variant, mode: 'insensitive' as const } })) },
    select: PRODUCT_SELECT,
  });
  return bySku ? toCandidate(bySku, warehouseId, 'sku', 1) : null;
}

/** Búsqueda manual por nombre, marca o SKU. Los productos activos van primero. */
export async function searchProducts(companyId: string, query: string, warehouseId?: string, limit = 20): Promise<MobileProduct[]> {
  const text = query.trim();
  if (!text) return [];
  const like: Prisma.StringFilter = { contains: text, mode: 'insensitive' };
  const rows = await prisma.product.findMany({
    where: { companyId, OR: [{ name: like }, { brand: like }, { sku: like }, ...(looksLikeCode(text) ? [{ barcode: text }] : [])] },
    select: PRODUCT_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: limit,
  });
  return rows.map((row) => toMobileProduct(row, warehouseId));
}

/** Tope de productos que se traen de la base para puntuar contra la lectura de la foto. */
const CANDIDATE_POOL = 300;

/**
 * Productos del catálogo que se parecen a lo que la IA leyó. La base hace una
 * preselección amplia por trozos de palabra (sin depender de tildes) y el
 * puntaje de `match.ts` decide quién es candidato y si alguno es claro.
 */
export async function matchByText(
  companyId: string,
  subject: MatchSubject,
  warehouseId?: string
): Promise<{ decision: 'matched' | 'candidates' | 'new'; candidates: MobileCandidate[] }> {
  const terms = searchTermsFor(subject);
  if (terms.length === 0) return { decision: 'new', candidates: [] };

  const rows = await prisma.product.findMany({
    where: {
      companyId,
      isActive: true,
      OR: terms.flatMap((term) => [{ name: { contains: term, mode: 'insensitive' as const } }, { brand: { contains: term, mode: 'insensitive' as const } }]),
    },
    select: PRODUCT_SELECT,
    take: CANDIDATE_POOL,
  });

  const ranked = rankCandidates(
    subject,
    rows.map((row) => ({ row, name: row.name, brand: row.brand })),
    5
  );
  const { decision, picks } = decideMatch(ranked);
  return {
    decision,
    candidates: picks.map((pick) => toCandidate(pick.item.row, warehouseId, 'text', Math.round(pick.score * 100) / 100)),
  };
}

/** Producto de la empresa por id, con sus existencias. */
export async function getMobileProduct(companyId: string, productId: string, warehouseId?: string): Promise<MobileProduct | null> {
  const row = await prisma.product.findFirst({ where: { id: productId, companyId }, select: PRODUCT_SELECT });
  return row ? toMobileProduct(row, warehouseId) : null;
}

export async function listWarehouseOptions(companyId: string): Promise<Array<{ id: string; name: string; code: string; isDefault: boolean }>> {
  return prisma.warehouse.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export async function listCategoryOptions(companyId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.category.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}
