/**
 * `robots.txt` y `sitemap.xml` de un dominio propio (ej. `missuniversotemuco.cl`).
 *
 * Google exige que el sitemap viva en el mismo dominio que las páginas que
 * lista, así que el de la plataforma no le sirve a un dominio de cliente: cada
 * uno publica el suyo. Puro (sin base de datos): lo usan las rutas
 * `/sitio/[host]/robots.txt` y `/sitio/[host]/sitemap.xml`, a las que
 * reescribe `src/proxy.ts`.
 */

/**
 * Rutas de un micrositio que llevan un token en la dirección (postulación,
 * entradas, votación, pago de cuotas). No van a buscadores: indexarlas
 * publicaría el token en los resultados.
 */
export const CUSTOM_DOMAIN_PRIVATE_PATHS = ['/register/', '/tickets/', '/votar/', '/pagar/'];

export function robotsTxt(input: { domain: string; indexable: boolean }): string {
  const lines = ['User-agent: *'];
  if (!input.indexable) {
    lines.push('Disallow: /');
    return `${lines.join('\n')}\n`;
  }
  lines.push('Allow: /');
  for (const path of CUSTOM_DOMAIN_PRIVATE_PATHS) lines.push(`Disallow: ${path}`);
  lines.push('', `Sitemap: https://${input.domain}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** `paths` relativos al dominio (`''` o `/` = inicio); cada uno sale como URL absoluta https. */
export function sitemapXml(input: { domain: string; paths: string[] }): string {
  const urls = [...new Set(input.paths.map((path) => (path === '' || path === '/' ? '' : `/${path.replace(/^\/+/, '')}`)))].map(
    (path) => `  <url><loc>${escapeXml(`https://${input.domain}${path === '' ? '' : path}`)}</loc></url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
