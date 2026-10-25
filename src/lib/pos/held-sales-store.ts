import { createPersistedStore, type PersistedStore } from './persisted-store';
import { parseHeldSales, serializeHeldSales, type HeldSale } from './held-sales';

const NONE: HeldSale[] = [];
const stores = new Map<string, PersistedStore<HeldSale[]>>();

/**
 * Ventas en espera de UN turno. Cada turno tiene su clave: al abrir otro turno
 * (otro cajero, otro día) no aparecen ventas de antes, que ya no tienen sentido.
 */
export function heldSalesStoreFor(shiftId: string): PersistedStore<HeldSale[]> {
  let store = stores.get(shiftId);
  if (!store) {
    store = createPersistedStore<HeldSale[]>({
      key: `aether-pos-held:${shiftId}`,
      parse: parseHeldSales,
      serialize: serializeHeldSales,
      fallback: NONE,
    });
    stores.set(shiftId, store);
  }
  return store;
}

/** Id corto para una venta en espera; no es un secreto ni se envía al servidor. */
export function newHeldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
