import { z } from 'zod';
import { parseItemKey, type ItemKey } from './pageant-layout';

/**
 * Mensajes entre el editor visual (el panel) y su lienzo (el iframe con el
 * sitio, `/preview/certamen/[id]/editor`). Los dos lados son la misma
 * aplicación y el mismo origen; aun así, todo mensaje se valida con estos
 * esquemas y se descarta si no viene del otro lado esperado (`event.source`) y
 * del mismo origen (`event.origin`).
 */

export const PAGEANT_EDITOR_CHANNEL = 'aether-pageant-editor';

/** Lo que se puede seleccionar en el lienzo: una sección propia, un bloque del estudio o el pie. */
export type EditorKey = ItemKey | 'footer';

const keySchema = z
  .string()
  .max(60)
  .refine((key) => key === 'footer' || parseItemKey(key) !== null, 'Elemento desconocido')
  .transform((key) => key as EditorKey);

/** Textos que se editan en el lugar con doble clic. */
export const INLINE_FIELDS = ['kicker', 'title', 'titleAccent', 'tagline', 'description'] as const;
export type InlineField = (typeof INLINE_FIELDS)[number];

export const EDITOR_ACTIONS = ['up', 'down', 'hide', 'duplicate', 'delete'] as const;
export type EditorAction = (typeof EDITOR_ACTIONS)[number];

/** Atajos que se pulsan con el foco dentro del lienzo y los resuelve el panel. */
export const EDITOR_SHORTCUTS = ['undo', 'redo', 'save', 'deselect'] as const;
export type EditorShortcut = (typeof EDITOR_SHORTCUTS)[number];

const channel = z.literal(PAGEANT_EDITOR_CHANNEL);

/** Del panel al lienzo. */
export const toCanvasSchema = z.discriminatedUnion('type', [
  z.object({
    channel,
    type: z.literal('state'),
    /** `PageantEditorDraft` (el lienzo lo valida con su esquema). */
    draft: z.unknown(),
    audience: z.enum(['candidata', 'sponsor']).nullable(),
    /** `edit`: clic selecciona; `test`: se usa el sitio como un visitante (sin enviar formularios ni salir). */
    mode: z.enum(['edit', 'test']),
    selected: keySchema.nullable(),
  }),
  z.object({ channel, type: z.literal('scrollTo'), key: keySchema }),
]);
export type ToCanvasMessage = z.infer<typeof toCanvasSchema>;

/** Del lienzo al panel. */
export const toEditorSchema = z.discriminatedUnion('type', [
  z.object({ channel, type: z.literal('ready') }),
  z.object({ channel, type: z.literal('select'), key: keySchema.nullable() }),
  /** Insertar un bloque entre dos elementos visibles (el panel calcula la posición en su propia lista). */
  z.object({ channel, type: z.literal('insert'), after: keySchema.nullable(), before: keySchema.nullable() }),
  z.object({ channel, type: z.literal('action'), key: keySchema, action: z.enum(EDITOR_ACTIONS) }),
  z.object({ channel, type: z.literal('editText'), key: keySchema, field: z.enum(INLINE_FIELDS), value: z.string().max(8000) }),
  z.object({ channel, type: z.literal('notice'), text: z.string().max(200) }),
  z.object({ channel, type: z.literal('shortcut'), shortcut: z.enum(EDITOR_SHORTCUTS) }),
  /** Qué se está viendo, de arriba abajo (las secciones sin datos u ocultas no están). */
  z.object({ channel, type: z.literal('rendered'), keys: z.array(keySchema).max(200) }),
]);
export type ToEditorMessage = z.infer<typeof toEditorSchema>;

export function parseToCanvas(data: unknown): ToCanvasMessage | null {
  const parsed = toCanvasSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function parseToEditor(data: unknown): ToEditorMessage | null {
  const parsed = toEditorSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Arma un mensaje con su canal (para no olvidarlo en cada envío). */
export function editorMessage<T extends { type: string }>(message: T): T & { channel: typeof PAGEANT_EDITOR_CHANNEL } {
  return { ...message, channel: PAGEANT_EDITOR_CHANNEL };
}
