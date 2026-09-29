import { renderToStaticMarkup } from 'react-dom/server';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { findPublicPage, jsonLdString, localBusinessJsonLd, WebSiteDocument, webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { BLOCK_TYPES, createBlock, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { parseSiteDocument, type SiteDocument } from '@/lib/web-sites/site';
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
    // Solo el contenido de la página: el encabezado y el pie usan listas para el menú.
    const main = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
    expect(main).not.toMatch(/<li/);
    expect(main).not.toContain('Galería vacía');
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
    theme: DEFAULT_THEME, document: parseSiteDocument([]), blocks: [], html: '<p>x</p>', acceptsMessages: false, customDomain: null, customDomainVerified: false, publishedAt: null,
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

// ---------------------------------------------------------------------------
// Sitio de varias páginas
// ---------------------------------------------------------------------------

function block(type: (typeof BLOCK_TYPES)[number], patch: Record<string, unknown> = {}): WebSiteBlock {
  return { ...createBlock(type), ...patch } as WebSiteBlock;
}

function site(over: Record<string, unknown> = {}): SiteDocument {
  return parseSiteDocument({
    pages: [
      { id: 'home', title: 'Inicio', blocks: [block('hero', { title: 'Bienvenidos', ctaLabel: 'Ver servicios', ctaHref: 'page:p-serv' }), block('text', { heading: 'Nosotros', body: 'Somos un taller.' })] },
      { id: 'p-serv', title: 'Servicios', slug: 'servicios', blocks: [block('text', { heading: 'Lo que hacemos', body: 'Reparamos todo.' })] },
      { id: 'p-hid', title: 'Secreta', slug: 'secreta', hidden: true, blocks: [block('text', { heading: 'Oculta', body: 'no publicar' })] },
    ],
    ...over,
  });
}

const renderDoc = (document: SiteDocument, props: Partial<Parameters<typeof SiteRenderer>[0]> = {}) =>
  renderToStaticMarkup(<SiteRenderer name="Taller <Sur>" logoUrl={null} theme={DEFAULT_THEME} document={document} slug="mi-sitio" mode="public" {...props} />);

describe('SiteRenderer multipágina', () => {
  it('el menú automático lista las páginas publicadas con su dirección y no enlaza la oculta', () => {
    const html = renderDoc(site());
    expect(html).toContain('href="/web/mi-sitio/servicios"');
    expect(html).toContain('href="/web/mi-sitio"');
    expect(html).not.toContain('Secreta');
    expect(html).not.toContain('/web/mi-sitio/secreta');
  });

  it('en un dominio propio (basePath vacío) los enlaces salen sin el prefijo de la plataforma', () => {
    const html = renderDoc(site(), { basePath: '' });
    expect(html).toContain('href="/servicios"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('/web/mi-sitio');
  });

  it('un botón con enlace page: se resuelve a la página; a una borrada u oculta no se pinta', () => {
    const doc = site();
    expect(renderDoc(doc)).toMatch(/href="\/web\/mi-sitio\/servicios"[^>]*>Ver servicios/);
    const broken = { ...doc, pages: doc.pages.map((page) => (page.id === 'home' ? { ...page, blocks: [block('hero', { title: 'Hola', ctaLabel: 'Fantasma', ctaHref: 'page:p-hid' })] } : page)) };
    expect(renderDoc(broken)).not.toContain('Fantasma');
  });

  it('marca la página actual con aria-current="page"', () => {
    const html = renderDoc(site(), { pageId: 'p-serv' });
    expect(html).toMatch(/<a href="\/web\/mi-sitio\/servicios"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/<a href="\/web\/mi-sitio"[^>]*aria-current/);
    expect(html).toContain('Lo que hacemos');
    expect(html).not.toContain('Bienvenidos');
  });

  it('menú propio: submenú, pestaña nueva con rel seguro y aviso para lectores de pantalla', () => {
    const doc = site({
      header: {
        menuMode: 'custom',
        menu: [
          { id: 'm1', label: 'Qué hacemos', href: '', children: [{ id: 'c1', label: 'Reparaciones', href: 'page:p-serv' }] },
          { id: 'm2', label: 'Blog', href: 'https://blog.cl', newTab: true },
          { id: 'm3', label: 'Inicio interno', href: 'page:home', newTab: true },
        ],
      },
    });
    const html = renderDoc(doc);
    expect(html).toContain('Qué hacemos');
    expect(html).toMatch(/<a href="\/web\/mi-sitio\/servicios"[^>]*>Reparaciones/);
    expect(html).toMatch(/<a href="https:\/\/blog\.cl\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Blog<span class="sr-only"> \(se abre en otra pestaña\)/);
    expect(html).toMatch(/<a href="\/web\/mi-sitio"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Inicio interno/);
  });

  it('muestra la barra de anuncio, el lema, el botón destacado y las redes', () => {
    const doc = site({
      header: { tagline: 'Mecánica desde 1998', ctaLabel: 'Cotizar', ctaHref: 'https://wa.me/56912345678', announcement: { enabled: true, text: 'Abrimos los sábados', href: 'page:p-serv', linkLabel: 'Ver horarios', style: 'dark' }, showSocial: true },
      social: { instagram: '@tallersur' },
    });
    const html = renderDoc(doc);
    expect(html).toContain('Abrimos los sábados');
    expect(html).toContain('Ver horarios');
    expect(html).toContain('Mecánica desde 1998');
    expect(html).toMatch(/href="https:\/\/wa\.me\/56912345678"[^>]*>Cotizar/);
    expect(html).toContain('href="https://www.instagram.com/tallersur"');
  });

  it('escapa los textos del encabezado, el menú y el pie', () => {
    const doc = site({
      header: { tagline: '<i>lema</i>', menuMode: 'custom', menu: [{ id: 'm1', label: '<script>x</script>', href: 'page:p-serv' }] },
      footer: { layout: 'columns', about: '<b>acerca</b>', text: '<u>leyenda</u>', columns: [{ id: 'f1', title: '<em>col</em>', links: [{ id: 'l1', label: '<b>enlace</b>', href: 'https://ok.cl' }] }] },
    });
    const html = renderDoc(doc);
    for (const raw of ['<script>x', '<i>lema', '<b>acerca', '<u>leyenda', '<em>col', '<b>enlace']) expect(html).not.toContain(raw);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('Taller &lt;Sur&gt;');
  });

  it('nunca pinta javascript: en el menú, el pie, el anuncio, el botón ni el texto con formato', () => {
    const doc = site({
      header: {
        ctaLabel: 'Malo',
        ctaHref: 'javascript:alert(1)',
        menuMode: 'custom',
        menu: [{ id: 'm1', label: 'Peligro', href: 'javascript:alert(2)' }, { id: 'm2', label: 'Padre', href: '', children: [{ id: 'c1', label: 'Hijo', href: 'data:text/html,x' }] }],
        announcement: { enabled: true, text: 'Anuncio', href: 'javascript:alert(3)', linkLabel: 'Pincha' },
      },
      footer: { layout: 'columns', columns: [{ id: 'f1', title: 'Col', links: [{ id: 'l1', label: 'Pie malo', href: 'javascript:alert(4)' }] }] },
    });
    doc.pages[0]!.blocks.push(block('text', { heading: 'Formato', body: 'Mira [este enlace](javascript:alert(5)) y [otro](https://ok.cl).' }));
    const html = renderDoc(doc);
    expect(html).not.toMatch(/javascript:|data:text/i);
    for (const label of ['Malo', 'Peligro', 'Hijo', 'Pincha', 'Pie malo']) expect(html).not.toContain(`>${label}<`);
    expect(html).toContain('este enlace');
    expect(html).toMatch(/href="https:\/\/ok\.cl\/"[^>]*>otro/);
  });

  it('el pie en columnas muestra el menú, las redes y la leyenda', () => {
    const doc = site({ footer: { layout: 'columns', style: 'dark', about: 'Taller de confianza', showSocial: true, showMenu: true }, social: { facebook: 'tallersur' } });
    const html = renderDoc(doc);
    expect(html).toContain('Taller de confianza');
    expect(html).toContain('href="https://www.facebook.com/tallersur"');
    expect(html).toMatch(new RegExp(`© ${new Date().getFullYear()} Taller &lt;Sur&gt;`));
  });

  it('el encabezado transparente solo va superpuesto si la primera sección es una portada', () => {
    const withHero = renderDoc(site({ header: { style: 'transparent' } }));
    expect(withHero).toMatch(/<section[^>]*ws-under-header/);
    expect(withHero).toMatch(/<header[^>]*absolute/);
    const doc = site({ header: { style: 'transparent' } });
    const withoutHero = renderDoc(doc, { pageId: 'p-serv' });
    expect(withoutHero).not.toMatch(/<section[^>]*ws-under-header/);
    expect(withoutHero).toMatch(/<header[^>]*sticky/);
  });

  it('el botón flotante de WhatsApp usa el número y el mensaje configurados', () => {
    const html = renderDoc(site({ whatsapp: { enabled: true, number: '+56 9 1234 5678', message: 'Hola, necesito una cotización', label: 'Escríbenos' } }));
    expect(html).toContain('href="https://wa.me/56912345678?text=Hola%2C%20necesito%20una%20cotizaci%C3%B3n"');
    expect(html).toContain('Escríbenos');
    expect(renderDoc(site({ whatsapp: { enabled: true, number: 'abc' } }))).not.toContain('wa.me');
    expect(renderDoc(site())).not.toContain('wa.me');
  });

  it('la barra de acciones del celular tiene Llamar, WhatsApp y Cómo llegar, y esconde el botón flotante en el celular', () => {
    const doc = site({ actionBar: { enabled: true, phone: '+56 9 8765 4321', address: 'Av. Alemania 123, Temuco' }, whatsapp: { enabled: true, number: '+56912345678' } });
    const html = renderDoc(doc);
    expect(html).toContain('href="tel:+56987654321"');
    expect(html).toContain('href="https://wa.me/56912345678"');
    expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=Av.%20Alemania%20123%2C%20Temuco');
    for (const label of ['Llamar', 'WhatsApp', 'Cómo llegar']) expect(html).toContain(label);
    // Con la barra activa, el flotante queda solo para pantallas anchas.
    expect(html).toContain('hidden @2xl:block');
    // Sin datos, cada acción desaparece; sin ninguna, no hay barra.
    const onlyPhone = renderDoc(site({ actionBar: { enabled: true, phone: '+56 9 8765 4321' } }));
    expect(onlyPhone).toContain('Llamar');
    expect(onlyPhone).not.toContain('Cómo llegar');
    expect(renderDoc(site({ actionBar: { enabled: true } }))).not.toContain('Acciones rápidas');
    expect(renderDoc(site({ actionBar: { enabled: false, phone: '+56 9 8765 4321' } }))).not.toContain('Llamar');
  });

  it('en la vista previa las secciones llevan id con prefijo wsp-, data-block-id y la etiqueta para editar', () => {
    const doc = site();
    const text = doc.pages[0]!.blocks[1]!;
    const selected: string[] = [];
    const html = renderDoc(doc, { mode: 'preview', onSelectBlock: (id) => selected.push(id), selectedBlockId: text.id });
    expect(html).toContain('id="wsp-nosotros"');
    expect(html).toContain(`data-block-id="${text.id}"`);
    expect(html).toContain('Editar «Texto»');
    expect(html).toContain('Editar «Portada»');
    // Sin onSelectBlock no hay etiquetas de edición.
    expect(renderDoc(doc, { mode: 'preview' })).not.toContain('Editar «');
    // Público: sin prefijo.
    expect(renderDoc(doc)).toContain('id="nosotros"');
  });

  it('en la vista previa una sección vacía sale como marcador para poder elegirla', () => {
    const html = renderDoc(parseSiteDocument([createBlock('gallery')]), { mode: 'preview' });
    expect(html).toContain('Esta sección está vacía');
    expect(renderDoc(parseSiteDocument([createBlock('gallery')]))).not.toContain('Esta sección está vacía');
  });

  it('un sitio antiguo (solo secciones) se pinta con el mismo renderizador', () => {
    const html = renderToStaticMarkup(<SiteRenderer name="Viejo" logoUrl={null} theme={DEFAULT_THEME} blocks={[block('text', { heading: 'Hola', body: 'Texto' })]} slug="viejo" mode="public" />);
    expect(html).toContain('Hola');
  });
});

describe('secciones', () => {
  it('pinta sin lanzar los 23 tipos de sección, vacíos y en ambos modos', () => {
    expect(BLOCK_TYPES.length).toBeGreaterThanOrEqual(23);
    for (const type of BLOCK_TYPES) {
      const blocks = [createBlock(type)];
      expect(() => render(blocks, 'public')).not.toThrow();
      expect(() => render(blocks, 'preview')).not.toThrow();
    }
  });

  it('pinta con contenido los tipos de sección nuevos y las variantes', () => {
    const blocks = [
      block('hero', { title: 'Portada', eyebrow: 'Nuevo', variant: 'split', imageUrl: 'https://cdn.test/a.jpg', ctaLabel: 'Uno', ctaHref: 'https://a.cl', secondaryLabel: 'Dos', secondaryHref: 'https://b.cl' }),
      block('stats', { items: [{ value: '+500', label: 'Clientes' }] }),
      block('steps', { items: [{ title: 'Paso uno', text: 'Contacto' }, { title: 'Paso dos', text: 'Entrega' }] }),
      block('pricing', { items: [{ name: 'Básico', price: '$9.990', period: '/mes', features: '- Uno\nDos', buttonLabel: 'Elegir', buttonHref: 'https://a.cl' }, { name: 'Pro', price: '$19.990', highlighted: true, badge: 'Recomendado' }] }),
      block('team', { items: [{ name: 'Ana Pérez', role: 'Gerente' }] }),
      block('testimonials', { variant: 'cards', items: [{ quote: 'Excelente', author: 'Luis', rating: 5 }] }),
      block('quote', { quote: 'Frase grande', author: 'Ana' }),
      block('logos', { items: [{ imageUrl: 'https://cdn.test/l.png', alt: 'Marca' }] }),
      block('gallery', { variant: 'masonry', images: [{ url: 'https://cdn.test/g.jpg', alt: 'Foto', caption: 'Pie' }] }),
      block('features', { variant: 'list', items: [{ title: 'Rápido', text: 'y seguro' }] }),
      block('divider', { variant: 'dots' }),
    ];
    const html = render(blocks);
    for (const text of ['Nuevo', 'Portada', '+500', 'Paso uno', 'Recomendado', '$19.990', 'Ana Pérez', 'Excelente', 'Frase grande', 'alt="Marca"', 'Pie', 'Rápido']) expect(html).toContain(text);
    expect(html).toContain('aria-label="5 de 5"');
    expect(html).toMatch(/<h1[^>]*>Portada/);
    expect(html).not.toMatch(/<script/i);
  });

  it('la lista de precios agrupa por categoría, con etiqueta, precio y nota', () => {
    const html = render([
      block('pricelist', {
        heading: 'Carta',
        note: 'Precios con IVA',
        categories: [
          { title: 'Entradas', items: [{ name: 'Empanada', price: '$2.500', description: 'De pino', tag: 'Nuevo' }, { name: '', price: '$1' }] },
          { title: 'Vacía', items: [{ name: '' }] },
        ],
      }),
    ]);
    expect(html).toContain('Entradas');
    expect(html).toContain('Empanada');
    expect(html).toContain('$2.500');
    expect(html).toContain('De pino');
    expect(html).toContain('Nuevo');
    expect(html).toContain('Precios con IVA');
    expect(html).not.toContain('Vacía');
  });

  it('el catálogo arma el mensaje de WhatsApp con el nombre y el código, usa el número del sitio y oculta el botón sin número', () => {
    const catalog = block('catalog', { heading: 'Productos', items: [{ title: 'Silla', code: 'S-01', price: '$30.000', badge: 'Oferta', details: '4 patas' }], buttonLabel: '' });
    const doc = parseSiteDocument({ pages: [{ id: 'home', title: 'Inicio', blocks: [catalog] }], whatsapp: { number: '+56 9 1111 2222' } });
    const html = renderDoc(doc);
    expect(html).toContain('Pedir por WhatsApp');
    expect(html).toContain(`href="https://wa.me/56911112222?text=${encodeURIComponent('Hola, me interesa: Silla (código S-01)')}"`);
    for (const text of ['Silla', '$30.000', 'Oferta', '4 patas']) expect(html).toContain(text);
    // El número propio de la sección gana al del sitio.
    const own = renderDoc(parseSiteDocument({ pages: [{ id: 'home', title: 'Inicio', blocks: [{ ...catalog, whatsapp: '+56 9 3333 4444' }] }], whatsapp: { number: '+56 9 1111 2222' } }));
    expect(own).toContain('wa.me/56933334444');
    // Sin número válido, no hay botón.
    const none = renderDoc(parseSiteDocument({ pages: [{ id: 'home', title: 'Inicio', blocks: [catalog] }] }));
    expect(none).not.toContain('wa.me');
    expect(none).not.toContain('Pedir por WhatsApp');
    // En la vista previa el botón no navega.
    expect(renderDoc(doc, { mode: 'preview' })).not.toContain('href="https://wa.me');
  });

  it('el horario agrupa las filas seguidas con el mismo día', () => {
    const html = render([
      block('schedule', {
        heading: 'Clases',
        rows: [
          { day: 'Lunes', time: '18:00', title: 'Yoga', detail: 'Sala 1' },
          { day: 'lunes', time: '19:30', title: 'Pilates' },
          { day: 'Martes', time: '10:00', title: 'Zumba' },
        ],
      }),
    ]);
    expect(html.match(/>Lunes</g)).toHaveLength(1);
    expect(html.match(/>Martes</g)).toHaveLength(1);
    for (const text of ['Yoga', 'Sala 1', 'Pilates', 'Zumba', '19:30']) expect(html).toContain(text);
  });

  it('el video solo se incrusta con un enlace de YouTube o Vimeo, sin cookies, en iframe aislado', () => {
    const youtube = render([block('video', { heading: 'Nuestro taller', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })]);
    expect(youtube).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(youtube).toContain('title="Nuestro taller"');
    expect(youtube).toContain('loading="lazy"');
    expect(youtube).toMatch(/<iframe[^>]*referrerPolicy="strict-origin-when-cross-origin"/i);
    expect(youtube).toContain('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"');
    expect(render([block('video', { url: 'https://vimeo.com/123456789' })])).toContain('src="https://player.vimeo.com/video/123456789"');
    for (const url of ['https://evil.com/video', 'javascript:alert(1)', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v="><script>']) {
      expect(render([block('video', { url })])).not.toMatch(/<iframe/);
    }
  });

  it('el mapa incrusta Google Maps y ofrece abrirlo en la app', () => {
    const html = render([block('map', { heading: 'Dónde estamos', address: 'Av. Alemania 123, Temuco' })]);
    expect(html).toContain('src="https://www.google.com/maps?q=Av.%20Alemania%20123%2C%20Temuco&amp;output=embed"');
    expect(html).toContain('Abrir en Google Maps');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"');
  });

  it('la cuenta regresiva muestra la fecha en es-CL y hora de Chile', () => {
    const html = render([block('countdown', { heading: 'Falta poco', target: '2030-01-15T20:00:00-03:00', endedText: 'Terminó' })]);
    expect(html).toContain('Falta poco');
    expect(html).toContain('enero de 2030');
    expect(html).toContain('20:00');
    expect(html).toContain('hora de Chile');
    expect(html).toContain('aria-live="off"');
    expect(render([block('countdown', { heading: 'Sin fecha', target: 'no es fecha' })])).not.toContain('aria-live');
  });

  it('el contacto muestra horario, mapa opcional y el aviso de privacidad del formulario', () => {
    const html = render([block('contact', { heading: 'Contacto', hours: 'Lun a Vie 9:00 a 18:00', address: 'Calle 1, Temuco', showMap: true, phone: '+56 9 1234 5678' })]);
    expect(html).toContain('Lun a Vie 9:00 a 18:00');
    expect(html).toContain('www.google.com/maps?q=');
    expect(html).toContain('href="tel:+56912345678"');
    expect(html).toContain('Usaremos tus datos solo para responderte.');
    expect(render([block('contact', { address: 'Calle 1', showMap: false })])).not.toContain('<iframe');
  });

  it('el texto con formato pinta negritas, listas y enlaces válidos como elementos', () => {
    const html = render([block('text', { heading: 'Info', body: 'Hola **mundo** y *tú*.\n\n- uno\n- dos\n\n## Subtítulo' })]);
    expect(html).toContain('<strong class="font-bold">mundo</strong>');
    expect(html).toContain('<em>tú</em>');
    expect(html).toMatch(/<ul[^>]*><li>uno<\/li><li>dos<\/li><\/ul>/);
    expect(html).toMatch(/<h3[^>]*>Subtítulo/);
  });

  it('el CSS del sitio es constante: animaciones solo dentro de @supports y sin movimiento reducido', () => {
    const html = renderDoc(site(), { theme: { ...DEFAULT_THEME, animation: 'rise' } });
    expect(html).toContain('data-anim="rise"');
    expect(html).toMatch(/@media \(prefers-reduced-motion:no-preference\)\{\s*@supports \(animation-timeline:view\(\)\)/);
    expect(renderDoc(site(), { theme: { ...DEFAULT_THEME, animation: 'rise' }, mode: 'preview' })).toContain('data-anim="none"');
  });
});

describe('datos estructurados y metadatos por página', () => {
  const doc = parseSiteDocument({
    pages: [
      { id: 'home', title: 'Inicio', blocks: [block('contact', { email: 'hola@taller.cl', phone: '+56 9 1234 5678', address: 'Av. Alemania 123' })] },
      { id: 'p1', title: 'Servicios', slug: 'servicios', seoTitle: '', seoDescription: 'Todo lo que hacemos', blocks: [] },
      { id: 'p2', title: 'Equipo', slug: 'equipo', seoTitle: 'Conoce al equipo', blocks: [] },
      { id: 'p3', title: 'Oculta', slug: 'oculta', hidden: true, blocks: [] },
    ],
  });
  const base: PublicWebSite = {
    id: 's1', companyId: 'c1', name: 'Taller Sur', slug: 'taller-sur', mode: 'GUIDED', title: 'Taller Sur · Mecánica', description: 'Descripción general', indexable: true, logoUrl: 'https://cdn.test/logo.png',
    ogImageUrl: null, theme: DEFAULT_THEME, document: doc, blocks: [], html: '', acceptsMessages: true, customDomain: null, customDomainVerified: false, publishedAt: null,
  };

  it('título y descripción por página', () => {
    expect(webSiteMetadata(base, 'https://x.cl', findPublicPage(base))).toMatchObject({ title: 'Taller Sur · Mecánica', description: 'Descripción general' });
    expect(webSiteMetadata(base, 'https://x.cl/servicios', findPublicPage(base, 'servicios'))).toMatchObject({ title: 'Servicios · Taller Sur · Mecánica', description: 'Todo lo que hacemos' });
    const equipo = webSiteMetadata(base, 'https://x.cl/equipo', findPublicPage(base, 'equipo'));
    expect(equipo).toMatchObject({ title: 'Conoce al equipo', description: 'Descripción general' });
    expect(equipo.alternates?.canonical).toBe('https://x.cl/equipo');
    expect(findPublicPage(base, 'oculta')).toBeNull();
    expect(findPublicPage(base, 'no-existe')).toBeNull();
    expect(findPublicPage(base)?.id).toBe('home');
  });

  it('emite LocalBusiness solo con lo publicado y escapa "<" para no cerrar la etiqueta', () => {
    const html = renderToStaticMarkup(<WebSiteDocument site={base} siteUrl="https://taller-sur.cl" />);
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Taller Sur',
      url: 'https://taller-sur.cl',
      logo: 'https://cdn.test/logo.png',
      telephone: '+56 9 1234 5678',
      email: 'hola@taller.cl',
      address: { '@type': 'PostalAddress', streetAddress: 'Av. Alemania 123' },
    });

    const hostile = { ...base, name: 'Taller </script><script>alert(1)</script>' };
    const escaped = renderToStaticMarkup(<WebSiteDocument site={hostile} />);
    expect(escaped).not.toContain('</script><script>alert');
    expect(escaped).toContain('\\u003c/script>');
    expect(jsonLdString({ a: '<b>' })).toBe('{"a":"\\u003cb>"}');
  });

  it('no emite datos si no hay contacto publicado (bloque oculto, sin datos o HTML propio)', () => {
    const hidden = parseSiteDocument([block('contact', { email: 'x@y.cl', hidden: true })]);
    expect(localBusinessJsonLd({ ...base, document: hidden })).toBeNull();
    expect(localBusinessJsonLd({ ...base, document: parseSiteDocument([block('contact')]) })).toBeNull();
    expect(localBusinessJsonLd({ ...base, mode: 'HTML' })).toBeNull();
    expect(renderToStaticMarkup(<WebSiteDocument site={{ ...base, document: hidden }} />)).not.toContain('ld+json');
  });

  it('WebSiteDocument pinta la página pedida con las direcciones del dominio propio', () => {
    const html = renderToStaticMarkup(<WebSiteDocument site={base} pageSlug="servicios" basePath="" />);
    expect(html).toContain('href="/equipo"');
    expect(html).not.toContain('/web/taller-sur');
  });
});
