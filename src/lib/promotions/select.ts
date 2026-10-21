import { daysUntilExpiry, parseDayIndex, storedDayIndex } from './dates';
import type { CatalogLot, CatalogProduct, LeafRule, Promotion, PromotionRule } from './types';
import { isValidPercentBps } from './validate';

export type PromotionStatus = 'ACTIVE' | 'DISABLED' | 'NOT_STARTED' | 'ENDED' | 'INVALID';

export interface MatchedLot {
  lotNumber: string;
  expiresAt: Date | null;
  quantity: number;
  /** Días para vencer (0 = hoy); `null` si el lote no tiene vencimiento. */
  daysToExpiry: number | null;
}

export interface SelectedProduct {
  productId: string;
  /** Lotes con stock a los que aplica (vacío si el producto no maneja lotes). */
  matchedLots: MatchedLot[];
  /**
   * `true` si la rebaja alcanza a TODO el stock vendible del producto (regla
   * por categoría/productor/lista, o todos los lotes cumplen). `false` si solo
   * algunos lotes califican: la línea de venta debe partirse por FEFO
   * (`splitQuantityByLots`).
   */
  wholeProduct: boolean;
}

export interface PromotionSelection {
  promotionId: string;
  percentBps: number;
  status: PromotionStatus;
  products: SelectedProduct[];
}

export interface ExpiredLot {
  productId: string;
  lotNumber: string;
  expiresAt: Date;
  quantity: number;
  daysOverdue: number;
  /** Texto de pantalla: un lote vencido no se liquida, se retira. */
  action: 'Vencido, retirar';
}

export interface SelectionResult {
  selections: PromotionSelection[];
  /** Lotes con stock ya vencidos: nunca entran a una promoción. */
  expired: ExpiredLot[];
}

const EPSILON = 1e-9;

/** Estado de vigencia de una promoción a un instante dado. */
export function promotionStatus(promotion: Promotion, now: Date): PromotionStatus {
  if (!isValidPercentBps(promotion.percentBps) || promotion.percentBps === 0) return 'INVALID';
  if (!promotion.isActive) return 'DISABLED';
  if (now.getTime() < promotion.startsAt.getTime()) return 'NOT_STARTED';
  if (promotion.endsAt && now.getTime() >= promotion.endsAt.getTime()) return 'ENDED';
  return 'ACTIVE';
}

function evalLeaf(rule: LeafRule, product: CatalogProduct, lot: CatalogLot | null, now: Date): boolean {
  switch (rule.type) {
    case 'CATEGORY':
      return product.categoryId !== null && rule.ids.includes(product.categoryId);
    case 'PRODUCER':
      return product.producerId !== null && rule.ids.includes(product.producerId);
    case 'PRODUCTS':
      return rule.ids.includes(product.id);
    case 'EXPIRY_BEFORE': {
      if (!lot?.expiresAt) return false;
      const limit = parseDayIndex(rule.date);
      if (limit === null) return false;
      const days = daysUntilExpiry(lot.expiresAt, now);
      return days >= 0 && storedDayIndex(lot.expiresAt) < limit;
    }
    case 'EXPIRY_WITHIN_DAYS': {
      if (!lot?.expiresAt || !Number.isInteger(rule.days) || rule.days < 0) return false;
      const days = daysUntilExpiry(lot.expiresAt, now);
      return days >= 0 && days <= rule.days;
    }
  }
}

function evalRule(rule: PromotionRule, product: CatalogProduct, lot: CatalogLot | null, now: Date): boolean {
  if (rule.type === 'ALL') return rule.rules.length > 0 && rule.rules.every((r) => evalRule(r, product, lot, now));
  if (rule.type === 'ANY') return rule.rules.some((r) => evalRule(r, product, lot, now));
  return evalLeaf(rule, product, lot, now);
}

function toMatched(lot: CatalogLot, now: Date): MatchedLot {
  return {
    lotNumber: lot.lotNumber,
    expiresAt: lot.expiresAt,
    quantity: lot.quantity,
    daysToExpiry: lot.expiresAt ? daysUntilExpiry(lot.expiresAt, now) : null,
  };
}

/** Lotes con stock, separando los ya vencidos (que jamás se venden con promoción). */
function partitionLots(product: CatalogProduct, now: Date): { sellable: CatalogLot[]; expired: CatalogLot[] } {
  const sellable: CatalogLot[] = [];
  const expired: CatalogLot[] = [];
  for (const lot of product.lots) {
    if (!(lot.quantity > EPSILON)) continue;
    if (lot.expiresAt && daysUntilExpiry(lot.expiresAt, now) < 0) expired.push(lot);
    else sellable.push(lot);
  }
  return { sellable, expired };
}

function selectProduct(rule: PromotionRule, product: CatalogProduct, now: Date): SelectedProduct | null {
  const { sellable, expired } = partitionLots(product, now);
  if (sellable.length === 0) {
    // Sin lotes con stock: solo vale una regla de producto. Si todo su stock
    // está vencido no hay nada que liquidar.
    if (expired.length > 0) return null;
    return evalRule(rule, product, null, now) ? { productId: product.id, matchedLots: [], wholeProduct: true } : null;
  }
  const matched = sellable.filter((lot) => evalRule(rule, product, lot, now));
  if (matched.length === 0) return null;
  return {
    productId: product.id,
    matchedLots: matched.map((lot) => toMatched(lot, now)),
    wholeProduct: matched.length === sellable.length,
  };
}

/**
 * Qué productos y lotes cubre cada promoción en el instante `now`. Una
 * promoción fuera de vigencia (o con porcentaje inválido) vuelve sin productos
 * y con su `status`. Los lotes vencidos se reportan aparte y nunca califican.
 */
export function selectPromotionTargets(
  promotions: readonly Promotion[],
  catalog: readonly CatalogProduct[],
  now: Date,
): SelectionResult {
  const selections = promotions.map<PromotionSelection>((promotion) => {
    const status = promotionStatus(promotion, now);
    const products =
      status === 'ACTIVE'
        ? catalog.flatMap((product) => {
            const selected = selectProduct(promotion.rules, product, now);
            return selected ? [selected] : [];
          })
        : [];
    return { promotionId: promotion.id, percentBps: promotion.percentBps, status, products };
  });

  const expired = catalog.flatMap((product) =>
    partitionLots(product, now).expired.map<ExpiredLot>((lot) => ({
      productId: product.id,
      lotNumber: lot.lotNumber,
      expiresAt: lot.expiresAt as Date,
      quantity: lot.quantity,
      daysOverdue: -daysUntilExpiry(lot.expiresAt as Date, now),
      action: 'Vencido, retirar',
    })),
  );

  return { selections, expired };
}

/**
 * Promociones que rigen para un producto (y, si se conoce, un lote). Salida
 * lista para `pickBestPromotion` (apply.ts). Sin `lotNumber`, una promoción
 * parcial (solo algunos lotes) cuenta como aplicable al producto.
 */
export function applicablePromotionsFor(
  result: SelectionResult,
  productId: string,
  lotNumber?: string,
): Array<{ id: string; percentBps: number }> {
  const out: Array<{ id: string; percentBps: number }> = [];
  for (const selection of result.selections) {
    const found = selection.products.find((p) => p.productId === productId);
    if (!found) continue;
    if (lotNumber !== undefined && found.matchedLots.length > 0 && !found.matchedLots.some((l) => l.lotNumber === lotNumber)) continue;
    out.push({ id: selection.promotionId, percentBps: selection.percentBps });
  }
  return out;
}
