import { pageLink, resolveLink, type ResolvedLink, type SiteDocument, type SitePage } from '@/lib/web-sites/site';

/**
 * Contexto de pintado que comparten el encabezado, las secciones y el pie.
 * Es un objeto plano (sin hooks) para que el renderizador siga siendo usable
 * desde un Server Component.
 */
export interface RenderCtx {
  doc: SiteDocument;
  /** Página que se está pintando. */
  page: SitePage;
  /** `/web/<slug>` en la plataforma, `''` en un dominio propio. */
  basePath: string;
  /** Dirección del sitio (la usa el formulario de contacto). */
  slug: string;
  preview: boolean;
  /** Prefijo de los ids de sección: `wsp-` en la vista previa para no chocar con el DOM del panel. */
  idPrefix: string;
  /** Vista previa: pasar a otra página del sitio (y a un ancla de ella). */
  onNavigate?: (pageId: string, anchor: string | null) => void;
  /**
   * ¿Un clic en un enlace navega? En la vista previa con edición por clic, los
   * enlaces DENTRO de una sección no navegan: el clic selecciona la sección.
   */
  navigate: boolean;
  /** Sección que lleva el `<h1>` de la página (la primera con título). */
  h1BlockId: string | null;
  /**
   * Miniaturas de "Elige un diseño": donde el diseño lleva foto y no hay, se
   * dibuja un marcador para que se entienda el diseño. Nunca en el sitio
   * publicado ni en la vista previa normal (lo que se ve es lo que se publica).
   */
  placeholders?: boolean;
  /** Ancho del contenido del tema: el encabezado calcula con él si su menú cabe en una fila. */
  siteWidth?: 'narrow' | 'normal' | 'wide';
  /** El sitio tiene la tienda abierta: el encabezado muestra «Tienda» y el carrito. Nunca en la vista previa del editor. */
  store?: StoreRenderInfo;
  commerce?: { siteId?: string; products: Record<string, import('@/modules/ecommerce/services/store-public.service').PublicProductCard[]>; open: boolean };
}

/** Lo mínimo que el encabezado necesita saber de la tienda (direcciones ya resueltas para este sitio). */
export interface StoreRenderInfo {
  siteSlug: string;
  catalogHref: string;
  cartHref: string;
  /** Pantalla de la tienda que se está viendo (marca «Tienda» como actual). */
  current: 'catalog' | 'product' | 'cart' | 'checkout' | 'order' | null;
}

export function resolveIn(ctx: RenderCtx, raw: string | null | undefined): ResolvedLink | null {
  // Commerce screens reuse the merchant chrome, but are not the home page.
  // Section links must return to the published brand page instead of a missing #anchor in the cart.
  const commerceScreen = Boolean(ctx.store?.current);
  const value = commerceScreen && raw?.trim().startsWith('#') ? pageLink(ctx.page.id, raw.trim().slice(1)) : raw;
  return resolveLink(value, { doc: ctx.doc, pageId: commerceScreen ? '' : ctx.page.id, basePath: ctx.basePath, commerce: Boolean(ctx.store) });
}

/** Contexto para el contenido de las secciones. */
export function sectionCtx(ctx: RenderCtx, selectable: boolean): RenderCtx {
  return selectable ? { ...ctx, navigate: false } : ctx;
}
