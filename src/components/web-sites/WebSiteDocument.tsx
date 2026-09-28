import type { Metadata } from 'next';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';
import SiteRenderer from './SiteRenderer';

/**
 * Documento público de un sitio web: lo usan `/web/[slug]` y la raíz de un
 * dominio propio (`/sitio/[host]`). En modo guiado se pinta con `SiteRenderer`;
 * en modo HTML propio se incrusta el documento aislado (`/web/[slug]/raw`, que
 * se sirve con CSP `sandbox`) en un iframe también con `sandbox`: el HTML de un
 * cliente nunca corre con el origen de la plataforma.
 */
export function WebSiteDocument({ site }: { site: PublicWebSite }) {
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
  return <SiteRenderer name={site.name} logoUrl={site.logoUrl} theme={site.theme} blocks={site.blocks} slug={site.slug} mode="public" />;
}

/** Metadatos para buscadores y redes. `canonical` es la dirección definitiva del sitio. */
export function webSiteMetadata(site: PublicWebSite, canonical: string): Metadata {
  return {
    title: site.title,
    description: site.description ?? undefined,
    alternates: { canonical },
    robots: site.indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: site.title,
      description: site.description ?? undefined,
      url: canonical,
      type: 'website',
      ...(site.ogImageUrl ? { images: [{ url: site.ogImageUrl }] } : {}),
    },
    twitter: { card: site.ogImageUrl ? 'summary_large_image' : 'summary', title: site.title, description: site.description ?? undefined },
  };
}
