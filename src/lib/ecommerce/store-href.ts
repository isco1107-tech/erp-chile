/**
 * Direcciones de las pantallas de la tienda según dónde vive el sitio: `/web/mi-sitio` en la
 * plataforma o `''` en un dominio propio. Puro, así el navegador y el servidor arman lo mismo.
 */

export type StoreScreen = 'catalog' | 'cart' | 'checkout';

const SCREEN_PATH: Record<StoreScreen, string> = {
  catalog: 'tienda',
  cart: 'carrito',
  checkout: 'finalizar-compra',
};

export function storeScreenHref(basePath: string, screen: StoreScreen): string {
  return `${basePath}/${SCREEN_PATH[screen]}`;
}

export function productHref(basePath: string, slug: string): string {
  return `${basePath}/producto/${encodeURIComponent(slug)}`;
}

export function orderHref(basePath: string, accessToken: string): string {
  return `${basePath}/pedido/${encodeURIComponent(accessToken)}`;
}

/** Catálogo con filtros (`?coleccion=…&q=…&pagina=2`): los vacíos no se escriben. */
export function catalogHref(basePath: string, query: { collection?: string | null; q?: string | null; page?: number | null; sort?: import('./store-route').CatalogSort | null } = {}): string {
  const params = new URLSearchParams();
  if (query.collection) params.set('coleccion', query.collection);
  if (query.q) params.set('q', query.q);
  if (query.sort && query.sort !== 'featured') params.set('orden', query.sort);
  if (query.page && query.page > 1) params.set('pagina', String(query.page));
  const text = params.toString();
  return `${storeScreenHref(basePath, 'catalog')}${text ? `?${text}` : ''}`;
}
