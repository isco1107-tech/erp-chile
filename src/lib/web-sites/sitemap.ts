import { publishedPages, type SiteDocument } from './site';

/**
 * Mapa del sitio (`sitemap.xml`) y `robots.txt` de cada sitio publicado, para
 * que los buscadores encuentren todas sus páginas. Puro: las rutas deciden qué
 * sitio es y con qué dirección se publica (la de la plataforma o su dominio).
 */

export interface SitemapEntry {
  url: string;
  lastModified?: Date | null;
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Direcciones de las páginas publicadas, relativas a la raíz del sitio (`''` = inicio). */
export function sitePaths(doc: SiteDocument | null): string[] {
  if (!doc) return [''];
  return publishedPages(doc).map((page, index) => (index === 0 ? '' : page.slug)).filter((path, index) => index === 0 || Boolean(path));
}

/** URL absoluta de una página a partir de la raíz pública del sitio (sin barra final). */
export function pageUrl(base: string, path: string): string {
  const root = base.replace(/\/+$/, '');
  return path ? `${root}/${path}` : `${root}/`;
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastModified && !Number.isNaN(entry.lastModified.getTime()) ? `<lastmod>${entry.lastModified.toISOString()}</lastmod>` : '';
      return `<url><loc>${escapeXml(entry.url)}</loc>${lastmod}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** `robots.txt` de un dominio propio: todo abierto salvo la API, con su mapa; un sitio "no indexable" se cierra entero. */
export function robotsTxt({ base, indexable }: { base: string; indexable: boolean }): string {
  if (!indexable) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${pageUrl(base, 'sitemap.xml')}\n`;
}

export const SEO_HEADERS = { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' } as const;
