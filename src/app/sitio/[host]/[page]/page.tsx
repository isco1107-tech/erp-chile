import StorefrontDocument from '@/components/store-builder/StorefrontDocument';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { renderStorePage, storeMetadata } from '@/components/store/store-pages';
import { storeRouteFor } from '@/lib/ecommerce/store-route';
import { loadDomainWebSite, resolveDomainStore } from '@/components/store/store-domain';
import { findPublicPage, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { domainFromHost, platformBaseUrl } from '@/lib/hosting/custom-domain';
import { storeScreenHref } from '@/lib/ecommerce/store-href';

/**
 * Página interna de un sitio web en su dominio propio (`minegocio.cl/servicios`).
 * Nadie navega a esta ruta: `src/proxy.ts` reescribe hacia acá los tramos de
 * un solo segmento con forma de página. Misma verificación de host que la raíz
 * (`/sitio/[host]`): el sitio sale del host REAL de la petición. Si el dominio
 * no es de un sitio web (es de un certamen o no existe) o la página no existe
 * u está oculta, se redirige a la plataforma con esa misma ruta, que es lo que
 * hacía el proxy antes de que existieran las páginas.
 */
const loadSite = loadDomainWebSite;

type Params = Promise<{ host: string; page: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Query string original, para no perderlo al mandar a la plataforma. */
function queryString(search: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search))
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function resolve(params: Params) {
  const { host, page } = await params;
  const domain = domainFromHost(decodeURIComponent(host));
  const requestDomain = domainFromHost((await headers()).get('host'));
  const site = await loadSite(domain, requestDomain);
  const valid = site && site.customDomain === domain && requestDomain === domain ? site : null;
  return { domain, pageSlug: page, site: valid, found: valid ? findPublicPage(valid, page) : null };
}

/** Si la dirección es una pantalla de la tienda del sitio de este dominio (y la tienda está abierta). */
async function resolveStore(params: Params, search: Record<string, string | string[] | undefined>) {
  const { host, page } = await params;
  const route = storeRouteFor(page, search);
  if (!route) return null;
  const found = await resolveDomainStore(host);
  return found ? { ...found, route } : null;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const hit = await resolveStore(params, await searchParams);
  if (hit) {
    if (hit.route === 'to-catalog') return { robots: { index: false } };
    return storeMetadata({ site: hit.site, store: hit.store, route: hit.route, basePath: '', siteUrl: `https://${hit.domain}` });
  }
  const { domain, pageSlug, site, found } = await resolve(params);
  if (!site || !found) return { robots: { index: false } };
  return webSiteMetadata(site, `https://${domain}/${pageSlug}`, found);
}

export default async function CustomDomainInnerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const search = await searchParams;
  const hit = await resolveStore(params, search);
  if (hit) {
    if (hit.route === 'to-catalog') redirect(storeScreenHref('', 'catalog'));
    return renderStorePage({ site: hit.site, store: hit.store, route: hit.route, basePath: '', siteUrl: `https://${hit.domain}` });
  }
  const { pageSlug, site, found } = await resolve(params);
  if (!site || !found) redirect(`${platformBaseUrl()}/${encodeURIComponent(pageSlug)}${queryString(search)}`);
  return site.storefrontHome ? (
    <StorefrontDocument site={site} pageSlug={pageSlug} basePath="" siteUrl={`https://${site.customDomain}`} />
  ) : (
    <WebSiteDocument site={site} pageSlug={pageSlug} basePath="" siteUrl={`https://${site.customDomain}`} />
  );
}
