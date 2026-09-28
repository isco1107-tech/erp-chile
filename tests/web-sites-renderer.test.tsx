import { renderToStaticMarkup } from 'react-dom/server';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { createBlock, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { starterBlocks, WEB_SITE_KINDS } from '@/lib/web-sites/templates';
import { DEFAULT_THEME, parseTheme } from '@/lib/web-sites/theme';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';

/**
 * El renderizador es lo que ve el público: tiene que escapar todo texto y
 * negarse a pintar enlaces o imágenes peligrosos, sea cual sea el contenido
 * que llegue de la base de datos.
 */

const render = (blocks: WebSiteBlock[], mode: 'public' | 'preview' = 'public', theme = DEFAULT_THEME) =>
  renderToStaticMarkup(<SiteRenderer name="Mi <b>sitio</b>" logoUrl={null} theme={theme} blocks={blocks} slug="mi-sitio" mode={mode} />);

describe('SiteRenderer', () => {
  it.each(WEB_SITE_KINDS)('la plantilla %s se pinta completa, con menú y sin scripts', (kind) => {
    const html = render(starterBlocks(kind, { name: 'Taller Los Andes' }));
    expect(html).toContain('Taller Los Andes');
    expect(html).toContain('<h1');
    expect(html).toContain('Contacto');
    expect(html).not.toMatch(/<script/i);
  });

  it('escapa los textos: un título con HTML se ve como texto', () => {
    const hero = { ...createBlock('hero'), title: '<img src=x onerror=alert(1)>Hola', subtitle: '"><script>alert(1)</script>' } as WebSiteBlock;
    const html = render([hero]);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;Hola');
    // El nombre del sitio también sale escapado.
    expect(html).toContain('Mi &lt;b&gt;sitio&lt;/b&gt;');
  });

  it('no pinta enlaces peligrosos ni imágenes que no son https', () => {
    const blocks = [
      { ...createBlock('hero'), title: 'Hola', ctaLabel: 'Entrar', ctaHref: 'javascript:alert(1)', imageUrl: 'http://evil.cl/a.jpg' },
      { ...createBlock('cta'), title: 'CTA', buttonLabel: 'Ir', buttonHref: 'data:text/html,<script>1</script>' },
      { ...createBlock('image'), imageUrl: 'javascript:alert(1)', alt: 'x' },
      { ...createBlock('contact'), email: 'mal"><script>@x.cl', phone: 'javascript:1', showForm: false },
    ] as WebSiteBlock[];
    const html = render(blocks);
    expect(html).not.toMatch(/javascript:|data:text|http:\/\/evil|<script|<img/i);
    expect(html).not.toContain('Entrar');
  });

  it('los enlaces externos abren en pestaña nueva sin darle acceso a la ventana original', () => {
    const cta = { ...createBlock('cta'), title: 'CTA', buttonLabel: 'Ir', buttonHref: 'https://ejemplo.cl' } as WebSiteBlock;
    expect(render([cta])).toMatch(/href="https:\/\/ejemplo\.cl\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  });

  it('en la vista previa nada navega y el formulario no envía', () => {
    const blocks = starterBlocks('LANDING', { name: 'X' });
    const html = render(blocks, 'preview');
    expect(html).not.toMatch(/<a [^>]*href="#/);
    expect(html).toContain('Vista previa: el formulario funciona solo en el sitio publicado.');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('no publica secciones ocultas ni vacías', () => {
    const hidden = { ...createBlock('text'), heading: 'Secreto', body: 'no debe verse', hidden: true } as WebSiteBlock;
    const emptyGallery = { ...createBlock('gallery'), heading: 'Galería vacía' } as WebSiteBlock;
    const html = render([hidden, emptyGallery]);
    expect(html).not.toContain('Secreto');
    expect(html).not.toContain('no debe verse');
    expect(html).not.toMatch(/<li/);
  });

  it('el formulario incluye el señuelo anti-bots y etiquetas asociadas', () => {
    const html = render([{ ...createBlock('contact'), heading: 'Contacto', email: 'a@b.cl' } as WebSiteBlock]);
    expect(html).toContain('name="website"');
    expect(html).toMatch(/<label for="[^"]+-email"/);
    expect(html).toContain('href="mailto:a@b.cl"');
  });

  it('aplica el tema solo con valores validados', () => {
    const html = render([createBlock('text')], 'public', parseTheme({ primary: '#123456', accent: 'x;background:url(evil)' }));
    expect(html).toContain('--ws-primary:#123456');
    expect(html).not.toContain('evil');
  });
});

describe('WebSiteDocument', () => {
  const site: PublicWebSite = {
    id: 's1', companyId: 'c1', name: 'Sitio', slug: 'mi-sitio', mode: 'HTML', title: 'Mi sitio', description: 'Descripción', indexable: false, logoUrl: null, ogImageUrl: null,
    theme: DEFAULT_THEME, blocks: [], html: '<p>x</p>', acceptsMessages: false, customDomain: null, customDomainVerified: false, publishedAt: null,
  };

  it('el HTML propio va en un iframe sandbox sin scripts ni mismo origen', () => {
    const html = renderToStaticMarkup(<WebSiteDocument site={site} />);
    expect(html).toContain('src="/web/mi-sitio/raw"');
    const sandbox = /sandbox="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(sandbox).toBeTruthy();
    expect(sandbox).not.toMatch(/allow-scripts|allow-same-origin/);
  });

  it('un sitio no indexable pide noindex y el canónico es la dirección dada', () => {
    const meta = webSiteMetadata(site, 'https://minegocio.cl');
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates?.canonical).toBe('https://minegocio.cl');
    expect(webSiteMetadata({ ...site, indexable: true }, 'https://x.cl').robots).toEqual({ index: true, follow: true });
  });
});
