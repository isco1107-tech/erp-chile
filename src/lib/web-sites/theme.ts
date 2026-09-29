import { z } from 'zod';

/**
 * Apariencia de un sitio: colores, tipografías y algunos estilos globales,
 * con paletas y combinaciones listas para que un sitio armado por alguien sin
 * ojo de diseñador se vea bien igual. Todo valor que llega al CSS sale de una
 * lista cerrada o de un hex validado: el tema nunca puede inyectar CSS
 * arbitrario.
 */

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Tipografías. Las tres primeras son del sistema (no se descargan); el resto
 * son fuentes de Google autoalojadas por Next (`site-fonts.ts`): el navegador
 * del visitante las baja desde nuestro dominio y solo si el sitio las usa.
 * `css` referencia la variable que define `site-fonts.ts` (`--wsf-…`).
 */
export const FONT_OPTIONS = [
  'sans',
  'serif',
  'display',
  'inter',
  'poppins',
  'montserrat',
  'nunito',
  'raleway',
  'space-grotesk',
  'josefin',
  'oswald',
  'playfair',
  'lora',
  'dm-serif',
] as const;
export type SiteFont = (typeof FONT_OPTIONS)[number];

export interface FontInfo {
  label: string;
  description: string;
  css: string;
  /** Solo para títulos (se ve mal en párrafos largos). */
  headingOnly?: boolean;
}

