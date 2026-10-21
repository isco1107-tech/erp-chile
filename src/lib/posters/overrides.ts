import { z } from 'zod';
import { PUBLIC_ACCENTS } from '@/modules/projects/schema';
import { POSTER_FORMATS } from './formats';
import { PHOTO_POSITIONS, POSTER_PIECES, type PosterContent } from './pieces';
import { POSTER_STYLES } from './styles';

/**
 * Personalización de un afiche desde el estudio: textos propios, datos y
 * lista editados, bloques ocultos, foto, logo y logos de auspiciadores, y
 * tamaño del titular. Todo opcional: lo que no se toca sigue saliendo solo
 * de los datos del certamen. Lo que escribe el usuario es suyo (no es un
 * dato inventado por el sistema); el motor igual lo ajusta para que quepa.
 */

export const POSTER_TEXT_LIMITS = {
  eyebrow: 40,
  kicker: 60,
  headline: 80,
  edition: 24,
  subline: 160,
  cta: 32,
  url: 80,
  note: 200,
} as const;
export type PosterTextSlot = keyof typeof POSTER_TEXT_LIMITS;
export const POSTER_TEXT_SLOTS = Object.keys(POSTER_TEXT_LIMITS) as PosterTextSlot[];

/** Bloques que se pueden ocultar (el rótulo y el titular no: sin ellos no hay afiche). */
export const POSTER_HIDEABLE = ['kicker', 'edition', 'subline', 'facts', 'list', 'note', 'cta', 'qr', 'contact', 'photo'] as const;
export type PosterHideable = (typeof POSTER_HIDEABLE)[number];

export const MAX_POSTER_FACTS = 4;
export const MAX_POSTER_LIST_ITEMS = 5;
export const MAX_SPONSOR_LOGOS = 8;
export const TITLE_SCALE_MIN = 0.7;
export const TITLE_SCALE_MAX = 1.3;

/** Una línea: sin saltos ni caracteres de control, espacios colapsados. */
function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

const line = (max: number, label: string) =>
  z
    .string()
    .transform(oneLine)
    .refine((value) => value.length <= max, `${label}: máximo ${max} caracteres`);

const imageUrl = z.string().url('Imagen inválida').max(500);

const textsSchema = z
  .object({
    eyebrow: line(POSTER_TEXT_LIMITS.eyebrow, 'Rótulo'),
    kicker: line(POSTER_TEXT_LIMITS.kicker, 'Antetítulo'),
    headline: line(POSTER_TEXT_LIMITS.headline, 'Titular'),
    edition: line(POSTER_TEXT_LIMITS.edition, 'Edición'),
    subline: line(POSTER_TEXT_LIMITS.subline, 'Bajada'),
    cta: line(POSTER_TEXT_LIMITS.cta, 'Botón'),
    url: line(POSTER_TEXT_LIMITS.url, 'Dirección'),
    note: line(POSTER_TEXT_LIMITS.note, 'Mensaje'),
  })
  .partial();

export const posterOverridesSchema = z
  .object({
    texts: textsSchema.default({}),
    facts: z
      .array(z.object({ label: line(24, 'Etiqueta del dato'), value: line(48, 'Dato') }))
      .max(MAX_POSTER_FACTS, `Hasta ${MAX_POSTER_FACTS} datos`)
      .optional(),
    list: z
      .object({
        title: line(30, 'Título de la lista'),
        items: z.array(line(70, 'Ítem de la lista')).max(MAX_POSTER_LIST_ITEMS, `Hasta ${MAX_POSTER_LIST_ITEMS} ítems`),
      })
      .optional(),
    hidden: z.array(z.enum(POSTER_HIDEABLE)).max(POSTER_HIDEABLE.length).default([]),
    photoUrl: imageUrl.optional(),
    photoPosition: z.enum(PHOTO_POSITIONS).optional(),
    logoUrl: imageUrl.optional(),
    sponsorLogos: z.array(imageUrl).max(MAX_SPONSOR_LOGOS, `Hasta ${MAX_SPONSOR_LOGOS} logos`).default([]),
    titleScale: z.number().min(TITLE_SCALE_MIN).max(TITLE_SCALE_MAX).default(1),
  })
  .strict();

export type PosterOverrides = z.output<typeof posterOverridesSchema>;
export type PosterOverridesInput = z.input<typeof posterOverridesSchema>;

export const EMPTY_OVERRIDES: PosterOverrides = { texts: {}, hidden: [], sponsorLogos: [], titleScale: 1 };

