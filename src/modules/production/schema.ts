import { z } from 'zod';
import type { AccreditationLevel, BadgeBackgroundMode, BadgeImageDisplayMode, StageItemStatus, WardrobeStatus } from '@prisma/client';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const STAGE_ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED'] as const;

export const STAGE_ITEM_STATUS_LABELS: Record<StageItemStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Completado',
  SKIPPED: 'Omitido',
};

/**
 * Segmentos típicos de un certamen de belleza. La duración sugerida solo
 * precarga el formulario; `suggestsWardrobe` marca los bloques en los que
 * cada candidata necesita un look propio (base de "Generar plan de looks").
 */
export const STAGE_SEGMENT_TYPES = [
  'OPENING',
  'PRESENTATION',
  'SWIMSUIT',
  'EVENING_GOWN',
  'NATIONAL_COSTUME',
  'QUESTION',
  'ARTISTIC',
  'SPONSOR',
  'BREAK',
  'CROWNING',
  'OTHER',
] as const;

export type StageSegmentTypeKey = (typeof STAGE_SEGMENT_TYPES)[number];

export const STAGE_SEGMENT_META: Record<StageSegmentTypeKey, { label: string; defaultMinutes: number; suggestsWardrobe: boolean }> = {
  OPENING: { label: 'Apertura / opening', defaultMinutes: 8, suggestsWardrobe: true },
  PRESENTATION: { label: 'Presentación de candidatas', defaultMinutes: 10, suggestsWardrobe: false },
  SWIMSUIT: { label: 'Traje de baño', defaultMinutes: 12, suggestsWardrobe: true },
  EVENING_GOWN: { label: 'Traje de gala', defaultMinutes: 15, suggestsWardrobe: true },
  NATIONAL_COSTUME: { label: 'Traje típico / fantasía', defaultMinutes: 12, suggestsWardrobe: true },
  QUESTION: { label: 'Ronda de preguntas', defaultMinutes: 15, suggestsWardrobe: false },
  ARTISTIC: { label: 'Número artístico', defaultMinutes: 5, suggestsWardrobe: false },
  SPONSOR: { label: 'Mención de auspiciador', defaultMinutes: 2, suggestsWardrobe: false },
  BREAK: { label: 'Pausa / comercial', defaultMinutes: 5, suggestsWardrobe: false },
  CROWNING: { label: 'Coronación', defaultMinutes: 10, suggestsWardrobe: false },
  OTHER: { label: 'Otro', defaultMinutes: 5, suggestsWardrobe: false },
};

const optionalCue = z.string().trim().max(300).optional();

export const stageTimelineItemCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  startTime: z.coerce.date('Hora de inicio inválida'),
  durationMinutes: z.number().int('La duración debe ser un número entero').positive('La duración debe ser mayor a cero').max(600, 'Un bloque no puede durar más de 10 horas'),
  title: z.string().trim().min(1, 'El título del bloque es obligatorio').max(160),
  description: z.string().max(2000).optional(),
  candidateId: z.string().optional(),
  segmentType: z.enum(STAGE_SEGMENT_TYPES).default('OTHER'),
  responsible: z.string().trim().max(120).optional(),
  audioCue: optionalCue,
  lightingCue: optionalCue,
  videoCue: optionalCue,
});

export type StageTimelineItemCreateInput = z.infer<typeof stageTimelineItemCreateSchema>;

export const stageTimelineItemUpdateSchema = stageTimelineItemCreateSchema
  .omit({ projectId: true, segmentType: true })
  .partial()
  .extend({
    status: z.enum(STAGE_ITEM_STATUSES).optional(),
    segmentType: z.enum(STAGE_SEGMENT_TYPES).optional(),
  });

export type StageTimelineItemUpdateInput = z.infer<typeof stageTimelineItemUpdateSchema>;

/** Controles del modo show: marcan la hora REAL de cada bloque. */
export const STAGE_LIVE_ACTIONS = ['start', 'finish', 'skip', 'reset'] as const;
export type StageLiveAction = (typeof STAGE_LIVE_ACTIONS)[number];

export const chainScheduleSchema = z.object({
  projectId: z.string().min(1),
  firstStart: z.coerce.date('Hora de inicio inválida'),
});

export const WARDROBE_STATUSES = ['PENDING', 'READY', 'ISSUED', 'RETURNED'] as const;

export const WARDROBE_STATUS_LABELS: Record<WardrobeStatus, string> = {
  PENDING: 'Pendiente',
  READY: 'Lista',
  ISSUED: 'Entregada',
  RETURNED: 'Devuelta',
};

/** Siguiente paso natural de una prenda, para el botón de avance rápido. */
export const WARDROBE_NEXT_STATUS: Partial<Record<WardrobeStatus, WardrobeStatus>> = {
  PENDING: 'READY',
  READY: 'ISSUED',
  ISSUED: 'RETURNED',
};

export const WARDROBE_SOURCES = ['PRODUCTION', 'DESIGNER', 'SPONSOR', 'RENTAL', 'CANDIDATE_OWN'] as const;

export const WARDROBE_SOURCE_LABELS: Record<(typeof WARDROBE_SOURCES)[number], string> = {
  PRODUCTION: 'De la producción',
  DESIGNER: 'Diseñador',
  SPONSOR: 'Auspiciador (canje)',
  RENTAL: 'Arriendo',
  CANDIDATE_OWN: 'Propio de la candidata',
};