export const FONT_STACKS: Record<SiteFont, FontInfo> = {
  sans: {
    label: 'Moderna',
    description: 'Limpia y neutra; sirve para casi todo.',
    css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  serif: {
    label: 'Clásica',
    description: 'Con serifa; transmite tradición y seriedad.',
    css: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  display: {
    label: 'Editorial',
    description: 'Títulos con más presencia; buena para eventos y marcas personales.',
    css: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  },
  inter: { label: 'Inter', description: 'Muy legible en pantalla; tecnología y servicios.', css: 'var(--wsf-inter), ui-sans-serif, system-ui, sans-serif' },
  poppins: { label: 'Poppins', description: 'Geométrica y amable; emprendimientos y marcas jóvenes.', css: 'var(--wsf-poppins), ui-sans-serif, system-ui, sans-serif' },
  montserrat: { label: 'Montserrat', description: 'Firme y urbana; construcción, deportes, agencias.', css: 'var(--wsf-montserrat), ui-sans-serif, system-ui, sans-serif' },
  nunito: { label: 'Nunito', description: 'Redondeada y cercana; salud, niños, comunidad.', css: 'var(--wsf-nunito), ui-sans-serif, system-ui, sans-serif' },
  raleway: { label: 'Raleway', description: 'Elegante y liviana; belleza, moda, estudios.', css: 'var(--wsf-raleway), ui-sans-serif, system-ui, sans-serif' },
  'space-grotesk': { label: 'Space Grotesk', description: 'Técnica y con carácter; innovación y diseño.', css: 'var(--wsf-space-grotesk), ui-sans-serif, system-ui, sans-serif' },
  josefin: { label: 'Josefin Sans', description: 'Vintage y distinguida; cafeterías, boutiques.', css: 'var(--wsf-josefin), ui-sans-serif, system-ui, sans-serif', headingOnly: true },
  oswald: { label: 'Oswald', description: 'Condensada e impactante; títulos que se imponen.', css: 'var(--wsf-oswald), "Arial Narrow", ui-sans-serif, sans-serif', headingOnly: true },
  playfair: { label: 'Playfair Display', description: 'Lujo y sofisticación; gastronomía, eventos, joyería.', css: 'var(--wsf-playfair), Georgia, ui-serif, serif', headingOnly: true },
  lora: { label: 'Lora', description: 'Serifa cálida y legible; escritores, abogados, terapeutas.', css: 'var(--wsf-lora), Georgia, ui-serif, serif' },
  'dm-serif': { label: 'DM Serif Display', description: 'Serifa de alto contraste; portadas memorables.', css: 'var(--wsf-dm-serif), Georgia, ui-serif, serif', headingOnly: true },
};

/** Tipografía de títulos: `same` = la misma del texto. */
export const HEADING_FONT_OPTIONS = ['same', ...FONT_OPTIONS] as const;
export type SiteHeadingFont = (typeof HEADING_FONT_OPTIONS)[number];

export const RADIUS_OPTIONS = ['none', 'soft', 'round'] as const;
export type SiteRadius = (typeof RADIUS_OPTIONS)[number];
export const RADIUS_VALUES: Record<SiteRadius, { label: string; px: number }> = {
  none: { label: 'Rectas', px: 0 },
  soft: { label: 'Suaves', px: 10 },
  round: { label: 'Redondeadas', px: 24 },
};

export const BUTTON_STYLES = ['solid', 'outline', 'gradient', 'pill'] as const;
export type SiteButtonStyle = (typeof BUTTON_STYLES)[number];
export const BUTTON_STYLE_INFO: Record<SiteButtonStyle, { label: string; description: string }> = {
  solid: { label: 'Relleno', description: 'Clásico y claro.' },
  outline: { label: 'Contorno', description: 'Liviano y elegante.' },
  gradient: { label: 'Degradado', description: 'Del color principal al de acento; moderno.' },
  pill: { label: 'Cápsula', description: 'Relleno y totalmente redondeado.' },
};

export const HEADING_CASES = ['normal', 'uppercase'] as const;
export const SPACING_OPTIONS = ['compact', 'normal', 'airy'] as const;
export type SiteSpacing = (typeof SPACING_OPTIONS)[number];
export const SPACING_INFO: Record<SiteSpacing, { label: string; description: string }> = {
  compact: { label: 'Compacto', description: 'Más contenido a la vista.' },
  normal: { label: 'Equilibrado', description: 'El punto medio.' },
  airy: { label: 'Amplio', description: 'Mucho aire; se siente premium.' },
};

export const WIDTH_OPTIONS = ['normal', 'wide'] as const;
export const ANIMATION_OPTIONS = ['none', 'fade', 'rise', 'zoom'] as const;
export type SiteAnimation = (typeof ANIMATION_OPTIONS)[number];
export const ANIMATION_INFO: Record<SiteAnimation, { label: string; description: string }> = {
  none: { label: 'Sin animación', description: 'Todo aparece de inmediato.' },
  fade: { label: 'Aparecer', description: 'Las secciones se revelan suavemente al bajar.' },
  rise: { label: 'Subir', description: 'Aparecen y suben un poco al bajar.' },
  zoom: { label: 'Acercar', description: 'Aparecen con un leve acercamiento.' },
};

const hex = z.string().regex(HEX_COLOR_RE, 'Color inválido');
const pick = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).default(fallback);

export const themeSchema = z.object({
  primary: hex.default('#12161f'),
  accent: hex.default('#a98530'),
  background: hex.default('#ffffff'),
  text: hex.default('#1f2933'),
  /** Tipografía del texto (y de los títulos si `headingFont` es `same`). */
  font: pick(FONT_OPTIONS, 'sans'),
  headingFont: pick(HEADING_FONT_OPTIONS, 'same'),
  radius: pick(RADIUS_OPTIONS, 'soft'),
  buttonStyle: pick(BUTTON_STYLES, 'solid'),
  headingCase: pick(HEADING_CASES, 'normal'),
  spacing: pick(SPACING_OPTIONS, 'normal'),
  width: pick(WIDTH_OPTIONS, 'normal'),
  animation: pick(ANIMATION_OPTIONS, 'none'),
  /**
   * Heredados del primer formato (un sitio = una página). El encabezado y el
   * pie ahora viven en el documento del sitio (`site.ts`); estos valores solo
   * se leen para convertir un sitio antiguo.
   */
  showNav: z.boolean().default(true),
  footerText: z.string().trim().max(200).default(''),
});

export type WebSiteTheme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: WebSiteTheme = themeSchema.parse({});

/** Tema con el que parte un sitio nuevo (los antiguos conservan el suyo). */
export const NEW_SITE_THEME: WebSiteTheme = themeSchema.parse({ animation: 'rise', headingFont: 'same', font: 'inter' });

/** Tema guardado → tema completo. Un valor inválido cae al de fábrica, campo por campo. */
export function parseTheme(raw: unknown): WebSiteTheme {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const whole = themeSchema.safeParse(source);
  if (whole.success) return whole.data;
  const fixed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const single = themeSchema.shape[key as keyof typeof themeSchema.shape]?.safeParse(value);
    if (single?.success) fixed[key] = value;
  }
  return themeSchema.parse(fixed);
}

