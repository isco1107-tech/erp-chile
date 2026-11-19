import { z } from 'zod';
import { MAX_BLOCKS } from '@/lib/web-sites/blocks';
import type { CreativePlacement } from '@/lib/web-sites/creative';

/**
 * Diseño libre del micrositio del certamen: en qué orden van sus secciones
 * propias (portada, el certamen, candidatas…) y las del estudio visual, cómo se
 * llama y se ve cada una, y qué piezas globales se muestran. Puro (sin React ni
 * base de datos): lo usan el sitio público, el editor visual y las pruebas.
 *
 * Reglas:
 * - Las secciones propias son una lista CERRADA (`PAGEANT_SECTIONS`): el orden
 *   guardado solo puede nombrar esas o bloques del propio diseño; lo demás se
 *   descarta al leer. Sus datos (candidatas, paquetes, inscripción…) siguen
 *   saliendo del servidor campo por campo: el diseño solo decide orden y forma.
 * - Una sección propia sin datos (p. ej. «Resultados» antes de coronar) no se
 *   dibuja aunque esté en el orden; aparece sola cuando el dato existe.
 * - Un diseño guardado antes del orden libre (sin `layout`) se ve EXACTAMENTE
 *   como antes: el estudio va donde decía su `placement`.
 * - Lectura tolerante: un ajuste inválido vuelve a «automático» sin perder el
 *   resto del diseño.
 */

/** Secciones propias del micrositio, en su orden de fábrica. `inicio` = portada + cinta. */
export const PAGEANT_SECTIONS = ['inicio', 'resultados', 'certamen', 'ganadoras', 'camino', 'postula', 'candidatas', 'votacion', 'gala', 'auspicios', 'director', 'preguntas'] as const;
export type PageantSectionId = (typeof PAGEANT_SECTIONS)[number];

/** Fondos posibles. Una sección oscura solo cambia entre oscuros y una clara entre claros: su texto está pensado para ese fondo. */
export const SECTION_TONES = ['auto', 'night', 'deep', 'paper', 'soft'] as const;
export type SectionTone = (typeof SECTION_TONES)[number];
export const SECTION_SPACINGS = ['auto', 'compact', 'airy'] as const;
export type SectionSpacing = (typeof SECTION_SPACINGS)[number];

export const SECTION_TONE_LABELS: Record<Exclude<SectionTone, 'auto'>, string> = {
  night: 'Noche',
  deep: 'Noche profunda',
  paper: 'Papel',
  soft: 'Papel suave',
};
export const SECTION_SPACING_LABELS: Record<SectionSpacing, string> = { auto: 'Normal', compact: 'Compacto', airy: 'Amplio' };

type Family = 'hero' | 'dark' | 'paper';

export interface PageantSectionInfo {
  label: string;
  /** Qué muestra la sección (panel del editor). */
  description: string;
  /** Cuándo aparece: una sección sin su dato no se dibuja. */
  appearsWhen: string;
  family: Family;
  defaultTone: Exclude<SectionTone, 'auto'> | null;
  /** Tiene etiqueta y título propios que se pueden reemplazar. */
  heading: boolean;
  /**
   * Textos de fábrica (etiqueta, parte normal y cursiva del título). `null` =
   * depende de los datos (el nombre del certamen, la sede, cuántas candidatas…).
   * El sitio los usa tal cual; el panel los muestra como ejemplo.
   */
  defaults: { kicker: string | null; lead: string | null; accent: string | null };
}

