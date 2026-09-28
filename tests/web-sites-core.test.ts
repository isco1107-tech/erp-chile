import { BLOCK_TYPES, blockAnchors, blockSchema, blocksSchema, buildNav, createBlock, parseBlocks, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { SANDBOX_CSP, SANDBOX_HEADERS, htmlHints, sanitizeHtml, wrapHtmlDocument } from '@/lib/web-sites/html';
import { evaluateReadiness } from '@/lib/web-sites/readiness';
import { KIND_INFO, WEB_SITE_KINDS, isSampleText, starterBlocks, starterHtml } from '@/lib/web-sites/templates';
import { DEFAULT_THEME, contrastRatio, parseTheme, themeProblems, themeVariables } from '@/lib/web-sites/theme';
import { isExternalHref, safeHref, safeImageSrc, siteSlugProblem, slugify, whatsappHref } from '@/lib/web-sites/urls';
import { createWebSiteSchema, publicWebSiteMessageSchema } from '@/modules/web-sites/schema';

/**
 * Sitios web: las piezas puras del módulo. Lo que más importa acá es lo que
 * protege a la plataforma (enlaces, HTML propio) y lo que guía al usuario
 * (plantillas y lista "qué le falta").
 */

describe('enlaces e imágenes', () => {
  it('rechaza esquemas peligrosos y acepta lo que la gente escribe de verdad', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:void(0)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', '//evil.com', 'ftp://x.cl']) {
      expect(safeHref(bad)).toBeNull();
    }
    expect(safeHref('https://miweb.cl/contacto')).toBe('https://miweb.cl/contacto');
    expect(safeHref('www.miweb.cl')).toBe('https://www.miweb.cl/');
    expect(safeHref('hola@miweb.cl')).toBe('mailto:hola@miweb.cl');
    expect(safeHref('mailto:hola@miweb.cl?subject=Hola')).toBe('mailto:hola@miweb.cl');
    expect(safeHref('+56 9 1234 5678')).toBe('tel:+56912345678');
    expect(safeHref('#contacto')).toBe('#contacto');
    expect(safeHref('')).toBeNull();
    expect(safeHref('solo texto')).toBeNull();
  });

  it('marca como externos solo los http(s)', () => {
    expect(isExternalHref('https://a.cl')).toBe(true);
    expect(isExternalHref('#x')).toBe(false);
    expect(isExternalHref('mailto:a@b.cl')).toBe(false);
  });

  it('solo pinta imágenes https', () => {
    expect(safeImageSrc('https://cdn.cl/a.jpg')).toBe('https://cdn.cl/a.jpg');
    expect(safeImageSrc('http://cdn.cl/a.jpg')).toBeNull();
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
    expect(safeImageSrc('')).toBeNull();
  });

  it('arma enlaces de WhatsApp desde números escritos de cualquier forma', () => {
    expect(whatsappHref('+56 9 1234 5678')).toBe('https://wa.me/56912345678');
    expect(whatsappHref('9 1234 5678')).toBe('https://wa.me/56912345678');
    expect(whatsappHref('12')).toBeNull();
    expect(whatsappHref('', 'x')).toBeNull();
    expect(whatsappHref('56912345678', 'Hola, quiero cotizar')).toBe('https://wa.me/56912345678?text=Hola%2C%20quiero%20cotizar');
  });

  it('normaliza y valida la dirección pública', () => {
    expect(slugify('Ñandú Diseño & Café!')).toBe('nandu-diseno-cafe');
    expect(slugify('  --Hola--  ')).toBe('hola');
    expect(siteSlugProblem('ab')).toMatch(/al menos/);
    expect(siteSlugProblem('mi-sitio')).toBeNull();
    expect(siteSlugProblem('Mi Sitio')).toMatch(/minúsculas/);
    expect(siteSlugProblem('a'.repeat(51))).toMatch(/hasta/);
  });
});

describe('tema', () => {
  it('completa un tema vacío o dañado, campo por campo', () => {
    expect(parseTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(parseTheme({ primary: 'rojo', accent: '#112233', font: 'comic' })).toMatchObject({ primary: DEFAULT_THEME.primary, accent: '#112233', font: 'sans' });
  });

  it('el tema nunca deja pasar CSS arbitrario a las variables', () => {
    const vars = themeVariables(parseTheme({ primary: 'red;} body{display:none', text: '#000000' }));
    for (const value of Object.values(vars)) expect(value).not.toMatch(/[;{}]/);
    expect(vars['--ws-primary']).toBe(DEFAULT_THEME.primary);
  });

  it('avisa cuando el texto no se lee sobre el fondo', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(themeProblems(parseTheme({ text: '#f0f0f0', background: '#ffffff' })).length).toBeGreaterThan(0);
    expect(themeProblems(DEFAULT_THEME)).toEqual([]);
  });
});