// ---------------------------------------------------------------------------
// Paletas y combinaciones listas
// ---------------------------------------------------------------------------

export interface ThemePalette {
  id: string;
  label: string;
  /** Para qué tipo de negocio queda bien. */
  mood: string;
  colors: Pick<WebSiteTheme, 'primary' | 'accent' | 'background' | 'text'>;
}

/** Paletas probadas: texto legible sobre el fondo y acento visible (ver `themeProblems`). */
export const THEME_PALETTES: ThemePalette[] = [
  { id: 'aether', label: 'Tinta y oro', mood: 'Elegante, profesional', colors: { primary: '#12161f', accent: '#a98530', background: '#ffffff', text: '#1f2933' } },
  { id: 'ocean', label: 'Océano', mood: 'Confianza, salud, tecnología', colors: { primary: '#0b3b5c', accent: '#0e7490', background: '#f8fbfd', text: '#12263a' } },
  { id: 'forest', label: 'Bosque', mood: 'Natural, orgánico, sustentable', colors: { primary: '#1f3d2b', accent: '#4d7c0f', background: '#fbfaf5', text: '#1c2a21' } },
  { id: 'terracotta', label: 'Terracota', mood: 'Cálido, artesanal, gastronomía', colors: { primary: '#5b2a1c', accent: '#c2410c', background: '#fffaf5', text: '#2d1a12' } },
  { id: 'berry', label: 'Frambuesa', mood: 'Belleza, moda, eventos', colors: { primary: '#4a1535', accent: '#be185d', background: '#fffafc', text: '#2b1022' } },
  { id: 'violet', label: 'Violeta', mood: 'Creativo, educación, bienestar', colors: { primary: '#2e1065', accent: '#7c3aed', background: '#faf9ff', text: '#1e1b3a' } },
  { id: 'sunset', label: 'Atardecer', mood: 'Energía, deporte, promociones', colors: { primary: '#1c1917', accent: '#ea580c', background: '#ffffff', text: '#1c1917' } },
  { id: 'mint', label: 'Menta', mood: 'Fresco, limpieza, clínicas', colors: { primary: '#134e4a', accent: '#0f766e', background: '#f6fffd', text: '#0f2a28' } },
  { id: 'sand', label: 'Arena', mood: 'Minimalista, inmobiliaria, deco', colors: { primary: '#3f3a33', accent: '#8a6d3b', background: '#faf7f2', text: '#2b2722' } },
  { id: 'night', label: 'Noche', mood: 'Oscuro, premium, música y tecnología', colors: { primary: '#0b0f19', accent: '#fbbf24', background: '#111827', text: '#f3f4f6' } },
  { id: 'neon', label: 'Neón', mood: 'Oscuro y audaz, gaming, eventos nocturnos', colors: { primary: '#050510', accent: '#22d3ee', background: '#0a0a14', text: '#e5e7eb' } },
  { id: 'mono', label: 'Blanco y negro', mood: 'Sobrio, arquitectura, fotografía', colors: { primary: '#111111', accent: '#111111', background: '#ffffff', text: '#1a1a1a' } },
];

export interface FontPairing {
  id: string;
  label: string;
  font: SiteFont;
  headingFont: SiteHeadingFont;
}

