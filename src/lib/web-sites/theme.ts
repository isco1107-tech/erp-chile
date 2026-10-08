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
  'dm-sans',
  'manrope',
  'outfit',
  'jakarta',
  'work-sans',
  'rubik',
  'figtree',
  'quicksand',
  'merriweather',
  'libre-baskerville',
  'eb-garamond',
  'fraunces',
  'cormorant',
  'bebas',
  'syne',
  'unbounded',
  'instrument-serif',
  'anton',
  'cinzel',
  'abril',
  'caveat',
  'dancing',
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
  'dm-sans': { label: 'DM Sans', description: 'Geométrica y suave; startups y servicios modernos.', css: 'var(--wsf-dm-sans), ui-sans-serif, system-ui, sans-serif' },
  manrope: { label: 'Manrope', description: 'Contemporánea y precisa; finanzas, consultoras.', css: 'var(--wsf-manrope), ui-sans-serif, system-ui, sans-serif' },
  outfit: { label: 'Outfit', description: 'Redonda y actual; marcas digitales y apps.', css: 'var(--wsf-outfit), ui-sans-serif, system-ui, sans-serif' },
  jakarta: { label: 'Plus Jakarta Sans', description: 'Amable y profesional; agencias y tecnología.', css: 'var(--wsf-jakarta), ui-sans-serif, system-ui, sans-serif' },
  'work-sans': { label: 'Work Sans', description: 'Sobria y muy legible; estudios y oficinas.', css: 'var(--wsf-work-sans), ui-sans-serif, system-ui, sans-serif' },
  rubik: { label: 'Rubik', description: 'Esquinas suaves y mucha personalidad; comida rápida, juguetes.', css: 'var(--wsf-rubik), ui-sans-serif, system-ui, sans-serif' },
  figtree: { label: 'Figtree', description: 'Limpia y cercana; salud, educación, comunidad.', css: 'var(--wsf-figtree), ui-sans-serif, system-ui, sans-serif' },
  quicksand: { label: 'Quicksand', description: 'Redondeada y liviana; niños, pastelería, bienestar.', css: 'var(--wsf-quicksand), ui-sans-serif, system-ui, sans-serif' },
  merriweather: { label: 'Merriweather', description: 'Serifa robusta para leer mucho; blogs, prensa, abogados.', css: 'var(--wsf-merriweather), Georgia, ui-serif, serif' },
  'libre-baskerville': { label: 'Libre Baskerville', description: 'Clásica de libro; editoriales, notarías, historia.', css: 'var(--wsf-libre-baskerville), Georgia, ui-serif, serif' },
  'eb-garamond': { label: 'EB Garamond', description: 'Elegancia tradicional; vinos, hoteles, academia.', css: 'var(--wsf-eb-garamond), Garamond, Georgia, ui-serif, serif' },
  fraunces: { label: 'Fraunces', description: 'Serifa con carácter retro; cafeterías y marcas de autor.', css: 'var(--wsf-fraunces), Georgia, ui-serif, serif', headingOnly: true },
  cormorant: { label: 'Cormorant', description: 'Fina y sofisticada; novias, joyería, moda de lujo.', css: 'var(--wsf-cormorant), Georgia, ui-serif, serif', headingOnly: true },
  bebas: { label: 'Bebas Neue', description: 'Mayúsculas altas y potentes; deporte, eventos, carteles.', css: 'var(--wsf-bebas), "Arial Narrow", Impact, sans-serif', headingOnly: true },
  syne: { label: 'Syne', description: 'Experimental y artística; galerías, diseño, música.', css: 'var(--wsf-syne), ui-sans-serif, system-ui, sans-serif', headingOnly: true },
  unbounded: { label: 'Unbounded', description: 'Ancha y futurista; tecnología, gaming, eventos.', css: 'var(--wsf-unbounded), ui-sans-serif, system-ui, sans-serif', headingOnly: true },
  'instrument-serif': { label: 'Instrument Serif', description: 'Serifa editorial de moda; estudios creativos.', css: 'var(--wsf-instrument-serif), Georgia, ui-serif, serif', headingOnly: true },
  anton: { label: 'Anton', description: 'Condensada y gruesa; ofertas, gimnasios, titulares.', css: 'var(--wsf-anton), Impact, "Arial Narrow", sans-serif', headingOnly: true },
  cinzel: { label: 'Cinzel', description: 'Mayúsculas romanas; ceremonias, vinos, hoteles.', css: 'var(--wsf-cinzel), Georgia, ui-serif, serif', headingOnly: true },
  abril: { label: 'Abril Fatface', description: 'Serifa gruesa de revista; moda y gastronomía.', css: 'var(--wsf-abril), Georgia, ui-serif, serif', headingOnly: true },
  caveat: { label: 'Caveat', description: 'Escrita a mano; cercana y artesanal.', css: 'var(--wsf-caveat), "Comic Sans MS", cursive', headingOnly: true },
  dancing: { label: 'Dancing Script', description: 'Caligrafía alegre; repostería, matrimonios, floristas.', css: 'var(--wsf-dancing), cursive', headingOnly: true },
};

