import { customDomainProblem, normalizeDomain } from '@/lib/hosting/custom-domain';

/**
 * Dominio predeterminado de la empresa (`CompanySettings.defaultDomain`): el que
 * ya compró y con el que nacen sus páginas nuevas.
 *
 * Un dominio es de UN solo destino (`domain-lifecycle.ts`), así que el dominio de
 * la empresa no puede ser «el de todas sus páginas» a la vez: cada página nueva
 * nace en un SUBDOMINIO suyo, `<dirección>.<dominio>` (ej. `miss-temuco.miempresa.cl`),
 * que se guarda como el `customDomain` de esa página y sigue exactamente el mismo
 * camino que un dominio propio (Vercel, verificación, redirección, mapa del sitio).
 * Una página con dominio comprado aparte lo conserva y nunca se toca.
 *
 * Todo acá es puro (sin base de datos ni red); el servicio está en
 * `default-domain.service.ts`.
 */

/**
 * Nombres que una empresa suele tener ya con otro uso en su dominio (correo,
 * panel de hosting, DNS…): un registro explícito le gana al comodín, así que una
 * página en `mail.miempresa.cl` nunca se vería. Esas páginas se quedan en la
 * dirección de la plataforma hasta que la empresa les ponga otro dominio.
 * `www` además se quita al normalizar un dominio, así que ni siquiera podría guardarse.
 */
const RESERVED_LABELS: ReadonlySet<string> = new Set([
  'www', 'mail', 'webmail', 'smtp', 'imap', 'pop', 'pop3', 'mx', 'email',
  'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'ftp', 'sftp', 'cpanel', 'whm', 'webdisk',
  'autodiscover', 'autoconfig', 'localhost',
]);

/** Etiqueta DNS más larga que admite un subdominio. */
const MAX_LABEL = 63;
/** Largo máximo de un nombre de dominio completo. */
const MAX_DOMAIN = 253;

/** Etiqueta del subdominio que le corresponde a una dirección, o `null` si no sirve (vacía o reservada). */
export function defaultDomainLabel(slug: string): string | null {
  const label = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_LABEL)
    .replace(/-+$/, '');
  if (!label || RESERVED_LABELS.has(label)) return null;
  return label;
}

/**
 * Dominio en el que nace una página de dirección `slug` bajo el dominio predeterminado `base`,
 * o `null` si no se puede (dirección reservada, dominio inválido o demasiado largo).
 */
export function defaultSiteDomain(base: string, slug: string, env: Record<string, string | undefined> = process.env): string | null {
  const label = defaultDomainLabel(slug);
  if (!label) return null;
  const domain = `${label}.${base}`;
  if (domain.length > MAX_DOMAIN) return null;
  return customDomainProblem(domain, env) ? null : domain;
}

/** Lo que escribió la persona, listo para guardar, o el motivo (en español) por el que no sirve. */
export function parseDefaultDomain(raw: string, env: Record<string, string | undefined> = process.env): { domain: string } | { problem: string } {
  const domain = normalizeDomain(raw);
  const problem = customDomainProblem(domain, env);
  if (problem) return { problem };
  // Debe quedar espacio para la etiqueta de una página (hasta 63 + el punto).
  if (domain.length + 1 + 1 > MAX_DOMAIN) return { problem: 'El dominio es demasiado largo' };
  return { domain };
}

/**
 * Nombre del registro DNS de comodín, relativo a lo que el cliente compró (los dos
 * últimos niveles): `*` para `miempresa.cl`, `*.sitios` para `sitios.miempresa.cl`.
 * Con un solo registro así, toda página nueva queda apuntando a la plataforma sin
 * tocar el DNS cada vez.
 */
export function wildcardRecordName(base: string): string {
  return ['*', ...base.split('.').slice(0, -2)].join('.');
}

/** Dirección de ejemplo de una página bajo el dominio predeterminado, para mostrarla antes de crear una. */
export function defaultDomainExample(base: string): string {
  return `mi-pagina.${base}`;
}
