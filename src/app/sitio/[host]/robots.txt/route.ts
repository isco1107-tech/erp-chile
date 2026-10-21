import { headers } from 'next/headers';
import { domainFromHost } from '@/lib/hosting/custom-domain';
import { domainSeo } from '@/lib/hosting/domain-seo';
import { captureException } from '@/lib/observability';
import { robotsTxt, SEO_HEADERS } from '@/lib/web-sites/sitemap';

/**
 * `minegocio.cl/robots.txt`: el de su propio sitio, con su mapa (antes el
 * dominio de un cliente devolvía el de la plataforma). Un dominio que no
 * publica nada, o un sitio "no indexable", cierra todo.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const domain = domainFromHost(decodeURIComponent(host));
  try {
    const seo = await domainSeo(domain, domainFromHost((await headers()).get('host')));
    return new Response(robotsTxt({ base: `https://${domain}`, indexable: Boolean(seo?.indexable) }), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEO_HEADERS } });
  } catch (error) {
    captureException(error, { module: 'sitios-web', extra: { reason: 'domain-robots', domain } });
    return new Response('User-agent: *\nDisallow:\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
