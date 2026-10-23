import { isStorePageSlug } from './routes';

/**
 * Qué pantalla de la tienda es una dirección de UN tramo (`/tienda`, `/carrito`, `/finalizar-compra`).
 * `producto` y `pedido` solas no son pantallas (necesitan su segundo tramo): mandan al catálogo.
 * Puro, para probarlo sin servidor.
 */

export const CATALOG_SORTS = ['featured', 'newest', 'name', 'price-asc', 'price-desc'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogSearch {
  sort?: CatalogSort;
  collection: string | null;
  q: string | null;
  page: number;
}

export type StoreRoute = { kind: 'catalog'; search: CatalogSearch } | { kind: 'cart' } | { kind: 'checkout' } | { kind: 'product'; slug: string } | { kind: 'order'; token: string };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text?.trim() ? text.trim() : null;
}

export function storeRouteFor(page: string, searchParams: SearchParams = {}): StoreRoute | 'to-catalog' | null {
  if (!isStorePageSlug(page)) return null;
  switch (page) {
    case 'tienda': {
      const rawPage = Number(first(searchParams.pagina) ?? 1);
      return {
        kind: 'catalog',
        search: {
          ...(CATALOG_SORTS.includes(first(searchParams.orden) as CatalogSort) && first(searchParams.orden) !== 'featured' ? { sort: first(searchParams.orden) as CatalogSort } : {}),
          collection: first(searchParams.coleccion)?.slice(0, 40) ?? null,
          q: first(searchParams.q)?.slice(0, 80) ?? null,
          page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(500, Math.floor(rawPage)) : 1,
        },
      };
    }
    case 'carrito':
      return { kind: 'cart' };
    case 'finalizar-compra':
      return { kind: 'checkout' };
    case 'producto':
    case 'pedido':
      return 'to-catalog';
  }
}
