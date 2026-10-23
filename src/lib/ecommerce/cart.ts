/**
 * Carrito de la tienda. Vive en el navegador de quien compra (no hay cuenta ni
 * sesión) y SOLO guarda qué producto y cuántas unidades: el precio, el stock y
 * el despacho los resuelve el servidor cada vez que se muestra el carrito y al
 * pagar. Lo que traiga el almacenamiento del navegador no es de fiar: se
 * normaliza antes de usarlo.
 */

export interface CartLine {
  productId: string;
  quantity: number;
}

export const MAX_CART_LINES = 40;
export const MAX_LINE_QUANTITY = 99;

/** Clave del almacenamiento del navegador: una por tienda (sitio). */
export function cartStorageKey(siteSlug: string): string {
  return `aether-cart:${siteSlug}`;
}

const clampQuantity = (value: number, max = MAX_LINE_QUANTITY): number => Math.max(0, Math.min(max, Math.floor(value)));

/** Convierte lo que haya en el almacenamiento (JSON arbitrario) en un carrito válido; junta líneas repetidas. */
export function normalizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const byProduct = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { productId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== 'string' || productId.length === 0 || productId.length > 40) continue;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) continue;
    const next = clampQuantity((byProduct.get(productId) ?? 0) + quantity);
    if (next > 0) byProduct.set(productId, next);
    if (byProduct.size >= MAX_CART_LINES) break;
  }
  return [...byProduct].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Suma unidades de un producto; `max` es el tope por pedido de ese producto (si lo hay). */
export function addToCart(lines: readonly CartLine[], productId: string, quantity = 1, max = MAX_LINE_QUANTITY): CartLine[] {
  const limit = Math.max(1, Math.min(max, MAX_LINE_QUANTITY));
  const existing = lines.find((line) => line.productId === productId);
  if (!existing) {
    if (lines.length >= MAX_CART_LINES) return [...lines];
    const first = clampQuantity(quantity, limit);
    return first > 0 ? [...lines, { productId, quantity: first }] : [...lines];
  }
  return lines.map((line) => (line.productId === productId ? { ...line, quantity: clampQuantity(line.quantity + quantity, limit) } : line));
}

/** Fija las unidades de una línea; 0 (o menos) la quita. */
export function setQuantity(lines: readonly CartLine[], productId: string, quantity: number, max = MAX_LINE_QUANTITY): CartLine[] {
  const next = clampQuantity(quantity, Math.max(1, Math.min(max, MAX_LINE_QUANTITY)));
  if (next <= 0) return removeFromCart(lines, productId);
  return lines.map((line) => (line.productId === productId ? { ...line, quantity: next } : line));
}

export function removeFromCart(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
