import { z } from 'zod';
import { FONT_OPTIONS, FONT_STACKS } from '@/lib/web-sites/theme';
import { CORMORANT_ITALIC_METRIC, PAGEANT_FONT_METRICS, type PageantFontMetric, type PageantWidths } from './pageant-font-metrics';

/**
 * Tipografía del micrositio del certamen, elegida por bloque de texto.
 *
 * El sitio trae tres familias de fábrica (Italiana para títulos, Cormorant
 * Garamond para cursivas y cifras, Karla para el texto). Cada una se puede
 * cambiar para TODO el sitio (`PAGEANT_FONT_ROLES`) y, además, cada bloque de
 * texto (`PAGEANT_TEXT_BLOCKS`) puede usar una propia; lo que no se elige queda
 * como estaba, así un certamen guardado antes de existir esto se ve igual.
 *
 * Las fuentes son la lista cerrada del constructor de sitios web
 * (`FONT_STACKS`, autoalojadas por `next/font` en `site-fonts.ts`) más las tres
 * de fábrica. La hoja de estilos que arma `pageantTypographyCss` sale solo de
 * claves validadas contra esa lista: nunca un texto escrito por el usuario.
 *
 * El diseño se calculó para las de fábrica (Italiana es angosta): una fuente
 * más ancha partiría palabras o se saldría en un teléfono. Por eso cada bloque
 * dice contra qué fuente y qué texto se mide (`reference`, `fit`) y, si la
 * elegida es más ancha, se achica lo justo con `font-size-adjust`, usando las
 * métricas reales de `pageant-font-metrics.ts`. Una más angosta no se agranda.
 */

const PAGEANT_ORIGINAL_FONTS = {
  italiana: { label: 'Italiana', description: 'La de fábrica para títulos: fina y de gala.', css: "var(--pgs-display), 'Didot', 'Bodoni 72', Georgia, serif" },
  karla: { label: 'Karla', description: 'La de fábrica para el texto: limpia y legible.', css: "var(--pgs-body), system-ui, -apple-system, 'Segoe UI', sans-serif" },
  cormorant: { label: 'Cormorant Garamond', description: 'La de fábrica para cursivas y cifras: fina y sofisticada.', css: "var(--pgs-serif), 'Cormorant Garamond', Georgia, serif" },
} as const;

/** `cormorant` ya está entre las de fábrica (con su cursiva real): no se repite. */
const SITE_FONTS = FONT_OPTIONS.filter((key) => key !== 'cormorant');

export const PAGEANT_FONT_KEYS = ['italiana', 'cormorant', 'karla', ...SITE_FONTS] as const;
export type PageantFontKey = (typeof PAGEANT_FONT_KEYS)[number];

export interface PageantFontInfo {
  label: string;
  description: string;
  css: string;
  /** Se ve mal en párrafos largos: solo para títulos y frases cortas. */
  headingOnly: boolean;
}

export function pageantFontInfo(key: PageantFontKey): PageantFontInfo {
  if (key in PAGEANT_ORIGINAL_FONTS) {
    const font = PAGEANT_ORIGINAL_FONTS[key as keyof typeof PAGEANT_ORIGINAL_FONTS];
    return { ...font, headingOnly: key === 'italiana' };
  }
  const font = FONT_STACKS[key as (typeof SITE_FONTS)[number]];
  return { label: font.label, description: font.description, css: font.css, headingOnly: Boolean(font.headingOnly) };
}

/** Fuentes que sirven para texto largo (párrafos). */
export const PAGEANT_TEXT_FONT_KEYS = PAGEANT_FONT_KEYS.filter((key) => !pageantFontInfo(key).headingOnly);

// ── Familias generales ───────────────────────────────────────────────────────

/** Contra qué se compara el ancho: la fuente de fábrica del bloque (la cursiva de Cormorant es más angosta). */
type Reference = 'italiana' | 'karla' | 'cormorant' | 'cormorant-italic';
/** Qué texto se mide: corrido, en mayúsculas, ambos (el más exigente) o cifras. */
type Fit = 'text' | 'caps' | 'mixed' | 'digits';

