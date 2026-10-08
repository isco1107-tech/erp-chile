import 'server-only';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { customDomainProblem, normalizeDomain } from '@/lib/hosting/custom-domain';
import {
  DOMAIN_ATTACH_ERROR,
  DOMAIN_STATUS_ERROR,
  DOMAIN_TAKEN_ERROR,
  attachDomain,
  checkDomainStatus,
  detachDomain,
  claimDomain,
  isDomainAutomatic,
  type DomainView,
} from '@/lib/hosting/domain-lifecycle';
import { AcademyError } from './academy.service';

/**
 * Dominio propio del sitio de la academia. Mismo ciclo que certámenes y sitios
 * web (`src/lib/hosting/domain-lifecycle.ts`): la base de datos manda, Vercel
 * se sincroniza si hay credenciales y `customDomainVerifiedAt` se marca solo
 * cuando el dominio ya responde; recién ahí `/academia/{slug}` redirige a él.
 */

async function findSite(companyId: string) {
  const site = await prisma.academySite.findFirst({ where: { companyId }, select: { id: true, customDomain: true, customDomainVerifiedAt: true } });
  if (!site) throw new AcademyError('Primero crea el sitio de la academia');
  return site;
}

function report(companyId: string, reason: string, domain: string, errors: unknown[]): void {
  for (const error of errors) captureException(error, { module: 'academia', companyId, extra: { reason, domain } });
}

export async function refreshAcademyDomain(companyId: string): Promise<DomainView> {
  const site = await findSite(companyId);
  const automatic = isDomainAutomatic();
  if (!site.customDomain) return { domain: null, verifiedAt: null, automatic, records: [], dnsOk: false, statusError: null };

  const domain = site.customDomain;
  let status: Awaited<ReturnType<typeof checkDomainStatus>> | null = null;
  try {
    status = await checkDomainStatus(domain);
  } catch (error) {
    report(companyId, 'academy-domain-status', domain, [error]);
  }

  // Sin respuesta del proveedor se conserva el último estado conocido.
  let verifiedAt = site.customDomainVerifiedAt;
  if (status) {
    verifiedAt = status.ready ? (site.customDomainVerifiedAt ?? new Date()) : null;
    if ((verifiedAt?.getTime() ?? null) !== (site.customDomainVerifiedAt?.getTime() ?? null)) {
      await prisma.academySite.updateMany({ where: { id: site.id, companyId }, data: { customDomainVerifiedAt: verifiedAt } });
    }
  }
  return {
    domain,
    verifiedAt: verifiedAt?.toISOString() ?? null,
    automatic,
    records: status?.records ?? [],
    dnsOk: status?.dnsOk ?? false,
    statusError: status ? null : DOMAIN_STATUS_ERROR,
  };
}

export async function setAcademyDomain(companyId: string, rawDomain: string): Promise<DomainView> {
  const site = await findSite(companyId);
  const domain = normalizeDomain(rawDomain);
  const problem = customDomainProblem(domain);
  if (problem) throw new AcademyError(problem);

  if (site.customDomain !== domain) {
    try {
      const claimed = await claimDomain(domain, { kind: 'academySite', id: site.id }, (tx) =>
        tx.academySite.updateMany({ where: { id: site.id, companyId }, data: { customDomain: domain, customDomainVerifiedAt: null } })
      );
      if (!claimed) throw new AcademyError(DOMAIN_TAKEN_ERROR);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new AcademyError(DOMAIN_TAKEN_ERROR);
      throw error;
    }
    if (site.customDomain) report(companyId, 'academy-domain-detach', site.customDomain, await detachDomain(site.customDomain));
  }

  // Se registra en Vercel DESPUÉS de guardar: si falla, "Revisar estado" reintenta.
  const failed = await attachDomain(domain);
  report(companyId, 'academy-domain-attach', domain, failed);
  const view = await refreshAcademyDomain(companyId);
  return failed.length > 0 && !view.statusError ? { ...view, statusError: DOMAIN_ATTACH_ERROR } : view;
}

export async function removeAcademyDomain(companyId: string): Promise<DomainView> {
  const site = await findSite(companyId);
  if (site.customDomain) {
    await prisma.academySite.updateMany({ where: { id: site.id, companyId }, data: { customDomain: null, customDomainVerifiedAt: null } });
    report(companyId, 'academy-domain-detach', site.customDomain, await detachDomain(site.customDomain));
  }
  return refreshAcademyDomain(companyId);
}