describe('bloques', () => {
  it('cada tipo se crea válido y con ids únicos', () => {
    const blocks = BLOCK_TYPES.map(createBlock);
    expect(blocksSchema.safeParse(blocks).success).toBe(true);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(BLOCK_TYPES.length);
  });

  it('un bloque dañado se descarta sin tumbar el sitio', () => {
    const good = createBlock('text');
    const parsed = parseBlocks([good, { id: 'x', type: 'inexistente' }, null, 'basura', { ...good }]);
    expect(parsed).toHaveLength(1); // el duplicado por id también se descarta
    expect(parseBlocks('no es un arreglo')).toEqual([]);
  });

  it('rechaza ids repetidos y demasiadas secciones al guardar', () => {
    const one = createBlock('text');
    expect(blocksSchema.safeParse([one, one]).success).toBe(false);
    expect(blocksSchema.safeParse(Array.from({ length: 41 }, () => createBlock('text'))).success).toBe(false);
  });

  it('el menú y las anclas son únicos aunque dos secciones se llamen igual', () => {
    const a = { ...createBlock('text'), heading: 'Servicios' } as WebSiteBlock;
    const b = { ...createBlock('features'), heading: 'Servicios' } as WebSiteBlock;
    const c = { ...createBlock('text'), heading: 'Oculta', hidden: true } as WebSiteBlock;
    const anchors = blockAnchors([a, b]);
    expect(new Set(anchors.values()).size).toBe(2);
    expect(buildNav([a, b, c]).map((entry) => entry.label)).toEqual(['Servicios', 'Servicios']);
  });

  it('descarta campos desconocidos', () => {
    const parsed = blockSchema.parse({ id: 'a', type: 'text', heading: 'H', body: 'B', onclick: 'alert(1)' });
    expect('onclick' in parsed).toBe(false);
  });
});

describe('plantillas', () => {
  for (const kind of WEB_SITE_KINDS) {
    it(`${kind}: parte válida, con portada con el nombre del sitio y contacto`, () => {
      const blocks = starterBlocks(kind, { name: 'Taller Los Andes' });
      expect(blocksSchema.safeParse(blocks).success).toBe(true);
      expect(blocks[0]).toMatchObject({ type: 'hero', title: 'Taller Los Andes' });
      expect(blocks.some((b) => b.type === 'contact' && b.showForm)).toBe(true);
    });

    it(`${kind}: los botones con #ancla apuntan a una sección que existe`, () => {
      const blocks = starterBlocks(kind, { name: 'X' });
      const anchors = new Set(blockAnchors(blocks).values());
      for (const block of blocks) {
        const href = block.type === 'hero' ? block.ctaHref : block.type === 'cta' ? block.buttonHref : '';
        if (href.startsWith('#')) expect(anchors.has(href.slice(1))).toBe(true);
      }
    });

    it(`${kind}: la guía "qué debe tener" se cumple con la plantilla inicial`, () => {
      const blocks = starterBlocks(kind, { name: 'X' });
      for (const need of KIND_INFO[kind].mustHave) expect(blocks.some((b) => b.type === need.type)).toBe(true);
    });
  }

  it('reconoce los textos de ejemplo y no los propios', () => {
    const hero = starterBlocks('LANDING', { name: 'X' })[1]!;
    const sample = hero.type === 'features' ? hero.items[0]!.text : '';
    expect(isSampleText(sample)).toBe(true);
    expect(isSampleText('Instalamos paneles solares en toda la Región del Biobío desde 2015.')).toBe(false);
    expect(isSampleText('Contacto')).toBe(false);
  });

  it('el HTML inicial no lleva nada que la plataforma tenga que quitar', () => {
    const { removed } = sanitizeHtml(starterHtml('Mi <negocio>'));
    expect(removed).toEqual([]);
    expect(starterHtml('Mi <negocio>')).not.toContain('<negocio>');
  });
});

