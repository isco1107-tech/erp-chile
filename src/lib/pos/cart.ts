/**
 * Carrito del mostrador: funciones puras, sin React. El precio y la condición de
 * exento viajan solo para mostrar el total; el servidor los vuelve a leer del
 * catálogo al cobrar (ver `createPosSale`), así que nada de aquí es de confianza.
 */
export interface CartLine {
  productId: string;
  sku: string;
  name: string;
  netPrice: number;
  /** Precio de lista con IVA, solo para mostrar: el total sale de `computeDocument` sobre el neto. */
  grossPrice: number;
  quantity: number;
  stock: number;
  isTrackable: boolean;
  isExempt: boolean;
}

export interface CartProduct {
  id: string;
  sku: string;
  name: string;
  netPrice: number;
  grossPrice: number;
  stock: number;
  isTrackable: boolean;
  isExempt: boolean;
}

/** Tope por línea: un código leído mal ("99999999") no debe armar una venta absurda. */
export const MAX_LINE_QUANTITY = 9999;

/** Redondea a milésimas (kg, metros) para que 0,1 + 0,2 sea 0,3 y no 0,30000000000000004. */
export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Cantidad válida para una línea, o `null` si no lo es (cero, negativa, NaN, gigante). */
export function normalizeQuantity(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = roundQuantity(value);
  if (rounded <= 0 || rounded > MAX_LINE_QUANTITY) return null;
  return rounded;
}

/** Suma `units` a la línea del producto (la crea si no existe). Nunca supera el tope. */
export function addUnits(cart: CartLine[], product: CartProduct, units: number): CartLine[] {
  const add = normalizeQuantity(units);
  if (add === null) return cart;
  const existing = cart.find((line) => line.productId === product.id);
  if (existing) {
    return cart.map((line) =>
      line.productId === product.id
        ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, roundQuantity(line.quantity + add)) }
        : line,
    );
  }
  return [
    ...cart,
    {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      netPrice: product.netPrice,
      grossPrice: product.grossPrice,
      quantity: Math.min(MAX_LINE_QUANTITY, add),
      stock: product.stock,
      isTrackable: product.isTrackable,
      isExempt: product.isExempt,
    },
  ];
}

/** Fija la cantidad de una línea; una cantidad inválida o cero la quita. */
export function setQuantity(cart: CartLine[], productId: string, quantity: number): CartLine[] {
  const next = normalizeQuantity(quantity);
  if (next === null) return cart.filter((line) => line.productId !== productId);
  return cart.map((line) => (line.productId === productId ? { ...line, quantity: next } : line));
}

/** Suma o resta (±1 con los botones); llegar a cero quita la línea. */
export function changeQuantity(cart: CartLine[], productId: string, delta: number): CartLine[] {
  const line = cart.find((item) => item.productId === productId);
  if (!line) return cart;
  const next = roundQuantity(line.quantity + delta);
  if (next <= 0) return cart.filter((item) => item.productId !== productId);
  return setQuantity(cart, productId, Math.min(MAX_LINE_QUANTITY, next));
}

export function removeLine(cart: CartLine[], productId: string): CartLine[] {
  return cart.filter((line) => line.productId !== productId);
}

/** Cantidad total de unidades (para el contador del carrito). */
export function countUnits(cart: CartLine[]): number {
  return roundQuantity(cart.reduce((sum, line) => sum + line.quantity, 0));
}

/** Texto de cantidad con coma decimal chilena y sin ceros sobrantes: 1 → "1", 0,5 → "0,5". */
export function formatQuantity(quantity: number): string {
  return String(roundQuantity(quantity)).replace('.', ',');
}