/** Tipografía de títulos: `same` = la misma del texto. */
export const HEADING_FONT_OPTIONS = ['same', ...FONT_OPTIONS] as const;
export type SiteHeadingFont = (typeof HEADING_FONT_OPTIONS)[number];

export const RADIUS_OPTIONS = ['none', 'soft', 'medium', 'round'] as const;
export type SiteRadius = (typeof RADIUS_OPTIONS)[number];
export const RADIUS_VALUES: Record<SiteRadius, { label: string; px: number }> = {
  none: { label: 'Rectas', px: 0 },
  soft: { label: 'Suaves', px: 10 },
  medium: { label: 'Medias', px: 16 },
  round: { label: 'Redondeadas', px: 24 },
};

export const BUTTON_STYLES = ['solid', 'outline', 'gradient', 'pill', 'soft', 'brutal', 'glow'] as const;
export type SiteButtonStyle = (typeof BUTTON_STYLES)[number];
export const BUTTON_STYLE_INFO: Record<SiteButtonStyle, { label: string; description: string }> = {
  solid: { label: 'Relleno', description: 'Clásico y claro.' },
  outline: { label: 'Contorno', description: 'Liviano y elegante.' },
  gradient: { label: 'Degradado', description: 'Del color principal al de acento; moderno.' },
  pill: { label: 'Cápsula', description: 'Relleno y totalmente redondeado.' },
  soft: { label: 'Suave', description: 'Fondo tenue del color de acento; discreto.' },
  brutal: { label: 'Sombra dura', description: 'Borde grueso y sombra sólida; audaz y juvenil.' },
  glow: { label: 'Brillo', description: 'Relleno con un halo del mismo color; llamativo.' },
};

/** Cómo se ven las tarjetas (servicios, planes, testimonios…). */
export const CARD_STYLES = ['bordered', 'shadow', 'flat', 'brutal', 'glass'] as const;
export type SiteCardStyle = (typeof CARD_STYLES)[number];
export const CARD_STYLE_INFO: Record<SiteCardStyle, { label: string; description: string }> = {
  bordered: { label: 'Con borde', description: 'Un borde fino; ordenado y claro.' },
  shadow: { label: 'Con sombra', description: 'Flotan sobre la página; se ven más modernas.' },
  flat: { label: 'Planas', description: 'Solo un fondo tenue, sin bordes ni sombra.' },
  brutal: { label: 'Sombra dura', description: 'Borde grueso y sombra sólida; audaz.' },
  glass: { label: 'Vidrio', description: 'Semitransparentes; lucen sobre fondos de color.' },
};

/** Grosor de los títulos. */
export const HEADING_WEIGHTS = ['light', 'regular', 'bold', 'black'] as const;
export type SiteHeadingWeight = (typeof HEADING_WEIGHTS)[number];
export const HEADING_WEIGHT_INFO: Record<SiteHeadingWeight, { label: string; description: string; value: number }> = {
  light: { label: 'Finos', description: 'Delicados y elegantes.', value: 300 },
  regular: { label: 'Normales', description: 'Equilibrados.', value: 500 },
  bold: { label: 'Gruesos', description: 'Firmes; lo más usado.', value: 700 },
  black: { label: 'Extra gruesos', description: 'Mucho impacto.', value: 850 },
};

