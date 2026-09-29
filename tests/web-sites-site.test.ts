import { blockImageUrls, blockLinks, BLOCK_TYPES, createBlock, isBlockEmpty, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { isValidPageSlug, pageSlugProblem, RESERVED_PAGE_SLUGS } from '@/lib/web-sites/page-slugs';
import { evaluateReadiness } from '@/lib/web-sites/readiness';
import { parseInline, parseRichText, richTextLinks, richTextPlain } from '@/lib/web-sites/rich-text';
import {
  addPage,
  autoMenuItems,
  documentFromBlocks,
  duplicatePage,
  findPageBySlug,
  homeOf,
  isValidSiteLink,
  movePage,
  normalizeSiteDocument,
  pageLink,
  parseSiteDocument,
  removePage,
  resolveLink,
  setHomePage,
  siteDocumentSchema,
  siteMenu,
  type SiteDocument,
} from '@/lib/web-sites/site';
import { starterDocument, WEB_SITE_KINDS } from '@/lib/web-sites/templates';
import { DEFAULT_THEME, FONT_PAIRINGS, parseTheme, THEME_PALETTES, themeProblems, themeVariables } from '@/lib/web-sites/theme';
import { mapEmbedUrl, socialHref, videoEmbed } from '@/lib/web-sites/urls';

/**
 * Sitios de varias páginas: el documento, los enlaces internos, el menú, el
 * texto con formato y la lista "qué le falta". Lo que más importa: que nada
 * de lo que escribe el usuario llegue a un `href` sin pasar por la barrera, y
 * que un sitio guardado en el formato antiguo se siga viendo igual.
 */

const hero = (title = 'Paneles solares para tu casa') => ({ ...createBlock('hero'), title }) as WebSiteBlock;
const contact = () => ({ ...createBlock('contact'), heading: 'Contacto', email: 'hola@solar.cl', showForm: false }) as WebSiteBlock;
const text = (heading: string, body = 'Texto propio del negocio.') => ({ ...createBlock('text'), heading, body }) as WebSiteBlock;

function twoPages(): SiteDocument {
  const doc = documentFromBlocks([hero(), contact()]);
  return addPage(doc, { title: 'Servicios', blocks: [text('Remodelaciones'), text('Gasfitería')] }).doc;
}

describe('documento del sitio', () => {
  it('un sitio antiguo (lista de secciones) se lee como una página, con su barra y pie', () => {
    const blocks = [hero(), contact()];
    const doc = parseSiteDocument(blocks, { showNav: false, footerText: '© Solar' });
    expect(doc.pages).toHaveLength(1);
    expect(homeOf(doc).blocks.map((block) => block.id)).toEqual(blocks.map((block) => block.id));
    expect(doc.header.enabled).toBe(false);
    expect(doc.footer.text).toBe('© Solar');
    // Leer dos veces da lo mismo (sirve para comparar borrador y publicado).
    expect(parseSiteDocument(blocks)).toEqual(parseSiteDocument(blocks));
  });

  it('repara lo dañado sin perder lo sano', () => {
    const doc = parseSiteDocument({
      pages: [
        { id: 'home', title: 'Inicio', slug: 'inicio', hidden: true, blocks: [hero(), { id: 'x', type: 'inexistente' }] },
        { id: 'a', title: 'Servicios', slug: 'servicios', blocks: [] },
        { id: 'a', title: 'Duplicada', slug: 'servicios', blocks: [] },
        { id: 'b', title: 'Login', slug: 'login', blocks: [] },
        'basura',
      ],
      header: { layout: 'inventado', tagline: 'Repostería en Ñuñoa', menu: [{ id: 'm1', label: 'Ok', href: '#x' }, { nope: true }] },
    });
    expect(doc.pages[0]).toMatchObject({ slug: '', hidden: false });
    expect(homeOf(doc).blocks).toHaveLength(1);
    const slugs = doc.pages.slice(1).map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every(isValidPageSlug)).toBe(true);
    expect(new Set(doc.pages.map((page) => page.id)).size).toBe(doc.pages.length);
    expect(doc.header.layout).toBe('classic');
    expect(doc.header.tagline).toBe('Repostería en Ñuñoa');
    expect(doc.header.menu.map((item) => item.label)).toEqual(['Ok']);
    expect(siteDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('nunca queda sin página de inicio', () => {
    expect(parseSiteDocument(null).pages).toHaveLength(1);
    expect(parseSiteDocument({ pages: [] }).pages).toHaveLength(1);
  });

  it('el esquema de guardado rechaza direcciones repetidas o reservadas y secciones repetidas entre páginas', () => {
    const doc = twoPages();
    const page = doc.pages[1]!;
    expect(siteDocumentSchema.safeParse({ ...doc, pages: [...doc.pages, { ...page, id: 'otra' }] }).success).toBe(false);
    expect(siteDocumentSchema.safeParse({ ...doc, pages: [doc.pages[0]!, { ...page, slug: 'dashboard' }] }).success).toBe(false);
    expect(siteDocumentSchema.safeParse({ ...doc, pages: [doc.pages[0]!, { ...page, blocks: [...page.blocks, doc.pages[0]!.blocks[0]!] }] }).success).toBe(false);
    expect(siteDocumentSchema.safeParse(doc).success).toBe(true);
    expect(normalizeSiteDocument(doc)).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it('las plantillas iniciales parten válidas', () => {
    for (const kind of WEB_SITE_KINDS) expect(siteDocumentSchema.safeParse(starterDocument(kind, { name: 'Taller' })).success).toBe(true);
  });
});

describe('operaciones sobre páginas', () => {
  it('agregar, duplicar, mover, convertir en inicio y eliminar', () => {
    let doc = twoPages();
    const services = doc.pages[1]!;
    expect(services.slug).toBe('servicios');

    const copy = duplicatePage(doc, services.id)!;
    doc = copy.doc;
    expect(copy.page.slug).not.toBe('servicios');
    expect(copy.page.blocks.map((block) => block.id)).not.toEqual(services.blocks.map((block) => block.id));

    doc = movePage(doc, copy.page.id, -1);
    expect(doc.pages[1]!.id).toBe(copy.page.id);
    // La de inicio no se mueve.
    expect(movePage(doc, doc.pages[0]!.id, 1)).toBe(doc);

    const promoted = setHomePage(doc, services.id);
    expect(promoted.pages[0]).toMatchObject({ id: services.id, slug: '' });
    expect(promoted.pages.slice(1).every((page) => isValidPageSlug(page.slug))).toBe(true);

    const withMenu: SiteDocument = { ...doc, header: { ...doc.header, menuMode: 'custom', menu: [{ id: 'm', label: 'Servicios', href: pageLink(services.id), newTab: false, children: [] }] } };
    const removed = removePage(withMenu, services.id);
    expect(removed.pages.some((page) => page.id === services.id)).toBe(false);
    expect(removed.header.menu).toHaveLength(0);
    // La de inicio no se elimina.
    expect(removePage(doc, doc.pages[0]!.id)).toBe(doc);
  });
});

describe('enlaces y menú', () => {
  const doc = twoPages();
  const services = doc.pages[1]!;
  const home = homeOf(doc);

  it('resuelve enlaces internos según dónde se publique', () => {
    expect(resolveLink(pageLink(services.id), { doc, pageId: home.id, basePath: '/web/solar' })).toMatchObject({ href: '/web/solar/servicios', external: false, pageId: services.id });
    expect(resolveLink(pageLink(services.id, 'gasfiteria'), { doc, pageId: home.id, basePath: '' })?.href).toBe('/servicios#gasfiteria');
    expect(resolveLink(pageLink(home.id), { doc, pageId: services.id, basePath: '' })?.href).toBe('/');
    expect(resolveLink(pageLink(services.id, 'gasfiteria'), { doc, pageId: services.id, basePath: '' })?.href).toBe('#gasfiteria');
    expect(resolveLink('https://ejemplo.cl', { doc, pageId: home.id, basePath: '' })).toMatchObject({ external: true });
  });

  it('nunca deja pasar esquemas peligrosos ni páginas borradas u ocultas', () => {
    const ctx = { doc, pageId: home.id, basePath: '/web/solar' };
    for (const bad of ['javascript:alert(1)', 'page:no-existe', 'page:../x', 'data:text/html,x', '//evil.cl']) expect(resolveLink(bad, ctx)).toBeNull();
    const hidden: SiteDocument = { ...doc, pages: doc.pages.map((page) => (page.id === services.id ? { ...page, hidden: true } : page)) };
    expect(resolveLink(pageLink(services.id), { ...ctx, doc: hidden })).toBeNull();
    expect(isValidSiteLink(pageLink(services.id), hidden)).toBe(false);
    expect(findPageBySlug(hidden, 'servicios')).toBeNull();
  });

  it('menú automático: páginas si hay varias, secciones si hay una sola', () => {
    expect(siteMenu(doc, home.id).map((item) => item.label)).toEqual(['Inicio', 'Servicios']);
    const single = documentFromBlocks([hero(), text('Quiénes somos'), contact()]);
    expect(siteMenu(single, homeOf(single).id).map((item) => item.href)).toEqual(['#quienes-somos', '#contacto']);
    expect(autoMenuItems(doc).map((item) => item.label)).toEqual(['Inicio', 'Servicios']);
  });

  it('menú propio con submenú y pestaña nueva', () => {
    const custom: SiteDocument = {
      ...doc,
      header: {
        ...doc.header,
        menuMode: 'custom',
        menu: [
          { id: 'a', label: 'Servicios', href: '', newTab: false, children: [{ id: 'b', label: 'Gasfitería', href: pageLink(services.id, 'gasfiteria'), newTab: false }, { id: 'c', label: 'Blog', href: 'https://blog.cl', newTab: true }] },
          { id: 'd', label: '', href: '#x', newTab: false, children: [] },
        ],
      },
    };
    const menu = siteMenu(custom, home.id);
    expect(menu).toHaveLength(1);
    expect(menu[0]!.children.map((child) => [child.label, child.newTab])).toEqual([
      ['Gasfitería', false],
      ['Blog', true],
    ]);
  });
});

describe('secciones nuevas', () => {
  it('cada tipo se crea, reconoce sus imágenes y enlaces', () => {
    for (const type of BLOCK_TYPES) {
      const block = createBlock(type);
      expect(Array.isArray(blockImageUrls(block))).toBe(true);
      expect(Array.isArray(blockLinks(block))).toBe(true);
      expect(typeof isBlockEmpty(block)).toBe('boolean');
    }
    const withBackground = { ...text('A'), style: { ...createBlock('text').style, background: 'image', backgroundImage: 'https://blob.test/a.png' } } as WebSiteBlock;
    expect(blockImageUrls(withBackground)).toContain('https://blob.test/a.png');
    const rich = text('A', 'Mira [esto](javascript:void) y [aquello](#contacto)');
    expect(blockLinks(rich).map((link) => link.href)).toEqual(['javascript:void', '#contacto']);
  });

  it('una elección desconocida cae a su valor de fábrica en vez de borrar la sección', () => {
    const doc = parseSiteDocument([{ ...hero(), variant: 'inventada', style: { background: 'rojo' } }]);
    expect(homeOf(doc).blocks[0]).toMatchObject({ variant: 'center', style: { background: 'default' } });
  });
});

describe('texto con formato', () => {
  it('negrita, cursiva, enlaces, listas y subtítulos', () => {
    const blocks = parseRichText('## Horario\nAbrimos **todos** los días, *incluso* feriados.\n\n- Uno\n- Dos\n\n1. Primero\n2. Segundo\nVer [la carta](#carta).');
    expect(blocks.map((block) => block.kind)).toEqual(['h3', 'p', 'ul', 'ol', 'p']);
    expect(richTextLinks('Ver [la carta](#carta) y [web](https://a.cl)')).toEqual(['#carta', 'https://a.cl']);
    expect(richTextPlain('**Hola** [mundo](https://a.cl)')).toBe('Hola mundo');
  });

  it('un asterisco suelto o una cuenta no se vuelven cursiva, y el anidamiento está acotado', () => {
    expect(parseInline('5 * 3 * 2')).toEqual([{ kind: 'text', text: '5 * 3 * 2' }]);
    const deep = '**'.repeat(50) + 'x' + '**'.repeat(50);
    expect(() => parseInline(deep)).not.toThrow();
  });
});

describe('video, mapa y redes', () => {
  it('solo YouTube y Vimeo, siempre por su dirección de inserción', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbed('youtu.be/dQw4w9WgXcQ')?.provider).toBe('youtube');
    expect(videoEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')?.provider).toBe('youtube');
    expect(videoEmbed('https://vimeo.com/123456789')?.embedUrl).toBe('https://player.vimeo.com/video/123456789');
    for (const bad of ['https://evil.cl/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com/watch?v=<script>', 'https://youtube.com.evil.cl/embed/dQw4w9WgXcQ']) expect(videoEmbed(bad)).toBeNull();
    expect(mapEmbedUrl('Av. Providencia 1234, Santiago')).toContain('output=embed');
    expect(mapEmbedUrl('')).toBeNull();
  });

  it('redes: acepta @usuario o la dirección de esa red, nunca otra página', () => {
    expect(socialHref('instagram', '@mi.negocio')).toBe('https://www.instagram.com/mi.negocio');
    expect(socialHref('tiktok', 'minegocio')).toBe('https://www.tiktok.com/@minegocio');
    expect(socialHref('facebook', 'https://www.facebook.com/minegocio')).toBe('https://www.facebook.com/minegocio');
    expect(socialHref('instagram', 'https://evil.cl/minegocio')).toBeNull();
    expect(socialHref('instagram', 'javascript:alert(1)')).toBeNull();
    expect(socialHref('instagram', 'instagram.com/minegocio')).toBe('https://instagram.com/minegocio');
  });
});

describe('direcciones de página', () => {
  it('forma y palabras reservadas', () => {
    expect(isValidPageSlug('servicios')).toBe(true);
    for (const reserved of ['login', 'dashboard', 'raw', 'pagar', 'register']) expect(RESERVED_PAGE_SLUGS.has(reserved)).toBe(true);
    expect(pageSlugProblem('Servicios')).toMatch(/minúsculas/);
    expect(pageSlugProblem('login')).toMatch(/reservada/);
  });
});

describe('tema', () => {
  it('todas las paletas listas son legibles y las combinaciones usan fuentes válidas', () => {
    for (const palette of THEME_PALETTES) expect(themeProblems(parseTheme({ ...DEFAULT_THEME, ...palette.colors }))).toEqual([]);
    for (const pairing of FONT_PAIRINGS) expect(parseTheme({ font: pairing.font, headingFont: pairing.headingFont })).toMatchObject({ font: pairing.font, headingFont: pairing.headingFont });
  });

  it('las variables nuevas salen solo de listas cerradas', () => {
    const vars = themeVariables(parseTheme({ font: 'comic', headingFont: 'x;}', buttonStyle: 'pill', headingCase: 'uppercase', width: 'wide' }));
    for (const value of Object.values(vars)) expect(value).not.toMatch(/[;{}]/);
    expect(vars['--ws-button-radius']).toBe('999px');
    expect(vars['--ws-heading-case']).toBe('uppercase');
  });
});

describe('lista "qué le falta" en sitios de varias páginas', () => {
  const base = { kind: 'CORPORATE' as const, mode: 'GUIDED' as const, seoTitle: 'Solar Sur: paneles para tu hogar', seoDescription: 'x'.repeat(80), logoUrl: 'https://blob.test/logo.png', theme: {} };

  it('revisa enlaces del menú y del pie, y la página de inicio debe tener portada', () => {
    const doc = twoPages();
    expect(evaluateReadiness({ ...base, document: doc }).canPublish).toBe(true);

    const badMenu: SiteDocument = { ...doc, header: { ...doc.header, menuMode: 'custom', menu: [{ id: 'm', label: 'Malo', href: 'javascript:alert(1)', newTab: false, children: [] }] } };
    const report = evaluateReadiness({ ...base, document: badMenu });
    expect(report.items.find((item) => item.id === 'links')).toMatchObject({ ok: false });
    expect(report.canPublish).toBe(false);

    const noHero: SiteDocument = { ...doc, pages: [{ ...doc.pages[0]!, blocks: [contact()] }, doc.pages[1]!] };
    expect(evaluateReadiness({ ...base, document: noHero }).items.find((item) => item.id === 'hero')?.ok).toBe(false);
  });

  it('avisa páginas vacías, encabezado apagado con varias páginas y videos que no son de YouTube/Vimeo', () => {
    let doc = addPage(twoPages(), { title: 'Vacía' }).doc;
    doc = { ...doc, header: { ...doc.header, enabled: false } };
    doc = { ...doc, pages: doc.pages.map((page, index) => (index === 1 ? { ...page, blocks: [...page.blocks, { ...createBlock('video'), url: 'https://evil.cl/video' } as WebSiteBlock] } : page)) };
    const report = evaluateReadiness({ ...base, document: doc });
    expect(report.items.find((item) => item.id === 'pages')?.ok).toBe(false);
    expect(report.items.find((item) => item.id === 'navigation')?.ok).toBe(false);
    expect(report.items.find((item) => item.id === 'media')?.ok).toBe(false);
    // Son recomendaciones: no bloquean.
    expect(report.canPublish).toBe(true);
  });

  it('el botón flotante de WhatsApp cuenta como forma de contacto; un catálogo sin número se avisa', () => {
    const doc = documentFromBlocks([hero()]);
    expect(evaluateReadiness({ ...base, document: doc }).items.find((item) => item.id === 'contact')?.ok).toBe(false);
    const withWhatsapp: SiteDocument = { ...doc, whatsapp: { enabled: true, number: '+56 9 1234 5678', message: '', label: '' } };
    expect(evaluateReadiness({ ...base, document: withWhatsapp }).items.find((item) => item.id === 'contact')?.ok).toBe(true);

    const catalog = { ...createBlock('catalog'), heading: 'Productos', items: [{ imageUrl: '', title: 'Mesa de roble', price: '$120.000', description: '', details: '', code: 'M1', badge: '' }] } as WebSiteBlock;
    const withCatalog = documentFromBlocks([hero(), contact(), catalog]);
    expect(evaluateReadiness({ ...base, document: withCatalog }).items.find((item) => item.id === 'media')?.ok).toBe(false);
  });
});