export const wardrobeItemCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  name: z.string().trim().min(1, 'El nombre de la prenda es obligatorio').max(160),
  designer: z.string().max(120).optional(),
  stageTimelineItemId: z.string().optional(),
  candidateId: z.string().optional(),
  status: z.enum(WARDROBE_STATUSES).default('PENDING'),
  notes: z.string().max(2000).optional(),
  source: z.enum(WARDROBE_SOURCES).default('PRODUCTION'),
  size: z.string().trim().max(20).optional(),
  color: z.string().trim().max(40).optional(),
  valuation: z.number().int('El valor debe ser un número entero').min(0).max(1_000_000_000).nullable().optional(),
  fittingAt: z.coerce.date().nullable().optional(),
  returnDueAt: z.coerce.date().nullable().optional(),
});

export type WardrobeItemCreateInput = z.infer<typeof wardrobeItemCreateSchema>;

export const wardrobeItemUpdateSchema = wardrobeItemCreateSchema.omit({ projectId: true, status: true, source: true }).partial().extend({
  status: z.enum(WARDROBE_STATUSES).optional(),
  source: z.enum(WARDROBE_SOURCES).optional(),
});

export type WardrobeItemUpdateInput = z.infer<typeof wardrobeItemUpdateSchema>;

export const ACCREDITATION_LEVELS = ['GENERAL', 'BACKSTAGE', 'VIP', 'STAFF'] as const;

export const ACCREDITATION_LEVEL_LABELS: Record<AccreditationLevel, string> = {
  GENERAL: 'General',
  BACKSTAGE: 'Backstage',
  VIP: 'VIP',
  STAFF: 'Staff de producción',
};

export const staffAccreditationCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  fullName: z.string().min(1, 'El nombre es obligatorio'),
  role: z.string().min(1, 'El rol/función es obligatorio'),
  organization: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  accessLevel: z.enum(ACCREDITATION_LEVELS).default('GENERAL'),
  badgeCode: z.string().min(1, 'El código de acreditación es obligatorio'),
  templateId: z.string().optional(),
});

export type StaffAccreditationCreateInput = z.infer<typeof staffAccreditationCreateSchema>;

// ---------------------------------------------------------------------------
// Diseño de credencial (BadgeTemplate)
// ---------------------------------------------------------------------------

export const BADGE_BACKGROUND_MODES = ['COLOR', 'IMAGE'] as const;
export const BADGE_IMAGE_DISPLAY_MODES = ['SOLID', 'WATERMARK'] as const;

export const BADGE_BACKGROUND_MODE_LABELS: Record<BadgeBackgroundMode, string> = {
  COLOR: 'Color sólido',
  IMAGE: 'Imagen de fondo',
};

export const BADGE_IMAGE_DISPLAY_MODE_LABELS: Record<BadgeImageDisplayMode, string> = {
  SOLID: 'Opaca',
  WATERMARK: 'Marca de agua',
};

// Base sin refinamientos: `.omit()`/`.partial()` no se pueden encadenar sobre
// un schema que ya tiene un `.refine()` (zod lo rechaza en tiempo de módulo,
// no es un error de tipos — revienta recién al cargar el módulo). Por eso el
// refine que exige `backgroundImageUrl` en modo IMAGE se aplica solo en
// `badgeTemplateCreateSchema`, encima de esta base compartida.
const badgeTemplateBaseSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  name: z.string().min(1, 'El nombre de la plantilla es obligatorio'),
  backgroundMode: z.enum(BADGE_BACKGROUND_MODES).default('COLOR'),
  backgroundColor: z.string().regex(HEX_COLOR_RE, 'Color inválido (use formato #rrggbb)').default('#1e3a5f'),
  backgroundImageUrl: z.string().url('URL de imagen inválida').optional(),
  imageDisplayMode: z.enum(BADGE_IMAGE_DISPLAY_MODES).default('SOLID'),
  watermarkOpacityBps: z.number().int().min(0).max(10000).default(2000),
  accentColor: z.string().regex(HEX_COLOR_RE, 'Color inválido (use formato #rrggbb)').default('#1e3a5f'),
  textColor: z.string().regex(HEX_COLOR_RE, 'Color inválido (use formato #rrggbb)').default('#0f172a'),
  isDefault: z.boolean().default(false),
});

export const badgeTemplateCreateSchema = badgeTemplateBaseSchema.refine(
  (data) => data.backgroundMode !== 'IMAGE' || !!data.backgroundImageUrl,
  { message: 'Suba una imagen de fondo o cambie a color sólido', path: ['backgroundImageUrl'] }
);

export type BadgeTemplateCreateInput = z.infer<typeof badgeTemplateCreateSchema>;

export const badgeTemplateUpdateSchema = badgeTemplateBaseSchema
  .omit({ projectId: true })
  .partial()
  .extend({
    // Debe poder mandarse explícitamente `undefined`/vacío para volver a color sólido.
    backgroundImageUrl: z.string().url('URL de imagen inválida').optional().or(z.literal('')),
  });

export type BadgeTemplateUpdateInput = z.infer<typeof badgeTemplateUpdateSchema>;
