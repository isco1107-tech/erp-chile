import { z } from 'zod';

/**
 * Paleta del micrositio del certamen: tres colores sacados de la portada que
 * sube la organización (o elegidos a mano) con los que se pinta TODO el sitio.
 *
 * - `base`: el tono profundo del fondo (de la portada: el violeta, el azul noche…).
 * - `accent`: el tono luminoso de títulos, botones y detalles (el «dorado» del sitio).
 * - `highlight`: el color de apoyo: halos, secciones alternadas, avisos de error.
 *
 * El sitio es una «gala nocturna» (fondo oscuro, texto marfil). Por eso lo que
 * se guarda es el color que la persona ve en su portada y lo que se pinta sale
 * de DERIVARLO (`derivePaletteTokens`): el fondo siempre queda oscuro, el acento
 * siempre luminoso y todo par texto/fondo cumple contraste WCAG AA. Un color
 * elegido a ciegas, o detectado de un logo claro, no puede dejar el sitio
 * ilegible.
 *
 * Lógica pura (sin I/O): la usan el servidor (detectar desde la imagen), el
 * navegador (ajustar y previsualizar) y la hoja de estilos del sitio. Las
 * mismas funciones corren en los tres lados, así lo que se previsualiza es lo
 * que se publica. La hoja que sale (`pageantPaletteCss`) solo contiene colores
 * validados `#rrggbb`: nunca un texto escrito por la persona.
 */

export const PALETTE_ROLES = ['base', 'accent', 'highlight'] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

export const PALETTE_ROLE_INFO: Record<PaletteRole, { label: string; description: string }> = {
  base: { label: 'Fondo', description: 'El tono profundo de las secciones oscuras. Se oscurece solo para que el texto se lea bien.' },
  accent: { label: 'Acento', description: 'El tono luminoso de títulos, botones y detalles (el «dorado» del sitio).' },
  highlight: { label: 'Destaque', description: 'El color de apoyo: halos de luz, secciones alternadas y avisos de error.' },
};

/** De dónde salieron los colores: detectados de la portada o ajustados a mano (una portada nueva no pisa lo manual). */
export const PALETTE_SOURCES = ['portada', 'manual'] as const;
export type PaletteSource = (typeof PALETTE_SOURCES)[number];

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const hexSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR, 'Color inválido')
  .transform((value) => value.toLowerCase());

const paletteColorsSchema = z.object({
  base: hexSchema,
  accent: hexSchema,
  highlight: hexSchema,
  source: z.enum(PALETTE_SOURCES).catch('portada').default('portada'),
});
export type PageantPalette = z.infer<typeof paletteColorsSchema>;

function isEmptyPalette(value: unknown): boolean {
  return value == null || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
}

/**
 * Lo que se guarda en `Project.publicPalette` (JSON): los tres colores o `{}`
 * cuando no hay paleta (vale el acento prediseñado). Como `publicTypography`,
 * nunca `null`: una columna JSON de Prisma no admite `null` suelto.
 */
export const pageantPaletteSchema = z
  .preprocess((value) => (isEmptyPalette(value) ? null : value), paletteColorsSchema.nullable())
  .transform((palette): PageantPalette | Record<string, never> => palette ?? {});

