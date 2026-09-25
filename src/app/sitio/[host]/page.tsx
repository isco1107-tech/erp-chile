import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { PageantSiteDocument, pageantSiteMetadata } from '@/components/public/pageant/PageantSiteDocument';
import { domainFromHost, platformBaseUrl } from '@/lib/hosting/custom-domain';
import { getPageantSlugByDomain, getPublicPageantSite } from '@/modules/projects/services/public-site.service';

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
  return slug ? getPublicPageantSite(slug) : null;
});

async function resolveDomain(params: Promise<{ host: string }>): Promise<{ domain: string; requestDomain: string }> {
  const { host } = await params;
  return { domain: domainFromHost(decodeURIComponent(host)), requestDomain: domainFromHost((await headers()).get('host')) };
}

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const { domain, requestDomain } = await resolveDomain(params);
  const site = await loadSite(domain, requestDomain);
  return site ? pageantSiteMetadata(site) : { robots: { index: false } };
}

export default async function CustomDomainSitePage({ params }: { params: Promise<{ host: string }> }) {
  const { domain, requestDomain } = await resolveDomain(params);
  const site = await loadSite(domain, requestDomain);
  if (!site || site.customDomain !== domain) redirect(platformBaseUrl());
  if (requestDomain !== domain) redirect(`https://${domain}`);
  return <PageantSiteDocument site={site} />;
}
