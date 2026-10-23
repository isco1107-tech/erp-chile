import 'server-only';

import { headers } from 'next/headers';
import { cache } from 'react';
import { domainFromHost } from '@/lib/hosting/custom-domain';
import { getPageantSlugByDomain } from '@/modules/projects/services/public-site.service';
import { getPublicWebSiteByDomain, type PublicWebSite } from '@/modules/web-sites/services/web-sites.service';
import { loadStoreByDomain } from './store-pages';
import type { PublicStoreContext } from '@/modules/ecommerce/services/store-public.service';

/**
 * Sitio web de un dominio propio. Un dominio es de UN solo destino: si es de un certamen, ninguna
 * página de un sitio web se sirve bajo él.
 */
export const loadDomainWebSite = cache(async (domain: string, requestDomain: string): Promise<PublicWebSite | null> => {
  if (await getPageantSlugByDomain(domain, requestDomain === domain)) return null;
  return getPublicWebSiteByDomain(domain, requestDomain === domain);
});

/**
 * Sitio y tienda del dominio de la petición. Solo vale si el host REAL de la petición es ese
 * dominio (abrir `/sitio/otro.cl` desde la plataforma no publica su tienda), el sitio es del
 * constructor guiado y su tienda está abierta.
 */
export async function resolveDomainStore(hostParam: string): Promise<{ domain: string; site: PublicWebSite; store: PublicStoreContext } | null> {
  const domain = domainFromHost(decodeURIComponent(hostParam));
  const requestDomain = domainFromHost((await headers()).get('host'));
  if (requestDomain !== domain) return null;
  const site = await loadDomainWebSite(domain, requestDomain);
  if (!site || site.customDomain !== domain || site.mode !== 'GUIDED') return null;
  const store = await loadStoreByDomain(domain);
  if (!store || store.siteId !== site.id) return null;
  return { domain, site, store };
}