/** Lo guardado (o un borrador) → paleta válida o `null`. Lee con tolerancia: un dato raro es «sin paleta». */
export function parsePageantPalette(value: unknown): PageantPalette | null {
  if (isEmptyPalette(value)) return null;
  const parsed = paletteColorsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Punto de partida de quien prefiere elegir los colores a mano: el aspecto de fábrica del sitio (noche índigo, champaña y copihue). */
export const DEFAULT_MANUAL_PALETTE: PageantPalette = { base: '#16205a', accent: '#e9d2a0', highlight: '#b3243f', source: 'manual' };

/** Cambia el color de un rol: la paleta pasa a ser «a mano» (una portada nueva ya no la pisa). */
export function withPaletteColor(palette: PageantPalette, role: PaletteRole, hex: string): PageantPalette {
  return { ...palette, [role]: hex.toLowerCase(), source: 'manual' };
}

/**
 * Qué paleta queda al subir una portada nueva. Lo que la persona ajustó a mano
 * no se pisa solo (cambiar la foto no debe borrar sus colores): para eso está
 * «Detectar desde la portada». Una portada sin colores legibles tampoco borra
 * la paleta que ya había.
 */
export function paletteAfterNewCover(current: PageantPalette | null, detected: PageantPalette | null): { palette: PageantPalette | null; applied: boolean } {
  if (!detected) return { palette: current, applied: false };
  if (current?.source === 'manual') return { palette: current, applied: false };
  return { palette: { ...detected, source: 'portada' }, applied: true };
}

// ---------------------------------------------------------------------------
// Color: hex ↔ sRGB ↔ OKLab/OKLCH (espacio perceptual: «parecido» = cerca)
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];
interface Lab {
  L: number;
  a: number;
  b: number;
}
interface Lch {
  L: number;
  C: number;
  /** Matiz en grados, [0, 360). */
  h: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = HEX_COLOR.test(hex) ? hex : '#000000';
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055) * 255;