export const PAGEANT_FONT_ROLES = [
  { key: 'display', label: 'Títulos', hint: 'Nombre del certamen, títulos de sección, nombres y letra capital, salvo los bloques que elijan otra.', defaultFont: 'italiana', cssVar: '--display', longText: false, reference: 'italiana', fit: 'mixed', bold: false },
  { key: 'serif', label: 'Cursivas y frases', hint: 'Frase principal, primer párrafo, palabras en cursiva y cifras.', defaultFont: 'cormorant', cssVar: '--serif', longText: false, reference: 'cormorant-italic', fit: 'mixed', bold: false },
  { key: 'sans', label: 'Texto, botones y menú', hint: 'Párrafos, botones, etiquetas y formularios.', defaultFont: 'karla', cssVar: '--sans', longText: true, reference: 'karla', fit: 'mixed', bold: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; hint: string; defaultFont: PageantFontKey; cssVar: string; longText: boolean; reference: Reference; fit: Fit; bold: boolean }>;

export type PageantFontRole = (typeof PAGEANT_FONT_ROLES)[number]['key'];

// ── Bloques de texto ─────────────────────────────────────────────────────────

interface TextBlockDef {
  key: string;
  label: string;
  hint: string;
  /** Familia general que usa el bloque cuando no tiene una propia. */
  inherits: PageantFontRole;
  /** Selectores del bloque dentro de `.pgs` (ver `styles.ts`). */
  selectors: readonly string[];
  /** En vez de selectores, la variable de CSS que lee el bloque. */
  cssVar?: string;
  longText: boolean;
  reference: Reference;
  fit: Fit;
  /** Se escribe en negrita (botones, etiquetas): se compara también el ancho en negrita. */
  bold?: boolean;
}

export const PAGEANT_TEXT_BLOCKS = [
  { key: 'heroTitle', label: 'Nombre del certamen (portada)', hint: 'El nombre gigante de la portada. Se achica solo si la fuente es más ancha.', inherits: 'display', selectors: ['.pgs-title-main', '.pgs-title-lead'], longText: false, reference: 'italiana', fit: 'mixed' },
  { key: 'heroCall', label: 'Llamado de la portada', hint: 'La línea grande bajo el nombre («Postula y sé la próxima reina»).', inherits: 'display', selectors: ['.pgs-hero-call'], longText: false, reference: 'italiana', fit: 'mixed' },
  { key: 'tagline', label: 'Frase principal', hint: 'La frase en cursiva de la portada.', inherits: 'serif', selectors: ['.pgs-tagline'], longText: false, reference: 'cormorant-italic', fit: 'text' },
  { key: 'kickers', label: 'Etiquetas sobre los títulos', hint: 'Las mayúsculas chicas como «El certamen» (el número usa «Cifras»).', inherits: 'sans', selectors: ['.pgs-kicker', '.pgs-hero-eyebrow', '.pgs-eyebrow'], longText: false, reference: 'karla', fit: 'caps', bold: true },
  { key: 'sectionTitles', label: 'Títulos de sección', hint: 'Por ejemplo «Fiesta de la Primavera» en «El certamen».', inherits: 'display', selectors: ['.pgs-h2', '.pgs-h3', '.pgs-sent h3'], longText: false, reference: 'italiana', fit: 'mixed' },
  { key: 'titleAccent', label: 'Palabra en cursiva de los títulos', hint: 'La última palabra destacada de un título, como «Temuco».', inherits: 'serif', selectors: ['.pgs-h2 em', '.pgs-h3 em'], longText: false, reference: 'cormorant-italic', fit: 'mixed' },
  { key: 'lead', label: 'Primer párrafo de «Sobre el certamen»', hint: 'El párrafo grande que abre la sección.', inherits: 'serif', selectors: ['.pgs-prose p.is-lead'], longText: false, reference: 'cormorant', fit: 'text' },
  { key: 'dropCap', label: 'Letra capital', hint: 'La letra grande con que empieza el primer párrafo.', inherits: 'display', selectors: ['.pgs-prose p.is-lead::first-letter'], longText: false, reference: 'italiana', fit: 'caps' },
  { key: 'prose', label: 'Resto de «Sobre el certamen»', hint: 'Los párrafos que siguen al primero.', inherits: 'sans', selectors: ['.pgs-prose p:not(.is-lead)'], longText: true, reference: 'karla', fit: 'text' },
  { key: 'names', label: 'Nombres', hint: 'Candidatas, ganadoras, salón de la fama, director o directora y auspiciadores.', inherits: 'display', selectors: ['.pgs-card-name', '.pgs-dialog-name', '.pgs-ranking-name', '.pgs-winner-name', '.pgs-court-name', '.pgs-hof-name', '.pgs-hof-card-name', '.pgs-director-name', '.pgs-sponsor-tier li'], longText: false, reference: 'italiana', fit: 'mixed' },
  { key: 'cardTitles', label: 'Paquetes, pasos y preguntas', hint: 'Nombre de cada paquete de auspicio, pasos del camino, preguntas frecuentes y recuadros.', inherits: 'display', selectors: ['.pgs-package-name', '.pgs-journey-title', '.pgs-faq-item summary', '.pgs-callout .pgs-callout-title'], longText: false, reference: 'italiana', fit: 'mixed' },
  { key: 'quotes', label: 'Textos en cursiva', hint: 'Bio de cada candidata, mes de la gala, Instagram y notas del salón de la fama.', inherits: 'serif', selectors: ['.pgs-dialog-bio', '.pgs-gala-month > span:first-child', '.pgs-gala-tba', '.pgs-follow-handle', '.pgs-hof-span', '.pgs-hof-note'], longText: false, reference: 'cormorant-italic', fit: 'mixed' },
  { key: 'numbers', label: 'Cifras', hint: 'Cuenta regresiva, día de la gala, precios, votos, años y números de candidata.', inherits: 'serif', selectors: [], cssVar: '--numeric', longText: false, reference: 'cormorant', fit: 'digits' },
  { key: 'brand', label: 'Nombre en la barra, el menú y el pie', hint: 'El nombre chico de arriba, los enlaces del menú en el teléfono y el nombre del pie.', inherits: 'display', selectors: ['.pgs-brand-name', '.pgs-menu ol a', '.pgs-footer-name'], longText: false, reference: 'italiana', fit: 'mixed' },
] as const satisfies ReadonlyArray<TextBlockDef>;

export type PageantTextBlock = (typeof PAGEANT_TEXT_BLOCKS)[number]['key'];
export type PageantTypographyKey = PageantFontRole | PageantTextBlock;

/** Lo elegido; una clave ausente = la de fábrica (familia) o la de su familia (bloque). */
export type PageantTypography = Partial<Record<PageantTypographyKey, PageantFontKey>>;

function allowedFonts(longText: boolean): readonly PageantFontKey[] {
  return longText ? PAGEANT_TEXT_FONT_KEYS : PAGEANT_FONT_KEYS;
}

const ENTRIES: ReadonlyArray<{ key: PageantTypographyKey; longText: boolean }> = [...PAGEANT_FONT_ROLES, ...PAGEANT_TEXT_BLOCKS];

/** Fuentes que se pueden elegir para una familia o un bloque. */
export function fontsFor(key: PageantTypographyKey): readonly PageantFontKey[] {
  const entry = ENTRIES.find((e) => e.key === key);
  return allowedFonts(entry?.longText ?? false);
}

const TYPOGRAPHY_KEYS = ENTRIES.map((entry) => entry.key) as [PageantTypographyKey, ...PageantTypographyKey[]];

/**
 * Validación al guardar: estricta (un bloque o una fuente desconocida se
 * rechaza) y sin fuentes de títulos en los bloques de texto largo.
 */
export const pageantTypographySchema = z
  .partialRecord(z.enum(TYPOGRAPHY_KEYS, 'Hay un bloque de texto desconocido en la tipografía'), z.enum(PAGEANT_FONT_KEYS, 'Esa tipografía no está disponible'))
  .superRefine((value, ctx) => {
    for (const entry of ENTRIES) {
      const font = value[entry.key];
      if (font && !allowedFonts(entry.longText).includes(font)) {
        ctx.addIssue({ code: 'custom', path: [entry.key], message: `«${pageantFontInfo(font).label}» es solo para títulos: elige otra para el texto` });
      }
    }
  });

/**
 * Lectura tolerante de lo guardado (JSON de la base): lo que ya no es válido
 * (una fuente que se quitó de la lista) se ignora clave por clave en vez de
 * perder toda la elección o romper la página pública.
 */
export function parsePageantTypography(value: unknown): PageantTypography {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: PageantTypography = {};
  for (const entry of ENTRIES) {
    const font = record[entry.key];
    if (typeof font === 'string' && (allowedFonts(entry.longText) as readonly string[]).includes(font)) {
      result[entry.key] = font as PageantFontKey;
    }
  }
  return result;
}

/** Fuente que se ve hoy en una familia o bloque (para mostrar «Igual que…»). */
export function effectiveFont(typography: PageantTypography, key: PageantTypographyKey): PageantFontKey {
  const own = typography[key];
  if (own) return own;
  const role = PAGEANT_FONT_ROLES.find((r) => r.key === key);
  if (role) return role.defaultFont;
  const block = PAGEANT_TEXT_BLOCKS.find((b) => b.key === key);
  return effectiveFont(typography, block?.inherits ?? 'sans');
}

/** Clase que activa la hoja de `pageantTypographyCss` en el contenedor `.pgs`. */
export const PAGEANT_TYPOGRAPHY_CLASS = 'pgs-typo';

const REFERENCE_METRIC: Record<Reference, PageantFontMetric> = {
  italiana: PAGEANT_FONT_METRICS.italiana,
  karla: PAGEANT_FONT_METRICS.karla,
  cormorant: PAGEANT_FONT_METRICS.cormorant,
  'cormorant-italic': CORMORANT_ITALIC_METRIC,
};

/**
 * Margen de seguridad: el ancho medido es un promedio y una palabra concreta
 * («diciembre», «Entradas») puede salir algo más ancha que el promedio.
 */
const SAFETY = 0.95;

/**
 * Cuánto hay que achicar una fuente para que ocupe lo mismo que la de fábrica
 * (1 = nada: bastante más angosta). Con `mixed` manda el texto más exigente y,
 * en lo que va en negrita, también el ancho en negrita.
 */
export function widthScale(font: PageantFontKey, reference: Reference, fit: Fit, bold = false): number {
  // La misma familia de fábrica (también Cormorant contra su cursiva) es el diseño original: no se toca.
  if (font === reference.replace('-italic', '')) return 1;
  const kinds: Array<keyof PageantWidths> = fit === 'mixed' ? ['text', 'caps'] : [fit];
  const chosen = PAGEANT_FONT_METRICS[font];
  const base = REFERENCE_METRIC[reference];
  const ratios = kinds.flatMap((kind) => [base[kind] / chosen[kind], ...(bold ? [base.bold[kind] / chosen.bold[kind]] : [])]);
  return Math.min(1, Math.min(...ratios) * SAFETY);
}

/**
 * Valor de `font-size-adjust` (proporción de la altura de la x) que achica la
 * fuente según `widthScale`, o `none` si no hace falta.
 */
export function fontSizeAdjust(font: PageantFontKey, reference: Reference, fit: Fit, bold = false): string {
  const scale = widthScale(font, reference, fit, bold);
  if (scale >= 0.995) return 'none';
  return (PAGEANT_FONT_METRICS[font].xHeight * scale).toFixed(3);
}

/** CSS de la fuente: comillas simples, así el texto va tal cual dentro de `<style>`. */
function fontCss(key: PageantFontKey): string {
  return pageantFontInfo(key).css.replace(/"/g, "'");
}

/**
 * Hoja de estilos de lo elegido ('' si todo es de fábrica). Los selectores van
 * prefijados con `.pgs.pgs-typo`, más específicos que los de `styles.ts`, así
 * ganan sin `!important`; las familias generales se cambian en sus variables.
 */
export function pageantTypographyCss(typography: PageantTypography): string {
  const parsed = parsePageantTypography(typography);
  const root = `.pgs.${PAGEANT_TYPOGRAPHY_CLASS}`;
  const vars: string[] = [];
  for (const role of PAGEANT_FONT_ROLES) {
    const font = parsed[role.key];
    if (font) vars.push(`${role.cssVar}: ${fontCss(font)};`, `${role.cssVar}-adjust: ${fontSizeAdjust(font, role.reference, role.fit, role.bold)};`);
  }
  const rules: string[] = [];
  for (const block of PAGEANT_TEXT_BLOCKS as ReadonlyArray<TextBlockDef & { key: PageantTextBlock }>) {
    const font = parsed[block.key];
    if (block.cssVar) {
      // Sin cifra propia, las cifras siguen a «Cursivas y frases» (de fábrica son la misma fuente).
      const numeric = font ?? parsed[block.inherits];
      if (numeric) vars.push(`${block.cssVar}: ${fontCss(numeric)};`, `${block.cssVar}-adjust: ${fontSizeAdjust(numeric, block.reference, block.fit, block.bold)};`);
      continue;
    }
    if (!font) continue;
    // `em:not(.ws-root em)` de styles.ts pesa (0,2,2): `.pgs.pgs-typo .pgs-h2 em` (0,3,1) le gana.
    rules.push(`${block.selectors.map((selector) => `${root} ${selector}`).join(', ')} { font-family: ${fontCss(font)}; font-size-adjust: ${fontSizeAdjust(font, block.reference, block.fit, block.bold)}; }`);
  }
  if (vars.length === 0 && rules.length === 0) return '';
  // Las secciones del estudio visual (.ws-root) traen sus propias fuentes: no heredan la compensación.
  return [vars.length > 0 ? `${root} { ${vars.join(' ')} }` : '', ...rules, `${root} .ws-root { font-size-adjust: none; }`].filter(Boolean).join('\n');
}
