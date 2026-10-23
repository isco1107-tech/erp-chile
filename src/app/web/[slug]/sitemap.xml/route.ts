import { captureException } from '@/lib/observability';
import { pageUrl, SEO_HEADERS, sitePaths, sitemapXml } from '@/lib/web-sites/sitemap';
import { listStoreSitemapPaths, resolvePublicStore } from '@/modules/ecommerce/services/store-public.service';
import { getPublicWebSite, publicSiteUrl } from '@/modules/web-sites/services/web-sites.service';

/**
 * Mapa del sitio de un sitio web publicado (`/web/[slug]/sitemap.xml`), para
 * darlo de alta en Google Search Console. Con dominio propio verificado, las
 * direcciones son las del dominio (las canónicas). Un sitio no publicado o
 * marcado como "no indexable" no tiene mapa.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const site = await getPublicWebSite(slug);
    if (!site || !site.indexable) return new Response('No encontrado', { status: 404 });
    const base = site.customDomain && site.customDomainVerified ? `https://${site.customDomain}` : publicSiteUrl(site.slug);
    const paths = site.mode === 'GUIDED' ? sitePaths(site.document) : [''];
    // La tienda abierta suma su catálogo y cada ficha publicada.
    const store = site.mode === 'GUIDED' ? await resolvePublicStore(slug) : null;
    const storeEntries = store ? await listStoreSitemapPaths(store) : [];
    return new Response(sitemapXml([...paths.map((path) => ({ url: pageUrl(base, path), lastModified: site.publishedAt })), ...storeEntries.map((entry) => ({ url: pageUrl(base, entry.path), lastModified: entry.lastModified }))]), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', ...SEO_HEADERS },
    });
  } catch (error) {
    captureException(error, { module: 'sitios-web', extra: { reason: 'sitemap', slug } });
    return new Response('No disponible', { status: 500 });
  }
}
