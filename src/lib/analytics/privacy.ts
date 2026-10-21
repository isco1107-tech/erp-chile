/**
 * Filtro de Vercel Web Analytics: qué visitas se cuentan y con qué URL.
 *
 * Solo se miden las páginas PROPIAS de Aether (landing, login, panel). Se
 * descarta todo lo demás porque:
 *  - Muchas URLs públicas llevan tokens secretos en la ruta (`/pagar/[token]`,
 *    `/tickets/[token]`, `/derechos/[token]`, invitaciones, reseteo de
 *    contraseña): mandarlas a un tercero filtraría el acceso.
 *  - Los micrositios, sitios web y formularios de cada empresa cliente son de
 *    esa empresa: medir a sus visitantes con la cuenta de Aether no está en
 *    los avisos de privacidad que ellos publican.
 *  - Un dominio propio de un certamen nunca es de Aether.
 *
 * A lo que sí se mide se le quitan la consulta y el fragmento, y los ids de
 * la ruta se reemplazan por `:id` (no identifican a nadie y agrupan mejor).
 */

/** Rutas propias de Aether que se miden (prefijo exacto o subruta). */
const TRACKED_PREFIXES = ['/dashboard', '/aether'] as const;
const TRACKED_EXACT = new Set(['/', '/empresas', '/conoce-aether', '/landing-v2', '/login', '/seleccionar-empresa']);

/** Segmento que parece un identificador: cuid, uuid, número o o token largo con dígitos. */
const ID_SEGMENT = /^(?:(?=c[a-z]*\d)c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{16,})$/;

function isPlatformHost(host: string, platformHosts: readonly string[]): boolean {
  const value = host.toLowerCase().replace(/:\d+$/, '');
  if (value === 'localhost' || value.endsWith('.localhost')) return true;
  if (value.endsWith('.vercel.app')) return true;
  return platformHosts.includes(value);
}

function isTrackedPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (TRACKED_EXACT.has(path)) return true;
  return TRACKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** URL que se envía a Analytics, o `null` si la visita no se debe contar. */
export function sanitizeAnalyticsUrl(rawUrl: string, platformHosts: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isPlatformHost(url.host, platformHosts)) return null;
  if (!isTrackedPath(url.pathname)) return null;
  const pathname = url.pathname
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
  return `${url.origin}${pathname}`;
}