export const HEADING_CASES = ['normal', 'uppercase'] as const;
export const SPACING_OPTIONS = ['compact', 'normal', 'airy'] as const;
export type SiteSpacing = (typeof SPACING_OPTIONS)[number];
export const SPACING_INFO: Record<SiteSpacing, { label: string; description: string }> = {
  compact: { label: 'Compacto', description: 'Más contenido a la vista.' },
  normal: { label: 'Equilibrado', description: 'El punto medio.' },
  airy: { label: 'Amplio', description: 'Mucho aire; se siente premium.' },
};

export const WIDTH_OPTIONS = ['narrow', 'normal', 'wide'] as const;
export type SiteWidth = (typeof WIDTH_OPTIONS)[number];
export const ANIMATION_OPTIONS = ['none', 'fade', 'rise', 'zoom', 'slide'] as const;
export type SiteAnimation = (typeof ANIMATION_OPTIONS)[number];
export const ANIMATION_INFO: Record<SiteAnimation, { label: string; description: string }> = {
  none: { label: 'Sin animación', description: 'Todo aparece de inmediato.' },
  fade: { label: 'Aparecer', description: 'Las secciones se revelan suavemente al bajar.' },
  rise: { label: 'Subir', description: 'Aparecen y suben un poco al bajar.' },
  zoom: { label: 'Acercar', description: 'Aparecen con un leve acercamiento.' },
  slide: { label: 'Deslizar', description: 'Entran desde un costado al bajar.' },
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
  cardStyle: pick(CARD_STYLES, 'bordered'),
  headingWeight: pick(HEADING_WEIGHTS, 'bold'),
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
  { id: 'coral', label: 'Coral', mood: 'Alegre, verano, moda de playa', colors: { primary: '#3b1f2b', accent: '#e0533d', background: '#fff8f4', text: '#2a1a1f' } },
  { id: 'lavender', label: 'Lavanda', mood: 'Calma, terapias, cosmética natural', colors: { primary: '#3a2e5c', accent: '#7c5cbf', background: '#f8f6fd', text: '#241c38' } },
  { id: 'sage', label: 'Salvia', mood: 'Bienestar, yoga, decoración', colors: { primary: '#2f3e34', accent: '#5e7d61', background: '#f6f7f2', text: '#1f2a22' } },
  { id: 'navy', label: 'Marino y rojo', mood: 'Institucional, deporte, náutica', colors: { primary: '#0f2340', accent: '#c8102e', background: '#ffffff', text: '#14213d' } },
  { id: 'sky', label: 'Cielo', mood: 'Limpieza, piscinas, aire acondicionado', colors: { primary: '#0c4a6e', accent: '#0284c7', background: '#f4faff', text: '#0b2a3d' } },
  { id: 'lemon', label: 'Limón', mood: 'Fresco, jugos, emprendimientos', colors: { primary: '#1f1f1f', accent: '#a16207', background: '#fffdf3', text: '#1c1a14' } },
  { id: 'rose', label: 'Rosa intenso', mood: 'Belleza, uñas, celebraciones', colors: { primary: '#4c1d2f', accent: '#be123c', background: '#fff7f8', text: '#2a121b' } },
  { id: 'emerald', label: 'Esmeralda', mood: 'Finanzas, agro, sustentabilidad', colors: { primary: '#064e3b', accent: '#047857', background: '#f3fbf8', text: '#0b2a22' } },
  { id: 'cocoa', label: 'Cacao', mood: 'Chocolatería, café, cuero', colors: { primary: '#3e2723', accent: '#8d5524', background: '#fbf7f2', text: '#2b1d19' } },
  { id: 'wine', label: 'Vino', mood: 'Viñas, enoturismo, restaurantes', colors: { primary: '#3f0d1e', accent: '#9f1239', background: '#fdf6f7', text: '#2a0f17' } },
  { id: 'slate', label: 'Pizarra', mood: 'Corporativo, legal, ingeniería', colors: { primary: '#1e293b', accent: '#475569', background: '#f8fafc', text: '#0f172a' } },
  { id: 'tangerine', label: 'Mandarina', mood: 'Comida rápida, delivery, energía', colors: { primary: '#2b1608', accent: '#c2410c', background: '#fff8f1', text: '#2a160b' } },
  { id: 'teal-gold', label: 'Petróleo y oro', mood: 'Hotelería, turismo, lujo sobrio', colors: { primary: '#0f3d3e', accent: '#b7791f', background: '#f7fbfa', text: '#10292a' } },
  { id: 'blush', label: 'Rubor', mood: 'Novias, repostería, estética', colors: { primary: '#5a2a3a', accent: '#c2557a', background: '#fdf5f7', text: '#3a1d27' } },
  { id: 'cobalt', label: 'Cobalto', mood: 'Tecnología, software, educación', colors: { primary: '#1e1b4b', accent: '#4338ca', background: '#f7f7ff', text: '#1e1b4b' } },
  { id: 'olive', label: 'Oliva', mood: 'Gourmet, aceites, campo', colors: { primary: '#3a3d1f', accent: '#6b7a1f', background: '#fafaf2', text: '#262817' } },
  { id: 'sunflower', label: 'Girasol', mood: 'Infantil, panadería, colegios', colors: { primary: '#2d2a1f', accent: '#b45309', background: '#fffbea', text: '#22201a' } },
  { id: 'ice', label: 'Glaciar', mood: 'Salud, dental, laboratorios', colors: { primary: '#0b3954', accent: '#087e8b', background: '#f5fbfc', text: '#0b2533' } },
  { id: 'plum', label: 'Ciruela', mood: 'Arte, música, eventos creativos', colors: { primary: '#2d0a31', accent: '#a21caf', background: '#fdf7fe', text: '#25102a' } },
  { id: 'graphite', label: 'Grafito', mood: 'Minimalista, diseño, arquitectura', colors: { primary: '#18181b', accent: '#71717a', background: '#fafafa', text: '#18181b' } },
  { id: 'champagne', label: 'Champaña', mood: 'Matrimonios, joyería, eventos', colors: { primary: '#3d3426', accent: '#9c7a3c', background: '#fbf8f1', text: '#2b251c' } },
  { id: 'peach', label: 'Durazno', mood: 'Cálido, cerámica, artesanía', colors: { primary: '#4a2c22', accent: '#d9603b', background: '#fff6f1', text: '#33201a' } },
  { id: 'midnight', label: 'Medianoche', mood: 'Oscuro, software, startups', colors: { primary: '#020617', accent: '#818cf8', background: '#0f172a', text: '#e2e8f0' } },
  { id: 'espresso', label: 'Espresso', mood: 'Oscuro y cálido, cafeterías, barberías', colors: { primary: '#1c1410', accent: '#d4a373', background: '#17110d', text: '#f5ebe0' } },
  { id: 'forest-night', label: 'Bosque nocturno', mood: 'Oscuro, outdoor, cervecerías', colors: { primary: '#06140f', accent: '#4ade80', background: '#0b1a14', text: '#e7f5ee' } },
  { id: 'aurora', label: 'Aurora', mood: 'Oscuro, tecnología, inteligencia artificial', colors: { primary: '#0b1026', accent: '#2dd4bf', background: '#0a0f1f', text: '#e6f7f5' } },
  { id: 'crimson-dark', label: 'Carmesí nocturno', mood: 'Oscuro, discotecas, tatuajes', colors: { primary: '#120809', accent: '#f43f5e', background: '#140a0c', text: '#fbe9ec' } },
  { id: 'mint-dark', label: 'Menta nocturna', mood: 'Oscuro, fintech, apps', colors: { primary: '#03201c', accent: '#34d399', background: '#04231f', text: '#e2fbf3' } },
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
  { id: 'startup', label: 'Startup', font: 'dm-sans', headingFont: 'jakarta' },
  { id: 'fresh', label: 'Fresca', font: 'figtree', headingFont: 'outfit' },
  { id: 'consulting', label: 'Consultora', font: 'work-sans', headingFont: 'manrope' },
  { id: 'cafe', label: 'Café de autor', font: 'dm-sans', headingFont: 'fraunces' },
  { id: 'bridal', label: 'Nupcial', font: 'raleway', headingFont: 'cormorant' },
  { id: 'sport', label: 'Deportiva', font: 'rubik', headingFont: 'bebas' },
  { id: 'gallery', label: 'Galería', font: 'work-sans', headingFont: 'syne' },
  { id: 'future', label: 'Futurista', font: 'manrope', headingFont: 'unbounded' },
  { id: 'magazine', label: 'Revista', font: 'figtree', headingFont: 'instrument-serif' },
  { id: 'poster', label: 'Afiche', font: 'outfit', headingFont: 'anton' },
  { id: 'heritage', label: 'Tradición', font: 'eb-garamond', headingFont: 'cinzel' },
  { id: 'fashion', label: 'Moda', font: 'jakarta', headingFont: 'abril' },
  { id: 'handmade', label: 'Artesanal', font: 'quicksand', headingFont: 'caveat' },
  { id: 'sweet', label: 'Dulce', font: 'quicksand', headingFont: 'dancing' },
  { id: 'press', label: 'Prensa', font: 'merriweather', headingFont: 'same' },
  { id: 'notary', label: 'Notarial', font: 'libre-baskerville', headingFont: 'same' },
];

