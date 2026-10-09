import { headers } from 'next/headers';
import { domainFromHost } from '@/lib/hosting/custom-domain';
import { domainSeo } from '@/lib/hosting/domain-seo';
import { captureException } from '@/lib/observability';
import { pageUrl, SEO_HEADERS, sitePaths, sitemapXml } from '@/lib/web-sites/sitemap';

/**
 * `minegocio.cl/sitemap.xml`: el proxy reescribe hacia acá. El sitio sale del
 * host REAL de la petición (igual que `/sitio/[host]`), así que esta ruta no
 * sirve para leer el mapa de otro dominio desde la plataforma.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const domain = domainFromHost(decodeURIComponent(host));
  try {
    const seo = await domainSeo(domain, domainFromHost((await headers()).get('host')));
    if (!seo || !seo.indexable) return new Response('No encontrado', { status: 404 });
    const base = `https://${domain}`;
    return new Response(sitemapXml(sitePaths(seo.document).map((path) => ({ url: pageUrl(base, path), lastModified: seo.lastModified }))), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', ...SEO_HEADERS },
    });
  } catch (error) {
    captureException(error, { module: 'sitios-web', extra: { reason: 'domain-sitemap', domain } });
    return new Response('No disponible', { status: 500 });
  }
}