/** Combinaciones de títulos + texto que se ven bien juntas. */
export const FONT_PAIRINGS: FontPairing[] = [
  { id: 'modern', label: 'Moderna', font: 'inter', headingFont: 'same' },
  { id: 'friendly', label: 'Amable', font: 'nunito', headingFont: 'poppins' },
  { id: 'luxury', label: 'Lujo', font: 'raleway', headingFont: 'playfair' },
  { id: 'editorial', label: 'Editorial', font: 'lora', headingFont: 'dm-serif' },
  { id: 'bold', label: 'Impacto', font: 'montserrat', headingFont: 'oswald' },
  { id: 'tech', label: 'Tecnológica', font: 'inter', headingFont: 'space-grotesk' },
  { id: 'boutique', label: 'Boutique', font: 'raleway', headingFont: 'josefin' },
  { id: 'classic', label: 'Clásica', font: 'serif', headingFont: 'same' },
];

// ---------------------------------------------------------------------------
// Colores → variables CSS
// ---------------------------------------------------------------------------

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Razón de contraste WCAG entre dos colores `#rrggbb` (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  if (!HEX_COLOR_RE.test(a) || !HEX_COLOR_RE.test(b)) return 1;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Color de texto legible (blanco o casi negro) sobre un fondo dado. */
export function readableOn(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111111', background) ? '#ffffff' : '#111111';
}

/** ¿El fondo de la página es oscuro? (cambia los fondos "suaves" y las sombras). */
export function isDarkBackground(theme: Pick<WebSiteTheme, 'background'>): boolean {
  return readableOn(theme.background) === '#ffffff';
}

const SPACING_PX: Record<SiteSpacing, { y: number; yLarge: number }> = {
  compact: { y: 40, yLarge: 56 },
  normal: { y: 56, yLarge: 80 },
  airy: { y: 72, yLarge: 112 },
};

/** Variables CSS del tema; se aplican en el contenedor raíz del sitio. */
export function themeVariables(theme: WebSiteTheme): Record<string, string> {
  const headingFont = theme.headingFont === 'same' ? theme.font : theme.headingFont;
  const spacing = SPACING_PX[theme.spacing];
  return {
    '--ws-primary': theme.primary,
    '--ws-on-primary': readableOn(theme.primary),
    '--ws-accent': theme.accent,
    '--ws-on-accent': readableOn(theme.accent),
    '--ws-bg': theme.background,
    '--ws-text': theme.text,
    '--ws-muted': theme.text + 'b3',
    '--ws-surface': theme.text + (isDarkBackground(theme) ? '14' : '0a'),
    '--ws-border': theme.text + '26',
    '--ws-radius': `${RADIUS_VALUES[theme.radius].px}px`,
    '--ws-button-radius': theme.buttonStyle === 'pill' ? '999px' : `${RADIUS_VALUES[theme.radius].px}px`,
    '--ws-font': FONT_STACKS[theme.font].css,
    '--ws-heading-font': FONT_STACKS[headingFont].css,
    '--ws-heading-case': theme.headingCase === 'uppercase' ? 'uppercase' : 'none',
    '--ws-heading-spacing': theme.headingCase === 'uppercase' ? '0.04em' : '-0.015em',
    '--ws-section-y': `${spacing.y}px`,
    '--ws-section-y-lg': `${spacing.yLarge}px`,
    '--ws-max': theme.width === 'wide' ? '80rem' : '64rem',
  };
}

/** Problemas de legibilidad del tema, en español. Vacío si está bien. */
export function themeProblems(theme: WebSiteTheme): string[] {
  const problems: string[] = [];
  if (contrastRatio(theme.text, theme.background) < 4.5) problems.push('El texto casi no se distingue del fondo. Elige un texto más oscuro sobre fondo claro (o al revés).');
  if (contrastRatio(theme.accent, theme.background) < 3) problems.push('El color de acento se pierde sobre el fondo; los botones y títulos destacados costarán de leer.');
  return problems;
}