// ---------------------------------------------------------------------------
// Estilos completos (un clic cambia todo el diseño)
// ---------------------------------------------------------------------------

export interface ThemeKit {
  id: string;
  label: string;
  /** Qué transmite y para quién es. */
  description: string;
  /** Paleta de `THEME_PALETTES`. */
  palette: string;
  style: Pick<WebSiteTheme, 'font' | 'headingFont' | 'buttonStyle' | 'radius' | 'cardStyle' | 'headingWeight' | 'headingCase' | 'spacing' | 'animation' | 'width'>;
}

/**
 * Estilos completos, como los "kits" de los creadores líderes: paleta,
 * tipografías, botones, bordes, tarjetas, títulos, espacio y animación que
 * combinan entre sí. Todos pasan `themeProblems` (lo vigila un test).
 */
export const THEME_KITS: ThemeKit[] = [
  { id: 'minimal', label: 'Minimalista', description: 'Blanco, gris y mucho aire. Arquitectura, diseño, fotografía.', palette: 'graphite', style: { font: 'inter', headingFont: 'same', buttonStyle: 'solid', radius: 'none', cardStyle: 'flat', headingWeight: 'regular', headingCase: 'normal', spacing: 'airy', animation: 'fade', width: 'normal' } },
  { id: 'luxury', label: 'Lujo dorado', description: 'Tinta y oro con serifa elegante. Joyería, hoteles, eventos.', palette: 'aether', style: { font: 'raleway', headingFont: 'playfair', buttonStyle: 'outline', radius: 'none', cardStyle: 'bordered', headingWeight: 'regular', headingCase: 'normal', spacing: 'airy', animation: 'fade', width: 'normal' } },
  { id: 'startup', label: 'Startup', description: 'Moderno y confiable, con degradados. Software y servicios digitales.', palette: 'cobalt', style: { font: 'dm-sans', headingFont: 'jakarta', buttonStyle: 'gradient', radius: 'medium', cardStyle: 'shadow', headingWeight: 'bold', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'wide' } },
  { id: 'brutal', label: 'Neo brutal', description: 'Bordes gruesos y sombras duras. Marcas jóvenes y atrevidas.', palette: 'lemon', style: { font: 'jakarta', headingFont: 'syne', buttonStyle: 'brutal', radius: 'medium', cardStyle: 'brutal', headingWeight: 'black', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'normal' } },
  { id: 'editorial', label: 'Editorial', description: 'Serifa de revista y líneas finas. Estudios creativos y escritores.', palette: 'sand', style: { font: 'figtree', headingFont: 'instrument-serif', buttonStyle: 'outline', radius: 'none', cardStyle: 'flat', headingWeight: 'regular', headingCase: 'normal', spacing: 'airy', animation: 'fade', width: 'normal' } },
  { id: 'organic', label: 'Orgánico', description: 'Verdes suaves y formas redondas. Bienestar, huertas, cosmética natural.', palette: 'sage', style: { font: 'figtree', headingFont: 'fraunces', buttonStyle: 'pill', radius: 'round', cardStyle: 'flat', headingWeight: 'regular', headingCase: 'normal', spacing: 'airy', animation: 'rise', width: 'normal' } },
  { id: 'playful', label: 'Juvenil', description: 'Colores alegres y redondeados. Niños, cumpleaños, helados.', palette: 'coral', style: { font: 'quicksand', headingFont: 'rubik', buttonStyle: 'pill', radius: 'round', cardStyle: 'shadow', headingWeight: 'black', headingCase: 'normal', spacing: 'normal', animation: 'zoom', width: 'normal' } },
  { id: 'corporate', label: 'Corporativo', description: 'Sobrio y ordenado. Consultoras, contadores, ingeniería.', palette: 'navy', style: { font: 'work-sans', headingFont: 'manrope', buttonStyle: 'solid', radius: 'soft', cardStyle: 'bordered', headingWeight: 'bold', headingCase: 'normal', spacing: 'normal', animation: 'fade', width: 'wide' } },
  { id: 'neon', label: 'Neón nocturno', description: 'Oscuro con brillos. Discotecas, gaming, música electrónica.', palette: 'neon', style: { font: 'outfit', headingFont: 'unbounded', buttonStyle: 'glow', radius: 'medium', cardStyle: 'glass', headingWeight: 'bold', headingCase: 'uppercase', spacing: 'normal', animation: 'zoom', width: 'wide' } },
  { id: 'boutique', label: 'Boutique', description: 'Pastel y mayúsculas finas. Tiendas de ropa, accesorios, regalos.', palette: 'blush', style: { font: 'raleway', headingFont: 'josefin', buttonStyle: 'soft', radius: 'round', cardStyle: 'flat', headingWeight: 'regular', headingCase: 'uppercase', spacing: 'airy', animation: 'fade', width: 'normal' } },
  { id: 'retro', label: 'Retro', description: 'Cálido y con carácter setentero. Cafeterías, vinilos, tiendas vintage.', palette: 'tangerine', style: { font: 'dm-sans', headingFont: 'abril', buttonStyle: 'pill', radius: 'round', cardStyle: 'shadow', headingWeight: 'regular', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'normal' } },
  { id: 'gourmet', label: 'Gourmet', description: 'Tonos tierra y serifa clásica. Restaurantes y productos gourmet.', palette: 'terracotta', style: { font: 'lora', headingFont: 'playfair', buttonStyle: 'solid', radius: 'soft', cardStyle: 'shadow', headingWeight: 'bold', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'normal' } },
  { id: 'wellness', label: 'Salud y bienestar', description: 'Limpio, fresco y tranquilo. Clínicas, kinesiología, psicología.', palette: 'mint', style: { font: 'figtree', headingFont: 'outfit', buttonStyle: 'soft', radius: 'round', cardStyle: 'shadow', headingWeight: 'regular', headingCase: 'normal', spacing: 'airy', animation: 'fade', width: 'normal' } },
  { id: 'sport', label: 'Deportivo', description: 'Energía y titulares potentes. Gimnasios, clubes, academias deportivas.', palette: 'sunset', style: { font: 'rubik', headingFont: 'bebas', buttonStyle: 'solid', radius: 'none', cardStyle: 'flat', headingWeight: 'regular', headingCase: 'uppercase', spacing: 'compact', animation: 'slide', width: 'wide' } },
  { id: 'wedding', label: 'Nupcial', description: 'Delicado y elegante. Matrimonios, novias, banquetería.', palette: 'champagne', style: { font: 'raleway', headingFont: 'cormorant', buttonStyle: 'outline', radius: 'none', cardStyle: 'bordered', headingWeight: 'light', headingCase: 'normal', spacing: 'airy', animation: 'fade', width: 'narrow' } },
  { id: 'tech-dark', label: 'Tecnología oscura', description: 'Fondo oscuro y acentos turquesa. Inteligencia artificial, software.', palette: 'aurora', style: { font: 'inter', headingFont: 'space-grotesk', buttonStyle: 'gradient', radius: 'medium', cardStyle: 'glass', headingWeight: 'bold', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'wide' } },
  { id: 'artisan', label: 'Artesanal', description: 'Hecho a mano, cálido y cercano. Repostería, cerámica, tejidos.', palette: 'cocoa', style: { font: 'quicksand', headingFont: 'caveat', buttonStyle: 'pill', radius: 'round', cardStyle: 'flat', headingWeight: 'bold', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'normal' } },
  { id: 'heritage', label: 'Tradición', description: 'Serifas clásicas y tonos vino. Viñas, notarías, hoteles históricos.', palette: 'wine', style: { font: 'eb-garamond', headingFont: 'cinzel', buttonStyle: 'outline', radius: 'none', cardStyle: 'bordered', headingWeight: 'regular', headingCase: 'normal', spacing: 'airy', animation: 'fade', width: 'normal' } },
  { id: 'espresso', label: 'Barra oscura', description: 'Café oscuro y dorado. Barberías, bares, cafeterías de especialidad.', palette: 'espresso', style: { font: 'dm-sans', headingFont: 'fraunces', buttonStyle: 'solid', radius: 'soft', cardStyle: 'flat', headingWeight: 'bold', headingCase: 'normal', spacing: 'normal', animation: 'rise', width: 'normal' } },
  { id: 'press', label: 'Prensa', description: 'Para leer mucho y bien. Blogs, medios, abogados, escritores.', palette: 'slate', style: { font: 'merriweather', headingFont: 'same', buttonStyle: 'solid', radius: 'none', cardStyle: 'bordered', headingWeight: 'black', headingCase: 'normal', spacing: 'normal', animation: 'none', width: 'narrow' } },
];

