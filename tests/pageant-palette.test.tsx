import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import {
  DEFAULT_MANUAL_PALETTE,
  applyPaletteToStudioTheme,
  contrastRatio,
  derivePaletteTokens,
  extractPalette,
  hexToRgb,
  pageantPaletteCss,
  pageantPaletteSchema,
  paletteAfterNewCover,
  parsePageantPalette,
  relativeLuminance,
  withPaletteColor,
  type PageantPalette,
} from '@/lib/events/pageant-palette';
import { paletteFromImageBytes } from '@/lib/events/pageant-palette-image';
import { applyDraftToSite, pageantEditorDraftSchema } from '@/lib/events/pageant-editor-draft';
import { pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';
import { buildPageantView } from '@/lib/events/pageant-site';
import { formatCurrency } from '@/lib/chile/tax';
import { PAGEANT_SITE_STYLES } from '@/components/public/pageant/styles';
import { REGISTRATION_STYLES } from '@/components/candidates/registration-styles';
import { PageantPage } from '@/components/public/pageant/PageantPage';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { layoutsOf } from '@/lib/web-sites/variants';
import { projectPublicSiteSchema } from '@/modules/projects/schema';
import { baseSite } from '../scripts/responsive/fixtures';

// El selector llama a una acción de servidor (prisma, sesión): acá solo se mira lo que dibuja.
jest.mock('@/modules/projects/actions/projects.actions', () => ({ detectCoverPaletteAction: jest.fn() }));

// ── Imágenes de prueba ───────────────────────────────────────────────────────

/** Generador pseudoaleatorio fijo: la prueba no depende del azar. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rgba = [number, number, number, number];
const jitter = (random: () => number, [r, g, b, a]: Rgba, amount = 10): Rgba => [r + (random() - 0.5) * amount, g + (random() - 0.5) * amount, b + (random() - 0.5) * amount, a];

/** Una portada como la de la Fiesta de la Primavera: fondo ciruela, letras doradas, flores rosadas y un rincón transparente. */
function logoPixels(shuffleSeed?: number): number[] {
  const random = rng(7);
  const plum: Rgba = [62, 26, 74, 255];
  const gold: Rgba = [242, 193, 78, 255];
  const pink: Rgba = [224, 64, 127, 255];
  const clear: Rgba = [0, 0, 0, 0];
  const pixels: Rgba[] = [];
  for (let i = 0; i < 6000; i++) {
    const share = i / 6000;
    pixels.push(jitter(random, share < 0.12 ? gold : share < 0.2 ? pink : share < 0.85 ? plum : clear));
  }
  if (shuffleSeed !== undefined) {
    const shuffle = rng(shuffleSeed);
    for (let i = pixels.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [pixels[i], pixels[j]] = [pixels[j]!, pixels[i]!];
    }
  }
  return pixels.flat();
}

const solid = (color: Rgba, count = 2000) => Array.from({ length: count }, () => color).flat();

/** Matiz HSL en grados (0-360) de un `#rrggbb`. */
function hue(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const saturation = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b);
};

// ── Detección ────────────────────────────────────────────────────────────────

