import { z } from 'zod';
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

const text = (max: number) => z.string().trim().max(max).default('');
const link = z.string().trim().max(500).default('');
/** Elección de una lista cerrada; un valor desconocido cae al de fábrica. */
const choice = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).default(fallback).catch(fallback);

// ---------------------------------------------------------------------------
// Estilo de la sección (común a todos los bloques)
// ---------------------------------------------------------------------------

export const SECTION_BACKGROUNDS = ['default', 'muted', 'primary', 'accent', 'dark', 'image'] as const;
export type SectionBackground = (typeof SECTION_BACKGROUNDS)[number];
export const SECTION_SPACINGS = ['auto', 'none', 'sm', 'md', 'lg'] as const;
export type SectionSpacing = (typeof SECTION_SPACINGS)[number];
export const SECTION_ALIGNS = ['auto', 'left', 'center'] as const;
export type SectionAlign = (typeof SECTION_ALIGNS)[number];

export const blockStyleSchema = z.object({
  /** Fondo de la franja: el de la página, uno suave, los colores del tema, oscuro o una foto. */
  background: choice(SECTION_BACKGROUNDS, 'default'),
  /** Foto de fondo (solo con `background: 'image'`); se oscurece con `overlay` para que el texto se lea. */
  backgroundImage: link,
  /** Oscurecimiento de la foto de fondo, 0–90 %. */
  overlay: z.number().int().min(0).max(90).default(55).catch(55),
  spacing: choice(SECTION_SPACINGS, 'auto'),
  align: choice(SECTION_ALIGNS, 'auto'),
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
// ---------------------------------------------------------------------------

export const HERO_VARIANTS = ['center', 'split', 'full', 'minimal'] as const;
export const heroBlockSchema = z.object({
  ...base,
  type: z.literal('hero'),
  /** Texto pequeño sobre el título ("Nuevo", "Desde 1998"…). */
  eyebrow: text(60),
  title: text(120),
  subtitle: text(300),
  imageUrl: link,
  ctaLabel: text(40),
  ctaHref: link,
  secondaryLabel: text(40),
  secondaryHref: link,
  /** center: texto centrado sobre color o foto · split: texto e imagen lado a lado · full: pantalla completa · minimal: solo texto, sin franja de color. */
  variant: choice(HERO_VARIANTS, 'center'),
});

export const textBlockSchema = z.object({
  ...base,
  type: z.literal('text'),
  heading: text(120),
  /** Admite formato simple (ver `rich-text.ts`). */
  body: text(4000),
});

export const SPLIT_SIDES = ['left', 'right'] as const;
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
});

export const IMAGE_SIZES = ['normal', 'wide', 'full'] as const;
export const imageBlockSchema = z.object({
  ...base,
  type: z.literal('image'),
  imageUrl: link,
  alt: text(160),
  caption: text(200),
  size: choice(IMAGE_SIZES, 'normal'),
});

export const GALLERY_VARIANTS = ['grid', 'masonry', 'carousel'] as const;
export const galleryImageSchema = z.object({ url: link, alt: text(160), caption: text(120) });
export const galleryBlockSchema = z.object({
  ...base,
  type: z.literal('gallery'),
  heading: text(120),
  images: z.array(galleryImageSchema).max(MAX_GALLERY_IMAGES).default([]),
  variant: choice(GALLERY_VARIANTS, 'grid'),
  columns: choice(COLUMN_OPTIONS, '3'),
});

export const FEATURE_VARIANTS = ['cards', 'icons', 'list'] as const;
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

export const statItemSchema = z.object({ value: text(20), label: text(80) });
export const statsBlockSchema = z.object({
  ...base,
  type: z.literal('stats'),
  heading: text(120),
  intro: text(300),
  items: z.array(statItemSchema).max(MAX_STATS).default([]),
});

export const stepItemSchema = z.object({ title: text(80), text: text(400) });
export const stepsBlockSchema = z.object({
  ...base,
  type: z.literal('steps'),
  heading: text(120),
  intro: text(300),
  items: z.array(stepItemSchema).max(MAX_STEPS).default([]),
});

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
});

export const teamMemberSchema = z.object({ name: text(80), role: text(80), photoUrl: link, bio: text(300) });
export const teamBlockSchema = z.object({
  ...base,
  type: z.literal('team'),
  heading: text(120),
  intro: text(300),
  items: z.array(teamMemberSchema).max(MAX_LIST_ITEMS).default([]),
});

