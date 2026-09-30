import 'server-only';

import { headers } from 'next/headers';
import { domainFromHost } from '@/lib/hosting/custom-domain';
import { publishedPages } from '@/lib/web-sites/site';
import { getPageantSlugByDomain, getPublicPageantSite } from '@/modules/projects/services/public-site.service';
import { getPublicWebSiteByDomain } from '@/modules/web-sites/services/web-sites.service';

/**
 * Qué publica un dominio propio para buscadores: si se puede indexar y qué
 * páginas tiene. Lo usan `robots.txt` y `sitemap.xml` de `/sitio/[host]`.
 *
 * Igual que la página del dominio, decide por el host REAL de la petición: un
 * dominio ajeno pedido desde la plataforma no responde nada, y un dominio
 * sin certamen ni sitio publicado tampoco (404, no un archivo vacío).
 */
export interface DomainSeo {
  domain: string;
  indexable: boolean;
  /** Rutas del dominio (`/` = inicio). */
  paths: string[];
}

export async function resolveDomainSeo(hostParam: string): Promise<DomainSeo | null> {
  const domain = domainFromHost(decodeURIComponent(hostParam));
  const requestDomain = domainFromHost((await headers()).get('host'));
  if (!domain || requestDomain !== domain) return null;

  const slug = await getPageantSlugByDomain(domain, true);
  const pageant = slug ? await getPublicPageantSite(slug) : null;
  if (pageant) return pageant.customDomain === domain ? { domain, indexable: true, paths: ['/'] } : null;

  const web = await getPublicWebSiteByDomain(domain, true);
  if (!web || web.customDomain !== domain) return null;
  const pages = web.mode === 'GUIDED' ? publishedPages(web.document).filter((page) => page.slug) : [];
  return { domain, indexable: web.indexable, paths: ['/', ...pages.map((page) => `/${page.slug}`)] };
}

/** Los buscadores piden estos archivos seguido: una hora en el borde de Vercel basta y evita ir a la base cada vez. */
export const SEO_FILE_CACHE = 'public, max-age=300, s-maxage=3600';