/** Tema que deja un estilo completo (los colores salen de su paleta). */
export function kitTheme(kit: ThemeKit): Partial<WebSiteTheme> {
  const palette = THEME_PALETTES.find((entry) => entry.id === kit.palette);
  return { ...(palette ? palette.colors : {}), ...kit.style };
}

/** Estilo completo que coincide exactamente con el tema, si lo hay. */
export function activeKit(theme: WebSiteTheme): ThemeKit | null {
  return (
    THEME_KITS.find((kit) => {
      const patch = kitTheme(kit) as Record<string, unknown>;
      return Object.entries(patch).every(([key, value]) => {
        const current = theme[key as keyof WebSiteTheme];
        return typeof value === 'string' && typeof current === 'string' ? value.toLowerCase() === current.toLowerCase() : value === current;
      });
    }) ?? null
  );
}

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
    '--ws-max': theme.width === 'wide' ? '80rem' : theme.width === 'narrow' ? '56rem' : '64rem',
    '--ws-heading-weight': String(HEADING_WEIGHT_INFO[theme.headingWeight].value),
    '--ws-fit': String(headingFitFactor(headingFont, theme.headingCase === 'uppercase')),
  };
}

/**
 * Cuánto más (o menos) ancha es la tipografía de títulos que una normal: los
 * títulos grandes se achican con ella para que una palabra larga
 * ("Remodelaciones") siga cabiendo en su columna. Las condensadas pueden ir
 * más grandes; las anchas (Unbounded, Syne) y las MAYÚSCULAS, más chicas.
 */