describe('lista "qué le falta"', () => {
  const base = { kind: 'LANDING' as const, mode: 'GUIDED' as const, seoTitle: 'Título de prueba largo', seoDescription: 'x'.repeat(80), logoUrl: 'https://cdn.cl/logo.png', theme: {} };

  it('una plantilla recién creada NO se puede publicar: quedan textos de ejemplo', () => {
    const report = evaluateReadiness({ ...base, blocks: starterBlocks('LANDING', { name: 'Mi negocio' }) });
    expect(report.canPublish).toBe(false);
    expect(report.items.find((i) => i.id === 'sample')).toMatchObject({ ok: false, required: true });
  });

  it('con contenido propio y contacto sí se publica', () => {
    const blocks: WebSiteBlock[] = [
      { ...createBlock('hero'), title: 'Paneles solares para tu casa' } as WebSiteBlock,
      { ...createBlock('contact'), heading: 'Contacto', email: 'hola@solar.cl', showForm: false } as WebSiteBlock,
    ];
    const report = evaluateReadiness({ ...base, blocks });
    expect(report.canPublish).toBe(true);
    expect(report.blockers).toBe(0);
  });

  it('exige portada con título, forma de contacto y enlaces válidos', () => {
    const hero = { ...createBlock('hero'), title: '' } as WebSiteBlock;
    const contact = { ...createBlock('contact'), showForm: false } as WebSiteBlock;
    const empty = evaluateReadiness({ ...base, blocks: [hero, contact] });
    expect(empty.items.filter((i) => i.required && !i.ok).map((i) => i.id).sort()).toEqual(['contact', 'hero']);

    const badLink = evaluateReadiness({
      ...base,
      blocks: [{ ...createBlock('hero'), title: 'Hola', ctaLabel: 'Ir', ctaHref: 'javascript:alert(1)' } as WebSiteBlock, { ...createBlock('contact'), email: 'a@b.cl' } as WebSiteBlock],
    });
    expect(badLink.items.find((i) => i.id === 'links')?.ok).toBe(false);
    expect(badLink.canPublish).toBe(false);
  });

  it('las secciones ocultas no cuentan como contenido', () => {
    const blocks = [
      { ...createBlock('hero'), title: 'Hola' } as WebSiteBlock,
      { ...createBlock('contact'), email: 'a@b.cl', hidden: true } as WebSiteBlock,
    ];
    expect(evaluateReadiness({ ...base, blocks }).items.find((i) => i.id === 'contact')?.ok).toBe(false);
  });

  it('avisa imágenes sin descripción y colores ilegibles (recomendaciones, no bloquean)', () => {
    const blocks = [
      { ...createBlock('hero'), title: 'Hola' } as WebSiteBlock,
      { ...createBlock('image'), imageUrl: 'https://cdn.cl/a.jpg', alt: '' } as WebSiteBlock,
      { ...createBlock('contact'), email: 'a@b.cl' } as WebSiteBlock,
    ];
    const report = evaluateReadiness({ ...base, theme: { text: '#eeeeee', background: '#ffffff' }, blocks });
    expect(report.items.find((i) => i.id === 'alt')?.ok).toBe(false);
    expect(report.items.find((i) => i.id === 'theme')?.ok).toBe(false);
    expect(report.canPublish).toBe(true);
  });

  it('modo HTML: exige contenido y avisa lo que se quitará', () => {
    const empty = evaluateReadiness({ ...base, mode: 'HTML', blocks: [], html: '<p>hola</p>' });
    expect(empty.canPublish).toBe(false);
    const html = `<h1>Hola</h1><p>${'texto '.repeat(20)}</p><script>alert(1)</script><a href="mailto:a@b.cl">Escríbenos</a>`;
    const report = evaluateReadiness({ ...base, mode: 'HTML', blocks: [], html });
    expect(report.canPublish).toBe(true);
    expect(report.items.find((i) => i.id === 'html-clean')).toMatchObject({ ok: false, required: false });
  });
});