export const PAGEANT_SECTION_INFO: Record<PageantSectionId, PageantSectionInfo> = {
  inicio: { label: 'Portada', description: 'Nombre del certamen, frase principal, cuenta regresiva, botones y la cinta animada.', appearsWhen: 'Siempre.', family: 'hero', defaultTone: null, heading: true, defaults: { kicker: null, lead: null, accent: null } },
  resultados: { label: 'Resultados', description: 'La ganadora con su foto y el podio.', appearsWhen: 'Cuando actives «Resultados oficiales» con la ronda final completada.', family: 'dark', defaultTone: 'night', heading: true, defaults: { kicker: 'Resultados oficiales', lead: 'Tenemos', accent: 'nueva reina' } },
  certamen: { label: 'El certamen', description: 'El texto «Sobre el certamen» y las cifras destacadas.', appearsWhen: 'Cuando escribas el texto «Sobre el certamen» o haya cifras que mostrar.', family: 'paper', defaultTone: 'paper', heading: true, defaults: { kicker: 'El certamen', lead: null, accent: null } },
  ganadoras: { label: 'Ganadoras', description: 'El salón de la fama de ediciones anteriores.', appearsWhen: 'Cuando agregues ganadoras en «Salón de la fama».', family: 'dark', defaultTone: 'deep', heading: true, defaults: { kicker: 'Salón de la fama', lead: 'Nuestras', accent: null } },
  camino: { label: 'El camino', description: 'Las etapas del certamen hasta la coronación.', appearsWhen: 'En la vista de candidatas, mientras no haya convocatoria ni aviso de inscripción.', family: 'dark', defaultTone: 'night', heading: true, defaults: { kicker: 'El camino a la corona', lead: 'De la postulación', accent: 'a la corona' } },
  postula: { label: 'Inscripción', description: 'El proceso, lo que incluye y el formulario de postulación.', appearsWhen: 'Con la convocatoria abierta (o el aviso de que abrirá o cerró).', family: 'dark', defaultTone: 'deep', heading: true, defaults: { kicker: 'Tu camino a la corona', lead: 'Así es', accent: 'el proceso' } },
  candidatas: { label: 'Candidatas', description: 'La galería de candidatas oficiales.', appearsWhen: 'Cuando haya candidatas oficiales publicadas en el sitio.', family: 'dark', defaultTone: 'night', heading: true, defaults: { kicker: null, lead: 'Conoce a', accent: 'las candidatas' } },
  votacion: { label: 'Votación', description: 'El ranking en vivo de la votación del público.', appearsWhen: 'Con «Ranking de votación del público» activo y votos pagados.', family: 'dark', defaultTone: 'deep', heading: true, defaults: { kicker: 'Votación del público', lead: 'Ranking', accent: 'en vivo' } },
  gala: { label: 'La gala', description: 'Fecha, lugar, entradas y cómo llegar.', appearsWhen: 'Cuando el certamen tenga fecha de gala, lugar o entradas a la venta.', family: 'paper', defaultTone: 'paper', heading: true, defaults: { kicker: 'La gala final', lead: null, accent: null } },
  auspicios: { label: 'Auspicios', description: 'Paquetes de patrocinio, formulario para marcas y sponsors oficiales.', appearsWhen: 'Con paquetes públicos, sponsors confirmados o el formulario «Ser sponsor».', family: 'dark', defaultTone: 'night', heading: true, defaults: { kicker: 'Patrocinios oficiales', lead: 'Elige tu paquete', accent: 'de patrocinio' } },
  director: { label: 'Dirección', description: 'Quién está detrás del certamen y su trayectoria.', appearsWhen: 'Cuando escribas el nombre del director o directora.', family: 'dark', defaultTone: 'deep', heading: true, defaults: { kicker: 'Detrás del certamen', lead: null, accent: null } },
  preguntas: { label: 'Preguntas', description: 'Las preguntas frecuentes del certamen.', appearsWhen: 'En la vista de candidatas, cuando haya preguntas que responder.', family: 'paper', defaultTone: 'paper', heading: true, defaults: { kicker: 'Dudas', lead: 'Preguntas', accent: 'frecuentes' } },
};