const WIDE_FONTS: Partial<Record<SiteFont, number>> = {
  unbounded: 0.72,
  syne: 0.86,
  montserrat: 0.9,
  'space-grotesk': 0.94,
  cinzel: 0.82,
  'libre-baskerville': 0.88,
  merriweather: 0.9,
  abril: 0.9,
  bebas: 1.3,
  anton: 1.2,
  oswald: 1.15,
  'instrument-serif': 1.12,
  cormorant: 1.08,
};

export function headingFitFactor(font: SiteFont, uppercase: boolean): number {
  const base = WIDE_FONTS[font] ?? 1;
  // Bebas, Anton y Oswald ya son mayúsculas o casi: no se castigan dos veces.
  const caps = uppercase && base <= 1 ? 0.86 : 1;
  return Math.round(base * caps * 100) / 100;
}

/** Problemas de legibilidad del tema, en español. Vacío si está bien. */
export function themeProblems(theme: WebSiteTheme): string[] {
  const problems: string[] = [];
  if (contrastRatio(theme.text, theme.background) < 4.5) problems.push('El texto casi no se distingue del fondo. Elige un texto más oscuro sobre fondo claro (o al revés).');
  if (contrastRatio(theme.accent, theme.background) < 3) problems.push('El color de acento se pierde sobre el fondo; los botones y títulos destacados costarán de leer.');
  return problems;
}
