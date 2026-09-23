/**
 * Dirección pública del micrositio de un certamen (`/certamen/{slug}`).
 *
 * El slug es único en TODA la plataforma (la URL no lleva la empresa), así
 * que además de normalizarlo hay que impedir que alguien reserve palabras
 * que el día de mañana queramos usar como ruta propia, o que se parezcan a
 * una pantalla del sistema en un enlace compartido.
 */

export const PUBLIC_SLUG_MIN = 3;
export const PUBLIC_SLUG_MAX = 60;

const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'aether',
  'certamen',
  'dashboard',
  'login',
  'logout',
  'nuevo',
  'new',
  'panel',
  'preview',
  'soporte',
  'superadmin',
  'support',
  'test',
]);

/**
 * "Miss Universe Chile 2026" → "miss-universe-chile-2026". Quita tildes y
 * eñes, colapsa separadores y recorta al largo máximo sin dejar un guion
 * colgando al final.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PUBLIC_SLUG_MAX)
    .replace(/-+$/g, '');
}

/** `null` si el slug es válido; si no, el motivo en español para mostrar tal cual. */
export function publicSlugProblem(slug: string): string | null {
  if (slug.length < PUBLIC_SLUG_MIN) return `La dirección debe tener al menos ${PUBLIC_SLUG_MIN} caracteres`;
  if (slug.length > PUBLIC_SLUG_MAX) return `La dirección no puede superar ${PUBLIC_SLUG_MAX} caracteres`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return 'Usa solo minúsculas, números y guiones (sin espacios, tildes ni guiones al inicio o al final)';
  }
  if (RESERVED_SLUGS.has(slug)) return 'Esa dirección está reservada por el sistema; elige otra';
  return null;
}