describe('detección de los tres colores de una portada', () => {
  it('saca fondo, acento y destaque de una portada con degradado, letras doradas y flores rosadas', () => {
    const palette = extractPalette(logoPixels())!;
    // Fondo: lo oscuro que más superficie ocupa (el violeta), no el dorado de las letras.
    expect(relativeLuminance(hexToRgb(palette.base))).toBeLessThan(0.05);
    expect(hue(palette.base)).toBeGreaterThan(260);
    expect(hue(palette.base)).toBeLessThan(300);
    // Acento: el dorado, aunque ocupe bastante menos que el fondo.
    expect(hue(palette.accent)).toBeGreaterThan(35);
    expect(hue(palette.accent)).toBeLessThan(55);
    expect(relativeLuminance(hexToRgb(palette.accent))).toBeGreaterThan(0.4);
    // Destaque: el rosado, de otro tono que el acento.
    expect(hue(palette.highlight)).toBeGreaterThan(325);
    expect(hue(palette.highlight)).toBeLessThan(350);
    expect(palette.source).toBe('portada');
  });

  it('da lo mismo en qué orden vengan los píxeles', () => {
    expect(extractPalette(logoPixels(1))).toEqual(extractPalette(logoPixels(2)));
    expect(extractPalette(logoPixels(1))).toEqual(extractPalette(logoPixels()));
  });

  it('los píxeles transparentes no cuentan: sin nada visible no hay paleta', () => {
    expect(extractPalette([])).toBeNull();
    expect(extractPalette(solid([200, 30, 30, 0]))).toBeNull();
    // Solo el relleno transparente de un PNG no tiñe el fondo.
    const withClear = [...logoPixels(), ...solid([255, 0, 0, 0], 20000)];
    expect(extractPalette(withClear)).toEqual(extractPalette(logoPixels()));
  });

  it('una imagen en blanco y negro da una paleta sobria, sin colores inventados', () => {
    const pixels = [...solid([10, 10, 10, 255], 5000), ...solid([245, 245, 245, 255], 1500)];
    const palette = extractPalette(pixels)!;
    for (const hex of [palette.base, palette.accent, palette.highlight]) expect(saturation(hex)).toBeLessThan(0.08);
    expect(relativeLuminance(hexToRgb(palette.accent))).toBeGreaterThan(0.5);
  });

  it('un solo color en toda la imagen no revienta: el destaque es el mismo tono más profundo', () => {
    const palette = extractPalette(solid([40, 90, 200, 255]))!;
    expect(hue(palette.accent)).toBeCloseTo(hue(palette.highlight), -1);
    expect(parsePageantPalette(palette)).not.toBeNull();
  });

  it('una portada clara (fondo blanco con un logo de color) usa el color del logo como fondo', () => {
    const palette = extractPalette([...solid([252, 252, 252, 255], 5000), ...solid([30, 70, 160, 255], 1200)])!;
    expect(hue(palette.base)).toBeGreaterThan(200);
    expect(hue(palette.base)).toBeLessThan(240);
  });

  it('lee una imagen real (PNG) en el servidor', async () => {
    const png = await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 62, g: 26, b: 74, alpha: 1 } } })
      .composite([
        { input: await sharp({ create: { width: 40, height: 14, channels: 4, background: { r: 242, g: 193, b: 78, alpha: 1 } } }).png().toBuffer(), left: 10, top: 10 },
        { input: await sharp({ create: { width: 30, height: 12, channels: 4, background: { r: 224, g: 64, b: 127, alpha: 1 } } }).png().toBuffer(), left: 70, top: 50 },
      ])
      .png()
      .toBuffer();
    const palette = (await paletteFromImageBytes(new Uint8Array(png)))!;
    expect(hue(palette.accent)).toBeGreaterThan(35);
    expect(hue(palette.accent)).toBeLessThan(55);
    expect(hue(palette.highlight)).toBeGreaterThan(325);
    expect(hue(palette.highlight)).toBeLessThan(350);
  });

  it('un archivo que no es imagen no frena nada: sin paleta', async () => {
    expect(await paletteFromImageBytes(new TextEncoder().encode('no soy una imagen'))).toBeNull();
  });
});

// ── Guardado ─────────────────────────────────────────────────────────────────

describe('paleta guardada', () => {
  const colors = { base: '#3E1A4A', accent: '#F2C14E', highlight: '#E0407F' };

  it('se normaliza a minúsculas y, sin origen, vale «portada»', () => {
    expect(parsePageantPalette(colors)).toEqual({ base: '#3e1a4a', accent: '#f2c14e', highlight: '#e0407f', source: 'portada' });
    expect(parsePageantPalette({ ...colors, source: 'manual' })?.source).toBe('manual');
    // Un origen raro no invalida los colores.
    expect(parsePageantPalette({ ...colors, source: 'inventado' })?.source).toBe('portada');
  });

  it('un dato raro es «sin paleta» (nunca un error al leer el sitio)', () => {
    for (const value of [null, undefined, {}, [], 'rojo', 12, { base: '#fff', accent: '#f2c14e', highlight: '#e0407f' }, { ...colors, accent: 'javascript:alert(1)' }, { base: '#000000' }]) {
      expect(parsePageantPalette(value)).toBeNull();
    }
  });

  it('el esquema guarda `{}` cuando no hay paleta (una columna JSON no admite null) y rechaza colores inválidos', () => {
    expect(pageantPaletteSchema.parse(null)).toEqual({});
    expect(pageantPaletteSchema.parse(undefined)).toEqual({});
    expect(pageantPaletteSchema.parse({})).toEqual({});
    expect(pageantPaletteSchema.parse(colors)).toMatchObject({ base: '#3e1a4a' });
    expect(pageantPaletteSchema.safeParse({ ...colors, accent: 'rojo' }).success).toBe(false);
    expect(pageantPaletteSchema.safeParse({ ...colors, highlight: '#e0407f; } body { display: none' }).success).toBe(false);
  });

  it('«Guardar el sitio público» acepta la paleta (y su ausencia)', () => {
    const base = { publicSiteEnabled: false, showCandidatesPublic: true, showSponsorsPublic: true, showVoteRankingPublic: false, showResultsPublic: false, sponsorLeadFormEnabled: true };
    expect(projectPublicSiteSchema.parse({ ...base, publicPalette: colors }).publicPalette).toMatchObject({ accent: '#f2c14e' });
    expect(projectPublicSiteSchema.parse({ ...base, publicPalette: null }).publicPalette).toEqual({});
    expect(projectPublicSiteSchema.parse(base).publicPalette).toEqual({});
    expect(projectPublicSiteSchema.safeParse({ ...base, publicPalette: { ...colors, base: 'azul' } }).success).toBe(false);
  });

  it('una portada nueva reemplaza los colores detectados pero no los ajustados a mano', () => {
    const detected: PageantPalette = { base: '#111111', accent: '#eeeeee', highlight: '#ff0000', source: 'portada' };
    const old: PageantPalette = { base: '#3e1a4a', accent: '#f2c14e', highlight: '#e0407f', source: 'portada' };
    const manual = withPaletteColor(old, 'accent', '#FFD700');
    expect(manual).toMatchObject({ accent: '#ffd700', source: 'manual' });
    expect(paletteAfterNewCover(null, detected)).toEqual({ palette: detected, applied: true });
    expect(paletteAfterNewCover(old, detected)).toEqual({ palette: detected, applied: true });
    expect(paletteAfterNewCover(manual, detected)).toEqual({ palette: manual, applied: false });
    // Una portada sin colores legibles no borra lo que había.
    expect(paletteAfterNewCover(old, null)).toEqual({ palette: old, applied: false });
    expect(paletteAfterNewCover(null, null)).toEqual({ palette: null, applied: false });
  });
});