function rgbToLab([r, g, b]: Rgb): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function labToLinear({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function lchOf(rgb: Rgb): Lch {
  const { L, a, b } = rgbToLab(rgb);
  const C = Math.hypot(a, b);
  return { L, C, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

const inGamut = (linear: readonly number[]) => linear.every((c) => c >= -0.0004 && c <= 1.0004);

/** OKLCH → sRGB. Si el color pedido no existe en pantalla se le baja la intensidad (nunca el tono ni la luz). */
function rgbOf({ L, C, h }: Lch): Rgb {
  if (L <= 0) return [0, 0, 0];
  if (L >= 1) return [255, 255, 255];
  const at = (chroma: number) => {
    const rad = (h * Math.PI) / 180;
    return labToLinear({ L, a: chroma * Math.cos(rad), b: chroma * Math.sin(rad) });
  };
  let linear = at(C);
  if (!inGamut(linear)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    linear = at(lo);
  }
  return [clamp(fromLinear(linear[0]), 0, 255), clamp(fromLinear(linear[1]), 0, 255), clamp(fromLinear(linear[2]), 0, 255)];
}

const hexOf = (lch: Lch) => rgbToHex(rgbOf(lch));
const channels = (rgb: Rgb) => rgb.map((v) => Math.round(v)).join(', ');

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Luminancia relativa WCAG. */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

/** Razón de contraste WCAG entre dos colores `#rrggbb` (1 a 21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(hexToRgb(foreground));
  const b = relativeLuminance(hexToRgb(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Mueve la luz de `lch` (sin tocar tono ni intensidad pedidos) hasta que contraste `min` con `background`. */
function withContrast(lch: Lch, background: string, min: number, toward: 'lighter' | 'darker'): Lch {
  const step = toward === 'lighter' ? 0.01 : -0.01;
  let current = lch;
  for (let i = 0; i < 100; i++) {
    if (contrastRatio(hexOf(current), background) >= min) return current;
    const next = clamp(current.L + step, 0, 1);
    if (next === current.L) break;
    current = { ...current, L: next };
  }
  return current;
}

// ---------------------------------------------------------------------------
// Detección: los tres colores principales de una imagen
// ---------------------------------------------------------------------------

interface Cluster extends Lch {
  a: number;
  b: number;
  weight: number;
}

/** Radio (en OKLab) dentro del cual dos colores cuentan como «el mismo» al agrupar. */
const CLUSTER_RADIUS = 0.085;
const MAX_CLUSTERS = 16;
/** Intensidad desde la que un color se ve como color y no como gris. */
const CHROMATIC = 0.07;
/** Por debajo de esto, un color es oscuro (candidato a fondo). */
const DARK_L = 0.5;
/** Superficie mínima (1 %) para que un color vivo cuente: los bordes suavizados de las letras no son colores de la marca. */
const MIN_ACCENT_WEIGHT = 0.01;

function clusterColors(pixels: ArrayLike<number>): Cluster[] {
  // Histograma de 5 bits por canal: unos miles de colores en vez de un millón de píxeles.
  const histogram = new Map<number, number>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];

  // Más frecuentes primero (y por clave al empatar): el resultado no depende del orden de los píxeles.
  const bins = [...histogram.entries()]
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .map(([key, count]) => ({ lab: rgbToLab([((key >> 10) << 3) + 4, (((key >> 5) & 31) << 3) + 4, ((key & 31) << 3) + 4]), count }));

  const distance = (p: Lab, q: Lab) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
  const centers: Lab[] = [];
  for (const bin of bins) {
    const near = centers.some((center) => distance(center, bin.lab) <= CLUSTER_RADIUS);
    if (!near && centers.length < MAX_CLUSTERS) centers.push(bin.lab);
  }

  // Afinado: cada color al centro más cercano y el centro pasa a ser el promedio ponderado de los suyos.
  let current = centers;
  for (let pass = 0; pass < 3; pass++) {
    const sums = current.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (const bin of bins) {
      let best = 0;
      let bestDistance = Infinity;
      current.forEach((center, index) => {
        const d = distance(center, bin.lab);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      const sum = sums[best];
      sum.L += bin.lab.L * bin.count;
      sum.a += bin.lab.a * bin.count;
      sum.b += bin.lab.b * bin.count;
      sum.n += bin.count;
    }
    current = sums.map((sum, index) => (sum.n > 0 ? { L: sum.L / sum.n, a: sum.a / sum.n, b: sum.b / sum.n } : current[index]));
    if (pass === 2) {
      return sums
        .map((sum, index) => {
          const lab = current[index];
          const C = Math.hypot(lab.a, lab.b);
          return { ...lab, C, h: ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360, weight: sum.n / total };
        })
        .filter((cluster) => cluster.weight > 0)
        .sort((x, y) => y.weight - x.weight);
    }
  }
  return [];
}

const clusterHex = (cluster: Cluster) => hexOf({ L: cluster.L, C: cluster.C, h: cluster.h });

/**
 * Los tres colores principales de una imagen a partir de sus píxeles RGBA
 * (reducidos a unos pocos miles: ver `pageant-palette-image.ts`). Devuelve
 * `null` si no hay ningún píxel visible.
 *
 * Qué NO se hace: promediar la imagen (daría un marrón sucio) ni quedarse con
 * los tres colores más frecuentes (en un logo el fondo ocupa casi todo y el
 * dorado de las letras, que es lo que identifica a la marca, queda afuera).
 * Se agrupan los colores parecidos y cada rol se elige con su propio criterio:
 *   - fondo: el color oscuro que más superficie ocupa;
 *   - acento: el más luminoso y vivo (pesa la superficie, pero menos que el brillo);
 *   - destaque: el más vivo de otro tono que el acento.
 * Con una imagen sin colores vivos (un logo en blanco y negro) sale una paleta
 * sobria derivada de sus grises, no colores inventados.
 */
export function extractPalette(pixels: ArrayLike<number>): PageantPalette | null {
  const clusters = clusterColors(pixels);
  if (clusters.length === 0) return null;

  // ── Fondo ────────────────────────────────────────────────────────────────
  const darks = clusters.filter((cluster) => cluster.L < DARK_L);
  const chromatics = clusters.filter((cluster) => cluster.C >= CHROMATIC);
  const seed = darks[0] ?? chromatics[0] ?? clusters[clusters.length - 1];
  // Los oscuros del mismo tono que el principal (vinos y violetas de un mismo degradado) cuentan como UN fondo.
  const family = (darks.length > 0 ? darks : [seed]).filter((cluster) => cluster === seed || cluster.C < 0.03 || seed.C < 0.03 || hueDistance(cluster.h, seed.h) <= 45);
  const familyWeight = family.reduce((sum, cluster) => sum + cluster.weight, 0);
  const mean = (pick: (cluster: Cluster) => number) => family.reduce((sum, cluster) => sum + pick(cluster) * cluster.weight, 0) / familyWeight;
  const baseLab = { L: mean((c) => c.L), a: mean((c) => c.a), b: mean((c) => c.b) };
  const base: Lch = { L: baseLab.L, C: Math.hypot(baseLab.a, baseLab.b), h: ((Math.atan2(baseLab.b, baseLab.a) * 180) / Math.PI + 360) % 360 };

  // ── Acento y destaque ────────────────────────────────────────────────────
  const vivid = clusters.filter((cluster) => cluster.C >= CHROMATIC && cluster.L >= 0.42 && cluster.L <= 0.97 && cluster.weight >= MIN_ACCENT_WEIGHT);
  // La superficie pesa poco (raíz quinta): el brillo y lo vivo de un color mandan más que cuánto ocupa.
  const brightness = (cluster: Cluster) => 0.3 + 0.7 * clamp((cluster.L - 0.4) / 0.45, 0, 1) ** 2;
  const score = (cluster: Cluster) => cluster.weight ** 0.3 * cluster.C * brightness(cluster);
  const ranked = [...vivid].sort((x, y) => score(y) - score(x));
  const accentCluster = ranked[0] ?? null;
  const highlightCluster = accentCluster ? (ranked.find((cluster) => hueDistance(cluster.h, accentCluster.h) >= 35) ?? null) : null;

  let accent: Lch;
  if (accentCluster) {
    accent = accentCluster;
  } else {
    // Sin colores vivos y luminosos: el más claro de la imagen (un logo en blanco y negro da un plateado).
    const lightest = [...clusters].sort((x, y) => y.L - x.L)[0];
    accent = { L: Math.max(lightest.L, 0.78), C: lightest.C, h: lightest.h };
  }
  // Un solo tono en toda la imagen: el destaque es el mismo tono más profundo (nada de matices inventados).
  const highlight: Lch = highlightCluster ?? { L: clamp(accent.L - 0.14, 0.45, 0.75), C: accent.C, h: accent.h };

  return { base: hexOf(base), accent: hexOf(accent), highlight: hexOf(highlight), source: 'portada' };
}

// ---------------------------------------------------------------------------
// Derivación: de tres colores a las variables del sitio
// ---------------------------------------------------------------------------

/** Contraste mínimo (WCAG AA) del texto normal. */
const AA = 4.5;

export interface PaletteTokens {
  /** Variables CSS de todo el sitio (`.pgs`). */
  main: Record<string, string>;
  /** Variables de las secciones profundas y el pie, que alternan con las del fondo. */
  deep: Record<string, string>;
  /** Para el estudio visual (secciones claras con su propio tema). */
  studio: { primary: string; accent: string; background: string; text: string };
  /** Cómo se ve cada rol en el sitio (la vista previa del editor y la imagen para compartir). */
  swatches: { night: string; night2: string; accent: string; accentMid: string; highlight: string; paper: string };
}

interface Shades {
  night: Lch;
  hueBase: number;
  chroma: number;
}

function nightShades(source: Lch, floor: number, cap: number): Shades {
  return { night: { L: 0.165, C: clamp(source.C, floor, cap), h: source.h }, hueBase: source.h, chroma: clamp(source.C, floor, cap) };
}

function surfaceVars(shades: Shades, glows: [Lch, Lch, Lch]): Record<string, string> {
  const at = (L: number, boost = 1): Lch => ({ L, C: shades.chroma * boost, h: shades.hueBase });
  return {
    '--night': hexOf(at(0.165)),
    '--night-2': hexOf(at(0.215, 1.05)),
    '--night-3': hexOf(at(0.27, 1.1)),
    '--night-rgb': channels(rgbOf(at(0.165))),
    '--panel-rgb': channels(rgbOf(at(0.185))),
    '--panel-2-rgb': channels(rgbOf(at(0.245, 1.05))),
    '--panel-3-rgb': channels(rgbOf(at(0.225, 1.05))),
    '--glow-rgb': channels(rgbOf(glows[0])),
    '--glow-2-rgb': channels(rgbOf(glows[1])),
    '--glow-3-rgb': channels(rgbOf(glows[2])),
  };
}

/** Todas las variables del sitio para una paleta. Cada par texto/fondo se comprueba contra WCAG AA. */
export function derivePaletteTokens(palette: PageantPalette): PaletteTokens {
  const base = lchOf(hexToRgb(palette.base));
  const accent = lchOf(hexToRgb(palette.accent));
  const highlight = lchOf(hexToRgb(palette.highlight));

  // Un gris (logo sin color) no se tiñe de ningún tono: queda un fondo sobrio.
  const baseShades = nightShades(base, base.C < 0.02 ? 0 : 0.03, 0.06);
  const nightHex = hexOf(baseShades.night);
  // Las secciones profundas toman el tono del destaque: alternan con el fondo y dan ritmo al sitio.
  const deepShades = nightShades(highlight, highlight.C < 0.02 ? 0 : 0.045, 0.07);

  // Acento: la misma familia en cuatro luces (de la sombra al brillo): es el degradado «metálico» de los títulos.
  const ca = Math.min(accent.C, 0.14);
  const a: Lch = withContrast({ L: clamp(accent.L, 0.78, 0.88), C: ca, h: accent.h }, nightHex, 7, 'lighter');
  const aBright: Lch = { L: Math.min(0.95, a.L + 0.08), C: ca * 0.55, h: accent.h };
  const aMid: Lch = { L: 0.66, C: ca * 0.95, h: accent.h };
  const aDeep: Lch = { L: 0.5, C: ca * 0.8, h: accent.h };

  // Hojas claras (secciones «papel» e inscripción): un blanco con un asomo del tono del fondo y tinta casi negra.
  const tint = base.C < 0.02 ? 0 : clamp(base.C * 0.12, 0.004, 0.014);
  const paper: Lch = { L: 0.985, C: tint, h: base.h };
  const paper2: Lch = { L: 0.955, C: tint * 1.7, h: base.h };
  const ink: Lch = { L: 0.2, C: base.C < 0.02 ? 0 : clamp(base.C * 0.5, 0.02, 0.05), h: base.h };
  const paper2Hex = hexOf(paper2);
  const inkSoft: Lch = withContrast({ L: 0.45, C: ink.C * 0.7, h: base.h }, paper2Hex, AA, 'darker');
  // Destaque sobre el papel (mensajes de error de los formularios): tiene que leerse.
  const copihue: Lch = withContrast({ L: 0.52, C: clamp(highlight.C, 0.1, 0.19), h: highlight.h }, paper2Hex, AA, 'darker');
  const aDeepOnPaper: Lch = withContrast(aDeep, paper2Hex, AA, 'darker');

  const aHex = hexOf(a);
  const common: Record<string, string> = {
    '--a': aHex,
    '--a-bright': hexOf(aBright),
    '--a-mid': hexOf(aMid),
    '--a-deep': hexOf(aDeepOnPaper),
    '--line-night': `rgba(${channels(rgbOf(a))}, 0.18)`,
    '--copihue': hexOf(copihue),
  };

  const glowAccent: Lch = { L: 0.72, C: Math.min(ca, 0.12), h: accent.h };
  const glowHighlight: Lch = { L: 0.6, C: clamp(highlight.C, 0.13, 0.2), h: highlight.h };
  const glowDeep: Lch = { L: 0.5, C: clamp(highlight.C, 0.12, 0.2), h: highlight.h };

  const main: Record<string, string> = {
    ...surfaceVars(baseShades, [glowHighlight, glowAccent, glowDeep]),
    ...common,
    '--paper': hexOf(paper),
    '--paper-2': paper2Hex,
    '--ink': hexOf(ink),
    '--ink-soft': hexOf(inkSoft),
    '--line-paper': `rgba(${channels(rgbOf(ink))}, 0.12)`,
  };
  const deep: Record<string, string> = {
    ...surfaceVars(deepShades, [glowAccent, { L: 0.76, C: Math.min(ca, 0.1), h: accent.h }, glowHighlight]),
    '--line-night': common['--line-night'],
  };

  // Estudio visual: sus secciones son claras. Primario = el fondo en un tono rico; acento = el destaque, oscurecido hasta leerse sobre el papel.
  const studioBackground = hexOf(paper);
  const studioPrimary = hexOf({ L: 0.34, C: clamp(base.C, base.C < 0.02 ? 0 : 0.06, 0.12), h: base.h });
  const studioAccent = hexOf(withContrast({ L: 0.55, C: clamp(highlight.C, 0.1, 0.19), h: highlight.h }, studioBackground, AA, 'darker'));
  const studioText = hexOf(ink);

  return {
    main,
    deep,
    studio: { primary: studioPrimary, accent: studioAccent, background: studioBackground, text: studioText },
    swatches: { night: nightHex, night2: main['--night-2'], accent: aHex, accentMid: main['--a-mid'], highlight: hexOf(glowHighlight), paper: studioBackground },
  };
}

const block = (vars: Record<string, string>) => Object.entries(vars).map(([name, value]) => `${name}: ${value};`).join(' ');

/** Atributo que activa la hoja de `pageantPaletteCss` en el contenedor `.pgs`. */
export const PAGEANT_PALETTE_ATTRIBUTE = 'data-palette';

/**
 * Hoja de estilos de la paleta ('' sin paleta). Va DESPUÉS de la hoja base y
 * con selectores de igual o mayor peso, así reemplaza tanto los colores de
 * fábrica como un acento prediseñado. Solo contiene colores derivados de
 * `#rrggbb` ya validados.
 */
export function pageantPaletteCss(value: unknown): string {
  const palette = parsePageantPalette(value);
  if (!palette) return '';
  const { main, deep } = derivePaletteTokens(palette);
  const root = `.pgs[${PAGEANT_PALETTE_ATTRIBUTE}]`;
  const glow = `rgba(${main['--glow-3-rgb']}, 0.45)`;
  return [
    `${root} { ${block(main)} }`,
    `${root} .pgs-section.is-deep, ${root} .pgs-footer { ${block(deep)} }`,
    // Estos detalles traían un rojo y un índigo fijos.
    `${root} .pgs-apply-glow { background: radial-gradient(closest-side, ${glow}, transparent); }`,
    // La barra fija de la página de postulación (misma hoja del sitio): su fondo era un índigo fijo.
    `${root} .cand-sticky { background: rgba(${main['--night-rgb']}, 0.9); }`,
    `${root} ~ .aether-platform-badge { background: rgba(${main['--panel-rgb']}, 0.72) !important; }`,
    `${root} ~ .aether-platform-badge:hover { background: rgba(${main['--panel-2-rgb']}, 0.9) !important; }`,
  ].join('\n');
}

/** El tema del estudio visual con los colores de la paleta (solo los cuatro colores; tipografía y formas quedan). */
export function applyPaletteToStudioTheme<T extends { primary: string; accent: string; background: string; text: string }>(theme: T, value: unknown): T {
  const palette = parsePageantPalette(value);
  if (!palette) return theme;
  return { ...theme, ...derivePaletteTokens(palette).studio };
}
