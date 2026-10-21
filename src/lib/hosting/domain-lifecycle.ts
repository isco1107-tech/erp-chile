import 'server-only';

import { resolve4, resolveCname } from 'node:dns/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureMessage } from '@/lib/observability';
import { isApexDomain } from '@/lib/hosting/custom-domain';
import { assertResolvesToPublicAddress } from '@/lib/security/outbound-url';
import { DOMAIN_PING_APP, DOMAIN_PING_PATH } from '@/lib/hosting/ping';
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
  /**
   * El dominio YA muestra la plataforma (se pidió `https://dominio/api/hosting/ping`
   * y respondió nuestra app). Es la única prueba de que funciona: los DNS pueden
   * apuntar bien y aun así Vercel no servirlo si el dominio no está agregado al proyecto.
   */
  serving: boolean;
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

type Db = Pick<Prisma.TransactionClient, 'project' | 'webSite' | 'academySite'>;

/** `true` si el dominio ya lo usa otro sitio distinto de `self` (de cualquier tipo). */
export async function domainTakenByOther(domain: string, self: { kind: DomainOwnerKind; id: string }, db: Db = prisma): Promise<boolean> {
  const [project, webSite, academySite] = await Promise.all([
    db.project.findUnique({ where: { customDomain: domain }, select: { id: true } }),
    db.webSite.findUnique({ where: { customDomain: domain }, select: { id: true } }),
    db.academySite.findUnique({ where: { customDomain: domain }, select: { id: true } }),
  ]);
  const owners: Array<[DomainOwnerKind, { id: string } | null]> = [
    ['project', project],
    ['webSite', webSite],
    ['academySite', academySite],
  ];
  return owners.some(([kind, row]) => row !== null && !(kind === self.kind && row.id === self.id));
}

/**
 * Toma un dominio para `self` sin carreras: revisar que esté libre y guardarlo
 * van en una misma transacción, con un candado por dominio
 * (`pg_advisory_xact_lock`). Así dos empresas que guardan el mismo dominio a
 * la vez —aunque sea en tablas distintas (certamen, sitio web, academia), donde
 * el `@unique` de cada tabla no alcanza— no pueden quedarse ambas con él.
 * Devuelve `false` si otro sitio ya lo usa (y no escribe nada).
 */
export async function claimDomain(domain: string, self: { kind: DomainOwnerKind; id: string }, write: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${domain}))::text AS locked`;
    if (await domainTakenByOther(domain, self, tx)) return false;
    await write(tx);
    return true;
  });
}

/** Dominio que el cliente compró: los dos últimos niveles ("temuco.cl" para "miss.temuco.cl"). */
function zoneOf(domain: string): string {
  return domain.split('.').slice(-2).join('.');
}

/**
 * Sin la API de Vercel: ¿el DNS público apunta a Vercel? Vercel usa varias
 * direcciones (76.76.21.x, y en proyectos nuevos 216.198.79.x / 64.29.17.x) y
 * CNAME `cname.vercel-dns.com` o `xxxx.vercel-dns-0NN.com`. Es solo una pista
 * para mostrar los registros: la prueba real es `domainServesPlatform`.
 */
const VERCEL_APEX_PREFIXES = ['76.76.21.', '216.198.79.', '64.29.17.'];
export function isVercelAddress(ip: string): boolean {
  return ip === DEFAULT_APEX_IPV4 || VERCEL_APEX_PREFIXES.some((prefix) => ip.startsWith(prefix));
}
export function isVercelCname(target: string): boolean {
  return /(^|\.)vercel-dns(-\d+)?\.com$/.test(target.replace(/\.$/, '').toLowerCase());
}
async function dnsPointsToVercel(domain: string, apex: boolean): Promise<boolean> {
  try {
    if (apex) return (await resolve4(domain)).some(isVercelAddress);
    return (await resolveCname(domain)).some(isVercelCname);
  } catch {
    return false;
  }
}


/**
 * ¿El dominio ya muestra la plataforma? Pide `https://dominio/api/hosting/ping`
 * y exige la respuesta de nuestra app. Así un dominio solo queda «verificado»
 * cuando de verdad funciona (DNS + Vercel + certificado), nunca solo porque el
 * DNS apunte bien. Nunca lanza. Defensa SSRF: el dominio ya pasó
 * `customDomainProblem` (sin IP ni localhost), se exige que resuelva a una IP
 * pública, solo https, y se sigue a lo más una redirección y solo entre el
 * dominio y su `www.`.
 */
