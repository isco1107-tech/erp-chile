import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { jsonLdString } from '@/components/web-sites/WebSiteDocument';
import type { StoreRoute } from '@/lib/ecommerce/store-route';
import { productHref, storeScreenHref } from '@/lib/ecommerce/store-href';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { getPublicOrder } from '@/modules/ecommerce/services/store-orders.service';
import { getPublicProduct, listPublicProducts, resolvePublicStore, resolvePublicStoreByDomain, resolveStoreForOrders, resolveStoreForOrdersByDomain, type PublicStoreContext } from '@/modules/ecommerce/services/store-public.service';
import { getPublicWebSite, type PublicWebSite } from '@/modules/web-sites/services/web-sites.service';
import CartScreen from './CartScreen';
import CheckoutScreen from './CheckoutScreen';
import StoreCatalogScreen from './StoreCatalogScreen';
import StoreDocument from './StoreDocument';
import StoreOrderScreen from './StoreOrderScreen';
import StoreProductScreen from './StoreProductScreen';

/**
 * Pantallas de la tienda de un sitio publicado, compartidas por `/web/[slug]/…` y por la raíz de un
 * dominio propio (`/sitio/[host]/…`). Reglas de seguridad: la empresa y la tienda salen SIEMPRE del
 * sitio resuelto por su dirección o dominio (nunca de un dato del navegador); el pedido se abre con
 * su enlace secreto y solo desde la tienda del mismo sitio; las pantallas con datos de la persona
 * (carrito, pago, pedido) no se indexan ni envían el enlace como referencia.
 */

/** Una sola lectura por petición: `generateMetadata` y la página piden lo mismo. */
export const loadSiteBySlug = cache((slug: string) => getPublicWebSite(slug));
const loadProduct = cache((store: PublicStoreContext, slug: string) => getPublicProduct(store, slug));
export const loadStoreBySlug = cache((slug: string) => resolvePublicStore(slug));
export const loadStoreByDomain = cache((domain: string) => resolvePublicStoreByDomain(domain));
/** Para el seguimiento de un pedido: sigue sirviéndose con la tienda cerrada. */
export const loadOrderStoreBySlug = cache((slug: string) => resolveStoreForOrders(slug));
export const loadOrderStoreByDomain = cache((domain: string) => resolveStoreForOrdersByDomain(domain));

export type { StoreRoute };

interface RenderArgs {
  site: PublicWebSite;
  store: PublicStoreContext;
  route: StoreRoute;
  basePath: string;
  /** Dirección pública definitiva de la raíz del sitio (dominio propio o plataforma). */
  siteUrl: string;
}

export async function renderStorePage({ site, store, route, basePath, siteUrl }: RenderArgs) {
  switch (route.kind) {
    case 'catalog': {
      const catalog = await listPublicProducts(store, { collection: route.search.collection ?? undefined, q: route.search.q ?? undefined, page: route.search.page });
      return (
        <StoreDocument site={site} basePath={basePath} current="catalog">
          <StoreCatalogScreen catalog={catalog} query={route.search} basePath={basePath} siteSlug={site.slug} />
        </StoreDocument>
      );
    }
    case 'cart':
      return (
        <StoreDocument site={site} basePath={basePath} current="cart">
          <CartScreen siteSlug={site.slug} basePath={basePath} />
        </StoreDocument>
      );
    case 'checkout':
      return (
        <StoreDocument site={site} basePath={basePath} current="checkout">
          <CheckoutScreen siteSlug={site.slug} basePath={basePath} termsText={store.settings.termsText} />
        </StoreDocument>
      );
    case 'product': {
      const product = await loadProduct(store, route.slug);
      if (!product) redirect(storeScreenHref(basePath, 'catalog'));
      const image = safeImageSrc(product.images[0]?.url);
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        ...(image ? { image: [image] } : {}),
        ...(product.description || product.summary ? { description: (product.description || product.summary).slice(0, 500) } : {}),
        sku: product.sku,
        ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
        offers: {
          '@type': 'Offer',
          priceCurrency: 'CLP',
          price: product.grossPrice,
          availability: product.stock.state === 'out' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          url: `${siteUrl}${productHref('', product.slug)}`,
        },
      };
      return (
        <StoreDocument site={site} basePath={basePath} current="product">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
          <StoreProductScreen product={product} settings={store.settings} basePath={basePath} siteSlug={site.slug} />
        </StoreDocument>
      );
    }
    case 'order': {
      const order = await getPublicOrder(store.siteId, route.token);
      if (!order) notFound();
      return (
        <StoreDocument site={site} basePath={basePath} current="order">
          <StoreOrderScreen order={order} accessToken={route.token} basePath={basePath} />
        </StoreDocument>
      );
    }
  }
}

/** Metadatos: el catálogo y las fichas se indexan (si el sitio lo permite); carrito, pago y pedido, nunca. */
export async function storeMetadata({ site, store, route, siteUrl }: RenderArgs): Promise<Metadata> {
  const indexable = site.indexable;
  switch (route.kind) {
    case 'catalog':
      return {
        title: `${route.search.collection ?? 'Tienda'} · ${site.title}`,
        description: `Compra en línea en ${site.name}.`,
        alternates: { canonical: `${siteUrl}${storeScreenHref('', 'catalog')}${route.search.collection ? `?coleccion=${encodeURIComponent(route.search.collection)}` : ''}` },
        robots: indexable && !route.search.q ? { index: true, follow: true } : { index: false, follow: true },
      };
    case 'product': {
      const product = await loadProduct(store, route.slug);
      if (!product) return { title: 'Producto no disponible', robots: { index: false } };
      const image = safeImageSrc(product.images[0]?.url);
      const description = (product.summary || product.description || `Compra ${product.title} en ${site.name}.`).slice(0, 200);
      return {
        title: `${product.title} · ${site.title}`,
        description,
        alternates: { canonical: `${siteUrl}${productHref('', product.slug)}` },
        robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
        openGraph: { title: product.title, description, type: 'website', ...(image ? { images: [{ url: image }] } : {}) },
      };
    }
    case 'cart':
      return { title: `Carrito · ${site.title}`, robots: { index: false, follow: false } };
    case 'checkout':
      return { title: `Finalizar compra · ${site.title}`, robots: { index: false, follow: false } };
    case 'order':
      return { title: `Tu pedido · ${site.title}`, robots: { index: false, follow: false }, referrer: 'no-referrer' };
  }
}
