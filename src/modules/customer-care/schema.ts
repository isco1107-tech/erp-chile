import { z } from 'zod';
import { ACQUISITION_CHANNEL_VALUES } from '@/lib/customer-care/channels';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const FOLLOW_UP_REASONS = ['INACTIVE', 'POST_SALE', 'DETRACTOR', 'MANUAL'] as const;
export const FOLLOW_UP_REASON_LABELS: Record<(typeof FOLLOW_UP_REASONS)[number], string> = {
  INACTIVE: 'Dejó de comprar',
  POST_SALE: 'Postventa',
  DETRACTOR: 'Mala experiencia',
  MANUAL: 'Seguimiento manual',
};

/** Respuesta pública a la encuesta: las 3 preguntas son obligatorias salvo el comentario. */
export const surveyResponseSchema = z.object({
  csat: z.number().int('Elige una nota').min(1, 'Elige una nota de satisfacción').max(5),
  nps: z.number().int('Elige una nota').min(0, 'Elige una nota de recomendación').max(10),
  deliveryOnTime: z.boolean().optional(),
  comment: optionalText(1000),
});
export type SurveyResponseInput = z.infer<typeof surveyResponseSchema>;

export const createSurveySchema = z.object({
  contactId: z.string().min(1, 'Selecciona el cliente'),
  salesDocumentId: z.string().min(1).optional(),
});

export const contactChannelSchema = z.object({
  contactId: z.string().min(1, 'Selecciona el cliente'),
  channel: z.enum(ACQUISITION_CHANNEL_VALUES, { message: 'Elige un canal de la lista' }),
  note: optionalText(200),
});

export const followUpSchema = z.object({
  contactId: z.string().min(1, 'Selecciona el cliente'),
  reason: z.enum(FOLLOW_UP_REASONS).default('MANUAL'),
  dueDate: isoDay,
  note: optionalText(500),
  assignedToId: z.string().min(1).nullable().optional(),
});
export type FollowUpInput = z.infer<typeof followUpSchema>;

export const closeFollowUpSchema = z.object({
  status: z.enum(['DONE', 'SKIPPED']),
  outcome: optionalText(500),
});

export const customerCareSettingsSchema = z.object({
  inactiveAfterDays: z.number().int('Días enteros').min(7, 'Mínimo 7 días').max(730, 'Máximo 730 días'),
  deliveryLeadDays: z.number().int('Días enteros').min(1).max(60).nullable().optional(),
  surveyIntro: optionalText(300),
  followUpMessage: optionalText(600),
});
export type CustomerCareSettingsInput = z.infer<typeof customerCareSettingsSchema>;
