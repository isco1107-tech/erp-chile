import 'server-only';

import { z } from 'zod';

/**
 * Dominios del proyecto en Vercel vía su API REST, para que un certamen con
 * dominio propio quede publicado sin entrar al panel de Vercel.
 *
 * Requiere `VERCEL_API_TOKEN` (token con acceso al proyecto) y
 * `VERCEL_PROJECT_ID`; `VERCEL_TEAM_ID` si el proyecto es de un equipo. Sin
 * ellas `isVercelDomainsConfigured()` es `false` y la pantalla muestra los
 * pasos para agregar el dominio a mano: guardar el dominio nunca depende de
 * esta API.
 */

const API = 'https://api.vercel.com';
const TIMEOUT_MS = 15_000;

/** Registros por defecto de Vercel, por si la API no entrega los recomendados. */
export const DEFAULT_APEX_IPV4 = '76.76.21.21';
export const DEFAULT_CNAME = 'cname.vercel-dns.com';

export function isVercelDomainsConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN?.trim() && process.env.VERCEL_PROJECT_ID?.trim());
}

export class VercelDomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = 'VercelDomainError';
  }
}

function query(): string {
  const team = process.env.VERCEL_TEAM_ID?.trim();
  return team ? `?teamId=${encodeURIComponent(team)}` : '';
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API}${path}${query()}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN?.trim()}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new VercelDomainError(error?.message ?? `Vercel respondió HTTP ${response.status}`, response.status, error?.code ?? null);
  }
  return body;
}

const verificationSchema = z.object({ type: z.string(), domain: z.string(), value: z.string(), reason: z.string().optional() });
const projectDomainSchema = z.object({
  name: z.string(),
  verified: z.boolean(),
  verification: z.array(verificationSchema).optional(),
});
const configSchema = z.object({
  misconfigured: z.boolean(),
  recommendedIPv4: z.array(z.object({ rank: z.number(), value: z.array(z.string()) })).optional(),
  recommendedCNAME: z.array(z.object({ rank: z.number(), value: z.string() })).optional(),
});

function projectPath(): string {
  return `/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!.trim())}/domains`;
}

/**
 * Agrega el dominio al proyecto. Idempotente: si ya estaba agregado a este
 * mismo proyecto no es error. `redirectTo` sirve para `www.` → raíz.
 */
export async function addProjectDomain(domain: string, redirectTo?: string): Promise<void> {
  try {
    await call(`/v10${projectPath()}`, {
      method: 'POST',
      body: JSON.stringify({ name: domain, ...(redirectTo ? { redirect: redirectTo, redirectStatusCode: 308 } : {}) }),
    });
  } catch (error) {
    // Ya estaba en este proyecto: nada que hacer.
    if (error instanceof VercelDomainError && error.status === 409 && error.code === 'domain_already_in_project') return;
    throw error;
  }
}

/** Quita el dominio del proyecto; si ya no estaba, no es error. */
export async function removeProjectDomain(domain: string): Promise<void> {
  try {
    await call(`/v9${projectPath()}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof VercelDomainError && error.status === 404) return;
    throw error;
  }
}

export interface DnsRecord {
  type: 'A' | 'CNAME' | 'TXT';
  /** Nombre del registro tal como lo pide el panel DNS ("@" para la raíz). */
  name: string;
  value: string;
}

export interface DomainStatus {
  /** El dominio está agregado al proyecto en Vercel. */
  inProject: boolean;
  /** Vercel confirmó que el dominio es de esta cuenta (algunos exigen un TXT). */
  verified: boolean;
  /** Los DNS apuntan a Vercel. */
  dnsOk: boolean;
  /** Registros que faltan por crear en el proveedor del dominio. */
  records: DnsRecord[];
}

/** Nombre relativo para el panel DNS: "@" en la raíz, "www" para www.ejemplo.cl, etc. */
function relativeName(host: string, apex: string): string {
  if (host === apex) return '@';
  return host.endsWith(`.${apex}`) ? host.slice(0, -(apex.length + 1)) : host;
}

/**
 * Estado de un dominio: si está en el proyecto, verificado y con los DNS
 * apuntando a Vercel, más los registros que faltan. `zone` es el dominio que
 * el cliente compró (para nombrar los registros relativos a él).
 */
export async function getDomainStatus(domain: string, zone: string, isApex: boolean): Promise<DomainStatus> {
  let inProject = true;
  let verified = false;
  let verification: z.infer<typeof verificationSchema>[] = [];
  try {
    // Pedir verificación de nuevo hace que Vercel revise el TXT si ya se creó.
    const raw = await call(`/v9${projectPath()}/${encodeURIComponent(domain)}/verify`, { method: 'POST' }).catch(() =>
      call(`/v9${projectPath()}/${encodeURIComponent(domain)}`)
    );
    const parsed = projectDomainSchema.parse(raw);
    verified = parsed.verified;
    verification = parsed.verification ?? [];
  } catch (error) {
    if (error instanceof VercelDomainError && error.status === 404) inProject = false;
    else throw error;
  }

  const config = configSchema.parse(await call(`/v6/domains/${encodeURIComponent(domain)}/config`));
  const ipv4 = config.recommendedIPv4?.sort((a, b) => a.rank - b.rank)[0]?.value[0] ?? DEFAULT_APEX_IPV4;
  const cname = (config.recommendedCNAME?.sort((a, b) => a.rank - b.rank)[0]?.value ?? DEFAULT_CNAME).replace(/\.$/, '');

  const records: DnsRecord[] = [];
  if (config.misconfigured) {
    records.push(isApex ? { type: 'A', name: '@', value: ipv4 } : { type: 'CNAME', name: relativeName(domain, zone), value: cname });
  }
  for (const challenge of verified ? [] : verification) {
    records.push({ type: challenge.type === 'TXT' ? 'TXT' : 'CNAME', name: relativeName(challenge.domain, zone), value: challenge.value });
  }
  return { inProject, verified, dnsOk: !config.misconfigured, records };
}

/** Registros a crear cuando no hay integración con la API (instrucciones manuales). */
export function defaultDnsRecords(domain: string, zone: string, isApex: boolean): DnsRecord[] {
  return isApex
    ? [
        { type: 'A', name: '@', value: DEFAULT_APEX_IPV4 },
        { type: 'CNAME', name: 'www', value: DEFAULT_CNAME },
      ]
    : [{ type: 'CNAME', name: relativeName(domain, zone), value: DEFAULT_CNAME }];
}
