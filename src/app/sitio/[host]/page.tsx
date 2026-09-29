import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { PageantSiteDocument, pageantSiteMetadata } from '@/components/public/pageant/PageantSiteDocument';
import { domainFromHost, platformBaseUrl } from '@/lib/hosting/custom-domain';
import { findPublicPage, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { getPageantSlugByDomain, getPublicPageantSite } from '@/modules/projects/services/public-site.service';
import { getPublicWebSiteByDomain } from '@/modules/web-sites/services/web-sites.service';

/**
 * Micrositio servido en la raíz de un dominio propio (ej.
 * `https://missuniversotemuco.cl/`). Nadie navega a esta ruta: `src/proxy.ts`
 * reescribe hacia acá la raíz de todo host que no es de la plataforma.
 *
 * El certamen sale del host REAL de la petición, no solo del parámetro: abrir
 * `/sitio/otro-dominio.cl` desde la plataforma manda al dominio verdadero en
 * vez de publicar ese sitio bajo la dirección de la plataforma. La primera
 * visita real por el dominio lo deja verificado (ver
 * `getPageantSlugByDomain`); un dominio sin certamen va a la plataforma.
 */
const loadSite = cache(async (domain: string, requestDomain: string) => {
  const slug = await getPageantSlugByDomain(domain, requestDomain === domain);
  const pageant = slug ? await getPublicPageantSite(slug) : null;
  if (pageant) return { kind: 'pageant' as const, site: pageant };
  // Un dominio es de un solo destino (certamen o sitio web): si no es de un
  // certamen, se busca entre los sitios web publicados.
  const web = await getPublicWebSiteByDomain(domain, requestDomain === domain);
  return web ? { kind: 'web' as const, site: web } : null;
});

async function resolveDomain(params: Promise<{ host: string }>): Promise<{ domain: string; requestDomain: string }> {
  const { host } = await params;
  return { domain: domainFromHost(decodeURIComponent(host)), requestDomain: domainFromHost((await headers()).get('host')) };
}

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const { domain, requestDomain } = await resolveDomain(params);
  const found = await loadSite(domain, requestDomain);
  if (!found) return { robots: { index: false } };
  return found.kind === 'pageant' ? pageantSiteMetadata(found.site) : webSiteMetadata(found.site, `https://${domain}`, findPublicPage(found.site));
}

export default async function CustomDomainSitePage({ params }: { params: Promise<{ host: string }> }) {
  const { domain, requestDomain } = await resolveDomain(params);
  const found = await loadSite(domain, requestDomain);
  if (!found || found.site.customDomain !== domain) redirect(platformBaseUrl());
  if (requestDomain !== domain) redirect(`https://${domain}`);
  return found.kind === 'pageant' ? <PageantSiteDocument site={found.site} /> : <WebSiteDocument site={found.site} basePath="" siteUrl={`https://${domain}`} />;
}