export const TESTIMONIAL_VARIANTS = ['cards', 'quotes'] as const;
export const testimonialItemSchema = z.object({ quote: text(500), author: text(80), role: text(80), photoUrl: link, rating: z.number().int().min(0).max(5).default(0).catch(0) });
export const testimonialsBlockSchema = z.object({
  ...base,
  type: z.literal('testimonials'),
  heading: text(120),
  items: z.array(testimonialItemSchema).max(MAX_LIST_ITEMS).default([]),
  variant: choice(TESTIMONIAL_VARIANTS, 'cards'),
});

export const quoteBlockSchema = z.object({
  ...base,
  type: z.literal('quote'),
  quote: text(400),
  author: text(80),
  role: text(80),
});

export const logoItemSchema = z.object({ imageUrl: link, alt: text(160), href: link });
export const logosBlockSchema = z.object({
  ...base,
  type: z.literal('logos'),
  heading: text(120),
  items: z.array(logoItemSchema).max(MAX_LOGOS).default([]),
});

export const priceItemSchema = z.object({ name: text(80), description: text(200), price: text(30), tag: text(24) });
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
});

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
});

export const scheduleRowSchema = z.object({ day: text(40), time: text(40), title: text(80), detail: text(160) });
export const scheduleBlockSchema = z.object({
  ...base,
  type: z.literal('schedule'),
  heading: text(120),
  intro: text(300),
  /** Filas seguidas con el mismo día se agrupan bajo ese día. */
  rows: z.array(scheduleRowSchema).max(MAX_SCHEDULE_ROWS).default([]),
});

export const faqItemSchema = z.object({ question: text(200), answer: text(1000) });
export const faqBlockSchema = z.object({
  ...base,
  type: z.literal('faq'),
  heading: text(120),
  items: z.array(faqItemSchema).max(MAX_LIST_ITEMS).default([]),
});

export const CTA_VARIANTS = ['card', 'band'] as const;
export const ctaBlockSchema = z.object({
  ...base,
  type: z.literal('cta'),
  title: text(120),
  text: text(300),
  buttonLabel: text(40),
  buttonHref: link,
  secondaryLabel: text(40),
  secondaryHref: link,
  variant: choice(CTA_VARIANTS, 'card'),
});

export const videoBlockSchema = z.object({
  ...base,
  type: z.literal('video'),
  heading: text(120),
  intro: text(300),
  /** Enlace de YouTube o Vimeo (ver `videoEmbed`). */
  url: z.string().trim().max(300).default(''),
  caption: text(200),
});

export const MAP_HEIGHTS = ['sm', 'md', 'lg'] as const;
export const mapBlockSchema = z.object({
  ...base,
  type: z.literal('map'),
  heading: text(120),
  text: text(300),
  address: text(200),
  height: choice(MAP_HEIGHTS, 'md'),
});

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
});

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
});

export const DIVIDER_VARIANTS = ['line', 'dots', 'space'] as const;
export const DIVIDER_SIZES = ['sm', 'md', 'lg'] as const;
export const dividerBlockSchema = z.object({
  ...base,
  type: z.literal('divider'),
  variant: choice(DIVIDER_VARIANTS, 'line'),
  size: choice(DIVIDER_SIZES, 'md'),
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
    | 'Minus';
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
    description: 'Una línea o un espacio entre secciones.',
    help: 'Úsalo con moderación: para separar dos secciones con el mismo fondo o dar aire antes de un cierre.',
    category: 'basic',
    icon: 'Minus',
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
      return block.heading;
    case 'hero':
    case 'image':
    case 'quote':
    case 'cta':
    case 'divider':
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
const NON_TEXT_KEYS = new Set(['id', 'type', 'style', 'variant', 'columns', 'icon', 'imageSide', 'size', 'height', 'target', 'url', 'rating', 'highlighted']);

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
  return out;
}

/** Todas las URLs de imagen que usa un bloque (incluida la foto de fondo de la sección). */
export function blockImageUrls(block: WebSiteBlock): string[] {
  const urls: string[] = [];
  if (block.style.background === 'image' || block.style.backgroundImage) urls.push(block.style.backgroundImage);
  switch (block.type) {
    case 'hero':
    case 'image':
    case 'split':
      urls.push(block.imageUrl);
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
    default:
      break;
  }
  return out;
}

/** ¿La sección no tiene nada que mostrar? (Se omite al publicar y la lista "qué falta" lo avisa.) */
export function isBlockEmpty(block: WebSiteBlock): boolean {
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
  }
}
