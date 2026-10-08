import 'server-only';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { customDomainProblem, isApexDomain, normalizeDomain } from '@/lib/hosting/custom-domain';
import { DOMAIN_TAKEN_ERROR, checkDomainStatus, claimDomain, domainOwner } from '@/lib/hosting/domain-lifecycle';
import {
  addProjectDomain,
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
  /** El dominio ya muestra la plataforma (ver `domainServesPlatform`). */
  serving: boolean;
  turnstile: TurnstileHostnameState;
  /** Mensaje si no se pudo consultar el estado (Vercel caído, token vencido…). */
  statusError: string | null;
}


async function findProject(companyId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    select: { id: true, customDomain: true, customDomainVerifiedAt: true },
  });
  if (!project) throw new CustomDomainError('Certamen no encontrado');
  return project;
}

/** Estado actual (consulta Vercel o el DNS) y actualiza `customDomainVerifiedAt`. */
export async function refreshCustomDomain(companyId: string, projectId: string): Promise<CustomDomainView> {
  const project = await findProject(companyId, projectId);
  const automatic = isVercelDomainsConfigured();
  const turnstile = turnstileHostnameMode();
  if (!project.customDomain) {
    return { domain: null, verifiedAt: null, automatic, records: [], dnsOk: false, serving: false, turnstile, statusError: null };
  }

  const domain = project.customDomain;
  let records: DnsRecord[] = [];
  let ready = false;
  let dnsOk = false;
  let serving = false;
  let statusError: string | null = null;

  try {
    // Mecanismo común (`domain-lifecycle.ts`): verificado solo si el dominio YA muestra la plataforma.
    ({ records, dnsOk, serving, ready } = await checkDomainStatus(domain));
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

  return { domain, verifiedAt: verifiedAt?.toISOString() ?? null, automatic, records, dnsOk, serving, turnstile, statusError };
}

async function detachFromProviders(companyId: string, domain: string): Promise<void> {
  // Si otro sitio lo sigue usando (dato viejo, carrera), soltarlo dejaría caído ese sitio.
  if ((await domainOwner(domain)) !== null) return;
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
    try {
      // Revisar que esté libre y guardarlo, sin carreras entre empresas (`claimDomain`).
      const claimed = await claimDomain(domain, { kind: 'project', id: projectId }, (tx) =>
        tx.project.updateMany({ where: { id: projectId, companyId }, data: { customDomain: domain, customDomainVerifiedAt: null } })
      );
      if (!claimed) throw new CustomDomainError(DOMAIN_TAKEN_ERROR);
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