/** Fondos que admite una sección (además de «automático»). */
export function tonesFor(id: PageantSectionId): Array<Exclude<SectionTone, 'auto'>> {
  const family = PAGEANT_SECTION_INFO[id].family;
  return family === 'dark' ? ['night', 'deep'] : family === 'paper' ? ['paper', 'soft'] : [];
}

// ── Esquemas ────────────────────────────────────────────────────────────────

/** Texto propio: `null`/ausente = el automático; '' = sin texto. Inválido vuelve a automático. */
const overrideText = (max: number) => z.string().trim().max(max).nullable().optional().catch(undefined);

export const sectionSettingsSchema = z.object({
  hidden: z.boolean().optional().catch(undefined),
  /** Etiqueta chica sobre el título («01 — El certamen»). */
  kicker: overrideText(60),
  /** Parte normal del título. */
  title: overrideText(120),
  /** Palabras en cursiva del título («las candidatas»). */
  titleAccent: overrideText(80),
  /** Nombre en el menú y el pie ('' o ausente = el automático). */
  navLabel: overrideText(30),
  tone: z.enum(SECTION_TONES).optional().catch(undefined),
  spacing: z.enum(SECTION_SPACINGS).optional().catch(undefined),
});
export type SectionSettings = z.infer<typeof sectionSettingsSchema>;

export const LAYOUT_ITEM_KINDS = ['section', 'block'] as const;
const layoutItemSchema = z.union([
  z.object({ kind: z.literal('section'), id: z.enum(PAGEANT_SECTIONS) }),
  z.object({ kind: z.literal('block'), id: z.string().min(1).max(40) }),
]);
export type LayoutItem = z.infer<typeof layoutItemSchema>;

export const MAX_LAYOUT_ITEMS = PAGEANT_SECTIONS.length + MAX_BLOCKS;

/** Orden guardado: se queda con lo que es válido, en su orden, sin repetir. `undefined` = diseño anterior al orden libre. */
export const pageantLayoutSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const items: LayoutItem[] = [];
  for (const raw of value) {
    const parsed = layoutItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const key = itemKey(parsed.data);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(parsed.data);
    if (items.length >= MAX_LAYOUT_ITEMS) break;
  }
  return items;
}, z.array(layoutItemSchema).optional());

export const pageantSectionsSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<PageantSectionId, unknown>> = {};
  for (const id of PAGEANT_SECTIONS) if (record[id] && typeof record[id] === 'object') result[id] = record[id];
  return result;
}, z.partialRecord(z.enum(PAGEANT_SECTIONS), sectionSettingsSchema));

export const pageantOptionsSchema = z
  .object({
    /** Numeración editorial de las secciones (01, 02…). */
    numbers: z.boolean().catch(true).default(true),
    /** Cinta animada bajo la portada. */
    ribbon: z.boolean().catch(true).default(true),
    /** Botón flotante de WhatsApp. */
    whatsappFloat: z.boolean().catch(true).default(true),
    /** Cuenta regresiva de la portada. */
    countdown: z.boolean().catch(true).default(true),
    /** Píldoras de datos clave de la portada. */
    pills: z.boolean().catch(true).default(true),
  })
  .catch({ numbers: true, ribbon: true, whatsappFloat: true, countdown: true, pills: true });
export type PageantOptions = z.infer<typeof pageantOptionsSchema>;
export const DEFAULT_PAGEANT_OPTIONS: PageantOptions = { numbers: true, ribbon: true, whatsappFloat: true, countdown: true, pills: true };

// ── Claves ──────────────────────────────────────────────────────────────────

export type ItemKey = `section:${PageantSectionId}` | `block:${string}`;

export function itemKey(item: LayoutItem): ItemKey {
  return item.kind === 'section' ? `section:${item.id}` : `block:${item.id}`;
}

export function parseItemKey(key: string): LayoutItem | null {
  const [kind, ...rest] = key.split(':');
  const id = rest.join(':');
  if (kind === 'section' && (PAGEANT_SECTIONS as readonly string[]).includes(id)) return { kind: 'section', id: id as PageantSectionId };
  if (kind === 'block' && id.length > 0 && id.length <= 40) return { kind: 'block', id };
  return null;
}

