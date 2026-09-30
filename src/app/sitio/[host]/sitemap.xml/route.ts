import { sitemapXml } from '@/lib/hosting/seo-files';
import { captureException } from '@/lib/observability';
import { resolveDomainSeo, SEO_FILE_CACHE } from '../seo';

/** `sitemap.xml` del dominio propio de un certamen o sitio web (el proxy reescribe `/sitemap.xml` hasta acá). */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  try {
    const seo = await resolveDomainSeo(host);
    // Un sitio marcado como no indexable no lista páginas: el sitemap sería contradictorio con su robots.txt.
    if (!seo || !seo.indexable) return new Response('No encontrado', { status: 404 });
    return new Response(sitemapXml(seo), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': SEO_FILE_CACHE } });
  } catch (error) {
    captureException(error, { module: 'certamen', extra: { host, reason: 'sitemap-xml' } });
    return new Response('Error interno', { status: 500 });
  }
}
