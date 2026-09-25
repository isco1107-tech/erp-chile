import 'server-only';

import { resolve4, resolveCname } from 'node:dns/promises';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { customDomainProblem, isApexDomain, normalizeDomain } from '@/lib/hosting/custom-domain';
import {
  DEFAULT_APEX_IPV4,
  addProjectDomain,
  defaultDnsRecords,
  getDomainStatus,
  isVercelDomainsConfigured,
  removeProjectDomain,
  type DnsRecord,
} from '@/lib/hosting/vercel-domains';
import {
  addTurnstileHostname,
  removeTurnstileHostname,
  turnstileHostnameMode,
  type TurnstileHostnameState,
} from '@/lib/security/turnstile-hostnames';

/**
 * Dominio propio del micrositio de un certamen. La base de datos es la fuente
 * de verdad: Vercel (servir el dominio) y Turnstile (captcha del formulario
 * de postulación) se sincronizan cuando hay credenciales, y si no, la
 * pantalla muestra los pasos manuales. `customDomainVerifiedAt` solo se marca
 * cuando el dominio ya responde: recién ahí `/certamen/{slug}` redirige a él,
 * así el sitio nunca queda inaccesible mientras se configuran los DNS.
 */

export class CustomDomainError extends Error {}

export interface CustomDomainView {
  domain: string | null;
  verifiedAt: string | null;
  /** Vercel se configura solo (hay credenciales de su API). */
  automatic: boolean;
  /** Registros DNS a crear en el proveedor del dominio (vacío si ya está todo). */
  records: DnsRecord[];
  dnsOk: boolean;
  turnstile: TurnstileHostnameState;
  /** Mensaje si no se pudo consultar el estado (Vercel caído, token vencido…). */
  statusError: string | null;
}

/** Dominio que el cliente compró: los dos últimos niveles ("temuco.cl" para "miss.temuco.cl"). */
function zoneOf(domain: string): string {
  return domain.split('.').slice(-2).join('.');
}

async function findProject(companyId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true, customDomain: true, customDomainVerifiedAt: true },
  });
  if (!project) throw new CustomDomainError('Certamen no encontrado');
  return project;
}

/** Sin la API de Vercel: se revisa el DNS público directamente. */
async function dnsPointsToVercel(domain: string, apex: boolean): Promise<boolean> {
  try {
    if (apex) {
      const ips = await resolve4(domain);
      return ips.some((ip) => ip === DEFAULT_APEX_IPV4 || ip.startsWith('76.76.21.'));
    }
    const targets = await resolveCname(domain);
    return targets.some((target) => target.replace(/\.$/, '').endsWith('vercel-dns.com'));
  } catch {
    return false;
  }
}

/** Estado actual (consulta Vercel o el DNS) y actualiza `customDomainVerifiedAt`. */
export async function refreshCustomDomain(companyId: string, projectId: string): Promise<CustomDomainView> {
  const project = await findProject(companyId, projectId);
  const automatic = isVercelDomainsConfigured();
  const turnstile = turnstileHostnameMode();
  if (!project.customDomain) {
    return { domain: null, verifiedAt: null, automatic, records: [], dnsOk: false, turnstile, statusError: null };
  }

  const domain = project.customDomain;
  const apex = isApexDomain(domain);
  const zone = zoneOf(domain);
  let records: DnsRecord[] = [];
  let ready = false;
  let dnsOk = false;
  let statusError: string | null = null;

  try {
    if (automatic) {
      const main = await getDomainStatus(domain, zone, apex);
      const www = apex ? await getDomainStatus(`www.${domain}`, zone, false).catch(() => null) : null;
      if (!main.inProject) await addProjectDomain(domain);
      records = [...main.records, ...(www?.records ?? [])];
      dnsOk = main.dnsOk;
      ready = main.inProject && main.verified && main.dnsOk;
    } else {
      dnsOk = await dnsPointsToVercel(domain, apex);
      records = dnsOk ? [] : defaultDnsRecords(domain, zone, apex);
      ready = dnsOk;
    }
  } catch (error) {
    captureException(error, { module: 'proyectos', companyId, extra: { reason: 'custom-domain-status', domain } });
    statusError = 'No pudimos consultar el estado del dominio en este momento. Intenta de nuevo en unos minutos.';
  }

  // Sin respuesta del proveedor se conserva el último estado conocido.
  let verifiedAt = project.customDomainVerifiedAt;
  if (!statusError) {
    verifiedAt = ready ? (project.customDomainVerifiedAt ?? new Date()) : null;
    if ((verifiedAt?.getTime() ?? null) !== (project.customDomainVerifiedAt?.getTime() ?? null)) {
      await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { customDomainVerifiedAt: verifiedAt } });
    }
  }

  return { domain, verifiedAt: verifiedAt?.toISOString() ?? null, automatic, records, dnsOk, turnstile, statusError };
}

async function detachFromProviders(companyId: string, domain: string): Promise<void> {
  const jobs: Promise<void>[] = [removeTurnstileHostname(domain)];
  if (isVercelDomainsConfigured()) {
    jobs.push(removeProjectDomain(domain));
    if (isApexDomain(domain)) jobs.push(removeProjectDomain(`www.${domain}`));
  }
  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === 'rejected') {
      captureException(result.reason, { module: 'proyectos', companyId, extra: { reason: 'custom-domain-detach', domain } });
    }
  }
}

/** Asigna (o cambia) el dominio propio del certamen. */
export async function setCustomDomain(companyId: string, projectId: string, rawDomain: string): Promise<CustomDomainView> {
  const project = await findProject(companyId, projectId);
  const domain = normalizeDomain(rawDomain);
  const problem = customDomainProblem(domain);
  if (problem) throw new CustomDomainError(problem);

  if (project.customDomain !== domain) {
    const taken = await prisma.project.findFirst({ where: { customDomain: domain, NOT: { id: projectId } }, select: { id: true } });
    if (taken) throw new CustomDomainError('Ese dominio ya lo usa otro certamen de la plataforma');
    try {
      await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { customDomain: domain, customDomainVerifiedAt: null } });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new CustomDomainError('Ese dominio ya lo usa otro certamen de la plataforma');
      throw error;
    }
    if (project.customDomain) await detachFromProviders(companyId, project.customDomain);
  }

  // Se registra en los proveedores DESPUÉS de guardarlo: si Vercel o
  // Cloudflare fallan, el dominio queda guardado y "Revisar estado" reintenta.
  const attach: Promise<void>[] = [addTurnstileHostname(domain)];
  if (isVercelDomainsConfigured()) {
    attach.push(addProjectDomain(domain));
    if (isApexDomain(domain)) attach.push(addProjectDomain(`www.${domain}`, domain));
  }
  const results = await Promise.allSettled(attach);
  const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  for (const result of failed) {
    captureException(result.reason, { module: 'proyectos', companyId, extra: { reason: 'custom-domain-attach', domain } });
  }

  const view = await refreshCustomDomain(companyId, projectId);
  return failed.length > 0 && !view.statusError
    ? { ...view, statusError: 'El dominio quedó guardado, pero no se pudo registrar en el servidor. Usa "Revisar estado" para reintentar.' }
    : view;
}

/** Quita el dominio propio: el sitio vuelve a verse solo en `/certamen/{slug}`. */
export async function removeCustomDomain(companyId: string, projectId: string): Promise<CustomDomainView> {
  const project = await findProject(companyId, projectId);
  if (project.customDomain) {
    await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { customDomain: null, customDomainVerifiedAt: null } });
    await detachFromProviders(companyId, project.customDomain);
  }
  return refreshCustomDomain(companyId, projectId);
}
