import 'server-only';

import { resolve4, resolveCname } from 'node:dns/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { attachDomain, claimDomain, isDomainAutomatic, isVercelAddress, isVercelCname, type DomainOwnerKind } from '@/lib/hosting/domain-lifecycle';
import { defaultDomainExample, defaultSiteDomain, parseDefaultDomain, wildcardRecordName } from '@/lib/hosting/default-domain';
import { DEFAULT_CNAME, type DnsRecord } from '@/lib/hosting/vercel-domains';
import { addTurnstileHostname } from '@/lib/security/turnstile-hostnames';

/**
 * Dominio predeterminado de la empresa (ver `default-domain.ts`): se guarda en
 * `CompanySettings.defaultDomain` y toda página nueva (certamen, sitio web,
 * tienda, academia) nace en `<dirección>.<dominio>` en vez de la dirección de la
 * plataforma. Guardarlo NO toca las páginas que ya existen ni su dominio.
 */

export class DefaultDomainError extends Error {}

const TAKEN_ERROR = 'Ese dominio ya lo usa otra empresa de la plataforma';

/** Etiqueta que se consulta para ver si el comodín del DNS está creado (no existe como página). */
const WILDCARD_PROBE_LABEL = 'aether-dns-check';

export interface DefaultDomainView {
  domain: string | null;
  /** Registro de comodín a crear UNA vez en el proveedor del dominio; `null` sin dominio. */
  record: DnsRecord | null;
  /** Dirección que tendría una página nueva, para mostrar el resultado antes de crearla. */
  example: string | null;
  /** La plataforma registra cada página sola en Vercel (hay credenciales); si no, hay que agregarla a mano. */
  automatic: boolean;
}

function viewOf(domain: string | null): DefaultDomainView {
  return {
    domain,
    record: domain ? { type: 'CNAME', name: wildcardRecordName(domain), value: DEFAULT_CNAME } : null,
    example: domain ? defaultDomainExample(domain) : null,
    automatic: isDomainAutomatic(),
  };
}

/** Dominio predeterminado de la empresa, o `null` si no tiene. */
export async function getDefaultDomain(companyId: string): Promise<string | null> {
  const settings = await prisma.companySettings.findFirst({ where: { companyId }, select: { defaultDomain: true } });
  return settings?.defaultDomain ?? null;
}

export async function getDefaultDomainView(companyId: string): Promise<DefaultDomainView> {
  return viewOf(await getDefaultDomain(companyId));
}

/**
 * Falla si el dominio ya es el predeterminado de OTRA empresa o si una página de otra
 * empresa lo usa (o usa un subdominio suyo): dos empresas no pueden disputarse el mismo
 * dominio. `companyId` es la empresa que lo pide (`null` al crearla, cuando aún no existe).
 */
export async function assertDefaultDomainAvailable(domain: string, companyId: string | null): Promise<void> {
  const others = companyId ? { companyId: { not: companyId } } : {};
  const pages = { OR: [{ customDomain: domain }, { customDomain: { endsWith: `.${domain}` } }], ...others };
  const [settings, project, webSite, academySite] = await Promise.all([
    prisma.companySettings.findFirst({ where: { defaultDomain: domain, ...others }, select: { id: true } }),
    prisma.project.findFirst({ where: pages, select: { id: true } }),
    prisma.webSite.findFirst({ where: pages, select: { id: true } }),
    prisma.academySite.findFirst({ where: pages, select: { id: true } }),
  ]);
  if (settings || project || webSite || academySite) throw new DefaultDomainError(TAKEN_ERROR);
}

