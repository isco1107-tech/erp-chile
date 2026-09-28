import { SANDBOX_HEADERS, sanitizeHtml, wrapHtmlDocument } from '@/lib/web-sites/html';
import { getPublicWebSite } from '@/modules/web-sites/services/web-sites.service';

/**
 * Documento HTML propio de un sitio publicado en modo HTML. Se sirve como
 * documento independiente con `Content-Security-Policy: sandbox …` (ver
 * `SANDBOX_CSP`): sin scripts, sin formularios, en un origen opaco. Es lo que
 * hace seguro publicar HTML de un cliente bajo nuestro dominio.
 * El HTML se vuelve a limpiar al servirlo (ya se limpió al publicar): dos
 * barreras antes de la política del navegador.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublicWebSite(slug);
  if (!site || site.mode !== 'HTML') {
    return new Response('Sitio no disponible', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  }
  const html = wrapHtmlDocument(sanitizeHtml(site.html).html, { title: site.title, description: site.description });
  return new Response(html, {
    status: 200,
    headers: { ...SANDBOX_HEADERS, 'X-Robots-Tag': 'noindex' },
  });
}
