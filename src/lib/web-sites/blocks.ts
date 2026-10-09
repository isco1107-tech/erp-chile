import { z } from 'zod';
import { canvasSchema } from './canvas';
import { SITE_ICONS } from './icons';
import { richTextLinks } from './rich-text';
import { slugify } from './urls';

/**
 * Bloques (secciones) de una página armada en modo guiado. Una página es una
 * lista ordenada de bloques; cada tipo tiene campos fijos y un texto de ayuda
 * que le explica al usuario para qué sirve y qué poner. El renderizador
 * (`SiteRenderer`) pinta exactamente estos tipos: no hay HTML libre en modo
 * guiado, así que un texto nunca puede romper la página ni ejecutar código.
 *
 * Todo campo de "elección" (variante, columnas, ícono, fondo…) sale de una
 * lista cerrada y, si llega un valor desconocido (dato viejo o manipulado),
 * cae a su valor por omisión en vez de descartar la sección entera.
 *
 * El borrador es permisivo (campos vacíos permitidos, para poder guardar a
 * medias); lo que falta para publicar lo dice `readiness.ts`, no el esquema.
 */

export const BLOCK_TYPES = [
  'hero',
  'text',
  'split',
  'image',
  'gallery',
  'features',
  'stats',
  'steps',
  'pricing',
  'team',
  'testimonials',
  'quote',
  'logos',
  'pricelist',
  'catalog',
  'schedule',
  'faq',
  'cta',
  'video',
  'map',
  'countdown',
  'contact',
  'divider',
  'timeline',
  'comparison',
  'beforeafter',
  'links',
  'marquee',
  'tabs',
  'hours',
  'areas',
  'embed',
  'posts',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const MAX_BLOCKS = 40;
export const MAX_GALLERY_IMAGES = 12;
export const MAX_LIST_ITEMS = 12;
export const MAX_STATS = 8;
export const MAX_STEPS = 8;
export const MAX_PLANS = 6;
export const MAX_LOGOS = 16;
export const MAX_PRICE_CATEGORIES = 8;
export const MAX_PRICE_ITEMS = 20;
export const MAX_CATALOG_ITEMS = 24;
export const MAX_SCHEDULE_ROWS = 40;
export const MAX_HERO_IMAGES = 3;
export const MAX_TIMELINE_ITEMS = 16;
export const MAX_COMPARISON_COLUMNS = 4;
export const MAX_COMPARISON_ROWS = 20;
export const MAX_BEFORE_AFTER = 6;
export const MAX_LINKS = 12;
export const MAX_MARQUEE_ITEMS = 12;
export const MAX_TABS = 8;
export const MAX_AREAS = 40;
export const MAX_POSTS = 12;

const text = (max: number) => z.string().trim().max(max).default('');
const link = z.string().trim().max(500).default('');
/** Elección de una lista cerrada; un valor desconocido cae al de fábrica. */
const choice = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).default(fallback).catch(fallback);

// ---------------------------------------------------------------------------
// Estilo de la sección (común a todos los bloques)
// ---------------------------------------------------------------------------

export const SECTION_BACKGROUNDS = ['default', 'muted', 'primary', 'accent', 'dark', 'image', 'gradient', 'soft'] as const;
export type SectionBackground = (typeof SECTION_BACKGROUNDS)[number];
export const SECTION_SPACINGS = ['auto', 'none', 'sm', 'md', 'lg'] as const;
export type SectionSpacing = (typeof SECTION_SPACINGS)[number];
export const SECTION_ALIGNS = ['auto', 'left', 'center'] as const;
export type SectionAlign = (typeof SECTION_ALIGNS)[number];
/** Textura suave sobre el fondo de la franja (puntos, cuadrícula, líneas): CSS fijo, nunca una imagen. */
export const SECTION_PATTERNS = ['none', 'dots', 'grid', 'diagonal', 'rings'] as const;
export type SectionPattern = (typeof SECTION_PATTERNS)[number];
/** Forma del borde inferior de la franja (se dibuja con el color de la sección siguiente). */
export const SECTION_SHAPES = ['none', 'wave', 'curve', 'slant', 'zigzag', 'triangle', 'steps'] as const;
export type SectionShape = (typeof SECTION_SHAPES)[number];
/** Ancho del contenido de la franja: el del sitio, más angosto (lectura) o más ancho. */
export const SECTION_WIDTHS = ['auto', 'narrow', 'wide'] as const;
export type SectionWidth = (typeof SECTION_WIDTHS)[number];

export const blockStyleSchema = z.object({
  canvas: canvasSchema.optional(),
  /** Fondo de la franja: el de la página, uno suave, los colores del tema, oscuro o una foto. */
  background: choice(SECTION_BACKGROUNDS, 'default'),
  /** Foto de fondo (solo con `background: 'image'`); se oscurece con `overlay` para que el texto se lea. */
  backgroundImage: link,
  /** Oscurecimiento de la foto de fondo, 0–90 %. */
  overlay: z.number().int().min(0).max(90).default(55).catch(55),
  spacing: choice(SECTION_SPACINGS, 'auto'),
  align: choice(SECTION_ALIGNS, 'auto'),
  pattern: choice(SECTION_PATTERNS, 'none'),
  shape: choice(SECTION_SHAPES, 'none'),
  width: choice(SECTION_WIDTHS, 'auto'),
});
export type BlockStyle = z.infer<typeof blockStyleSchema>;

const base = {
  id: z.string().trim().min(1).max(40),
  /** Oculto = no se publica, pero el contenido se conserva en el editor. */
  hidden: z.boolean().default(false),
  style: blockStyleSchema.prefault({}),
};

const COLUMN_OPTIONS = ['2', '3', '4'] as const;
const ICON_OPTIONS = ['', ...SITE_ICONS] as const;

// ---------------------------------------------------------------------------
// Tipos de sección
//
// Cada tipo tiene un `variant` (su diseño): el primero de cada lista es el de
// fábrica y el aspecto que tenían los sitios antes de que existiera la
// elección, así que un sitio guardado sin `variant` se ve igual que siempre.
// Las etiquetas y descripciones de cada diseño viven en `variants.ts`.
// ---------------------------------------------------------------------------

export const HERO_VARIANTS = ['center', 'split', 'split-left', 'full', 'minimal', 'card', 'collage', 'editorial', 'gradient', 'stacked'] as const;
export const galleryImageSchema = z.object({ url: link, alt: text(160), caption: text(120) });
export const heroBlockSchema = z.object({
  ...base,
  type: z.literal('hero'),
  /** Texto pequeño sobre el título ("Nuevo", "Desde 1998"…). */
  eyebrow: text(60),
  title: text(120),
  subtitle: text(300),
  imageUrl: link,
  /** Fotos extra del diseño "collage" (la principal es `imageUrl`). */
  images: z.array(galleryImageSchema).max(MAX_HERO_IMAGES).default([]),
  ctaLabel: text(40),
  ctaHref: link,
  secondaryLabel: text(40),
  secondaryHref: link,
  variant: choice(HERO_VARIANTS, 'center'),
});

