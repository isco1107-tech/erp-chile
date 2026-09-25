/**
 * Listas de precios, como funciones puras: las usa el servidor al crear una
 * nota de venta y el formulario para proponer el precio de cada línea.
 */

export interface PriceTier {
  minQuantity: number;
  netPrice: number;
}

/**
 * Precio neto de un producto para una cantidad: el tramo con el mayor
 * `minQuantity` que no supere la cantidad pedida. Sin tramos aplicables, el
 * precio base del catálogo.
 */
export function resolveUnitPrice(basePrice: number, tiers: readonly PriceTier[], quantity: number): number {
  let best: PriceTier | null = null;
  for (const tier of tiers) {
    if (tier.minQuantity <= quantity && (!best || tier.minQuantity > best.minQuantity)) best = tier;
  }
  return best ? best.netPrice : basePrice;
}

/** Descuento implícito de la lista respecto del precio base (0-100, un decimal). */
export function listDiscountPercent(basePrice: number, listPrice: number): number {
  if (basePrice <= 0 || listPrice >= basePrice) return 0;
  return Math.round(((basePrice - listPrice) / basePrice) * 1000) / 10;
}

/**
 * Precio de lista a partir del base con un ajuste porcentual (negativo =
 * descuento), redondeado a peso: sirve para armar una lista completa de una
 * vez ("mayoristas: 12% menos que el catálogo").
 */
export function applyPercentAdjustment(basePrice: number, percent: number): number {
  return Math.max(0, Math.round(basePrice * (1 + percent / 100)));
}
