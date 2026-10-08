import { renderToStaticMarkup } from 'react-dom/server';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import { BLOCK_INFO, BLOCK_TYPES, blockImageUrls, blockLinks, blockSchema, comparisonMark, createBlock, isBlockEmpty, parseBlocks, type HoursDay, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { dayHoursText, groupWeek, hoursStatus } from '@/lib/web-sites/hours';
import { industryDocument, INDUSTRY_TEMPLATES } from '@/lib/web-sites/industries';
import { PAGE_TEMPLATES } from '@/lib/web-sites/page-templates';
import { evaluateReadiness } from '@/lib/web-sites/readiness';
import { SAMPLE_PLACEHOLDERS, SAMPLE_WEEK, sampleBlock, SECTION_SAMPLES } from '@/lib/web-sites/section-samples';
import { documentFromBlocks, parseSiteDocument, type SiteDocument } from '@/lib/web-sites/site';
import { isSampleText } from '@/lib/web-sites/templates';
import { activeKit, DEFAULT_THEME, FONT_OPTIONS, FONT_STACKS, kitTheme, parseTheme, THEME_KITS, THEME_PALETTES, themeProblems, themeVariables } from '@/lib/web-sites/theme';
import { EMBED_ORIGINS, embedFrom } from '@/lib/web-sites/urls';
import { BLOCK_LAYOUTS, layoutsOf, totalLayouts, VARIANT_VALUES, withVariant } from '@/lib/web-sites/variants';

/**
 * El constructor ofrece muchos diseños por sección, secciones de segunda
 * generación y un tema más rico. Estas pruebas cuidan que todo diseño se
 * pinte sin romperse ni abrir huecos de seguridad, que los datos viejos se
 * sigan leyendo igual y que la lógica pura (horario, incrustaciones, tablas)
 * haga lo que promete.
 */

const render = (blocks: WebSiteBlock[], mode: 'public' | 'preview' = 'public', theme = DEFAULT_THEME, document?: SiteDocument) =>
  renderToStaticMarkup(<SiteRenderer name="Mi sitio" logoUrl={null} theme={theme} document={document} blocks={document ? undefined : blocks} slug="mi-sitio" mode={mode} />);

const PHOTO = 'https://cdn.example.com/foto.jpg';

describe('registro de diseños', () => {
  it('cada valor de las listas cerradas tiene su nombre y su explicación, en el mismo orden', () => {
    for (const type of BLOCK_TYPES) {
      expect(BLOCK_LAYOUTS[type].options.map((option) => option.value)).toEqual([...VARIANT_VALUES[type]]);
      for (const option of BLOCK_LAYOUTS[type].options) {
        expect(option.label.trim()).not.toBe('');
        expect(option.description.trim()).not.toBe('');
      }
      expect(BLOCK_LAYOUTS[type].hint.trim()).not.toBe('');
    }
  });

  it('ofrece muchos diseños: más de 130 en 33 tipos de sección', () => {
    expect(BLOCK_TYPES).toHaveLength(33);
    expect(totalLayouts()).toBeGreaterThanOrEqual(130);
  });

  it('el diseño de fábrica es el primero y un sitio antiguo sin `variant` se ve igual que antes', () => {
    const old = parseBlocks([
      { id: 'a', type: 'text', heading: 'Hola', body: 'Texto' },
      { id: 'b', type: 'stats', items: [{ value: '10', label: 'años' }] },
      { id: 'c', type: 'contact', heading: 'Contacto' },
    ]);
    expect(old.map((block) => block.variant)).toEqual(['standard', 'plain', 'split']);
    for (const type of BLOCK_TYPES) expect(createBlock(type).variant).toBe(VARIANT_VALUES[type][0]);
  });

  it('un diseño desconocido cae al de fábrica sin perder la sección', () => {
    const [block] = parseBlocks([{ id: 'x', type: 'features', variant: 'holograma', heading: 'Servicios', items: [{ title: 'Uno' }] }]);
    expect(block?.variant).toBe('cards');
    expect(block?.type === 'features' && block.items[0]?.title).toBe('Uno');
  });

  it('cambiar de diseño conserva el contenido; un diseño ajeno al tipo no hace nada', () => {
    const block = { ...createBlock('testimonials'), heading: 'Opiniones' } as WebSiteBlock;
    const changed = withVariant(block, 'masonry');
    expect(changed.variant).toBe('masonry');
    expect(changed.type === 'testimonials' && changed.heading).toBe('Opiniones');
    expect(changed.id).toBe(block.id);
    expect(withVariant(block, 'collage')).toBe(block);
  });
});

describe('cada diseño se pinta', () => {
  const cases = BLOCK_TYPES.flatMap((type) => layoutsOf(type).map((option) => [type, option.value] as const));

  it.each(cases)('%s · %s: con contenido de muestra, en público y en vista previa, sin scripts ni javascript:', (type, variant) => {
    const block = sampleBlock(type, variant);
    expect(block.variant).toBe(variant);
    for (const mode of ['public', 'preview'] as const) {
      const html = render([block], mode);
      expect(html).not.toMatch(/<script|javascript:/i);
    }
    // Vacía tampoco revienta (vista previa: marcador).
    expect(() => render([withVariant(createBlock(type), variant)], 'preview')).not.toThrow();
  });

  it('la sección lleva su tipo y su diseño en el HTML (lo usan las pruebas de pantalla)', () => {
    const html = render([sampleBlock('features', 'bento')]);
    expect(html).toContain('data-ws-type="features"');
    expect(html).toContain('data-ws-variant="bento"');
  });
});

describe('contenido de muestra', () => {
  it('cada tipo tiene muestra válida y se reconoce como ejemplo (no se publica tal cual)', () => {
    for (const type of BLOCK_TYPES) {
      const block = blockSchema.parse({ ...SECTION_SAMPLES[type], id: 'x' });
      expect(block.type).toBe(type);
    }
    const doc = documentFromBlocks(BLOCK_TYPES.filter((type) => type !== 'divider').map((type) => sampleBlock(type)));
    const report = evaluateReadiness({ kind: 'BLANK', mode: 'GUIDED', document: doc });
    expect(report.items.find((item) => item.id === 'sample')?.ok).toBe(false);
    expect(report.canPublish).toBe(false);
  });

  it('los textos cortos de muestra se reconocen aunque midan menos de 25 caracteres', () => {
    for (const text of SAMPLE_PLACEHOLDERS) expect(isSampleText(text)).toBe(true);
    expect(isSampleText('Contacto')).toBe(false);
    expect(isSampleText('Corte de pelo')).toBe(false);
  });
});

describe('estilo de la sección', () => {
  it('textura, forma y ancho tienen valor de fábrica y uno desconocido cae a él', () => {
    const block = createBlock('text');
    expect(block.style).toMatchObject({ pattern: 'none', shape: 'none', width: 'auto' });
    const [parsed] = parseBlocks([{ id: 'y', type: 'text', style: { pattern: 'url(x)', shape: '<svg>', width: '100vw', background: 'gradient' } }]);
    expect(parsed?.style).toMatchObject({ pattern: 'none', shape: 'none', width: 'auto', background: 'gradient' });
  });

  it('pinta el borde con forma con el color de lo que viene después, la textura y el degradado', () => {
    const first = { ...sampleBlock('text'), style: { ...createBlock('text').style, shape: 'wave', pattern: 'dots', background: 'gradient' } } as WebSiteBlock;
    const second = { ...sampleBlock('faq'), style: { ...createBlock('faq').style, background: 'dark' } } as WebSiteBlock;
    const html = render([first, second]);
    expect(html).toContain('ws-has-shape');
    expect(html).toMatch(/class="ws-shape ws-tone-dark"[^>]*><svg/);
    expect(html).toContain('ws-pattern ws-pat-dots');
    expect(html).toContain('ws-fx ws-fx-gradient');
  });

  it('la última sección dibuja el borde con el color del pie', () => {
    const doc = documentFromBlocks([{ ...sampleBlock('text'), style: { ...createBlock('text').style, shape: 'slant' } } as WebSiteBlock]);
    const withDarkFooter: SiteDocument = { ...doc, footer: { ...doc.footer, style: 'dark' } };
    expect(render([], 'public', DEFAULT_THEME, withDarkFooter)).toMatch(/class="ws-shape ws-tone-dark"/);
  });
});

describe('secciones nuevas', () => {
  it('la cinta repite las frases para cubrir pantallas anchas, pero el lector las lee una vez y el teclado no pasa por las copias', () => {
    const html = render([{ ...createBlock('marquee'), items: [{ text: 'Hecho a mano' }, { text: 'Envíos' }] } as WebSiteBlock]);
    expect(html).toMatch(/class="ws-marquee-group ws-marquee-dup[^"]*"/);
    expect(html).toMatch(/aria-hidden="true" inert=""[^>]*class="ws-marquee-group ws-marquee-dup/);
    const main = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
    const visible = main.split('ws-marquee-dup')[0]!;
    expect(visible.match(/Hecho a mano/g)).toHaveLength(1);
  });

  it('las pestañas son accesibles: lista de pestañas, una activa y los demás paneles ocultos pero presentes', () => {
    const html = render([sampleBlock('tabs', 'side')]);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/hidden=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Título de la tercera categoría');
  });

  it('antes y después: un control de rango con etiqueta y ambas fotos descritas; un par incompleto no se publica', () => {
    const pair = { beforeUrl: PHOTO, afterUrl: 'https://cdn.example.com/b.jpg', caption: '', alt: 'Cocina' };
    const html = render([{ ...createBlock('beforeafter'), heading: 'Resultados', items: [pair, { ...pair, afterUrl: '' }] } as WebSiteBlock]);
    expect(html).toMatch(/<input type="range"[^>]*aria-label="Desliza para comparar antes y después"/);
    expect(html).toContain('alt="Antes: Cocina"');
    expect(html).toContain('alt="Después: Cocina"');
    expect(html.match(/type="range"/g)).toHaveLength(1);
  });

  it('enlaces (link en bio): botones con destino seguro; uno con javascript: no se pinta', () => {
    const block = { ...createBlock('links'), title: 'Dulce Hogar', items: [{ label: 'WhatsApp', href: 'https://wa.me/56912345678', icon: 'phone' }, { label: 'Malo', href: 'javascript:alert(1)', icon: '' }] } as WebSiteBlock;
    const html = render([block]);
    expect(html).toContain('href="https://wa.me/56912345678"');
    expect(html).not.toContain('Malo');
    expect(html).not.toMatch(/javascript:/);
    expect(html).toMatch(/<h1[^>]*>Dulce Hogar<\/h1>/);
  });

  it('tabla comparativa: sí/no se pintan como íconos con texto para lectores; lo demás tal cual', () => {
    const html = render([sampleBlock('comparison', 'table')]);
    expect(html).toContain('<span class="sr-only">Sí</span>');
    expect(html).toContain('<span class="sr-only">No</span>');
    expect(html).toContain('24 horas');
    expect(html).toContain('scope="col"');
    expect(comparisonMark(' SÍ ')).toBe('yes');
    expect(comparisonMark('✗')).toBe('no');
    expect(comparisonMark('')).toBe('empty');
    expect(comparisonMark('$9.990')).toBe('text');
  });

  it('incrustar: solo servicios permitidos, en iframe aislado y armado por nosotros', () => {
    const ok = render([{ ...createBlock('embed'), heading: 'Agenda', url: 'https://calendly.com/mi-negocio/30min' } as WebSiteBlock]);
    expect(ok).toMatch(/<iframe[^>]*src="https:\/\/calendly\.com\/mi-negocio\/30min\?embed_type=Inline&amp;hide_gdpr_banner=1"[^>]*sandbox="[^"]*"/);
    const bad = render([{ ...createBlock('embed'), heading: 'Agenda', url: 'https://evil.cl/x' } as WebSiteBlock]);
    expect(bad).not.toContain('<iframe');
  });

  it('novedades: el enlace pasa por la barrera y el horario se agrupa por días iguales', () => {
    const posts = { ...createBlock('posts'), heading: 'Noticias', items: [{ imageUrl: '', date: 'Hoy', tag: '', title: 'Abrimos', excerpt: '', href: 'javascript:alert(1)' }] } as WebSiteBlock;
    expect(render([posts])).not.toMatch(/javascript:/);
    const hours = render([{ ...createBlock('hours'), heading: 'Horario', week: SAMPLE_WEEK } as WebSiteBlock]);
    expect(hours).toContain('Lunes a viernes');
    expect(hours).toContain('09:00 – 18:00');
    expect(hours).toContain('Cerrado');
  });

  it('las fotos de los campos nuevos pasan por la validación del servidor (blockImageUrls)', () => {
    const urls = (block: Partial<WebSiteBlock> & { type: WebSiteBlock['type'] }) => blockImageUrls(blockSchema.parse({ ...block, id: 'z' }));
    expect(urls({ type: 'hero', imageUrl: 'a', images: [{ url: 'b', alt: '', caption: '' }] } as WebSiteBlock)).toEqual(['a', 'b']);
    expect(urls({ type: 'quote', photoUrl: 'q' } as WebSiteBlock)).toEqual(['q']);
    expect(urls({ type: 'cta', imageUrl: 'c' } as WebSiteBlock)).toEqual(['c']);
    expect(urls({ type: 'links', imageUrl: 'l' } as WebSiteBlock)).toEqual(['l']);
    expect(urls({ type: 'pricelist', categories: [{ title: '', items: [{ name: 'x', imageUrl: 'p' }] }] } as unknown as WebSiteBlock)).toEqual(['p']);
    expect(urls({ type: 'beforeafter', items: [{ beforeUrl: 'b1', afterUrl: 'a1' }] } as unknown as WebSiteBlock)).toEqual(['b1', 'a1']);
    for (const type of ['timeline', 'tabs', 'posts'] as const) expect(urls({ type, items: [{ imageUrl: 'i' }] } as unknown as WebSiteBlock)).toEqual(['i']);
  });

  it('los enlaces de las secciones nuevas se revisan antes de publicar (blockLinks)', () => {
    const links = blockLinks(blockSchema.parse({ id: 'l', type: 'links', items: [{ label: 'Tienda', href: 'page:x' }] }));
    expect(links).toEqual([{ label: 'el botón «Tienda»', href: 'page:x', text: 'Tienda' }]);
    expect(blockLinks(blockSchema.parse({ id: 't', type: 'tabs', items: [{ label: 'A', buttonLabel: 'Ir', buttonHref: '#x', body: '[y](https://a.cl)' }] })).map((link) => link.href)).toEqual(['#x', 'https://a.cl']);
    expect(blockLinks(blockSchema.parse({ id: 'p', type: 'posts', items: [{ title: 'N', href: 'https://a.cl' }] }))[0]?.href).toBe('https://a.cl');
  });

  it('una sección nueva vacía no se publica', () => {
    for (const type of ['timeline', 'comparison', 'beforeafter', 'links', 'marquee', 'tabs', 'hours', 'areas', 'embed', 'posts'] as const) {
      const empty = blockSchema.parse({ id: 'e', type });
      expect(isBlockEmpty(empty)).toBe(true);
      expect(BLOCK_INFO[type].label).toBeTruthy();
    }
  });
});

describe('horario de atención', () => {
  const week = (patch: Partial<Record<number, Partial<HoursDay>>>): HoursDay[] =>
    Array.from({ length: 7 }, (_, index) => ({ closed: false, open: '', close: '', open2: '', close2: '', ...(patch[index] ?? {}) }));

  // Octubre: Chile está en horario de verano (UTC−3).
  const at = (iso: string) => new Date(iso);

  it('agrupa días seguidos con el mismo horario y omite los días sin definir', () => {
    expect(groupWeek(SAMPLE_WEEK).map((group) => `${group.label}: ${group.hours}`)).toEqual(['Lunes a viernes: 09:00 – 18:00', 'Sábado: 10:00 – 14:00', 'Domingo: Cerrado']);
    expect(groupWeek(week({ 0: { open: '09:00', close: '13:00', open2: '15:00', close2: '19:00' } }))).toHaveLength(1);
    expect(dayHoursText({ closed: false, open: '09:00', close: '13:00', open2: '15:00', close2: '19:00' })).toBe('09:00 – 13:00 · 15:00 – 19:00');
  });

  it('dice si está abierto con la hora de Chile, sin importar la zona del navegador', () => {
    // Miércoles 7 de octubre de 2026, 12:00 en Chile.
    expect(hoursStatus(SAMPLE_WEEK, at('2026-10-07T15:00:00Z'))).toEqual({ open: true, text: 'Abierto ahora · cierra a las 18:00' });
    // Miércoles 20:00 en Chile: abre mañana.
    expect(hoursStatus(SAMPLE_WEEK, at('2026-10-07T23:00:00Z'))).toEqual({ open: false, text: 'Cerrado · abre mañana a las 09:00' });
    // Sábado 15:00: el domingo cierra, abre el lunes.
    expect(hoursStatus(SAMPLE_WEEK, at('2026-10-10T18:00:00Z'))).toEqual({ open: false, text: 'Cerrado · abre el lunes a las 09:00' });
    // Lunes 07:00: abre hoy.
    expect(hoursStatus(SAMPLE_WEEK, at('2026-10-12T10:00:00Z'))).toEqual({ open: false, text: 'Cerrado · abre hoy a las 09:00' });
  });

  it('un horario que cruza la medianoche sigue abierto de madrugada; sin tramos no hay estado', () => {
    const bar = week({ 4: { open: '20:00', close: '02:00' } });
    // Sábado 01:00 en Chile (tramo del viernes).
    expect(hoursStatus(bar, at('2026-10-10T04:00:00Z'))?.open).toBe(true);
    // Viernes 21:00.
    expect(hoursStatus(bar, at('2026-10-10T00:00:00Z'))?.open).toBe(true);
    expect(hoursStatus(week({}), at('2026-10-10T00:00:00Z'))).toBeNull();
  });

  it('una hora mal escrita se descarta en vez de romper la sección', () => {
    const [block] = parseBlocks([{ id: 'h', type: 'hours', week: Array.from({ length: 7 }, () => ({ open: '25:99', close: 'mediodía', closed: 'sí' })) }]);
    expect(block?.type === 'hours' && block.week[0]).toEqual({ closed: false, open: '', close: '', open2: '', close2: '' });
    const [short] = parseBlocks([{ id: 'h2', type: 'hours', week: [{ open: '09:00', close: '18:00' }] }]);
    expect(short?.type === 'hours' && short.week).toHaveLength(7);
  });
});

describe('incrustar servicios', () => {
  it.each([
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify', 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
    ['open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc', 'spotify', 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'],
    ['https://soundcloud.com/artista/cancion', 'soundcloud', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartista%2Fcancion&visual=false&show_comments=false'],
    ['https://calendly.com/mi-negocio', 'calendly', 'https://calendly.com/mi-negocio?embed_type=Inline&hide_gdpr_banner=1'],
    ['https://docs.google.com/forms/d/e/1FAIpQLSf_abcdefghijklmnopqrstuvwxyz0123/viewform?usp=sf_link', 'google-forms', 'https://docs.google.com/forms/d/e/1FAIpQLSf_abcdefghijklmnopqrstuvwxyz0123/viewform?embedded=true'],
    ['https://calendar.google.com/calendar/embed?src=club%40group.calendar.google.com&ctz=Europe%2FMadrid', 'google-calendar', 'https://calendar.google.com/calendar/embed?src=club%40group.calendar.google.com&ctz=America%2FSantiago'],
    ['club@group.calendar.google.com', 'google-calendar', 'https://calendar.google.com/calendar/embed?src=club%40group.calendar.google.com&ctz=America%2FSantiago'],
  ])('%s → %s', (raw, provider, src) => {
    const embed = embedFrom(raw);
    expect(embed?.provider).toBe(provider);
    expect(embed?.src).toBe(src);
    expect(embed?.sandbox).not.toContain('allow-top-navigation');
  });

  it.each([
    'https://evil.cl/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com.evil.cl/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/track/<script>',
    'javascript:alert(1)',
    'https://calendly.com/a/b/c/d',
    'https://calendly.com/',
    'https://calendly.com/a%2Fb',
    'https://docs.google.com/document/d/abc/edit',
    'https://calendar.google.com/calendar/embed?src=<x>',
    'https://soundcloud.com/solo',
    '',
  ])('rechaza %j', (raw) => {
    expect(embedFrom(raw)).toBeNull();
  });

  it('la política de seguridad permite incrustar exactamente esos servicios', async () => {
    const nextConfig = require('../next.config.js') as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
    const entries = await nextConfig.headers();
    const csp = entries.find((entry) => entry.source === '/:path*')?.headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
    const frameSrc = csp.split(';').find((part) => part.trim().startsWith('frame-src')) ?? '';
    for (const origin of EMBED_ORIGINS) expect(frameSrc).toContain(origin);
  });
});

describe('tema', () => {
  it('todas las paletas y todos los estilos completos se leen bien', () => {
    expect(THEME_PALETTES.length).toBeGreaterThanOrEqual(36);
    for (const palette of THEME_PALETTES) expect(themeProblems(parseTheme(palette.colors))).toEqual([]);
    expect(THEME_KITS.length).toBeGreaterThanOrEqual(18);
    for (const kit of THEME_KITS) {
      expect(THEME_PALETTES.some((palette) => palette.id === kit.palette)).toBe(true);
      const theme = parseTheme(kitTheme(kit));
      expect(themeProblems(theme)).toEqual([]);
      // La letra del texto corrido nunca es una de títulos.
      expect(FONT_STACKS[kit.style.font].headingOnly).toBeFalsy();
      expect(activeKit(theme)?.id).toBe(kit.id);
    }
  });

  it('cada tipografía tiene su fuente autoalojada declarada', () => {
    for (const font of FONT_OPTIONS) {
      const match = /var\((--wsf-[a-z-]+)\)/.exec(FONT_STACKS[font].css);
      if (match) expect(SITE_FONT_CLASSES).toContain(`mock${match[1]}`);
    }
  });

  it('un tema guardado antes de las opciones nuevas las recibe de fábrica; un valor dañado cae campo por campo', () => {
    const old = parseTheme({ primary: '#112233', font: 'inter', buttonStyle: 'pill' });
    expect(old).toMatchObject({ primary: '#112233', buttonStyle: 'pill', cardStyle: 'bordered', headingWeight: 'bold', width: 'normal' });
    const broken = parseTheme({ cardStyle: 'url(x)', headingWeight: 9000, buttonStyle: 'glow' });
    expect(broken).toMatchObject({ cardStyle: 'bordered', headingWeight: 'bold', buttonStyle: 'glow' });
    expect(themeVariables(parseTheme({ headingWeight: 'black', width: 'narrow' }))).toMatchObject({ '--ws-heading-weight': '850', '--ws-max': '56rem' });
  });

  it('el estilo de tarjetas viaja al sitio como atributo de una lista cerrada', () => {
    expect(render([sampleBlock('features')], 'public', parseTheme({ cardStyle: 'brutal' }))).toContain('data-card="brutal"');
  });
});

describe('encabezado y pie', () => {
  const base = documentFromBlocks([sampleBlock('hero', 'center'), sampleBlock('contact')]);

  it.each([
    ['split', 'light'],
    ['classic', 'dark'],
    ['minimal', 'floating'],
    ['centered', 'floating'],
  ] as const)('encabezado %s · %s', (layout, style) => {
    const doc: SiteDocument = { ...base, header: { ...base.header, layout, style, ctaLabel: 'Cotizar', ctaHref: '#contacto' } };
    const html = render([], 'public', DEFAULT_THEME, doc);
    expect(html).toContain('<header');
    expect(html).toContain('Cotizar');
    if (style === 'dark') expect(html).toMatch(/<header class="ws-tone-dark/);
    if (style === 'floating') expect(html).toContain('ws-glass relative mx-auto');
  });

  it.each(['centered', 'big'] as const)('pie %s', (layout) => {
    const doc: SiteDocument = { ...base, footer: { ...base.footer, layout, about: 'Pastelería familiar.' } };
    const html = render([], 'public', DEFAULT_THEME, doc);
    expect(html).toContain('Pastelería familiar.');
    if (layout === 'big') expect(html).toMatch(/aria-hidden="true" class="ws-h mt-10[^"]*" style="font-size:clamp\(/);
  });

  it('un diseño de encabezado o pie desconocido cae al de fábrica', () => {
    const doc = parseSiteDocument({ pages: [{ id: 'home', title: 'Inicio', blocks: [] }], header: { layout: 'diagonal', style: 'neon' }, footer: { layout: 'gigante' } });
    expect(doc.header.layout).toBe('classic');
    expect(doc.header.style).toBe('light');
    expect(doc.footer.layout).toBe('simple');
  });
});

describe('lista "qué le falta" con las secciones nuevas', () => {
  const check = (blocks: WebSiteBlock[]) => evaluateReadiness({ kind: 'BLANK', mode: 'GUIDED', blocks: [{ ...createBlock('hero'), title: 'Hola' } as WebSiteBlock, { ...createBlock('contact'), email: 'a@b.cl' } as WebSiteBlock, ...blocks] });

  it('avisa un enlace que no se puede incrustar, un par de fotos incompleto y el horario de ejemplo', () => {
    const report = check([
      { ...createBlock('embed'), url: 'https://evil.cl' } as WebSiteBlock,
      { ...createBlock('beforeafter'), items: [{ beforeUrl: PHOTO, afterUrl: '', caption: '', alt: 'x' }] } as WebSiteBlock,
      { ...createBlock('hours'), week: SAMPLE_WEEK } as WebSiteBlock,
    ]);
    const media = report.items.find((item) => item.id === 'media');
    expect(media?.ok).toBe(false);
    expect(media?.hint).toContain('Spotify');
    expect(media?.hint).toContain('una sola foto');
    expect(media?.hint).toContain('horario');
    expect(media?.required).toBe(false);
  });

  it('recomienda fotos cuando el diseño elegido las necesita', () => {
    const noPhotos = check([{ ...withVariant(createBlock('features'), 'overlay'), heading: 'Servicios', items: [{ title: 'Uno', text: 'x', imageUrl: '', icon: '', href: '' }] } as WebSiteBlock]);
    expect(noPhotos.items.find((item) => item.id === 'layout-photos')?.ok).toBe(false);
    expect(noPhotos.items.find((item) => item.id === 'layout-photos')?.hint).toContain('Sobre foto');
    const fine = check([{ ...withVariant(createBlock('features'), 'cards'), heading: 'Servicios', items: [{ title: 'Uno', text: 'x', imageUrl: '', icon: '', href: '' }] } as WebSiteBlock]);
    expect(fine.items.find((item) => item.id === 'layout-photos')?.ok).toBe(true);
  });
});

describe('rubros y plantillas de página', () => {
  it('los rubros usan una gran variedad de diseños y siguen sin poder publicarse con los textos de ejemplo', () => {
    const used = new Set<string>();
    for (const industry of INDUSTRY_TEMPLATES) {
      const { document, theme } = industryDocument(industry, { name: 'Mi Negocio', contact: { email: 'a@b.cl', phone: '+56912345678' } });
      document.pages.flatMap((page) => page.blocks).forEach((block) => used.add(`${block.type}:${block.variant}`));
      expect(themeProblems(theme)).toEqual([]);
      expect(() => render([], 'public', theme, document)).not.toThrow();
      expect(evaluateReadiness({ kind: industry.kind, mode: 'GUIDED', document, theme }).canPublish).toBe(false);
    }
    expect(used.size).toBeGreaterThanOrEqual(60);
  });

  it('las plantillas de página nuevas se pintan', () => {
    for (const id of ['links', 'visit', 'history', 'news', 'compare']) {
      const template = PAGE_TEMPLATES.find((entry) => entry.id === id);
      expect(template).toBeDefined();
      const blocks = template!.blocks.map((draft) => blockSchema.parse({ ...draft, id: `${id}-${draft.type}` }));
      expect(() => render(blocks)).not.toThrow();
    }
  });
});