export const TEXT_VARIANTS = ['standard', 'columns', 'sidebar', 'lead', 'card'] as const;
export const textBlockSchema = z.object({
  ...base,
  type: z.literal('text'),
  heading: text(120),
  /** Admite formato simple (ver `rich-text.ts`). */
  body: text(4000),
  variant: choice(TEXT_VARIANTS, 'standard'),
});

export const SPLIT_SIDES = ['left', 'right'] as const;
export const SPLIT_VARIANTS = ['standard', 'overlap', 'framed', 'circle', 'wide'] as const;
export const splitBlockSchema = z.object({
  ...base,
  type: z.literal('split'),
  eyebrow: text(60),
  heading: text(120),
  body: text(3000),
  imageUrl: link,
  alt: text(160),
  imageSide: choice(SPLIT_SIDES, 'right'),
  buttonLabel: text(40),
  buttonHref: link,
  variant: choice(SPLIT_VARIANTS, 'standard'),
});

export const IMAGE_SIZES = ['normal', 'wide', 'full'] as const;
export const IMAGE_VARIANTS = ['shadow', 'plain', 'frame', 'polaroid', 'arch'] as const;
export const imageBlockSchema = z.object({
  ...base,
  type: z.literal('image'),
  imageUrl: link,
  alt: text(160),
  caption: text(200),
  size: choice(IMAGE_SIZES, 'normal'),
  variant: choice(IMAGE_VARIANTS, 'shadow'),
});

export const GALLERY_VARIANTS = ['grid', 'masonry', 'carousel', 'featured', 'bento', 'strip', 'polaroid'] as const;
export const galleryBlockSchema = z.object({
  ...base,
  type: z.literal('gallery'),
  heading: text(120),
  images: z.array(galleryImageSchema).max(MAX_GALLERY_IMAGES).default([]),
  variant: choice(GALLERY_VARIANTS, 'grid'),
  columns: choice(COLUMN_OPTIONS, '3'),
});

export const FEATURE_VARIANTS = ['cards', 'icons', 'list', 'bento', 'zigzag', 'numbered', 'minimal', 'overlay', 'carousel'] as const;
export const featureItemSchema = z.object({ title: text(80), text: text(400), imageUrl: link, icon: choice(ICON_OPTIONS, ''), href: link });
export const featuresBlockSchema = z.object({
  ...base,
  type: z.literal('features'),
  heading: text(120),
  intro: text(300),
  items: z.array(featureItemSchema).max(MAX_LIST_ITEMS).default([]),
  variant: choice(FEATURE_VARIANTS, 'cards'),
  columns: choice(COLUMN_OPTIONS, '3'),
});

export const STATS_VARIANTS = ['plain', 'cards', 'divided', 'side'] as const;
export const statItemSchema = z.object({ value: text(20), label: text(80) });
export const statsBlockSchema = z.object({
  ...base,
  type: z.literal('stats'),
  heading: text(120),
  intro: text(300),
  items: z.array(statItemSchema).max(MAX_STATS).default([]),
  variant: choice(STATS_VARIANTS, 'plain'),
});

export const STEPS_VARIANTS = ['vertical', 'horizontal', 'cards', 'timeline'] as const;
export const stepItemSchema = z.object({ title: text(80), text: text(400) });
export const stepsBlockSchema = z.object({
  ...base,
  type: z.literal('steps'),
  heading: text(120),
  intro: text(300),
  items: z.array(stepItemSchema).max(MAX_STEPS).default([]),
  variant: choice(STEPS_VARIANTS, 'vertical'),
});

export const PRICING_VARIANTS = ['cards', 'minimal', 'list'] as const;
export const planItemSchema = z.object({
  name: text(60),
  price: text(30),
  period: text(30),
  description: text(200),
  /** Lo que incluye: una línea por beneficio. */
  features: text(1500),
  buttonLabel: text(40),
  buttonHref: link,
  highlighted: z.boolean().default(false),
  badge: text(30),
});
export const pricingBlockSchema = z.object({
  ...base,
  type: z.literal('pricing'),
  heading: text(120),
  intro: text(300),
  items: z.array(planItemSchema).max(MAX_PLANS).default([]),
  variant: choice(PRICING_VARIANTS, 'cards'),
});

export const TEAM_VARIANTS = ['circles', 'cards', 'portrait', 'list'] as const;
export const teamMemberSchema = z.object({ name: text(80), role: text(80), photoUrl: link, bio: text(300) });
export const teamBlockSchema = z.object({
  ...base,
  type: z.literal('team'),
  heading: text(120),
  intro: text(300),
  items: z.array(teamMemberSchema).max(MAX_LIST_ITEMS).default([]),
  variant: choice(TEAM_VARIANTS, 'circles'),
});

export const TESTIMONIAL_VARIANTS = ['cards', 'quotes', 'carousel', 'masonry', 'spotlight', 'minimal'] as const;
export const testimonialItemSchema = z.object({ quote: text(500), author: text(80), role: text(80), photoUrl: link, rating: z.number().int().min(0).max(5).default(0).catch(0) });
export const testimonialsBlockSchema = z.object({
  ...base,
  type: z.literal('testimonials'),
  heading: text(120),
  items: z.array(testimonialItemSchema).max(MAX_LIST_ITEMS).default([]),
  variant: choice(TESTIMONIAL_VARIANTS, 'cards'),
});

export const QUOTE_VARIANTS = ['plain', 'card', 'bar', 'photo'] as const;
export const quoteBlockSchema = z.object({
  ...base,
  type: z.literal('quote'),
  quote: text(400),
  author: text(80),
  role: text(80),
  /** Foto de quien lo dice (diseño "con foto"). */
  photoUrl: link,
  variant: choice(QUOTE_VARIANTS, 'plain'),
});

export const LOGOS_VARIANTS = ['row', 'grid', 'marquee'] as const;
export const logoItemSchema = z.object({ imageUrl: link, alt: text(160), href: link });
export const logosBlockSchema = z.object({
  ...base,
  type: z.literal('logos'),
  heading: text(120),
  items: z.array(logoItemSchema).max(MAX_LOGOS).default([]),
  variant: choice(LOGOS_VARIANTS, 'row'),
});

export const PRICELIST_VARIANTS = ['columns', 'menu', 'cards', 'photos'] as const;
export const priceItemSchema = z.object({ name: text(80), description: text(200), price: text(30), tag: text(24), imageUrl: link });
export const priceCategorySchema = z.object({ title: text(60), items: z.array(priceItemSchema).max(MAX_PRICE_ITEMS).default([]) });
export const pricelistBlockSchema = z.object({
  ...base,
  type: z.literal('pricelist'),
  heading: text(120),
  intro: text(300),
  /** Grupos de la lista ("Cortes", "Entradas", "Mantenciones"…). */
  categories: z.array(priceCategorySchema).max(MAX_PRICE_CATEGORIES).default([]),
  /** Aclaración final ("Precios con IVA incluido"). */
  note: text(200),
  variant: choice(PRICELIST_VARIANTS, 'columns'),
});

