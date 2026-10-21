import type { Metadata } from 'next';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { findPublicPage, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { getPublicWebSite, publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';

/**
 * Sitio web publicado (`/web/[slug]`). Server Component: se resuelve en el
 * servidor (buen SEO y vista previa al compartir el enlace). Solo publica un
 * sitio con estado PUBLISHED, de una empresa operativa y con el módulo
 * contratado; en cualquier otro caso muestra un aviso neutro sin revelar si
 * el sitio existe. Con dominio propio verificado, el dominio es la dirección
 * canónica (buscadores) pero esta dirección sigue funcionando. Las páginas
 * internas viven en `/web/[slug]/[page]`.
 */
const loadSite = cache((slug: string) => getPublicWebSite(slug));

function siteRoot(site: { slug: string; customDomain: string | null; customDomainVerified: boolean }): string {
  return site.customDomain && site.customDomainVerified ? `https://${site.customDomain}` : publicSiteUrl(site.slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: 'Sitio no disponible', robots: { index: false } };
  return webSiteMetadata(site, siteRoot(site), findPublicPage(site));
}

export default async function PublicWebSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) {
    return <PublicStatus variant="error" title="Este sitio no está disponible" message="El enlace no existe o el sitio todavía no fue publicado." />;
  }
  return <WebSiteDocument site={site} basePath={`/web/${site.slug}`} siteUrl={siteRoot(site)} />;
}
