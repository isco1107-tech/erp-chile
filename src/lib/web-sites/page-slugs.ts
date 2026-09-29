/**
 * Direcciones de las páginas internas de un sitio (`/web/mi-sitio/servicios`
 * o `minegocio.cl/servicios`). Puro y sin dependencias: lo usa también
 * `src/lib/hosting/custom-domain.ts`, que corre en el proxy.
 *
 * En un dominio propio la página vive en la raíz (`/servicios`), así que su
 * dirección no puede chocar con una ruta que la plataforma sirve en ese mismo
 * dominio (postulación, pagos, recursos de Next) ni con las que manda a la
 * plataforma (login, panel). Esas quedan reservadas.
 */

export const PAGE_SLUG_MAX = 40;

/** Forma de la dirección de una página: minúsculas, números y guiones simples. */
export const PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  // Documento del modo HTML propio (`/web/[slug]/raw`).
  'raw',
  // Rutas de la plataforma y flujos públicos que un dominio propio sirve o redirige.
  'accept-invitation',
  'aether',
  'api',
  'branding',
  'certamen',
  'cliente',
  'conoce-aether',
  'dashboard',
  'downloads',
  'empresas',
  'favicon',
  'forgot-password',
  'judging',
  'landing-v2',
  'login',
  'manifest',
  'manual',
  'marketing',
  'opengraph-image',
  'pagar',
  'politica-privacidad',
  'register',
  'reset-password',
  'robots',
  'servicio',
  'sitemap',
  'sitio',
  'sponsors',
  'superadmin',
  'sw',
  'tickets',
  'trabajador',
  'verify',
  'votar',
  'web',
]);

/** ¿El texto tiene forma de dirección de página y no está reservado? */
export function isValidPageSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= PAGE_SLUG_MAX && PAGE_SLUG_RE.test(slug) && !RESERVED_PAGE_SLUGS.has(slug);
}

/** Motivo (en español) por el que la dirección de una página no sirve, o `null`. */
export function pageSlugProblem(slug: string): string | null {
  if (!slug) return 'Escribe la dirección de la página';
  if (slug.length > PAGE_SLUG_MAX) return `La dirección puede tener hasta ${PAGE_SLUG_MAX} caracteres`;
  if (!PAGE_SLUG_RE.test(slug)) return 'Usa solo letras minúsculas, números y guiones';
  if (RESERVED_PAGE_SLUGS.has(slug)) return `"${slug}" está reservada por la plataforma; elige otra`;
  return null;
}