/** Todas las imágenes que trae una personalización (para validar de dónde vienen). */
export function overrideImages(overrides: PosterOverrides): string[] {
  return [overrides.photoUrl, overrides.logoUrl, ...overrides.sponsorLogos].filter((url): url is string => Boolean(url));
}

/**
 * Lo que se aplica a TODAS las piezas de una campaña (logo, logos de
 * auspiciadores, tamaño del titular): los textos y los datos son de cada
 * pieza y no tendrían sentido en otra.
 */
export function campaignOverrides(overrides: PosterOverrides): PosterOverrides {
  return { ...EMPTY_OVERRIDES, logoUrl: overrides.logoUrl, sponsorLogos: overrides.sponsorLogos, titleScale: overrides.titleScale };
}

/** Aplica la personalización sobre el contenido automático de la pieza. Pura. */
export function applyPosterOverrides(content: PosterContent, overrides: PosterOverrides): PosterContent {
  const hidden = new Set(overrides.hidden);
  const texts = overrides.texts;
  const pick = (custom: string | undefined, auto: string | null) => (custom ? custom : auto);
  const next: PosterContent = {
    ...content,
    eyebrow: pick(texts.eyebrow, content.eyebrow)!,
    headline: pick(texts.headline, content.headline)!,
    kicker: hidden.has('kicker') ? null : pick(texts.kicker, content.kicker),
    edition: hidden.has('edition') ? null : pick(texts.edition, content.edition),
    subline: hidden.has('subline') ? null : pick(texts.subline, content.subline),
    note: hidden.has('note') ? null : pick(texts.note, content.note),
    facts: hidden.has('facts') ? [] : (overrides.facts?.filter((fact) => fact.label || fact.value) ?? content.facts),
    contact: hidden.has('contact') ? [] : content.contact,
    qr: hidden.has('qr') ? null : content.qr,
    decor: {
      logoUrl: overrides.logoUrl ?? null,
      sponsorLogos: overrides.sponsorLogos,
      photoPosition: overrides.photoPosition ?? null,
      titleScale: overrides.titleScale,
    },
  };

  if (hidden.has('list')) {
    next.list = null;
  } else if (overrides.list) {
    const items = overrides.list.items.filter(Boolean);
    next.list = items.length > 0 ? { title: overrides.list.title || content.list?.title || 'Detalles', items, marker: content.list?.marker ?? 'check' } : null;
  }

  // Botón: se puede escribir uno en una pieza que no lo trae (ej. el agradecimiento).
  if (hidden.has('cta')) {
    next.cta = null;
  } else if (texts.cta || texts.url) {
    next.cta = { label: texts.cta || content.cta?.label || 'Más información', displayUrl: texts.url || content.cta?.displayUrl || null };
  }

  // Foto: solo donde la pieza tiene foto (portada o retrato).
  if (content.hero.kind === 'portrait') {
    const photoUrl = hidden.has('photo') ? null : (overrides.photoUrl ?? content.hero.photoUrl);
    next.hero = { ...content.hero, photoUrl };
  } else if (content.hero.kind === 'cover') {
    next.backgroundUrl = hidden.has('photo') ? null : (overrides.photoUrl ?? content.backgroundUrl);
  }
  return next;
}

/** Si la pieza tiene una foto principal que se pueda cambiar. */
export function pieceHasPhoto(content: PosterContent): boolean {
  return content.hero.kind === 'portrait' || content.hero.kind === 'cover';
}

/** Un afiche completo tal como lo pide el estudio (para dibujarlo o guardarlo). */
export const posterRequestSchema = z.object({
  piece: z.enum(POSTER_PIECES),
  style: z.enum(POSTER_STYLES),
  format: z.enum(POSTER_FORMATS),
  accent: z.enum(PUBLIC_ACCENTS).nullable().default(null),
  candidateId: z.string().max(64).nullable().default(null),
  qr: z.boolean().nullable().default(null),
  overrides: posterOverridesSchema.default(EMPTY_OVERRIDES),
});
export type PosterRequestBody = z.output<typeof posterRequestSchema>;

export const MAX_POSTER_DESIGNS = 50;

/** Diseño guardado: el pedido más un nombre. */
export const posterDesignSchema = posterRequestSchema.extend({
  name: z.string().transform(oneLine).pipe(z.string().min(1, 'Ponle un nombre al diseño').max(60, 'Nombre: máximo 60 caracteres')),
});
export type PosterDesignInput = z.output<typeof posterDesignSchema>;