// ── Resolver el orden ───────────────────────────────────────────────────────

export interface ResolvedLayout {
  /** Lo que va dentro del sitio, en orden. */
  items: LayoutItem[];
  /** Solo diseños anteriores: estudio antes de todo el sitio (`placement: before`). */
  leading: string[];
  /** Solo diseños anteriores: estudio después del pie (`placement: after`). */
  trailing: string[];
}

const DEFAULT_ORDER: LayoutItem[] = PAGEANT_SECTIONS.map((id) => ({ kind: 'section', id }));

/**
 * El orden con el que se dibuja el sitio. Con `layout` guardado: ese orden,
 * sin bloques que ya no existen, con las secciones propias que falten en su
 * lugar de fábrica y los bloques nuevos al final. Sin `layout`: el de siempre.
 */
export function resolveLayout(input: { layout?: LayoutItem[]; blockIds: string[]; placement?: CreativePlacement; enabled?: boolean }): ResolvedLayout {
  const blockIds = input.enabled === false ? [] : input.blockIds;
  if (!input.layout) {
    const blocks: LayoutItem[] = blockIds.map((id) => ({ kind: 'block', id }));
    if (input.placement === 'before') return { items: DEFAULT_ORDER, leading: blockIds, trailing: [] };
    if (input.placement === 'afterHero') return { items: [DEFAULT_ORDER[0]!, ...blocks, ...DEFAULT_ORDER.slice(1)], leading: [], trailing: [] };
    return { items: DEFAULT_ORDER, leading: [], trailing: blockIds };
  }
  const known = new Set(blockIds);
  const items = input.layout.filter((item) => item.kind === 'section' || known.has(item.id));
  // Secciones propias que no están (diseño de antes de que existieran): en su lugar de fábrica.
  for (const id of PAGEANT_SECTIONS) {
    if (items.some((item) => item.kind === 'section' && item.id === id)) continue;
    const before = PAGEANT_SECTIONS.slice(0, PAGEANT_SECTIONS.indexOf(id)).reverse();
    const anchor = before.map((prev) => items.findIndex((item) => item.kind === 'section' && item.id === prev)).find((index) => index >= 0);
    items.splice(anchor === undefined ? 0 : anchor + 1, 0, { kind: 'section', id });
  }
  for (const id of blockIds) if (!items.some((item) => item.kind === 'block' && item.id === id)) items.push({ kind: 'block', id });
  return { items, leading: [], trailing: [] };
}

/**
 * El orden que edita el editor visual: siempre una sola lista. Un diseño
 * anterior se convierte (el estudio «antes de todo» queda al comienzo y el
 * «al final» justo antes del pie); se ve así en la vista previa antes de guardar.
 */
export function editableLayout(input: { layout?: LayoutItem[]; blockIds: string[]; placement?: CreativePlacement }): LayoutItem[] {
  const resolved = resolveLayout({ ...input, enabled: true });
  return [...resolved.leading.map((id): LayoutItem => ({ kind: 'block', id })), ...resolved.items, ...resolved.trailing.map((id): LayoutItem => ({ kind: 'block', id }))];
}

// ── Operaciones del editor (devuelven listas nuevas) ───────────────────────

export function indexOfKey(items: LayoutItem[], key: ItemKey): number {
  return items.findIndex((item) => itemKey(item) === key);
}

/** Inserta un bloque en una posición (0 = al comienzo; `items.length` = al final). */
export function insertBlockAt(items: LayoutItem[], index: number, blockId: string): LayoutItem[] {
  const without = items.filter((item) => !(item.kind === 'block' && item.id === blockId));
  const at = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, at), { kind: 'block', id: blockId }, ...without.slice(at)];
}

