/**
 * Direcciones que una tienda sirve dentro de su sitio. Puro (lo usa también
 * `src/lib/hosting/custom-domain.ts`, que corre en el proxy).
 *
 *   /tienda                   catálogo
 *   /producto/[slug]          ficha de un producto
 *   /carrito                  carrito
 *   /finalizar-compra         datos, despacho y pago
 *   /pedido/[token]           seguimiento del pedido (enlace secreto)
 *
 * No son direcciones reservadas para todos los sitios: reservarlas globalmente
 * renombraría en silencio páginas ya publicadas (`parseSiteDocument` repara las
 * direcciones reservadas). Solo valen para un sitio que tiene tienda: abrirla exige
 * que ninguna página las use y el editor no deja crear una nueva con esos nombres.
 */

export const STORE_PAGE_SLUGS = ['tienda', 'carrito', 'finalizar-compra', 'producto', 'pedido'] as const;

export type StorePageSlug = (typeof STORE_PAGE_SLUGS)[number];

const STORE_SLUGS: ReadonlySet<string> = new Set(STORE_PAGE_SLUGS);

export function isStorePageSlug(slug: string): slug is StorePageSlug {
  return STORE_SLUGS.has(slug);
}

/** De una lista de direcciones de página, las que chocan con la tienda. */
export function storePageConflicts(pageSlugs: readonly string[]): string[] {
  return pageSlugs.filter((slug) => STORE_SLUGS.has(slug));
}

/** Prefijos de dos tramos (`/producto/x`, `/pedido/x`) que la tienda sirve con un segundo segmento. */
export const STORE_NESTED_PREFIXES = ['producto', 'pedido'] as const;
