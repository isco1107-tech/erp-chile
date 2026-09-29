import { z } from 'zod';
import { slugify } from './urls';

/**
 * Bloques de un sitio armado en modo guiado. Un sitio es una lista ordenada de
 * bloques; cada tipo tiene campos fijos y un texto de ayuda que le explica al
 * usuario para qué sirve y qué poner. El renderizador (`SiteRenderer`) pinta
 * exactamente estos tipos: no hay HTML libre en modo guiado, así que un texto
 * nunca puede romper la página ni ejecutar código.
 *
 * El borrador es permisivo (campos vacíos permitidos, para poder guardar a
 * medias); lo que falta para publicar lo dice `readiness.ts`, no el esquema.
 */

export const BLOCK_TYPES = ['hero', 'text', 'image', 'gallery', 'features', 'cta', 'faq', 'testimonials', 'contact'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const MAX_BLOCKS = 40;
export const MAX_GALLERY_IMAGES = 12;
export const MAX_LIST_ITEMS = 12;

const text = (max: number) => z.string().trim().max(max).default('');
const link = z.string().trim().max(500).default('');

const base = {
  id: z.string().trim().min(1).max(40),
  /** Oculto = no se publica, pero el contenido se conserva en el editor. */
  hidden: z.boolean().default(false),
};

export const heroBlockSchema = z.object({
  ...base,
  type: z.literal('hero'),
  title: text(120),
  subtitle: text(300),
  imageUrl: link,
  ctaLabel: text(40),
  ctaHref: link,
});

export const textBlockSchema = z.object({
  ...base,
  type: z.literal('text'),
  heading: text(120),
  body: text(4000),
});

export const imageBlockSchema = z.object({
  ...base,
  type: z.literal('image'),
  imageUrl: link,
  alt: text(160),
  caption: text(200),
});

export const galleryImageSchema = z.object({ url: link, alt: text(160) });
export const galleryBlockSchema = z.object({
  ...base,
  type: z.literal('gallery'),
  heading: text(120),
  images: z.array(galleryImageSchema).max(MAX_GALLERY_IMAGES).default([]),
});

export const featureItemSchema = z.object({ title: text(80), text: text(400), imageUrl: link });
export const featuresBlockSchema = z.object({
  ...base,
  type: z.literal('features'),
  heading: text(120),
  intro: text(300),
  items: z.array(featureItemSchema).max(MAX_LIST_ITEMS).default([]),
});

export const ctaBlockSchema = z.object({
  ...base,
  type: z.literal('cta'),
  title: text(120),
  text: text(300),
  buttonLabel: text(40),
  buttonHref: link,
});

export const faqItemSchema = z.object({ question: text(200), answer: text(1000) });
export const faqBlockSchema = z.object({
  ...base,
  type: z.literal('faq'),
  heading: text(120),
  items: z.array(faqItemSchema).max(MAX_LIST_ITEMS).default([]),
});

export const testimonialItemSchema = z.object({ quote: text(500), author: text(80), role: text(80) });
export const testimonialsBlockSchema = z.object({
  ...base,
  type: z.literal('testimonials'),
  heading: text(120),
  items: z.array(testimonialItemSchema).max(MAX_LIST_ITEMS).default([]),
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
  /** Formulario: lo que escriban llega a la bandeja "Mensajes" del sitio. */
  showForm: z.boolean().default(true),
});

export const blockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  galleryBlockSchema,
  featuresBlockSchema,
  ctaBlockSchema,
  faqBlockSchema,
  testimonialsBlockSchema,
  contactBlockSchema,
]);

export const blocksSchema = z
  .array(blockSchema)
  .max(MAX_BLOCKS, `Un sitio puede tener hasta ${MAX_BLOCKS} secciones`)
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

export interface BlockTypeInfo {
  label: string;
  /** Una línea: qué es. */
  description: string;
  /** Guía para quien nunca armó un sitio: qué poner y qué evitar. */
  help: string;
  /** Nombre del ícono de lucide-react que la UI usa para este tipo. */
  icon: 'Sparkles' | 'Type' | 'Image' | 'Images' | 'LayoutGrid' | 'MousePointerClick' | 'HelpCircle' | 'Quote' | 'Mail';
}

