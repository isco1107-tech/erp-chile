import 'server-only';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { customDomainProblem, isApexDomain, normalizeDomain } from '@/lib/hosting/custom-domain';
import { checkDomainStatus, claimDomain, domainOwner } from '@/lib/hosting/domain-lifecycle';
import { addProjectDomain, isVercelDomainsConfigured, removeProjectDomain, type DnsRecord } from '@/lib/hosting/vercel-domains';

/**
 * Dominio propio de un sitio web. Mismo mecanismo que el de un certamen
 * (`projects/services/custom-domain.service.ts`): la base de datos manda, y
 * Vercel se sincroniza si hay credenciales; si no, la pantalla muestra los
 * registros DNS a crear a mano. El proxy resuelve por host sin base de datos
 * y manda la raíz a `/sitio/[host]`, que busca primero un certamen y luego un sitio.
 *
 * Un dominio es de UN solo destino en toda la plataforma: se comprueba contra
 * certámenes y sitios, para que dos clientes no se disputen el mismo host.
 */

export class WebSiteDomainError extends Error {}

export interface WebSiteDomainView {
  domain: string | null;
  verifiedAt: string | null;
  automatic: boolean;
  records: DnsRecord[];
  dnsOk: boolean;
  /** El dominio ya muestra la plataforma (ver `domainServesPlatform`). */
  serving: boolean;
  statusError: string | null;
}


async function findSite(companyId: string, siteId: string) {
  const site = await prisma.webSite.findFirst({ where: { id: siteId, companyId }, select: { id: true, customDomain: true, customDomainVerifiedAt: true } });
  if (!site) throw new WebSiteDomainError('Sitio no encontrado');
  return site;
}

export async function refreshWebSiteDomain(companyId: string, siteId: string): Promise<WebSiteDomainView> {
  const site = await findSite(companyId, siteId);
  const automatic = isVercelDomainsConfigured();
  if (!site.customDomain) return { domain: null, verifiedAt: null, automatic, records: [], dnsOk: false, serving: false, statusError: null };

  const domain = site.customDomain;
  let records: DnsRecord[] = [];
  let ready = false;
  let dnsOk = false;
  let serving = false;
  let statusError: string | null = null;

  try {
    // Mecanismo común (`domain-lifecycle.ts`): verificado solo si el dominio YA muestra la plataforma.
    ({ records, dnsOk, serving, ready } = await checkDomainStatus(domain));
  } catch (error) {
    captureException(error, { module: 'sitios-web', companyId, extra: { reason: 'web-site-domain-status', domain } });
    statusError = 'No pudimos consultar el estado del dominio en este momento. Intenta de nuevo en unos minutos.';
  }

  let verifiedAt = site.customDomainVerifiedAt;
  if (!statusError) {
    verifiedAt = ready ? (site.customDomainVerifiedAt ?? new Date()) : null;
    if ((verifiedAt?.getTime() ?? null) !== (site.customDomainVerifiedAt?.getTime() ?? null)) {
      await prisma.webSite.updateMany({ where: { id: siteId, companyId }, data: { customDomainVerifiedAt: verifiedAt } });
    }
  }
  return { domain, verifiedAt: verifiedAt?.toISOString() ?? null, automatic, records, dnsOk, serving, statusError };
}

async function detach(companyId: string, domain: string): Promise<void> {
  if (!isVercelDomainsConfigured()) return;
  // Si otro sitio lo sigue usando (dato viejo, carrera), soltarlo dejaría caído ese sitio.
  if ((await domainOwner(domain)) !== null) return;
  const jobs = [removeProjectDomain(domain), ...(isApexDomain(domain) ? [removeProjectDomain(`www.${domain}`)] : [])];
  for (const result of await Promise.allSettled(jobs)) {
    if (result.status === 'rejected') captureException(result.reason, { module: 'sitios-web', companyId, extra: { reason: 'web-site-domain-detach', domain } });
  }
}

export async function setWebSiteDomain(companyId: string, siteId: string, rawDomain: string): Promise<WebSiteDomainView> {
  const site = await findSite(companyId, siteId);
  const domain = normalizeDomain(rawDomain);
  const problem = customDomainProblem(domain);
  if (problem) throw new WebSiteDomainError(problem);

  if (site.customDomain !== domain) {
    try {
      // Un dominio es de un solo destino en toda la plataforma: revisar y guardar sin carreras (`claimDomain`).
      const claimed = await claimDomain(domain, { kind: 'webSite', id: siteId }, (tx) =>
        tx.webSite.updateMany({ where: { id: siteId, companyId }, data: { customDomain: domain, customDomainVerifiedAt: null } })
      );
      if (!claimed) throw new WebSiteDomainError('Ese dominio ya lo usa otro sitio o certamen de la plataforma');
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new WebSiteDomainError('Ese dominio ya lo usa otro sitio o certamen de la plataforma');
      throw error;
    }
    if (site.customDomain) await detach(companyId, site.customDomain);
  }

  // Se registra en Vercel DESPUÉS de guardar: si falla, "Revisar estado" reintenta.
  let failed = false;
  if (isVercelDomainsConfigured()) {
    const attach = [addProjectDomain(domain), ...(isApexDomain(domain) ? [addProjectDomain(`www.${domain}`, domain)] : [])];
    for (const result of await Promise.allSettled(attach)) {
      if (result.status === 'rejected') {
        failed = true;
        captureException(result.reason, { module: 'sitios-web', companyId, extra: { reason: 'web-site-domain-attach', domain } });
      }
    }
  }
  const view = await refreshWebSiteDomain(companyId, siteId);
  return failed && !view.statusError ? { ...view, statusError: 'El dominio quedó guardado, pero no se pudo registrar en el servidor. Usa "Revisar estado" para reintentar.' } : view;
}

export async function removeWebSiteDomain(companyId: string, siteId: string): Promise<WebSiteDomainView> {
  const site = await findSite(companyId, siteId);
  if (site.customDomain) {
    await prisma.webSite.updateMany({ where: { id: siteId, companyId }, data: { customDomain: null, customDomainVerifiedAt: null } });
    await detach(companyId, site.customDomain);
  }
  return refreshWebSiteDomain(companyId, siteId);
}

/** Libera el dominio de un sitio que se elimina (sin tocar su fila, que ya no existe). */
export async function releaseDomain(companyId: string, domain: string | null): Promise<void> {
  if (domain) await detach(companyId, domain);
}
