import type { Metadata } from 'next';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { findPublicPage, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { getPublicWebSite, publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';

/**
 * Página interna de un sitio publicado (`/web/[slug]/[page]`). Mismas reglas
 * que la portada: si el sitio no está publicado, o la página no existe o está
 * oculta, se muestra el mismo aviso neutro. `/web/[slug]/raw` es una ruta
 * estática hermana y tiene precedencia sobre esta.
 */
const loadSite = cache((slug: string) => getPublicWebSite(slug));

type Params = Promise<{ slug: string; page: string }>;

function pageUrl(site: { slug: string; customDomain: string | null; customDomainVerified: boolean }, page: string): string {
  return site.customDomain && site.customDomainVerified ? `https://${site.customDomain}/${page}` : `${publicSiteUrl(site.slug)}/${page}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, page: pageSlug } = await params;
  const site = await loadSite(slug);
  const page = site ? findPublicPage(site, pageSlug) : null;
  if (!site || !page) return { title: 'Sitio no disponible', robots: { index: false } };
  return webSiteMetadata(site, pageUrl(site, pageSlug), page);
}

export default async function PublicWebSiteInnerPage({ params }: { params: Params }) {
  const { slug, page: pageSlug } = await params;
  const site = await loadSite(slug);
  if (!site || !findPublicPage(site, pageSlug)) {
    return <PublicStatus variant="error" title="Este sitio no está disponible" message="El enlace no existe o el sitio todavía no fue publicado." />;
  }
  return <WebSiteDocument site={site} pageSlug={pageSlug} basePath={`/web/${site.slug}`} />;
}