export const BLOCK_INFO: Record<BlockType, BlockTypeInfo> = {
  hero: {
    label: 'Portada',
    description: 'Lo primero que se ve: título grande, una frase y un botón.',
    help: 'Di en una frase qué haces y para quién. El botón debe llevar a la acción más importante (escribirte, cotizar, comprar). Una sola portada por sitio.',
    icon: 'Sparkles',
  },
  text: {
    label: 'Texto',
    description: 'Un título y uno o más párrafos.',
    help: 'Ideal para "Quiénes somos" o "Nuestra historia". Párrafos cortos (3–4 líneas) se leen mejor en el celular. Separa los párrafos con una línea en blanco.',
    icon: 'Type',
  },
  image: {
    label: 'Imagen',
    description: 'Una foto grande con su descripción.',
    help: 'Usa fotos propias y nítidas. La descripción (texto alternativo) la leen los lectores de pantalla y ayuda a que te encuentren en Google: describe lo que se ve.',
    icon: 'Image',
  },
  gallery: {
    label: 'Galería',
    description: 'Varias fotos en cuadrícula.',
    help: 'Entre 3 y 9 fotos de tamaño parecido se ven mejor. Muestra trabajos terminados, productos o momentos del evento.',
    icon: 'Images',
  },
  features: {
    label: 'Servicios o beneficios',
    description: 'Tarjetas con título y descripción corta.',
    help: 'Tres a seis tarjetas. Cada una responde "¿qué gano yo?": un servicio, un producto, una ventaja. Evita párrafos largos.',
    icon: 'LayoutGrid',
  },
  cta: {
    label: 'Llamado a la acción',
    description: 'Una franja con un mensaje y un botón.',
    help: 'Úsalo entre secciones para invitar a dar el siguiente paso. Un solo botón, con un verbo: "Cotizar", "Reservar", "Escribir por WhatsApp".',
    icon: 'MousePointerClick',
  },
  faq: {
    label: 'Preguntas frecuentes',
    description: 'Preguntas y respuestas que ahorran mensajes.',
    help: 'Anota lo que más te preguntan: precios, plazos, formas de pago, cobertura. Cada respuesta en pocas líneas.',
    icon: 'HelpCircle',
  },
  testimonials: {
    label: 'Testimonios',
    description: 'Lo que dicen tus clientes.',
    help: 'Con nombre y, si puedes, cargo o empresa. Pide autorización antes de publicar la opinión de alguien.',
    icon: 'Quote',
  },
  contact: {
    label: 'Contacto',
    description: 'Datos de contacto y formulario de mensajes.',
    help: 'Pon al menos un medio (correo, teléfono o WhatsApp). Si activas el formulario, los mensajes llegan a la bandeja "Mensajes" del sitio y te avisamos en el panel.',
    icon: 'Mail',
  },
};

/** Bloque nuevo, vacío pero con la estructura lista (una fila de ejemplo en las listas). */
export function createBlock(type: BlockType): WebSiteBlock {
  const id = newBlockId();
  switch (type) {
    case 'hero':
      return heroBlockSchema.parse({ id, type });
    case 'text':
      return textBlockSchema.parse({ id, type });
    case 'image':
      return imageBlockSchema.parse({ id, type });
    case 'gallery':
      return galleryBlockSchema.parse({ id, type, images: [{}] });
    case 'features':
      return featuresBlockSchema.parse({ id, type, items: [{}, {}, {}] });
    case 'cta':
      return ctaBlockSchema.parse({ id, type });
    case 'faq':
      return faqBlockSchema.parse({ id, type, items: [{}] });
    case 'testimonials':
      return testimonialsBlockSchema.parse({ id, type, items: [{}] });
    case 'contact':
      return contactBlockSchema.parse({ id, type });
  }
}

/** Título con el que la sección aparece en el menú del sitio; `''` si no debe aparecer. */
export function blockNavLabel(block: WebSiteBlock): string {
  switch (block.type) {
    case 'text':
    case 'gallery':
    case 'features':
    case 'faq':
    case 'testimonials':
    case 'contact':
      return block.heading;
    case 'cta':
      return '';
    case 'hero':
    case 'image':
      return '';
  }
}

export interface NavEntry {
  label: string;
  anchor: string;
}

/** Ancla estable de cada bloque visible; única aunque dos secciones se llamen igual. */
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

/** Entradas del menú: secciones visibles con título. */
export function buildNav(blocks: WebSiteBlock[]): NavEntry[] {
  const visible = blocks.filter((block) => !block.hidden);
  const anchors = blockAnchors(visible);
  return visible.flatMap((block) => {
    const label = blockNavLabel(block);
    return label ? [{ label, anchor: anchors.get(block.id) ?? block.id }] : [];
  });
}

/** Todos los textos editables de un bloque (para buscar ejemplos sin cambiar). */
export function blockTexts(block: WebSiteBlock): string[] {
  const out: string[] = [];
  const visit = (value: unknown, key?: string) => {
    if (typeof value === 'string') {
      if (value && key !== 'id' && key !== 'type' && key !== 'imageUrl' && key !== 'url' && !/Href$/.test(key ?? '')) out.push(value);
    } else if (Array.isArray(value)) value.forEach((v) => visit(v));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => visit(v, k));
  };
  visit(block);
  return out;
}

/** Todas las URLs de imagen que usa un bloque. */
export function blockImageUrls(block: WebSiteBlock): string[] {
  switch (block.type) {
    case 'hero':
    case 'image':
      return block.imageUrl ? [block.imageUrl] : [];
    case 'gallery':
      return block.images.map((image) => image.url).filter(Boolean);
    case 'features':
      return block.items.map((item) => item.imageUrl).filter(Boolean);
    default:
      return [];
  }
}