/** Lleva un elemento a otra posición (índice de destino en la lista ya sin él). */
export function moveKeyTo(items: LayoutItem[], key: ItemKey, index: number): LayoutItem[] {
  const from = indexOfKey(items, key);
  if (from < 0) return items;
  const item = items[from]!;
  const without = [...items.slice(0, from), ...items.slice(from + 1)];
  const at = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, at), item, ...without.slice(at)];
}

/**
 * Sube o baja un elemento saltándose lo que no se ve (secciones ocultas o sin
 * datos): así «Bajar» siempre cambia lo que la persona ve en la página.
 */
export function moveKeyBy(items: LayoutItem[], key: ItemKey, dir: -1 | 1, isVisible: (item: LayoutItem) => boolean = () => true): LayoutItem[] {
  const from = indexOfKey(items, key);
  if (from < 0) return items;
  let to = from + dir;
  while (to >= 0 && to < items.length && !isVisible(items[to]!)) to += dir;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function removeKey(items: LayoutItem[], key: ItemKey): LayoutItem[] {
  return items.filter((item) => itemKey(item) !== key);
}

// ── Ajustes por sección ─────────────────────────────────────────────────────

export interface ResolvedSectionSettings {
  hidden: boolean;
  kicker: string | null | undefined;
  title: string | null | undefined;
  titleAccent: string | null | undefined;
  navLabel: string | null;
  tone: Exclude<SectionTone, 'auto'> | null;
  spacing: SectionSpacing;
}

export function sectionSettings(sections: Partial<Record<PageantSectionId, SectionSettings>> | undefined, id: PageantSectionId): ResolvedSectionSettings {
  const raw = sections?.[id] ?? {};
  const info = PAGEANT_SECTION_INFO[id];
  const allowed = tonesFor(id);
  const tone = raw.tone && raw.tone !== 'auto' && allowed.includes(raw.tone) ? raw.tone : info.defaultTone;
  return {
    hidden: raw.hidden === true,
    kicker: raw.kicker,
    title: raw.title,
    titleAccent: raw.titleAccent,
    navLabel: raw.navLabel?.trim() ? raw.navLabel.trim() : null,
    tone,
    spacing: raw.spacing ?? 'auto',
  };
}

/** Texto final de una pieza: el propio si existe (aunque sea vacío), si no el automático. */
export function overrideOr(own: string | null | undefined, automatic: string): string {
  return own === null || own === undefined ? automatic : own;
}

/** Clases de fondo y espaciado de una sección (ver `styles.ts`). */
export function sectionToneClasses(tone: ResolvedSectionSettings['tone'], spacing: SectionSpacing): string {
  const toneClass =
    tone === 'night' ? 'is-night' : tone === 'deep' ? 'is-night is-deep' : tone === 'paper' ? 'is-paper' : tone === 'soft' ? 'is-paper is-soft' : '';
  const spacingClass = spacing === 'compact' ? 'is-compact' : spacing === 'airy' ? 'is-airy' : '';
  return [toneClass, spacingClass].filter(Boolean).join(' ');
}

/** Cambia un ajuste; si queda todo en automático, la sección sale del registro (el JSON no crece). */
export function patchSectionSettings(
  sections: Partial<Record<PageantSectionId, SectionSettings>> | undefined,
  id: PageantSectionId,
  patch: Partial<SectionSettings>
): Partial<Record<PageantSectionId, SectionSettings>> {
  const merged: SectionSettings = { ...(sections?.[id] ?? {}), ...patch };
  const clean = Object.fromEntries(Object.entries(merged).filter(([key, value]) => value !== undefined && !(key === 'tone' && value === 'auto') && !(key === 'spacing' && value === 'auto') && !(key === 'hidden' && value === false))) as SectionSettings;
  const next = { ...(sections ?? {}) };
  if (Object.keys(clean).length === 0) delete next[id];
  else next[id] = clean;
  return next;
}
