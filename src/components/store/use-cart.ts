'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { addToCart, cartCount, cartStorageKey, normalizeCart, removeFromCart, setQuantity, type CartLine } from '@/lib/ecommerce/cart';

/**
 * Carrito del comprador: vive en el almacenamiento del navegador (una clave por tienda) y solo
 * guarda producto y cantidad. Precio, stock y despacho los resuelve siempre el servidor.
 * El almacenamiento puede faltar o estar bloqueado (ventana privada): sin él, el carrito vive
 * en memoria mientras la página esté abierta.
 */

const CHANGE_EVENT = 'aether-cart-change';
const memory = new Map<string, string>();

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? '[]';
  } catch {
    return memory.get(key) ?? '[]';
  }
}

function write(key: string, lines: CartLine[]): void {
  const raw = JSON.stringify(lines);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

/** Carrito guardado, aunque el texto esté dañado (otro programa tocó el almacenamiento): entonces parte vacío. */
function readLines(key: string): CartLine[] {
  try {
    return normalizeCart(JSON.parse(read(key)));
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** `false` en el servidor y en la primera pintura del navegador: así no se muestra «carrito vacío» antes de leer el almacenamiento. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
}

export function useCart(siteSlug: string) {
  const key = cartStorageKey(siteSlug);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => '[]');
  const lines = useMemo<CartLine[]>(() => {
    try {
      return normalizeCart(JSON.parse(raw));
    } catch {
      return [];
    }
  }, [raw]);

  const add = useCallback((productId: string, quantity = 1, max?: number) => write(key, addToCart(readLines(key), productId, quantity, max)), [key]);
  const set = useCallback((productId: string, quantity: number, max?: number) => write(key, setQuantity(readLines(key), productId, quantity, max)), [key]);
  const remove = useCallback((productId: string) => write(key, removeFromCart(readLines(key), productId)), [key]);
  const clear = useCallback(() => write(key, []), [key]);

  return { lines, count: cartCount(lines), add, set, remove, clear };
}
