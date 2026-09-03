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

export const stageTimelineItemCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  startTime: z.coerce.date('Hora de inicio inválida'),
  durationMinutes: z.number().int('La duración debe ser un número entero').positive('La duración debe ser mayor a cero'),
  title: z.string().min(1, 'El título del bloque es obligatorio'),
  description: z.string().optional(),
  candidateId: z.string().optional(),
});

export type StageTimelineItemCreateInput = z.infer<typeof stageTimelineItemCreateSchema>;

export const stageTimelineItemUpdateSchema = stageTimelineItemCreateSchema.omit({ projectId: true }).partial().extend({
  status: z.enum(STAGE_ITEM_STATUSES).optional(),
});

export type StageTimelineItemUpdateInput = z.infer<typeof stageTimelineItemUpdateSchema>;

export const WARDROBE_STATUSES = ['PENDING', 'READY', 'ISSUED', 'RETURNED'] as const;

export const WARDROBE_STATUS_LABELS: Record<WardrobeStatus, string> = {
  PENDING: 'Pendiente',
  READY: 'Lista',
  ISSUED: 'Entregada',
  RETURNED: 'Devuelta',
};

export const wardrobeItemCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  name: z.string().min(1, 'El nombre de la prenda es obligatorio'),
  designer: z.string().optional(),
  stageTimelineItemId: z.string().optional(),
  candidateId: z.string().optional(),
  status: z.enum(WARDROBE_STATUSES).default('PENDING'),
  notes: z.string().optional(),
});

export type WardrobeItemCreateInput = z.infer<typeof wardrobeItemCreateSchema>;

export const wardrobeItemUpdateSchema = wardrobeItemCreateSchema.omit({ projectId: true }).partial();

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