// ── Derivación: el sitio siempre se lee ──────────────────────────────────────

const PALETTES: Record<string, PageantPalette> = {
  'ciruela, dorado y rosa': { base: '#4e2336', accent: '#f7cf6f', highlight: '#db3770', source: 'portada' },
  'todo blanco': { base: '#ffffff', accent: '#ffffff', highlight: '#ffffff', source: 'manual' },
  'todo negro': { base: '#000000', accent: '#000000', highlight: '#000000', source: 'manual' },
  'amarillo neón': { base: '#fff200', accent: '#fff200', highlight: '#fff200', source: 'manual' },
  'rojo puro': { base: '#ff0000', accent: '#ff0000', highlight: '#ff0000', source: 'manual' },
  'azul oscuro con acento oscuro': { base: '#0a1a3a', accent: '#1a2a5a', highlight: '#2a1a5a', source: 'manual' },
  'gris medio': { base: '#808080', accent: '#808080', highlight: '#808080', source: 'manual' },
  'verde y rosado': { base: '#1f5a3c', accent: '#ead39a', highlight: '#c2386f', source: 'manual' },
  'de fábrica': DEFAULT_MANUAL_PALETTE,
};

describe('del tono elegido a las variables del sitio', () => {
  it.each(Object.entries(PALETTES))('%s: todo texto cumple contraste AA y los colores son válidos', (_name, palette) => {
    const { main, deep, studio } = derivePaletteTokens(palette);
    const ON_NIGHT = '#f5f1e8';
    for (const vars of [main, deep]) {
      // El fondo siempre es noche: el texto marfil se lee sobre cada tono, el más claro incluido.
      for (const night of ['--night', '--night-2', '--night-3']) {
        expect(relativeLuminance(hexToRgb(vars[night]!))).toBeLessThan(0.05);
        expect(contrastRatio(ON_NIGHT, vars[night]!)).toBeGreaterThanOrEqual(12);
      }
      // El acento se lee como texto sobre la noche (títulos, enlaces, etiquetas).
      expect(contrastRatio(main['--a']!, vars['--night-3']!)).toBeGreaterThanOrEqual(4.5);
    }
    // Sobre el papel: tinta, tinta suave, aviso de error y acento oscuro.
    expect(contrastRatio(main['--ink']!, main['--paper']!)).toBeGreaterThanOrEqual(12);
    expect(contrastRatio(main['--ink-soft']!, main['--paper-2']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(main['--copihue']!, main['--paper-2']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(main['--a-deep']!, main['--paper-2']!)).toBeGreaterThanOrEqual(4.5);
    // El estudio visual (secciones claras): texto, y acento como enlace o botón con letra blanca.
    expect(contrastRatio(studio.text, studio.background)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(studio.primary, studio.background)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(studio.accent, studio.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', studio.accent)).toBeGreaterThanOrEqual(4.5);
    // Todo es un color válido: nunca un canal negativo ni fuera de 255.
    const hexes = [...Object.entries(main), ...Object.entries(deep)].filter(([name]) => !name.endsWith('-rgb') && !name.startsWith('--line')).map(([, value]) => value);
    for (const hex of [...hexes, studio.primary, studio.accent, studio.background, studio.text]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    for (const [name, value] of [...Object.entries(main), ...Object.entries(deep)].filter(([key]) => key.endsWith('-rgb'))) {
      const channels = value.split(', ').map(Number);
      expect([name, channels.length]).toEqual([name, 3]);
      for (const channel of channels) expect(Number.isInteger(channel) && channel >= 0 && channel <= 255).toBe(true);
    }
  });

  it('cada color se queda en su familia: el acento dorado sigue dorado y el fondo violeta, violeta', () => {
    const { main } = derivePaletteTokens({ base: '#3e1a4a', accent: '#f2c14e', highlight: '#e0407f', source: 'portada' });
    expect(hue(main['--a']!)).toBeGreaterThan(35);
    expect(hue(main['--a']!)).toBeLessThan(60);
    expect(hue(main['--night']!)).toBeGreaterThan(260);
    expect(hue(main['--night']!)).toBeLessThan(310);
  });

  it('las secciones profundas toman el tono del destaque (alternan con el fondo)', () => {
    const { main, deep } = derivePaletteTokens({ base: '#16205a', accent: '#e9d2a0', highlight: '#b3243f', source: 'manual' });
    expect(main['--night']).not.toBe(deep['--night']);
    expect(hue(deep['--night']!)).toBeGreaterThan(330);
  });
});

describe('hoja de estilos de la paleta', () => {
  const palette = PALETTES['ciruela, dorado y rosa']!;

  it('sin paleta no hay hoja', () => {
    expect(pageantPaletteCss(null)).toBe('');
    expect(pageantPaletteCss({})).toBe('');
    expect(pageantPaletteCss('rojo')).toBe('');
  });

  it('pinta el contenedor, las secciones profundas y el pie', () => {
    const css = pageantPaletteCss(palette);
    expect(css).toContain('.pgs[data-palette] {');
    expect(css).toContain('.pgs[data-palette] .pgs-section.is-deep, .pgs[data-palette] .pgs-footer {');
    expect(css).toContain('--a:');
    expect(css).toContain('--night-rgb:');
  });

  it('solo contiene colores calculados: nada escrito por el usuario entra en la hoja', () => {
    const css = pageantPaletteCss(palette);
    expect(css).not.toMatch(/<|\/\*|@import|url\(|`|"|javascript:/i);
    expect(pageantPaletteCss({ ...palette, base: '#000000; } body { display: none' })).toBe('');
    expect(pageantPaletteCss({ ...palette, accent: 'red; position: fixed' })).toBe('');
  });

  it('cada variable y cada selector que reemplaza existe en la hoja base del sitio', () => {
    const { main, deep } = derivePaletteTokens(palette);
    for (const name of new Set([...Object.keys(main), ...Object.keys(deep)])) expect(PAGEANT_SITE_STYLES).toContain(`${name}:`);
    for (const selector of ['.pgs-section.is-deep', '.pgs-footer', '.pgs-apply-glow', '.aether-platform-badge']) expect(PAGEANT_SITE_STYLES).toContain(selector);
    // La página de postulación comparte la hoja del sitio y trae sus propios detalles.
    expect(REGISTRATION_STYLES).toContain('.cand-sticky');
  });

  it('el tema del estudio cambia solo los cuatro colores', () => {
    const theme = { primary: '#12161f', accent: '#a98530', background: '#ffffff', text: '#1f2933', font: 'inter', radius: 'soft' };
    expect(applyPaletteToStudioTheme(theme, null)).toBe(theme);
    expect(applyPaletteToStudioTheme(theme, {})).toBe(theme);
    const painted = applyPaletteToStudioTheme(theme, palette);
    expect(painted).toMatchObject({ font: 'inter', radius: 'soft' });
    expect(painted.primary).not.toBe(theme.primary);
    expect(painted).toMatchObject(derivePaletteTokens(palette).studio);
  });
});

// ── En el sitio y en el editor ───────────────────────────────────────────────

function render(site: ReturnType<typeof baseSite>) {
  const view = buildPageantView(site, new Date('2026-09-30T12:00:00Z'), 'https://ejemplo.cl', formatCurrency);
  return renderToStaticMarkup(<PageantPage site={site} view={view} />);
}

describe('micrositio con paleta', () => {
  const palette = PALETTES['ciruela, dorado y rosa']!;

  it('sin paleta se dibuja exactamente como antes', () => {
    const html = render(baseSite());
    expect(html).not.toContain('data-palette');
    expect(html).not.toContain('.pgs[data-palette]');
    expect(html).toContain('data-accent="gold"');
  });

  it('con paleta marca el sitio y suma su hoja DESPUÉS de la hoja base', () => {
    const html = render(baseSite({ palette }));
    expect(html).toContain('data-palette="custom"');
    const base = html.indexOf('.pgs {');
    const painted = html.indexOf('.pgs[data-palette] {');
    expect(base).toBeGreaterThan(-1);
    expect(painted).toBeGreaterThan(base);
    expect(html).toContain(`--a:${derivePaletteTokens(palette).main['--a']}`.replace(':', ': '));
  });

  it('manda sobre un acento prediseñado (la paleta se pinta aunque el sitio tenga «primavera»)', () => {
    const html = render(baseSite({ accent: 'primavera', palette }));
    expect(html).toContain('data-accent="primavera"');
    expect(html.indexOf('.pgs[data-palette] {')).toBeGreaterThan(html.indexOf(".pgs[data-accent='primavera']"));
  });

  it('las secciones del estudio toman los colores de la paleta', () => {
    const block = { ...sampleBlock('text', layoutsOf('text')[0]!.value), id: 'b1' };
    const site = baseSite({ palette, creative: pageantSiteDesignSchema.parse({ enabled: true, blocks: [block] }) });
    const html = render(site).toLowerCase();
    const { studio } = derivePaletteTokens(palette);
    expect(html).toContain(studio.primary);
    expect(html).toContain(studio.background);
    // Con el mismo diseño y sin paleta, el estudio conserva su tema.
    expect(render(baseSite({ creative: site.creative })).toLowerCase()).not.toContain(studio.primary);
  });

  it('el editor visual pinta el borrador de la paleta sin guardarla', () => {
    const draft = pageantEditorDraftSchema.parse({ design: pageantSiteDesignSchema.parse({}), palette });
    expect(applyDraftToSite(baseSite(), draft).palette).toEqual(palette);
    // Un borrador sin paleta, o con una inválida, deja el sitio sin ella.
    expect(applyDraftToSite(baseSite({ palette }), pageantEditorDraftSchema.parse({ design: pageantSiteDesignSchema.parse({}) })).palette).toBeNull();
    expect(applyDraftToSite(baseSite(), pageantEditorDraftSchema.parse({ design: pageantSiteDesignSchema.parse({}), palette: { base: 'azul' } })).palette).toBeNull();
  });
});

describe('selector «Colores del sitio»', () => {
  it('con paleta muestra los tres colores, su origen y la vista previa', async () => {
    const { PalettePicker } = await import('@/components/projects/PalettePicker');
    const palette = PALETTES['ciruela, dorado y rosa']!;
    const html = renderToStaticMarkup(<PalettePicker projectId="p1" value={palette} onChange={() => undefined} coverImageUrl="https://x/pageant-covers/c/p.jpg" />);
    for (const label of ['Fondo', 'Acento', 'Destaque']) expect(html).toContain(label);
    expect(html.match(/type="color"/g)).toHaveLength(3);
    for (const hex of [palette.base, palette.accent, palette.highlight]) expect(html).toContain(hex);
    expect(html).toContain('Detectados de la portada.');
    expect(html).toContain('Detectar desde la portada');
    expect(html).toContain('Usar el acento prediseñado');
  });

  it('sin paleta ofrece detectar o elegir a mano, y sin portada no se puede detectar', async () => {
    const { PalettePicker } = await import('@/components/projects/PalettePicker');
    const html = renderToStaticMarkup(<PalettePicker projectId="p1" value={null} onChange={() => undefined} coverImageUrl="" />);
    expect(html).toContain('Elegir colores a mano');
    expect(html).not.toContain('type="color"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<svg[\s\S]*?<\/svg>)?Detectar desde la portada/);
  });

  it('quien no puede editar solo mira: sin botones ni selectores activos', async () => {
    const { PalettePicker } = await import('@/components/projects/PalettePicker');
    const html = renderToStaticMarkup(<PalettePicker projectId="p1" value={{ ...DEFAULT_MANUAL_PALETTE }} onChange={() => undefined} coverImageUrl="" disabled />);
    expect(html).not.toContain('Detectar desde la portada');
    expect(html).not.toContain('Usar el acento prediseñado');
    expect(html.match(/type="color"[^>]*disabled/g)).toHaveLength(3);
    expect(html).toContain('Ajustados a mano');
  });
});
