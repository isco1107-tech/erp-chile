import type { Metadata } from 'next';
import { findPageBySlug, publishedPages, type SitePage } from '@/lib/web-sites/site';
import { safeHref, safeImageSrc } from '@/lib/web-sites/urls';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';
import SiteRenderer from './SiteRenderer';

/**
 * Documento público de un sitio web: lo usan `/web/[slug]`, sus páginas
 * internas y la raíz o las páginas de un dominio propio (`/sitio/[host]`). En
 * modo guiado se pinta la página pedida con `SiteRenderer`; en modo HTML propio
 * se incrusta el documento aislado (`/web/[slug]/raw`, que se sirve con CSP
 * `sandbox`) en un iframe también con `sandbox`: el HTML de un cliente nunca
 * corre con el origen de la plataforma.
 */

/** Página publicada con esa dirección (`''` = inicio) o `null` si no existe o está oculta. */
export function findPublicPage(site: PublicWebSite, pageSlug?: string): SitePage | null {
  if (site.mode === 'HTML') return pageSlug ? null : { id: 'home', title: site.title, slug: '', menuLabel: '', showInMenu: true, hidden: false, seoTitle: '', seoDescription: '', blocks: [] };
  return findPageBySlug(site.document, pageSlug ?? '');
}

/**
 * Datos de negocio local para buscadores, SOLO con lo que el sitio publicado
 * ya muestra: el primer bloque de contacto visible de las páginas publicadas.
 * Sin datos de contacto no se emite nada.
 */
export function localBusinessJsonLd(site: PublicWebSite, siteUrl?: string): Record<string, unknown> | null {
  if (site.mode !== 'GUIDED') return null;
  const contact = publishedPages(site.document)
    .flatMap((page) => page.blocks)
    .find((block) => block.type === 'contact' && !block.hidden);
  if (!contact || contact.type !== 'contact') return null;
  const telephone = contact.phone && safeHref(`tel:${contact.phone}`) ? contact.phone : '';
  const email = contact.email && safeHref(`mailto:${contact.email}`)?.startsWith('mailto:') ? contact.email : '';
  const address = contact.address.trim();
  if (!telephone && !email && !address) return null;
  const logo = safeImageSrc(site.logoUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.name,
    ...(siteUrl ? { url: siteUrl } : {}),
    ...(logo ? { logo } : {}),
    ...(telephone ? { telephone } : {}),
    ...(email ? { email } : {}),
    ...(address ? { address: { '@type': 'PostalAddress', streetAddress: address } } : {}),
  };
}

/** JSON para un `<script type="application/ld+json">`: `<` escapado para que ningún texto cierre la etiqueta. */
export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

interface WebSiteDocumentProps {
  site: PublicWebSite;
  /** Dirección de la página (`servicios`); vacío o ausente = inicio. */
  pageSlug?: string;
  /** `/web/<slug>` en la plataforma, `''` en un dominio propio. */
  basePath?: string;
  /** Dirección pública definitiva del sitio, para los datos estructurados. */
  siteUrl?: string;
}

export function WebSiteDocument({ site, pageSlug, basePath, siteUrl }: WebSiteDocumentProps) {
  if (site.mode === 'HTML') {
    return (
      <iframe
        src={`/web/${site.slug}/raw`}
        title={site.title}
        // Sin allow-scripts ni allow-same-origin: no se cambia. Los enlaces externos abren en pestaña nueva.
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ display: 'block', border: 0, width: '100%', height: '100dvh' }}
      />
    );
  }
  const page = findPublicPage(site, pageSlug) ?? findPageBySlug(site.document, '');
  const jsonLd = localBusinessJsonLd(site, siteUrl);
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />}
      <SiteRenderer
        name={site.name}
        logoUrl={site.logoUrl}
        theme={site.theme}
        document={site.document}
        pageId={page?.id}
        slug={site.slug}
        mode="public"
        basePath={basePath ?? `/web/${site.slug}`}
      />
    </>
  );
}

/** Metadatos para buscadores y redes. `canonical` es la dirección definitiva de ESTA página; `page` afina el título y la descripción. */
export function webSiteMetadata(site: PublicWebSite, canonical: string, page?: SitePage | null): Metadata {
  const isHome = !page || page.slug === '';
  const title = isHome ? page?.seoTitle || site.title : page.seoTitle || `${page.title} · ${site.title}`;
  const description = (!isHome && page.seoDescription) || site.description || undefined;
  return {
    title,
    description,
    alternates: { canonical },
    robots: site.indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      ...(site.ogImageUrl ? { images: [{ url: site.ogImageUrl }] } : {}),
    },
    twitter: { card: site.ogImageUrl ? 'summary_large_image' : 'summary', title, description },
  };
}