export const CATALOG_VARIANTS = ['grid', 'list', 'carousel', 'minimal'] as const;
export const catalogItemSchema = z.object({
  imageUrl: link,
  title: text(80),
  price: text(30),
  description: text(300),
  /** Atributos en una línea ("3 dormitorios · 2 baños · 80 m²"). */
  details: text(200),
  /** Código o SKU: viaja en el mensaje de WhatsApp para saber qué se consulta. */
  code: text(30),
  badge: text(24),
});
export const catalogBlockSchema = z.object({
  ...base,
  type: z.literal('catalog'),
  heading: text(120),
  intro: text(300),
  items: z.array(catalogItemSchema).max(MAX_CATALOG_ITEMS).default([]),
  columns: choice(COLUMN_OPTIONS, '3'),
  /** Número de WhatsApp para pedir; vacío = el del botón flotante del sitio. */
  whatsapp: text(40),
  buttonLabel: text(30),
  variant: choice(CATALOG_VARIANTS, 'grid'),
});

export const SCHEDULE_VARIANTS = ['cards', 'table', 'timeline'] as const;
export const scheduleRowSchema = z.object({ day: text(40), time: text(40), title: text(80), detail: text(160) });
export const scheduleBlockSchema = z.object({
  ...base,
  type: z.literal('schedule'),
  heading: text(120),
  intro: text(300),
  /** Filas seguidas con el mismo día se agrupan bajo ese día. */
  rows: z.array(scheduleRowSchema).max(MAX_SCHEDULE_ROWS).default([]),
  variant: choice(SCHEDULE_VARIANTS, 'cards'),
});

export const FAQ_VARIANTS = ['accordion', 'split', 'columns', 'cards'] as const;
export const faqItemSchema = z.object({ question: text(200), answer: text(1000) });
export const faqBlockSchema = z.object({
  ...base,
  type: z.literal('faq'),
  heading: text(120),
  /** Bajada bajo el título (diseño "al costado"). */
  intro: text(300),
  items: z.array(faqItemSchema).max(MAX_LIST_ITEMS).default([]),
  variant: choice(FAQ_VARIANTS, 'accordion'),
});

export const CTA_VARIANTS = ['card', 'band', 'split', 'minimal', 'banner', 'gradient'] as const;
export const ctaBlockSchema = z.object({
  ...base,
  type: z.literal('cta'),
  title: text(120),
  text: text(300),
  buttonLabel: text(40),
  buttonHref: link,
  secondaryLabel: text(40),
  secondaryHref: link,
  /** Foto del diseño "con foto". */
  imageUrl: link,
  variant: choice(CTA_VARIANTS, 'card'),
});

export const VIDEO_VARIANTS = ['standard', 'wide', 'split'] as const;
export const videoBlockSchema = z.object({
  ...base,
  type: z.literal('video'),
  heading: text(120),
  intro: text(300),
  /** Enlace de YouTube o Vimeo (ver `videoEmbed`). */
  url: z.string().trim().max(300).default(''),
  caption: text(200),
  variant: choice(VIDEO_VARIANTS, 'standard'),
});

export const MAP_HEIGHTS = ['sm', 'md', 'lg'] as const;
export const MAP_VARIANTS = ['standard', 'split'] as const;
export const mapBlockSchema = z.object({
  ...base,
  type: z.literal('map'),
  heading: text(120),
  text: text(300),
  address: text(200),
  height: choice(MAP_HEIGHTS, 'md'),
  variant: choice(MAP_VARIANTS, 'standard'),
});

export const COUNTDOWN_VARIANTS = ['boxes', 'minimal', 'big'] as const;
export const countdownBlockSchema = z.object({
  ...base,
  type: z.literal('countdown'),
  heading: text(120),
  text: text(300),
  /** Fecha y hora de término en ISO 8601 (con zona horaria); `''` = sin definir. */
  target: z.string().trim().max(40).default(''),
  endedText: text(120),
  buttonLabel: text(40),
  buttonHref: link,
  variant: choice(COUNTDOWN_VARIANTS, 'boxes'),
});

export const CONTACT_VARIANTS = ['split', 'centered', 'cards', 'minimal'] as const;
export const contactBlockSchema = z.object({
  ...base,
  type: z.literal('contact'),
  heading: text(120),
  text: text(400),
  email: text(120),
  phone: text(40),
  whatsapp: text(40),
  address: text(200),
  /** Horario de atención (una línea por día o rango). */
  hours: text(300),
  /** Formulario: lo que escriban llega a la bandeja "Mensajes" del sitio. */
  showForm: z.boolean().default(true),
  /** Mapa de Google con la dirección. */
  showMap: z.boolean().default(false),
  variant: choice(CONTACT_VARIANTS, 'split'),
});

export const DIVIDER_VARIANTS = ['line', 'dots', 'space', 'ornament', 'gradient', 'wave', 'zigzag'] as const;
export const DIVIDER_SIZES = ['sm', 'md', 'lg'] as const;
export const dividerBlockSchema = z.object({
  ...base,
  type: z.literal('divider'),
  variant: choice(DIVIDER_VARIANTS, 'line'),
  size: choice(DIVIDER_SIZES, 'md'),
});

// --- Secciones de la segunda generación -----------------------------------

export const TIMELINE_VARIANTS = ['alternating', 'vertical', 'horizontal', 'cards'] as const;
export const timelineItemSchema = z.object({
  /** Año o fecha tal como se quiere mostrar ("1998", "Marzo 2024"). */
  date: text(40),
  title: text(80),
  text: text(400),
  imageUrl: link,
});
export const timelineBlockSchema = z.object({
  ...base,
  type: z.literal('timeline'),
  heading: text(120),
  intro: text(300),
  items: z.array(timelineItemSchema).max(MAX_TIMELINE_ITEMS).default([]),
  variant: choice(TIMELINE_VARIANTS, 'alternating'),
});

export const COMPARISON_VARIANTS = ['table', 'versus'] as const;
export const comparisonColumnSchema = z.object({ title: text(40) });
export const comparisonRowSchema = z.object({
  label: text(100),
  /** Un valor por columna: "Sí"/"✓" pinta un visto, "No"/"✗" una cruz, lo demás va como texto. */
  values: z.array(text(60)).max(MAX_COMPARISON_COLUMNS).default([]),
});
export const comparisonBlockSchema = z.object({
  ...base,
  type: z.literal('comparison'),
  heading: text(120),
  intro: text(300),
  columns: z.array(comparisonColumnSchema).max(MAX_COMPARISON_COLUMNS).default([]),
  rows: z.array(comparisonRowSchema).max(MAX_COMPARISON_ROWS).default([]),
  /** Columna destacada (0, 1, 2 o 3); -1 = ninguna. */
  highlight: z.number().int().min(-1).max(MAX_COMPARISON_COLUMNS - 1).default(0).catch(0),
  variant: choice(COMPARISON_VARIANTS, 'table'),
});