/** Guarda (o cambia) el dominio predeterminado. Las páginas que ya existen no cambian de dominio. */
export async function setDefaultDomain(companyId: string, raw: string): Promise<DefaultDomainView> {
  const parsed = parseDefaultDomain(raw);
  if ('problem' in parsed) throw new DefaultDomainError(parsed.problem);
  await assertDefaultDomainAvailable(parsed.domain, companyId);
  try {
    await prisma.companySettings.upsert({
      where: { companyId },
      update: { defaultDomain: parsed.domain },
      create: { companyId, defaultDomain: parsed.domain },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new DefaultDomainError(TAKEN_ERROR);
    throw error;
  }
  return viewOf(parsed.domain);
}

/** Quita el dominio predeterminado: las páginas nuevas vuelven a nacer en la dirección de la plataforma. */
export async function removeDefaultDomain(companyId: string): Promise<DefaultDomainView> {
  await prisma.companySettings.updateMany({ where: { companyId }, data: { defaultDomain: null } });
  return viewOf(null);
}

/**
 * ¿El comodín del DNS ya apunta a la plataforma? Consulta una etiqueta que no es de ninguna
 * página: solo responde si existe el registro `*` (CNAME a Vercel, o una dirección de Vercel).
 * Nunca lanza.
 */
export async function wildcardPointsToPlatform(domain: string): Promise<boolean> {
  const probe = `${WILDCARD_PROBE_LABEL}.${domain}`;
  try {
    if ((await resolveCname(probe)).some(isVercelCname)) return true;
  } catch {
    // Sin CNAME: puede que lo hayan creado como registro A.
  }
  try {
    return (await resolve4(probe)).some(isVercelAddress);
  } catch {
    return false;
  }
}

/** Revisa el DNS del dominio predeterminado de la empresa. */
export async function checkDefaultDomainDns(companyId: string): Promise<{ domain: string; dnsOk: boolean }> {
  const domain = await getDefaultDomain(companyId);
  if (!domain) throw new DefaultDomainError('La empresa no tiene un dominio predeterminado');
  return { domain, dnsOk: await wildcardPointsToPlatform(domain) };
}

export type DefaultDomainTarget = { kind: DomainOwnerKind; id: string };

function writeDomain(tx: Prisma.TransactionClient, companyId: string, target: DefaultDomainTarget, domain: string): Promise<{ count: number }> {
  // `customDomain: null`: solo se llena una página que no tiene dominio; el comprado aparte nunca se pisa.
  const where = { id: target.id, companyId, customDomain: null };
  const data = { customDomain: domain, customDomainVerifiedAt: null };
  // Exhaustivo a propósito: un tipo de sitio nuevo en `DOMAIN_OWNER_KINDS` no compila hasta que se resuelva acá.
  switch (target.kind) {
    case 'project':
      return tx.project.updateMany({ where, data });
    case 'webSite':
      return tx.webSite.updateMany({ where, data });
    case 'academySite':
      return tx.academySite.updateMany({ where, data });
  }
}

/**
 * Le da a una página recién creada su dominio bajo el predeterminado de la empresa
 * (`<slug>.<dominio>`), si lo tiene y la página aún no tiene uno propio. Hace lo mismo que
 * guardar un dominio a mano —candado de unicidad, registro en Vercel y, en certámenes, en
 * Turnstile— y el sitio sigue en la dirección de la plataforma hasta que el dominio responde
 * (la primera visita o «Revisar estado» lo verifican).
 *
 * Nunca lanza: una página sin dominio funciona igual en la dirección de la plataforma, así que
 * crear la página jamás depende de esto. Devuelve el dominio asignado, o `null` si no hubo.
 */
export async function assignDefaultDomain(companyId: string, target: DefaultDomainTarget, slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  try {
    const base = await getDefaultDomain(companyId);
    const domain = base ? defaultSiteDomain(base, slug) : null;
    if (!domain) return null;

    let stored = 0;
    const claimed = await claimDomain(domain, target, async (tx) => {
      stored = (await writeDomain(tx, companyId, target, domain)).count;
    });
    // Otra página ya tiene ese subdominio, o esta ya traía un dominio propio: no se registra nada.
    if (!claimed || stored === 0) return null;

    // Se registra DESPUÉS de guardar (como al poner un dominio a mano): si falla, «Revisar estado» reintenta.
    const jobs: unknown[] = await attachDomain(domain);
    if (target.kind === 'project') {
      // El formulario de postulación del certamen usa Turnstile, que solo funciona en los dominios que tiene registrados.
      await addTurnstileHostname(domain).catch((error: unknown) => jobs.push(error));
    }
    for (const error of jobs) captureException(error, { module: 'dominios', companyId, extra: { reason: 'default-domain-attach', domain } });
    return domain;
  } catch (error) {
    captureException(error, { module: 'dominios', companyId, extra: { reason: 'default-domain-assign', kind: target.kind, id: target.id } });
    return null;
  }
}
