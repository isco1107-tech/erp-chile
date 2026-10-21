import 'server-only';

import { getPublicAcademySite, getAcademySlugByDomain } from '@/modules/academy/services/academy-site.service';
import { getPageantSlugByDomain, getPublicPageantSite } from '@/modules/projects/services/public-site.service';
import { getPublicWebSiteByDomain } from '@/modules/web-sites/services/web-sites.service';
import type { SiteDocument } from '@/lib/web-sites/site';

/**
 * Lo que necesitan `robots.txt` y `sitemap.xml` en la raíz de un dominio
 * propio: qué publica (mismo orden que `/sitio/[host]`: certamen → sitio web →
 * academia), si se puede indexar y sus páginas. `null` si el dominio no
 * publica nada o la petición no llegó por ese mismo dominio.
 */
export interface DomainSeo {
  indexable: boolean;
  document: SiteDocument | null;
  lastModified: Date | null;
}

export async function domainSeo(domain: string, requestDomain: string): Promise<DomainSeo | null> {
  if (!domain || domain !== requestDomain) return null;
  const pageantSlug = await getPageantSlugByDomain(domain, true);
  if (pageantSlug) return (await getPublicPageantSite(pageantSlug)) ? { indexable: true, document: null, lastModified: null } : null;
  const web = await getPublicWebSiteByDomain(domain, true);
  if (web) return web.customDomain === domain ? { indexable: web.indexable, document: web.mode === 'GUIDED' ? web.document : null, lastModified: web.publishedAt } : null;
  const academySlug = await getAcademySlugByDomain(domain, true);
  return academySlug && (await getPublicAcademySite(academySlug)) ? { indexable: true, document: null, lastModified: null } : null;
}
