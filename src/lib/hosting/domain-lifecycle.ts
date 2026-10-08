import 'server-only';

import { resolve4, resolveCname } from 'node:dns/promises';
import { prisma } from '@/lib/prisma';
import { isApexDomain } from '@/lib/hosting/custom-domain';
import {
  DEFAULT_APEX_IPV4,
  addProjectDomain,
  defaultDnsRecords,
  getDomainStatus,
  isVercelDomainsConfigured,
  removeProjectDomain,
  type DnsRecord,
} from '@/lib/hosting/vercel-domains';

/**
 * Ciclo de vida de un dominio propio, común a TODO sitio público de la
 * plataforma (certámenes, sitios web, academia y los que vengan). Cada tipo de
 * sitio guarda su dominio en su propia tabla (`customDomain` @unique +
 * `customDomainVerifiedAt`); acá vive lo que no depende de la tabla:
 *
 *  - `domainOwner`: un dominio es de UN solo destino en toda la plataforma.
 *    Un sitio nuevo con dominio se suma aquí y en `DOMAIN_OWNER_KINDS`, y así
 *    los demás lo respetan sin tocar cada servicio.
 *  - `checkDomainStatus`: registros DNS a crear y si ya responde (por la API
 *    de Vercel si hay credenciales; si no, mirando el DNS público).
 *  - `attachDomain` / `detachDomain`: registrar o soltar en Vercel. Nunca
 *    lanzan: guardar el dominio no depende del proveedor.
 */

export const DOMAIN_OWNER_KINDS = ['project', 'webSite', 'academySite'] as const;
export type DomainOwnerKind = (typeof DOMAIN_OWNER_KINDS)[number];

export interface DomainView {
  domain: string | null;
  verifiedAt: string | null;
  /** Vercel se configura solo (hay credenciales de su API). */
  automatic: boolean;
  /** Registros DNS a crear en el proveedor del dominio (vacío si ya está todo). */
  records: DnsRecord[];
  dnsOk: boolean;
  /** Mensaje si no se pudo consultar el estado (Vercel caído, token vencido…). */
  statusError: string | null;
}

/** Quién usa un dominio (cualquier tipo de sitio), o `null` si está libre. */
export async function domainOwner(domain: string): Promise<DomainOwnerKind | null> {
  const [project, webSite, academySite] = await Promise.all([
    prisma.project.findUnique({ where: { customDomain: domain }, select: { id: true } }),
    prisma.webSite.findUnique({ where: { customDomain: domain }, select: { id: true } }),
    prisma.academySite.findUnique({ where: { customDomain: domain }, select: { id: true } }),
  ]);
  if (project) return 'project';
  if (webSite) return 'webSite';
  if (academySite) return 'academySite';
  return null;
}

/** `true` si el dominio ya lo usa otro sitio distinto de `self` (de cualquier tipo). */
export async function domainTakenByOther(domain: string, self: { kind: DomainOwnerKind; id: string }): Promise<boolean> {
  const [project, webSite, academySite] = await Promise.all([
    prisma.project.findUnique({ where: { customDomain: domain }, select: { id: true } }),
    prisma.webSite.findUnique({ where: { customDomain: domain }, select: { id: true } }),
    prisma.academySite.findUnique({ where: { customDomain: domain }, select: { id: true } }),
  ]);
  const owners: Array<[DomainOwnerKind, { id: string } | null]> = [
    ['project', project],
    ['webSite', webSite],
    ['academySite', academySite],
  ];
  return owners.some(([kind, row]) => row !== null && !(kind === self.kind && row.id === self.id));
}

/** Dominio que el cliente compró: los dos últimos niveles ("temuco.cl" para "miss.temuco.cl"). */
function zoneOf(domain: string): string {
  return domain.split('.').slice(-2).join('.');
}

/** Sin la API de Vercel: se revisa el DNS público directamente. */
async function dnsPointsToVercel(domain: string, apex: boolean): Promise<boolean> {
  try {
    if (apex) return (await resolve4(domain)).some((ip) => ip === DEFAULT_APEX_IPV4 || ip.startsWith('76.76.21.'));
    return (await resolveCname(domain)).some((target) => target.replace(/\.$/, '').endsWith('vercel-dns.com'));
  } catch {
    return false;
  }
}

/** Estado del dominio. Lanza si el proveedor no respondió (quien llama conserva el último estado conocido). */
export async function checkDomainStatus(domain: string): Promise<{ records: DnsRecord[]; dnsOk: boolean; ready: boolean }> {
  const apex = isApexDomain(domain);
  const zone = zoneOf(domain);
  if (isVercelDomainsConfigured()) {
    const main = await getDomainStatus(domain, zone, apex);
    const www = apex ? await getDomainStatus(`www.${domain}`, zone, false).catch(() => null) : null;
    if (!main.inProject) await addProjectDomain(domain);
    return { records: [...main.records, ...(www?.records ?? [])], dnsOk: main.dnsOk, ready: main.inProject && main.verified && main.dnsOk };
  }
  const dnsOk = await dnsPointsToVercel(domain, apex);
  return { records: dnsOk ? [] : defaultDnsRecords(domain, zone, apex), dnsOk, ready: dnsOk };
}

/** Registra el dominio (y su `www.` si es raíz) en Vercel. Devuelve los errores en vez de lanzar. */
export async function attachDomain(domain: string): Promise<unknown[]> {
  if (!isVercelDomainsConfigured()) return [];
  const jobs = [addProjectDomain(domain), ...(isApexDomain(domain) ? [addProjectDomain(`www.${domain}`, domain)] : [])];
  return (await Promise.allSettled(jobs)).filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
}

/** Suelta el dominio en Vercel. Devuelve los errores en vez de lanzar. */
export async function detachDomain(domain: string): Promise<unknown[]> {
  if (!isVercelDomainsConfigured()) return [];
  const jobs = [removeProjectDomain(domain), ...(isApexDomain(domain) ? [removeProjectDomain(`www.${domain}`)] : [])];
  return (await Promise.allSettled(jobs)).filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
}

/** La conexión con Vercel es automática (hay credenciales de su API). */
export function isDomainAutomatic(): boolean {
  return isVercelDomainsConfigured();
}

export const DOMAIN_STATUS_ERROR = 'No pudimos consultar el estado del dominio en este momento. Intenta de nuevo en unos minutos.';
export const DOMAIN_ATTACH_ERROR = 'El dominio quedó guardado, pero no se pudo registrar en el servidor. Usa "Revisar estado" para reintentar.';
export const DOMAIN_TAKEN_ERROR = 'Ese dominio ya lo usa otro certamen o sitio de la plataforma';
