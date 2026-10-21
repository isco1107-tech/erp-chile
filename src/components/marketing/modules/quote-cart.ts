'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Carrito de la vitrina de módulos: los ids que la persona marcó para
 * cotizar. Vive en `localStorage` (es un borrador de este navegador, nada que
 * deba compartirse ni guardarse en la base) para que siga marcado al pasar de
 * la landing a la página de un módulo y volver. Si el almacenamiento no está
 * disponible (modo privado, bloqueado), funciona igual mientras la página esté
 * abierta. Los ids desconocidos los descarta el servidor al cotizar.
 */

const STORAGE_KEY = 'aether:cotizacion-modulos';
const EMPTY: readonly string[] = [];
const listeners = new Set<() => void>();
let cache: readonly string[] | null = null;

function readStorage(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return EMPTY;
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))];
  } catch {
    return EMPTY;
  }
}

function snapshot(): readonly string[] {
  if (cache === null) cache = readStorage();
  return cache;
}

function write(next: readonly string[]) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento el carrito dura lo que dure la página.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Otra pestaña cambió el carrito: se relee.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = readStorage();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Abre el formulario de cotización (lo escucha `QuoteCart`). */
export const OPEN_QUOTE_EVENT = 'aether:abrir-cotizacion';

export function openQuoteDialog() {
  window.dispatchEvent(new Event(OPEN_QUOTE_EVENT));
}

export function useQuoteCart() {
  // En el servidor (y en la hidratación) el carrito está vacío: así el HTML calza.
  const ids = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const toggle = useCallback((id: string) => {
    const current = snapshot();
    write(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }, []);
  const remove = useCallback((id: string) => write(snapshot().filter((value) => value !== id)), []);
  const clear = useCallback(() => write(EMPTY), []);
  return { ids, toggle, remove, clear };
}
