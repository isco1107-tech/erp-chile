import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { findPublicPage, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { domainFromHost, platformBaseUrl } from '@/lib/hosting/custom-domain';
import { getPublicWebSiteByDomain } from '@/modules/web-sites/services/web-sites.service';

/**
 * Página interna de un sitio web en su dominio propio (`minegocio.cl/servicios`).
 * Nadie navega a esta ruta: `src/proxy.ts` reescribe hacia acá los tramos de
 * un solo segmento con forma de página. Misma verificación de host que la raíz
 * (`/sitio/[host]`): el sitio sale del host REAL de la petición. Si el dominio
 * no es de un sitio web (es de un certamen o no existe) o la página no existe
 * u está oculta, se redirige a la plataforma con esa misma ruta, que es lo que
 * hacía el proxy antes de que existieran las páginas.
 */
const loadSite = cache((domain: string, requestDomain: string) => getPublicWebSiteByDomain(domain, requestDomain === domain));

type Params = Promise<{ host: string; page: string }>;

async function resolve(params: Params) {
  const { host, page } = await params;
  const domain = domainFromHost(decodeURIComponent(host));
  const requestDomain = domainFromHost((await headers()).get('host'));
  const site = await loadSite(domain, requestDomain);
  const valid = site && site.customDomain === domain && requestDomain === domain ? site : null;
  return { domain, pageSlug: page, site: valid, found: valid ? findPublicPage(valid, page) : null };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { domain, pageSlug, site, found } = await resolve(params);
  if (!site || !found) return { robots: { index: false } };
  return webSiteMetadata(site, `https://${domain}/${pageSlug}`, found);
}

export default async function CustomDomainInnerPage({ params }: { params: Params }) {
  const { pageSlug, site, found } = await resolve(params);
  if (!site || !found) redirect(`${platformBaseUrl()}/${encodeURIComponent(pageSlug)}`);
  return <WebSiteDocument site={site} pageSlug={pageSlug} basePath="" siteUrl={`https://${site.customDomain}`} />;
}