export const BEFORE_AFTER_VARIANTS = ['slider', 'side'] as const;
export const beforeAfterItemSchema = z.object({ beforeUrl: link, afterUrl: link, caption: text(160), alt: text(160) });
export const beforeAfterBlockSchema = z.object({
  ...base,
  type: z.literal('beforeafter'),
  heading: text(120),
  intro: text(300),
  items: z.array(beforeAfterItemSchema).max(MAX_BEFORE_AFTER).default([]),
  /** Etiquetas de cada foto; vacío = "Antes" / "Después". */
  beforeLabel: text(20),
  afterLabel: text(20),
  variant: choice(BEFORE_AFTER_VARIANTS, 'slider'),
});

export const LINKS_VARIANTS = ['stack', 'grid'] as const;
export const linkItemSchema = z.object({ label: text(60), href: link, icon: choice(ICON_OPTIONS, '') });
export const linksBlockSchema = z.object({
  ...base,
  type: z.literal('links'),
  /** Foto o logo redondo de arriba. */
  imageUrl: link,
  title: text(80),
  text: text(300),
  items: z.array(linkItemSchema).max(MAX_LINKS).default([]),
  /** Mostrar los íconos de las redes sociales del sitio. */
  showSocial: z.boolean().default(true),
  variant: choice(LINKS_VARIANTS, 'stack'),
});

export const MARQUEE_VARIANTS = ['scroll', 'big', 'static'] as const;
export const MARQUEE_SPEEDS = ['slow', 'normal', 'fast'] as const;
export const marqueeItemSchema = z.object({ text: text(60) });
export const marqueeBlockSchema = z.object({
  ...base,
  type: z.literal('marquee'),
  items: z.array(marqueeItemSchema).max(MAX_MARQUEE_ITEMS).default([]),
  speed: choice(MARQUEE_SPEEDS, 'normal'),
  variant: choice(MARQUEE_VARIANTS, 'scroll'),
});

export const TABS_VARIANTS = ['top', 'side', 'pills'] as const;
export const tabItemSchema = z.object({
  /** Nombre de la pestaña ("Cortes", "Coloración"). */
  label: text(40),
  title: text(120),
  /** Admite formato simple. */
  body: text(2000),
  imageUrl: link,
  buttonLabel: text(40),
  buttonHref: link,
});
export const tabsBlockSchema = z.object({
  ...base,
  type: z.literal('tabs'),
  heading: text(120),
  intro: text(300),
  items: z.array(tabItemSchema).max(MAX_TABS).default([]),
  variant: choice(TABS_VARIANTS, 'top'),
});

export const HOURS_VARIANTS = ['card', 'table', 'inline'] as const;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const time = z
  .string()
  .trim()
  .refine((value) => value === '' || TIME_RE.test(value))
  .default('')
  .catch('');
/** Un día de la semana: abierto de `open` a `close` y, si corta a mediodía, de `open2` a `close2`. */
export const hoursDaySchema = z.object({
  closed: z.boolean().default(false).catch(false),
  open: time,
  close: time,
  open2: time,
  close2: time,
});
export type HoursDay = z.infer<typeof hoursDaySchema>;
const EMPTY_WEEK = (): HoursDay[] => Array.from({ length: 7 }, () => hoursDaySchema.parse({}));
export const hoursBlockSchema = z.object({
  ...base,
  type: z.literal('hours'),
  heading: text(120),
  intro: text(300),
  /** Siete días, de lunes (0) a domingo (6). */
  week: z.array(hoursDaySchema).length(7).default(EMPTY_WEEK).catch(EMPTY_WEEK),
  /** Aclaración ("Feriados cerrado", "Atención con hora"). */
  note: text(200),
  /** Mostrar "Abierto ahora" / "Cerrado" según la hora de Chile. */
  showStatus: z.boolean().default(true),
  variant: choice(HOURS_VARIANTS, 'card'),
});

export const AREAS_VARIANTS = ['chips', 'columns'] as const;
export const areaItemSchema = z.object({ name: text(60) });
export const areasBlockSchema = z.object({
  ...base,
  type: z.literal('areas'),
  heading: text(120),
  intro: text(300),
  items: z.array(areaItemSchema).max(MAX_AREAS).default([]),
  note: text(200),
  variant: choice(AREAS_VARIANTS, 'chips'),
});

export const EMBED_VARIANTS = ['standard', 'split'] as const;
export const EMBED_HEIGHTS = ['sm', 'md', 'lg'] as const;
export const embedBlockSchema = z.object({
  ...base,
  type: z.literal('embed'),
  heading: text(120),
  /** Texto con formato simple (va al costado en el diseño "al costado"). */
  text: text(1000),
  /** Enlace de Spotify, SoundCloud, Calendly, Google Forms o Google Calendar (ver `embedFrom`). */
  url: z.string().trim().max(500).default(''),
  height: choice(EMBED_HEIGHTS, 'md'),
  caption: text(200),
  variant: choice(EMBED_VARIANTS, 'standard'),
});

export const POSTS_VARIANTS = ['grid', 'list', 'featured'] as const;
export const postItemSchema = z.object({
  imageUrl: link,
  /** Fecha tal como se quiere mostrar ("12 de marzo de 2026"). */
  date: text(40),
  tag: text(30),
  title: text(120),
  excerpt: text(300),
  href: link,
});
export const postsBlockSchema = z.object({
  ...base,
  type: z.literal('posts'),
  heading: text(120),
  intro: text(300),
  items: z.array(postItemSchema).max(MAX_POSTS).default([]),
  columns: choice(COLUMN_OPTIONS, '3'),
  variant: choice(POSTS_VARIANTS, 'grid'),
});

export const blockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  textBlockSchema,
  splitBlockSchema,
  imageBlockSchema,
  galleryBlockSchema,
  featuresBlockSchema,
  statsBlockSchema,
  stepsBlockSchema,
  pricingBlockSchema,
  teamBlockSchema,
  testimonialsBlockSchema,
  quoteBlockSchema,
  logosBlockSchema,
  pricelistBlockSchema,
  catalogBlockSchema,
  scheduleBlockSchema,
  faqBlockSchema,
  ctaBlockSchema,
  videoBlockSchema,
  mapBlockSchema,
  countdownBlockSchema,
  contactBlockSchema,
  dividerBlockSchema,
  timelineBlockSchema,
  comparisonBlockSchema,
  beforeAfterBlockSchema,
  linksBlockSchema,
  marqueeBlockSchema,
  tabsBlockSchema,
  hoursBlockSchema,
  areasBlockSchema,
  embedBlockSchema,
  postsBlockSchema,
]);

export const blocksSchema = z
  .array(blockSchema)
  .max(MAX_BLOCKS, `Una página puede tener hasta ${MAX_BLOCKS} secciones`)
  .superRefine((blocks, ctx) => {
    const seen = new Set<string>();
    blocks.forEach((block, index) => {
      if (seen.has(block.id)) ctx.addIssue({ code: 'custom', message: 'Hay secciones repetidas', path: [index, 'id'] });
      seen.add(block.id);
    });
  });

export type WebSiteBlock = z.infer<typeof blockSchema>;
export type BlockOf<T extends BlockType> = Extract<WebSiteBlock, { type: T }>;

/**
 * JSON guardado → bloques válidos. Tolerante: un bloque dañado se descarta y
 * los demás se conservan, para que un dato viejo nunca deje un sitio en blanco.
 */