export async function domainServesPlatform(domain: string): Promise<boolean> {
  const allowedHosts = new Set([domain, `www.${domain}`, domain.replace(/^www\./, '')]);
  let url = new URL(`https://${domain}${DOMAIN_PING_PATH}`);
  try {
    for (let hop = 0; hop < 2; hop++) {
      await assertResolvesToPublicAddress(url.hostname);
      const response = await fetch(url, { redirect: 'manual', cache: 'no-store', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return false;
        const next = new URL(location, url);
        if (next.protocol !== 'https:' || !allowedHosts.has(next.hostname)) return false;
        url = next;
        continue;
      }
      if (!response.ok) return false;
      const body = (await response.json().catch(() => null)) as { app?: unknown } | null;
      return body?.app === DOMAIN_PING_APP;
    }
    return false;
  } catch {
    return false;
  }
}

export interface DomainStatus {
  records: DnsRecord[];
  dnsOk: boolean;
  serving: boolean;
  /** Listo para publicarse ahí: el dominio ya muestra la plataforma (y, con la API, Vercel lo da por verificado). */
  ready: boolean;
}

/** Estado del dominio. Lanza si la API de Vercel no respondió (quien llama conserva el último estado conocido). */
export async function checkDomainStatus(domain: string): Promise<DomainStatus> {
  const apex = isApexDomain(domain);
  const zone = zoneOf(domain);
  if (isVercelDomainsConfigured()) {
    const main = await getDomainStatus(domain, zone, apex);
    const www = apex ? await getDomainStatus(`www.${domain}`, zone, false).catch(() => null) : null;
    if (!main.inProject) await addProjectDomain(domain);
    const serving = await domainServesPlatform(domain);
    return { records: [...main.records, ...(www?.records ?? [])], dnsOk: main.dnsOk || serving, serving, ready: serving && main.inProject && main.verified };
  }
  const [dnsHint, serving] = await Promise.all([dnsPointsToVercel(domain, apex), domainServesPlatform(domain)]);
  const dnsOk = dnsHint || serving;
  return { records: dnsOk ? [] : defaultDnsRecords(domain, zone, apex), dnsOk, serving, ready: serving };
}

/** Registra el dominio (y su `www.` si es raíz) en Vercel. Devuelve los errores en vez de lanzar. */
export async function attachDomain(domain: string): Promise<unknown[]> {
  if (!isVercelDomainsConfigured()) {
    // Sin VERCEL_API_TOKEN nadie agrega el dominio a Vercel y no mostrará el sitio: se deja constancia para el
    // administrador de la plataforma (logs/Sentry), además del aviso en el panel de quien lo guardó.
    captureMessage('Dominio propio guardado sin conexión automática con Vercel: hay que agregarlo a mano en el proyecto (o configurar VERCEL_API_TOKEN)', 'warn', { module: 'dominios', extra: { domain } });
    return [];
  }
  const jobs = [addProjectDomain(domain), ...(isApexDomain(domain) ? [addProjectDomain(`www.${domain}`, domain)] : [])];
  return (await Promise.allSettled(jobs)).filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
}

/**
 * Suelta el dominio en Vercel, SOLO si ningún sitio lo sigue usando: si otro
 * sitio lo tiene (dato viejo, carrera), soltarlo dejaría caído ese sitio.
 * Se llama después de borrar el dominio de la fila propia. Devuelve los
 * errores en vez de lanzar.
 */
export async function detachDomain(domain: string): Promise<unknown[]> {
  if (!isVercelDomainsConfigured()) return [];
  if ((await domainOwner(domain)) !== null) return [];
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
