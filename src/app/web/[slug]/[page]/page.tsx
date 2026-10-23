import StorefrontDocument from '@/components/store-builder/StorefrontDocument';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { loadStoreBySlug, renderStorePage, storeMetadata } from '@/components/store/store-pages';
import { storeRouteFor } from '@/lib/ecommerce/store-route';
import { findPublicPage, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { storeScreenHref } from '@/lib/ecommerce/store-href';
import { getPublicWebSite, publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';

/**
 * Página interna de un sitio publicado (`/web/[slug]/[page]`). Mismas reglas
 * que la portada: si el sitio no está publicado, o la página no existe o está
 * oculta, se muestra el mismo aviso neutro. `/web/[slug]/raw` es una ruta
 * estática hermana y tiene precedencia sobre esta.
 *
 * Si el sitio tiene su tienda abierta, las direcciones de la tienda (`/tienda`,
 * `/carrito`, `/finalizar-compra`) las sirve la tienda; `/producto/[slug]` y
 * `/pedido/[token]` son rutas hermanas. Un sitio SIN tienda abierta sigue sirviendo
 * una página propia con esos nombres, como siempre.
 */
const loadSite = cache((slug: string) => getPublicWebSite(slug));

type Params = Promise<{ slug: string; page: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pageUrl(site: { slug: string; customDomain: string | null; customDomainVerified: boolean }, page: string): string {
  return site.customDomain && site.customDomainVerified ? `https://${site.customDomain}/${page}` : `${publicSiteUrl(site.slug)}/${page}`;
}

function rootUrl(site: { slug: string; customDomain: string | null; customDomainVerified: boolean }): string {
  return site.customDomain && site.customDomainVerified ? `https://${site.customDomain}` : publicSiteUrl(site.slug);
}

/** Pantalla de la tienda que corresponde a esta dirección, o `null` si no es de la tienda o el sitio no la tiene abierta. */
async function resolveStore(slug: string, pageSlug: string, search: Record<string, string | string[] | undefined>) {
  const route = storeRouteFor(pageSlug, search);
  if (!route) return null;
  const site = await getPublicWebSite(slug, true);
  if (!site || site.mode !== 'GUIDED') return null;
  const store = await loadStoreBySlug(slug);
  if (!store || store.siteId !== site.id) return null;
  return { site, store, route };
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { slug, page: pageSlug } = await params;
  const hit = await resolveStore(slug, pageSlug, await searchParams);
  if (hit) {
    if (hit.route === 'to-catalog') return { robots: { index: false } };
    return storeMetadata({ ...hit, route: hit.route, basePath: `/web/${hit.site.slug}`, siteUrl: rootUrl(hit.site) });
  }
  const site = await loadSite(slug);
  const page = site ? findPublicPage(site, pageSlug) : null;
  if (!site || !page) return { title: 'Sitio no disponible', robots: { index: false } };
  return webSiteMetadata(site, pageUrl(site, pageSlug), page);
}

export default async function PublicWebSiteInnerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug, page: pageSlug } = await params;
  const hit = await resolveStore(slug, pageSlug, await searchParams);
  if (hit) {
    const basePath = `/web/${hit.site.slug}`;
    if (hit.route === 'to-catalog') redirect(storeScreenHref(basePath, 'catalog'));
    return renderStorePage({ ...hit, route: hit.route, basePath, siteUrl: rootUrl(hit.site) });
  }
  const site = await loadSite(slug);
  if (!site || !findPublicPage(site, pageSlug)) {
    return <PublicStatus variant="error" title="Este sitio no está disponible" message="El enlace no existe o el sitio todavía no fue publicado." />;
  }
  return site.storefrontHome ? (
    <StorefrontDocument site={site} pageSlug={pageSlug} basePath={`/web/${site.slug}`} />
  ) : (
    <WebSiteDocument site={site} pageSlug={pageSlug} basePath={`/web/${site.slug}`} />
  );
}
