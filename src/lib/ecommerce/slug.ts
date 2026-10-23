import { slugify } from '@/lib/web-sites/urls';

/** Dirección de un producto en la tienda (`/producto/[slug]`): del nombre, sin repetirse dentro de la tienda. */
export function productSlug(name: string, taken: ReadonlySet<string> | readonly string[], max = 60): string {
  const used = taken instanceof Set ? taken : new Set(taken);
  const base = slugify(name, max) || 'producto';
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, max - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, max - 9)}-${Date.now().toString(36)}`;
}

export const PRODUCT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