describe('HTML propio', () => {
  it('quita scripts, manejadores, javascript:, marcos, formularios e @import', () => {
    const dirty = [
      '<h1 onclick="alert(1)">Hola</h1>',
      '<script>alert(1)</script>',
      '<SCRIPT SRC=//evil.js></SCRIPT>',
      '<a href="javascript:alert(1)">x</a>',
      "<a href='JaVaScRiPt:alert(1)'>x</a>",
      '<img src=x onerror=alert(1)>',
      '<iframe src="https://evil.cl"></iframe>',
      '<form action="https://evil.cl"><input name="pw"><button>Enviar</button></form>',
      '<style>@import url(https://evil.cl/x.css); p{color:red}</style>',
      '<meta http-equiv="refresh" content="0;url=https://evil.cl">',
      '<base href="https://evil.cl/">',
      '<scr<script>ipt>alert(1)</scr</script>ipt>',
    ].join('\n');
    const { html, removed } = sanitizeHtml(dirty);
    expect(html).not.toMatch(/<script|onclick|onerror|javascript:|<iframe|<form|<input|<button|@import|http-equiv|<base/i);
    expect(html).toContain('<h1>Hola</h1>');
    expect(html).toContain('p{color:red}');
    expect(removed.length).toBeGreaterThanOrEqual(5);
  });

  it('deja intacto un HTML normal', () => {
    const ok = '<header><h1>Hola</h1></header><p style="color:#333">Texto <a href="https://a.cl" target="_blank">enlace</a></p><img src="https://cdn.cl/a.jpg" alt="foto">';
    expect(sanitizeHtml(ok)).toEqual({ html: ok, removed: [] });
  });

  it('la política del documento propio lo deja inerte', () => {
    const directives = SANDBOX_CSP.split(';').map((d) => d.trim());
    const sandbox = directives.find((d) => d.startsWith('sandbox'))!;
    expect(sandbox).toBeDefined();
    expect(sandbox).not.toMatch(/allow-scripts|allow-same-origin|allow-forms|allow-top-navigation/);
    expect(directives).toContain("script-src 'none'");
    expect(directives).toContain("default-src 'none'");
    expect(directives).toContain("form-action 'none'");
    expect(SANDBOX_HEADERS['Content-Security-Policy']).toBe(SANDBOX_CSP);
    expect(SANDBOX_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('envuelve el contenido y respeta una página completa', () => {
    const wrapped = wrapHtmlDocument('<p>hola</p>', { title: 'A <b> & "c"', description: 'd"e' });
    expect(wrapped).toContain('<!doctype html>');
    expect(wrapped).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(wrapped).toContain('content="d&quot;e"');
    expect(wrapped).toContain('name="viewport"');

    const full = wrapHtmlDocument('<html><head><title>Viejo</title></head><body>x</body></html>', { title: 'Nuevo' });
    expect(full).toContain('<title>Nuevo</title>');
    expect(full).not.toContain('Viejo');
    expect(full.match(/<title>/g)).toHaveLength(1);
    expect(wrapHtmlDocument('<html><body>x</body></html>', { title: 'T' })).toContain('<head>');
  });

  it('da recomendaciones útiles', () => {
    const hints = Object.fromEntries(htmlHints('<h2>x</h2><img src="http://a.cl/x.png">').map((h) => [h.id, h.ok]));
    expect(hints).toEqual({ h1: false, 'img-alt': false, contact: false, 'images-https': false });
    const good = Object.fromEntries(htmlHints('<h1>x</h1><img src="https://a.cl/x.png" alt="f"><a href="https://wa.me/56912345678">wsp</a>').map((h) => [h.id, h.ok]));
    expect(Object.values(good).every(Boolean)).toBe(true);
  });
});

describe('entradas de formularios', () => {
  it('normaliza la dirección al crear un sitio', () => {
    const parsed = createWebSiteSchema.parse({ name: 'Mi sitio', slug: '  Mi Sitio Único ', kind: 'LANDING', mode: 'GUIDED' });
    expect(parsed.slug).toBe('mi-sitio-unico');
    expect(createWebSiteSchema.parse({ name: 'Mi sitio', slug: '', kind: 'BLANK', mode: 'HTML' }).slug).toBeUndefined();
    expect(createWebSiteSchema.safeParse({ name: 'Mi sitio', slug: 'a', kind: 'LANDING', mode: 'GUIDED' }).success).toBe(false);
    expect(createWebSiteSchema.safeParse({ name: 'Mi sitio', kind: 'OTRO', mode: 'GUIDED' }).success).toBe(false);
    expect(createWebSiteSchema.safeParse({ name: 'M', kind: 'LANDING', mode: 'GUIDED' }).success).toBe(false);
  });

  it('valida el mensaje del formulario público', () => {
    const ok = publicWebSiteMessageSchema.safeParse({ name: 'Ana', email: 'ANA@Correo.cl', phone: '+56 9 1234 5678', message: 'Quiero cotizar un trabajo' });
    expect(ok.success && ok.data.email).toBe('ana@correo.cl');
    expect(publicWebSiteMessageSchema.safeParse({ name: 'Ana', email: 'no-es-correo', message: 'Hola, quiero cotizar' }).success).toBe(false);
    expect(publicWebSiteMessageSchema.safeParse({ name: 'Ana', email: 'a@b.cl', message: 'hola' }).success).toBe(false);
    expect(publicWebSiteMessageSchema.safeParse({ name: 'Ana', email: 'a@b.cl', phone: 'abc', message: 'Hola, quiero cotizar' }).success).toBe(false);
    expect(publicWebSiteMessageSchema.safeParse({ name: 'Ana', email: 'a@b.cl', message: 'x'.repeat(2001) }).success).toBe(false);
  });
});