export function parseBlocks(raw: unknown): WebSiteBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: WebSiteBlock[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_BLOCKS)) {
    const parsed = blockSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    out.push(parsed.data);
  }
  return out;
}

export function newBlockId(): string {
  return `b${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// Ayuda para quien edita
// ---------------------------------------------------------------------------

export type BlockCategory = 'basic' | 'content' | 'trust' | 'action' | 'media';

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string }[] = [
  { id: 'basic', label: 'Lo esencial' },
  { id: 'content', label: 'Contar lo que haces' },
  { id: 'trust', label: 'Generar confianza' },
  { id: 'action', label: 'Invitar a actuar' },
  { id: 'media', label: 'Fotos, video y mapa' },
];

export interface BlockTypeInfo {
  label: string;
  /** Una línea: qué es. */
  description: string;
  /** Guía para quien nunca armó un sitio: qué poner y qué evitar. */
  help: string;
  category: BlockCategory;
  /** Nombre del ícono de lucide-react que la UI usa para este tipo. */
  icon:
    | 'Sparkles'
    | 'Type'
    | 'Columns2'
    | 'Image'
    | 'Images'
    | 'LayoutGrid'
    | 'BarChart3'
    | 'ListOrdered'
    | 'BadgeDollarSign'
    | 'Users'
    | 'Quote'
    | 'MessageSquareQuote'
    | 'Award'
    | 'Receipt'
    | 'ShoppingBag'
    | 'CalendarClock'
    | 'HelpCircle'
    | 'MousePointerClick'
    | 'PlayCircle'
    | 'MapPin'
    | 'Timer'
    | 'Mail'
    | 'Minus'
    | 'Milestone'
    | 'Table2'
    | 'SquareSplitHorizontal'
    | 'Link2'
    | 'Megaphone'
    | 'PanelsTopLeft'
    | 'Clock4'
    | 'MapPinned'
    | 'AppWindow'
    | 'Newspaper';
}

export const BLOCK_INFO: Record<BlockType, BlockTypeInfo> = {
  hero: {
    label: 'Portada',
    description: 'Lo primero que se ve: título grande, una frase y un botón.',
    help: 'Di en una frase qué haces y para quién. El botón debe llevar a la acción más importante (escribirte, cotizar, comprar). Una sola portada por página.',
    category: 'basic',
    icon: 'Sparkles',
  },
  text: {
    label: 'Texto',
    description: 'Un título y párrafos, con negritas, listas y enlaces.',
    help: 'Ideal para "Quiénes somos" o "Nuestra historia". Párrafos cortos (3–4 líneas) se leen mejor en el celular. Separa los párrafos con una línea en blanco.',
    category: 'basic',
    icon: 'Type',
  },
  split: {
    label: 'Imagen y texto',
    description: 'Una foto a un lado y el texto al otro.',
    help: 'Perfecto para presentar un servicio, tu local o a ti. Alterna el lado de la foto entre secciones seguidas para que la página respire.',
    category: 'content',
    icon: 'Columns2',
  },
  image: {
    label: 'Imagen',
    description: 'Una foto grande con su descripción.',
    help: 'Usa fotos propias y nítidas. La descripción (texto alternativo) la leen los lectores de pantalla y ayuda a que te encuentren en Google: describe lo que se ve.',
    category: 'media',
    icon: 'Image',
  },
  gallery: {
    label: 'Galería',
    description: 'Varias fotos en cuadrícula, mosaico o carrusel.',
    help: 'Entre 3 y 9 fotos se ven mejor. Muestra trabajos terminados, productos o momentos del evento.',
    category: 'media',
    icon: 'Images',
  },
  features: {
    label: 'Servicios o beneficios',
    description: 'Tarjetas con ícono o foto, título y descripción corta.',
    help: 'Tres a seis tarjetas. Cada una responde "¿qué gano yo?": un servicio, un producto, una ventaja. Evita párrafos largos.',
    category: 'content',
    icon: 'LayoutGrid',
  },
  stats: {
    label: 'Cifras',
    description: 'Números grandes que demuestran tu experiencia.',
    help: 'Tres o cuatro cifras reales: años de experiencia, clientes atendidos, proyectos terminados. Un número concreto convence más que un adjetivo.',
    category: 'trust',
    icon: 'BarChart3',
  },
  steps: {
    label: 'Cómo funciona',
    description: 'Pasos numerados de tu proceso.',
    help: 'Explica en 3 a 5 pasos cómo se trabaja contigo: desde el primer contacto hasta la entrega. Quita miedos y dudas.',
    category: 'content',
    icon: 'ListOrdered',
  },
  pricing: {
    label: 'Planes y precios',
    description: 'Tarjetas de planes para comparar.',
    help: 'Dos o tres planes funcionan mejor que muchos. Destaca el recomendado y escribe lo que incluye, un beneficio por línea.',
    category: 'action',
    icon: 'BadgeDollarSign',
  },
  team: {
    label: 'Equipo',
    description: 'Fotos y nombres de las personas detrás del negocio.',
    help: 'Poner cara genera confianza. Usa fotos parecidas entre sí (mismo encuadre y fondo) y una línea sobre cada persona.',
    category: 'trust',
    icon: 'Users',
  },
  testimonials: {
    label: 'Testimonios',
    description: 'Lo que dicen tus clientes, con estrellas.',
    help: 'Con nombre y, si puedes, cargo o empresa. Pide autorización antes de publicar la opinión de alguien.',
    category: 'trust',
    icon: 'Quote',
  },
  quote: {
    label: 'Frase destacada',
    description: 'Una cita grande que resume tu propuesta.',
    help: 'Una sola frase potente: tu lema, una promesa o la cita de un cliente. Menos es más.',
    category: 'content',
    icon: 'MessageSquareQuote',
  },
  logos: {
    label: 'Clientes y marcas',
    description: 'Logos de clientes, marcas o certificaciones.',
    help: 'Muestra con quién has trabajado o qué te respalda. Usa logos con fondo transparente y pide permiso a las marcas.',
    category: 'trust',
    icon: 'Award',
  },
  pricelist: {
    label: 'Lista de precios',
    description: 'Carta, tarifas o servicios con precio, por categorías.',
    help: 'Agrupa por categoría (Cortes, Entradas, Mantenciones…). Escribe precios claros: "desde" o "a consultar" espanta clientes. Aclara si incluyen IVA. Nunca subas la carta como foto o PDF: no se lee en el celular ni la encuentra Google.',
    category: 'action',
    icon: 'Receipt',
  },
  catalog: {
    label: 'Catálogo',
    description: 'Productos o propiedades con foto, precio y botón "Pedir por WhatsApp".',
    help: 'Cada ficha con foto propia, nombre, precio y 2–4 datos clave. El botón abre WhatsApp con el nombre y el código del producto ya escritos: sabes al tiro qué te consultan. Usa fotos del mismo tamaño y fondo.',
    category: 'action',
    icon: 'ShoppingBag',
  },
  schedule: {
    label: 'Horario o programa',
    description: 'Clases, turnos o el programa de un evento, por día y hora.',
    help: 'Una fila por actividad: día, hora, nombre y un detalle (sala, profesor, lugar). Nunca subas el horario como imagen: no se puede leer en el celular.',
    category: 'content',
    icon: 'CalendarClock',
  },
  faq: {
    label: 'Preguntas frecuentes',
    description: 'Preguntas y respuestas que ahorran mensajes.',
    help: 'Anota lo que más te preguntan: precios, plazos, formas de pago, cobertura. Cada respuesta en pocas líneas.',
    category: 'trust',
    icon: 'HelpCircle',
  },
  cta: {
    label: 'Llamado a la acción',
    description: 'Una franja con un mensaje y un botón.',
    help: 'Úsalo entre secciones para invitar a dar el siguiente paso. Un botón principal, con un verbo: "Cotizar", "Reservar", "Escribir por WhatsApp".',
    category: 'action',
    icon: 'MousePointerClick',
  },
  video: {
    label: 'Video',
    description: 'Un video de YouTube o Vimeo.',
    help: 'Pega el enlace del video tal como lo copias desde YouTube o Vimeo. Videos cortos (menos de 2 minutos) se ven completos.',
    category: 'media',
    icon: 'PlayCircle',
  },
  map: {
    label: 'Mapa',
    description: 'Tu ubicación en Google Maps.',
    help: 'Escribe la dirección completa con comuna y ciudad, como la buscarías en Google Maps.',
    category: 'media',
    icon: 'MapPin',
  },
  countdown: {
    label: 'Cuenta regresiva',
    description: 'Días, horas y minutos para un evento o una oferta.',
    help: 'Genera urgencia para un lanzamiento, evento o promoción. Elige fecha y hora; cuando termine se muestra el mensaje que escribas.',
    category: 'action',
    icon: 'Timer',
  },
  contact: {
    label: 'Contacto',
    description: 'Datos de contacto, horario, mapa y formulario.',
    help: 'Pon al menos un medio (correo, teléfono o WhatsApp). Si activas el formulario, los mensajes llegan a la bandeja "Mensajes" del sitio y te avisamos en el panel.',
    category: 'basic',
    icon: 'Mail',
  },
  divider: {
    label: 'Separador',
    description: 'Una línea, un adorno o un espacio entre secciones.',
    help: 'Úsalo con moderación: para separar dos secciones con el mismo fondo o dar aire antes de un cierre.',
    category: 'basic',
    icon: 'Minus',
  },
  timeline: {
    label: 'Línea de tiempo',
    description: 'Tu historia o un proceso, hito por hito, con fecha.',
    help: 'Ideal para "Nuestra historia", la trayectoria de un profesional o el programa de un evento. Entre 4 y 8 hitos, con el año o la fecha y una frase cada uno.',
    category: 'content',
    icon: 'Milestone',
  },
  comparison: {
    label: 'Tabla comparativa',
    description: 'Compara planes, productos o "nosotros vs. otros".',
    help: 'Una columna por opción y una fila por característica. Escribe "Sí" o "No" para que aparezca un visto o una cruz; cualquier otro texto se muestra tal cual. Destaca la columna que más quieres vender.',
    category: 'action',
    icon: 'Table2',
  },
  beforeafter: {
    label: 'Antes y después',
    description: 'Dos fotos que se comparan deslizando: el cambio salta a la vista.',
    help: 'Perfecto para remodelaciones, limpieza, peluquería, estética o detailing. Usa dos fotos tomadas desde el mismo ángulo y con la misma luz: así el cambio se nota de verdad.',
    category: 'trust',
    icon: 'SquareSplitHorizontal',
  },
  links: {
    label: 'Enlaces (link en bio)',
    description: 'Tu foto, una frase y botones grandes a tus enlaces, como Linktree.',
    help: 'Pon esta página como enlace en tu Instagram o TikTok. Entre 3 y 7 botones, el más importante primero: WhatsApp, catálogo, reservas, ubicación.',
    category: 'action',
    icon: 'Link2',
  },
  marquee: {
    label: 'Cinta de frases',
    description: 'Frases cortas que desfilan de lado a lado (o quietas, en grande).',
    help: 'Para destacar lo que te define en pocas palabras: "Envíos a todo Chile ✦ Hecho a mano ✦ 10 años de experiencia". Frases de 1 a 4 palabras se leen mejor.',
    category: 'content',
    icon: 'Megaphone',
  },
  tabs: {
    label: 'Pestañas',
    description: 'Varios contenidos en el mismo espacio: se cambia tocando cada pestaña.',
    help: 'Útil para mostrar servicios por categoría, planes por tipo de cliente o un programa por día sin alargar la página. Pestañas con nombres cortos (una o dos palabras).',
    category: 'content',
    icon: 'PanelsTopLeft',
  },
  hours: {
    label: 'Horario de atención',
    description: 'Tus horarios por día, con "Abierto ahora" según la hora de Chile.',
    help: 'Marca los días que cierras y, si cierras a mediodía, usa el segundo tramo. Mantén al día los feriados en la aclaración: un horario equivocado hace perder clientes.',
    category: 'basic',
    icon: 'Clock4',
  },
  areas: {
    label: 'Zonas de cobertura',
    description: 'Las comunas o ciudades donde atiendes o despachas.',
    help: 'Una comuna por línea. Quien busca un servicio quiere saber al tiro si llegas a su casa: esto ahorra muchos mensajes.',
    category: 'content',
    icon: 'MapPinned',
  },
  embed: {
    label: 'Incrustar',
    description: 'Spotify, SoundCloud, Calendly, Google Forms o Google Calendar dentro de tu página.',
    help: 'Pega el enlace tal como lo copias del servicio. Calendly sirve para que te agenden horas; Google Forms para inscripciones; Spotify y SoundCloud para tu música o podcast.',
    category: 'media',
    icon: 'AppWindow',
  },
  posts: {
    label: 'Novedades',
    description: 'Noticias, artículos o anuncios con foto, fecha y enlace.',
    help: 'Muestra lo último: un lanzamiento, una nota de prensa, un evento pasado o consejos. Mantenlo al día: noticias viejas dan sensación de abandono.',
    category: 'content',
    icon: 'Newspaper',
  },
};

/** Bloque nuevo, vacío pero con la estructura lista (filas de ejemplo en las listas). */
export function createBlock(type: BlockType): WebSiteBlock {
  const id = newBlockId();
  switch (type) {
    case 'hero':
      return heroBlockSchema.parse({ id, type });
    case 'text':
      return textBlockSchema.parse({ id, type });
    case 'split':
      return splitBlockSchema.parse({ id, type });
    case 'image':
      return imageBlockSchema.parse({ id, type });
    case 'gallery':
      return galleryBlockSchema.parse({ id, type, images: [{}] });
    case 'features':
      return featuresBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'stats':
      return statsBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'steps':
      return stepsBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'pricing':
      return pricingBlockSchema.parse({ id, type, items: [{}, { highlighted: true }, {}] });
    case 'team':
      return teamBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'testimonials':
      return testimonialsBlockSchema.parse({ id, type, items: [{}] });
    case 'quote':
      return quoteBlockSchema.parse({ id, type });
    case 'logos':
      return logosBlockSchema.parse({ id, type, items: [{}, {}, {}, {}] });
    case 'pricelist':
      return pricelistBlockSchema.parse({ id, type, categories: [{ items: [{}, {}, {}] }] });
    case 'catalog':
      return catalogBlockSchema.parse({ id, type, items: [{}, {}, {}], buttonLabel: 'Pedir por WhatsApp' });
    case 'schedule':
      return scheduleBlockSchema.parse({ id, type, rows: [{}, {}, {}] });
    case 'faq':
      return faqBlockSchema.parse({ id, type, items: [{}] });
    case 'cta':
      return ctaBlockSchema.parse({ id, type });
    case 'video':
      return videoBlockSchema.parse({ id, type });
    case 'map':
      return mapBlockSchema.parse({ id, type });
    case 'countdown':
      return countdownBlockSchema.parse({ id, type });
    case 'contact':
      return contactBlockSchema.parse({ id, type });
    case 'divider':
      return dividerBlockSchema.parse({ id, type });
    case 'timeline':
      return timelineBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'comparison':
      return comparisonBlockSchema.parse({ id, type, columns: [{}, {}], rows: [{ values: ['', ''] }, { values: ['', ''] }, { values: ['', ''] }] });
    case 'beforeafter':
      return beforeAfterBlockSchema.parse({ id, type, items: [{}] });
    case 'links':
      return linksBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'marquee':
      return marqueeBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'tabs':
      return tabsBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'hours':
      return hoursBlockSchema.parse({ id, type });
    case 'areas':
      return areasBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'embed':
      return embedBlockSchema.parse({ id, type });
    case 'posts':
      return postsBlockSchema.parse({ id, type, items: [{}, {}, {}] });
  }
}

/** Copia de una sección con id nuevo (duplicar sección o página). */
export function cloneBlock(block: WebSiteBlock): WebSiteBlock {
  return { ...structuredClone(block), id: newBlockId() };
}

// ---------------------------------------------------------------------------
// Menú y anclas de una página
// ---------------------------------------------------------------------------

/** Título con el que la sección aparece en el menú del sitio; `''` si no debe aparecer. */
export function blockNavLabel(block: WebSiteBlock): string {
  switch (block.type) {
    case 'text':
    case 'split':
    case 'gallery':
    case 'features':
    case 'stats':
    case 'steps':
    case 'pricing':
    case 'team':
    case 'testimonials':
    case 'logos':
    case 'pricelist':
    case 'catalog':
    case 'schedule':
    case 'faq':
    case 'video':
    case 'map':
    case 'countdown':
    case 'contact':
    case 'timeline':
    case 'comparison':
    case 'beforeafter':
    case 'tabs':
    case 'hours':
    case 'areas':
    case 'embed':
    case 'posts':
      return block.heading;
    case 'hero':
    case 'image':
    case 'quote':
    case 'cta':
    case 'divider':
    case 'links':
    case 'marquee':
      return '';
  }
}

export interface NavEntry {
  label: string;
  anchor: string;
}

/** Ancla estable de cada bloque; única aunque dos secciones se llamen igual. */
export function blockAnchors(blocks: WebSiteBlock[]): Map<string, string> {
  const used = new Set<string>();
  const anchors = new Map<string, string>();
  blocks.forEach((block, index) => {
    const label = blockNavLabel(block);
    let anchor = slugify(label, 40) || `${block.type}-${index + 1}`;
    while (used.has(anchor)) anchor = `${anchor}-${index + 1}`;
    used.add(anchor);
    anchors.set(block.id, anchor);
  });
  return anchors;
}

/** Entradas del menú de una página: secciones visibles con título. */
export function buildNav(blocks: WebSiteBlock[]): NavEntry[] {
  const visible = blocks.filter((block) => !block.hidden);
  const anchors = blockAnchors(visible);
  return visible.flatMap((block) => {
    const label = blockNavLabel(block);
    return label ? [{ label, anchor: anchors.get(block.id) ?? block.id }] : [];
  });
}

// ---------------------------------------------------------------------------
// Consultas sobre el contenido (las usan el editor, la lista "qué falta" y el servidor)
// ---------------------------------------------------------------------------

/** Campos que no son texto para el visitante (ids, elecciones, enlaces, imágenes). */
const NON_TEXT_KEYS = new Set([
  'id',
  'type',
  'style',
  'variant',
  'columns',
  'icon',
  'imageSide',
  'size',
  'height',
  'target',
  'url',
  'rating',
  'highlighted',
  'highlight',
  'speed',
  'week',
  'showStatus',
  'showSocial',
]);

/** Todos los textos editables de un bloque (para buscar ejemplos sin cambiar). */
export function blockTexts(block: WebSiteBlock): string[] {
  const out: string[] = [];
  const visit = (value: unknown, key?: string) => {
    if (key && (NON_TEXT_KEYS.has(key) || /(?:Href|Url|href)$/.test(key))) return;
    if (typeof value === 'string') {
      if (value) out.push(value);
    } else if (Array.isArray(value)) value.forEach((v) => visit(v));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => visit(v, k));
  };
  visit(block);
  if (block.style.canvas?.enabled) for (const element of block.style.canvas.elements) if (!element.hidden) { if (element.text) out.push(element.text); if (element.alt) out.push(element.alt); }
  return out;
}

/** Todas las URLs de imagen que usa un bloque (incluida la foto de fondo de la sección). */
export function blockImageUrls(block: WebSiteBlock): string[] {
  const urls: string[] = [];
  if (block.style.canvas) urls.push(...block.style.canvas.elements.filter((el) => el.kind === 'image').map((el) => el.imageUrl));
  if (block.style.background === 'image' || block.style.backgroundImage) urls.push(block.style.backgroundImage);
  switch (block.type) {
    case 'hero':
      urls.push(block.imageUrl, ...block.images.map((image) => image.url));
      break;
    case 'image':
    case 'split':
    case 'cta':
    case 'links':
      urls.push(block.imageUrl);
      break;
    case 'quote':
      urls.push(block.photoUrl);
      break;
    case 'pricelist':
      urls.push(...block.categories.flatMap((category) => category.items.map((item) => item.imageUrl)));
      break;
    case 'timeline':
    case 'tabs':
    case 'posts':
      urls.push(...block.items.map((item) => item.imageUrl));
      break;
    case 'beforeafter':
      urls.push(...block.items.flatMap((item) => [item.beforeUrl, item.afterUrl]));
      break;
    case 'gallery':
      urls.push(...block.images.map((image) => image.url));
      break;
    case 'features':
      urls.push(...block.items.map((item) => item.imageUrl));
      break;
    case 'team':
      urls.push(...block.items.map((item) => item.photoUrl));
      break;
    case 'testimonials':
      urls.push(...block.items.map((item) => item.photoUrl));
      break;
    case 'logos':
      urls.push(...block.items.map((item) => item.imageUrl));
      break;
    case 'catalog':
      urls.push(...block.items.map((item) => item.imageUrl));
      break;
    default:
      break;
  }
  return urls.filter(Boolean);
}

export interface BlockLink {
  /** Cómo se le nombra al usuario ("el botón «Cotizar»"). */
  label: string;
  href: string;
  /** Texto visible del botón o enlace; `null` si el enlace no lleva texto propio (tarjeta, logo). */
  text: string | null;
}

/** Todos los enlaces que escribió el usuario en un bloque (botones, tarjetas y enlaces dentro del texto). */
export function blockLinks(block: WebSiteBlock): BlockLink[] {
  const out: BlockLink[] = [];
  const button = (textValue: string, href: string, fallback: string) => {
    if (href.trim()) out.push({ label: textValue.trim() ? `el botón «${textValue.trim()}»` : fallback, href, text: textValue });
  };
  const rich = (value: string, where: string) => {
    for (const href of richTextLinks(value)) out.push({ label: `un enlace dentro de ${where}`, href, text: null });
  };
  if (block.style.canvas?.enabled) {
    for (const el of block.style.canvas.elements.filter((el) => !el.hidden)) button(el.text || el.alt, el.href, `el elemento «${el.name}»`);
  }
  switch (block.type) {
    case 'hero':
      button(block.ctaLabel, block.ctaHref, 'el botón de la portada');
      button(block.secondaryLabel, block.secondaryHref, 'el segundo botón de la portada');
      break;
    case 'cta':
      button(block.buttonLabel, block.buttonHref, 'el botón del llamado a la acción');
      button(block.secondaryLabel, block.secondaryHref, 'el segundo botón del llamado a la acción');
      break;
    case 'split':
      button(block.buttonLabel, block.buttonHref, 'el botón de «Imagen y texto»');
      rich(block.body, `«${block.heading || 'Imagen y texto'}»`);
      break;
    case 'text':
      rich(block.body, `«${block.heading || 'Texto'}»`);
      break;
    case 'faq':
      block.items.forEach((item) => rich(item.answer, 'una respuesta de preguntas frecuentes'));
      break;
    case 'features':
      block.items.forEach((item, index) => {
        if (item.href.trim()) out.push({ label: `la tarjeta «${item.title || index + 1}»`, href: item.href, text: null });
      });
      break;
    case 'pricing':
      block.items.forEach((item, index) => button(item.buttonLabel, item.buttonHref, `el botón del plan «${item.name || index + 1}»`));
      break;
    case 'logos':
      block.items.forEach((item, index) => {
        if (item.href.trim()) out.push({ label: `el logo «${item.alt || index + 1}»`, href: item.href, text: null });
      });
      break;
    case 'countdown':
      button(block.buttonLabel, block.buttonHref, 'el botón de la cuenta regresiva');
      break;
    case 'links':
      block.items.forEach((item, index) => button(item.label, item.href, `el enlace ${index + 1} de «Enlaces»`));
      break;
    case 'tabs':
      block.items.forEach((item, index) => {
        button(item.buttonLabel, item.buttonHref, `el botón de la pestaña «${item.label || index + 1}»`);
        rich(item.body, `la pestaña «${item.label || index + 1}»`);
      });
      break;
    case 'posts':
      block.items.forEach((item, index) => {
        if (item.href.trim()) out.push({ label: `la novedad «${item.title || index + 1}»`, href: item.href, text: null });
      });
      break;
    case 'embed':
      rich(block.text, `«${block.heading || 'Incrustar'}»`);
      break;
    default:
      break;
  }
  return out;
}

/** ¿La sección no tiene nada que mostrar? (Se omite al publicar y la lista "qué falta" lo avisa.) */
export function isBlockEmpty(block: WebSiteBlock): boolean {
  const canvas = block.style.canvas;
  if (canvas?.enabled) {
    const hasContent = canvas.elements.some((el) => !el.hidden && (el.kind === 'shape' || (el.kind === 'image' ? Boolean(el.imageUrl) : Boolean(el.text.trim()))));
    if (canvas.replaceContent) return !hasContent;
    if (hasContent) return false;
  }
  switch (block.type) {
    case 'hero':
      return !block.title.trim() && !block.subtitle.trim();
    case 'text':
      return !block.body.trim() && !block.heading.trim();
    case 'split':
      return !block.body.trim() && !block.heading.trim() && !block.imageUrl;
    case 'image':
      return !block.imageUrl;
    case 'gallery':
      return block.images.every((image) => !image.url);
    case 'features':
      return block.items.every((item) => !item.title.trim() && !item.text.trim());
    case 'stats':
      return block.items.every((item) => !item.value.trim());
    case 'steps':
      return block.items.every((item) => !item.title.trim() && !item.text.trim());
    case 'pricing':
      return block.items.every((item) => !item.name.trim() && !item.price.trim());
    case 'team':
      return block.items.every((item) => !item.name.trim());
    case 'testimonials':
      return block.items.every((item) => !item.quote.trim());
    case 'quote':
      return !block.quote.trim();
    case 'logos':
      return block.items.every((item) => !item.imageUrl);
    case 'pricelist':
      return block.categories.every((category) => category.items.every((item) => !item.name.trim()));
    case 'catalog':
      return block.items.every((item) => !item.title.trim() && !item.imageUrl);
    case 'schedule':
      return block.rows.every((row) => !row.title.trim() && !row.time.trim());
    case 'faq':
      return block.items.every((item) => !item.question.trim());
    case 'cta':
      return !block.title.trim() && !block.buttonLabel.trim();
    case 'video':
      return !block.url.trim();
    case 'map':
      return !block.address.trim();
    case 'countdown':
      return !block.target.trim();
    case 'contact':
      return false;
    case 'divider':
      return false;
    case 'timeline':
      return block.items.every((item) => !item.title.trim() && !item.date.trim() && !item.text.trim());
    case 'comparison':
      return block.rows.every((row) => !row.label.trim());
    case 'beforeafter':
      return block.items.every((item) => !item.beforeUrl || !item.afterUrl);
    case 'links':
      return block.items.every((item) => !item.label.trim()) && !block.title.trim();
    case 'marquee':
      return block.items.every((item) => !item.text.trim());
    case 'tabs':
      return block.items.every((item) => !item.label.trim() && !item.body.trim());
    case 'hours':
      return block.week.every((day) => !day.closed && !(day.open && day.close));
    case 'areas':
      return block.items.every((item) => !item.name.trim());
    case 'embed':
      return !block.url.trim();
    case 'posts':
      return block.items.every((item) => !item.title.trim());
  }
}

// ---------------------------------------------------------------------------
// Tabla comparativa
// ---------------------------------------------------------------------------

const YES_VALUES = new Set(['si', 'sí', 'yes', '✓', '✔', '✔️', 'incluido', 'incluye']);
const NO_VALUES = new Set(['no', '✗', '✕', '✖', '×', 'x', '-', '—', 'no incluye']);

/** Qué pintar en una celda: un visto, una cruz, el texto tal cual o nada. */
export function comparisonMark(value: string): 'yes' | 'no' | 'text' | 'empty' {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'empty';
  if (YES_VALUES.has(normalized)) return 'yes';
  if (NO_VALUES.has(normalized)) return 'no';
  return 'text';
}
