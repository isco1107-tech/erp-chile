import { z } from 'zod';
import { SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';

export const OPPORTUNITY_STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
export type OpportunityStageKey = (typeof OPPORTUNITY_STAGES)[number];

/** Etapas abiertas, en el orden en que avanza un negocio. */
export const OPEN_STAGES: OpportunityStageKey[] = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'];

export const STAGE_LABELS: Record<OpportunityStageKey, string> = {
  LEAD: 'Prospecto',
  QUALIFIED: 'Calificado',
  PROPOSAL: 'Propuesta enviada',
  NEGOTIATION: 'Negociación',
  WON: 'Ganado',
  LOST: 'Perdido',
};

/**
 * Probabilidad sugerida al entrar a cada etapa. Es la base del pronóstico
 * ponderado; el vendedor puede corregirla por negocio.
 */
export const STAGE_DEFAULT_PROBABILITY: Record<OpportunityStageKey, number> = {
  LEAD: 10,
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

/** Días sin moverse de etapa a partir de los cuales un negocio abierto se considera estancado. */
export const STALE_AFTER_DAYS = 21;

export const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'TASK', 'NOTE'] as const;
export type ActivityTypeKey = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_TYPE_LABELS: Record<ActivityTypeKey, string> = {
  CALL: 'Llamada',
  EMAIL: 'Correo',
  MEETING: 'Reunión',
  WHATSAPP: 'WhatsApp',
  TASK: 'Tarea',
  NOTE: 'Nota',
};

/**
 * Qué vende una productora de certámenes. El tipo ordena el embudo, los
 * reportes y decide qué campos pide el formulario (plan y nivel de auspicio
 * solo tienen sentido en `SPONSORSHIP`).
 */
export const DEAL_TYPES = ['SPONSORSHIP', 'EVENT_PRODUCTION', 'CORPORATE_TICKETS', 'TALENT_BOOKING', 'LICENSING', 'MEDIA', 'OTHER'] as const;
export type DealTypeKey = (typeof DEAL_TYPES)[number];

export const DEAL_TYPE_LABELS: Record<DealTypeKey, string> = {
  SPONSORSHIP: 'Auspicio',
  EVENT_PRODUCTION: 'Producción de evento',
  CORPORATE_TICKETS: 'Entradas corporativas',
  TALENT_BOOKING: 'Presentación de reinas',
  LICENSING: 'Franquicia / licencia',
  MEDIA: 'Medios / transmisión',
  OTHER: 'Otro',
};

export const DEAL_TYPE_HINTS: Record<DealTypeKey, string> = {
  SPONSORSHIP: 'Una marca que auspicia un certamen, en efectivo, canje o ambos.',
  EVENT_PRODUCTION: 'Producir un evento para un tercero (corporativo, lanzamiento, gala).',
  CORPORATE_TICKETS: 'Mesas o bloques de entradas para empresas.',
  TALENT_BOOKING: 'Candidatas o reinas en eventos, campañas o activaciones de marca.',
  LICENSING: 'Franquicia regional, licencia de marca o formato del certamen.',
  MEDIA: 'Derechos de transmisión, streaming o alianzas con medios.',
  OTHER: 'Cualquier otro negocio.',
};

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type PriorityKey = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<PriorityKey, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

/** Origen que usa el formulario "Quiero auspiciar" del micrositio público. */
export const WEB_LEAD_SOURCE = 'Sitio del certamen';

export const OPPORTUNITY_SOURCES = [
  'Referido',
  WEB_LEAD_SOURCE,
  'Sitio web',
  'Redes sociales',
  'Agencia de medios',
  'Llamada entrante',
  'Feria / evento',
  'Prospección',
  'Cliente actual',
  'Otro',
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalEmail = z
  .string()
  .trim()
  .email('Correo inválido')
  .max(160)
  .optional()
  .or(z.literal('').transform(() => undefined));

const tagsField = z.array(z.string().max(32)).max(20).optional();

const opportunityFields = z.object({
  title: z.string().trim().min(1, 'Ponle un nombre a la oportunidad').max(160),
  contactId: optionalText(64),
  prospectName: optionalText(160),
  prospectEmail: optionalEmail,
  prospectPhone: optionalText(40),
  amount: z.number().int('El monto debe ser un número entero').min(0, 'El monto no puede ser negativo').max(100_000_000_000),
  probability: z.number().int().min(0).max(100).optional(),
  stage: z.enum(OPPORTUNITY_STAGES).default('LEAD'),
  source: optionalText(60),
  expectedCloseDate: z.coerce.date().optional(),
  ownerUserId: optionalText(64),
  notes: optionalText(4000),
  dealType: z.enum(DEAL_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  projectId: optionalText(64),
  packageId: optionalText(64),
  sponsorshipTier: z.enum(SPONSORSHIP_TIERS).optional().or(z.literal('').transform(() => undefined)),
  isBarter: z.boolean().optional(),
  barterValuation: z.number().int('La valorización debe ser un número entero').min(0).max(100_000_000_000).optional(),
  barterDescription: optionalText(500),
  tags: tagsField,
  personId: optionalText(64),
});

export const opportunityCreateSchema = opportunityFields.refine((data) => Boolean(data.contactId || data.prospectName), {
  message: 'Elige un cliente existente o escribe el nombre del prospecto',
  path: ['prospectName'],
});

/**
 * Texto que en la edición distingue "no tocar" (`undefined`) de "vaciar"
 * (`''` o `null` → `null`). En la creación basta `optionalText`; al editar,
 * quitar el certamen o la persona de contacto tiene que poder expresarse.
 */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value ? value : null));

export const opportunityUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Ponle un nombre a la oportunidad').max(160).optional(),
  contactId: clearableText(64),
  prospectName: clearableText(160),
  prospectEmail: z
    .string()
    .trim()
    .email('Correo del prospecto inválido')
    .max(160)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  prospectPhone: clearableText(40),
  amount: z.number().int('El monto debe ser un número entero').min(0, 'El monto no puede ser negativo').max(100_000_000_000).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  source: clearableText(60),
  expectedCloseDate: z.coerce.date().nullable().optional(),
  ownerUserId: clearableText(64),
  notes: clearableText(4000),
  dealType: z.enum(DEAL_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  projectId: clearableText(64),
  packageId: clearableText(64),
  sponsorshipTier: z.enum(SPONSORSHIP_TIERS).nullable().optional(),
  isBarter: z.boolean().optional(),
  barterValuation: z.number().int('La valorización debe ser un número entero').min(0).max(100_000_000_000).optional(),
  barterDescription: clearableText(500),
  tags: tagsField,
  personId: clearableText(64),
});

export const moveStageSchema = z
  .object({
    stage: z.enum(OPPORTUNITY_STAGES),
    lostReason: optionalText(300),
  })
  .refine((data) => data.stage !== 'LOST' || Boolean(data.lostReason), {
    message: 'Indica por qué se perdió: es lo que permite aprender del embudo',
    path: ['lostReason'],
  });

export const activityCreateSchema = z.object({
  opportunityId: z.string().min(1),
  type: z.enum(ACTIVITY_TYPES),
  summary: z.string().trim().min(1, 'Describe la actividad').max(1000),
  dueAt: z.coerce.date().optional(),
  completed: z.boolean().default(false),
});

export const activityRescheduleSchema = z.object({
  dueAt: z.coerce.date().nullable(),
});

export const pipelineFiltersSchema = z.object({
  mine: z.boolean().optional(),
  dealType: z.enum(DEAL_TYPES).optional(),
  projectId: z.string().max(64).optional(),
  priority: z.enum(PRIORITIES).optional(),
  tag: z.string().max(32).optional(),
  includeClosed: z.boolean().optional(),
});

/**
 * Convertir un negocio de auspicio ganado en contrato. La marca debe ser un
 * `Contact` con RUT (el contrato es un documento con contraparte tributaria):
 * si el negocio nació como prospecto sin ficha, aquí se elige o se crea.
 */
export const convertToSponsorshipSchema = z
  .object({
    contactId: optionalText(64),
    tier: z.enum(SPONSORSHIP_TIERS, 'Elige el nivel del auspicio'),
    cashAmount: z.number().int().min(0).max(100_000_000_000),
    isBarter: z.boolean().default(false),
    barterValuation: z.number().int().min(0).max(100_000_000_000).default(0),
    barterDescription: optionalText(500),
    createDeliverables: z.boolean().default(true),
  })
  .refine((data) => data.isBarter || data.cashAmount > 0, {
    message: 'El contrato necesita un monto en efectivo o marcarse como canje',
    path: ['cashAmount'],
  });

export const personFieldsSchema = z.object({
  fullName: z.string().trim().min(2, 'Escribe el nombre de la persona').max(160),
  jobTitle: optionalText(120),
  contactId: optionalText(64),
  organizationName: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  instagram: optionalText(80),
  linkedinUrl: z
    .string()
    .trim()
    .url('El enlace de LinkedIn no es una URL válida')
    .max(300)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  isDecisionMaker: z.boolean().default(false),
  tags: tagsField,
  notes: optionalText(2000),
});

export const personCreateSchema = personFieldsSchema;
/** La ficha se edita completa: un campo opcional vacío se guarda como vacío (no "sin cambios"). */
export const personUpdateSchema = personFieldsSchema;

/** Honeypot del formulario público: un bot lo completa, una persona no lo ve. */
export const SPONSOR_LEAD_HONEYPOT_FIELD = 'website';

/** Formulario "Quiero auspiciar" del micrositio de un certamen (sin sesión). */
export const publicSponsorLeadSchema = z.object({
  companyName: z.string().trim().min(2, 'Escribe el nombre de tu marca o empresa').max(160),
  contactName: z.string().trim().min(2, 'Escribe tu nombre').max(160),
  jobTitle: optionalText(120),
  email: z.string().trim().email('Escribe un correo válido').max(160),
  phone: optionalText(40),
  packageId: optionalText(64),
  message: optionalText(2000),
  [SPONSOR_LEAD_HONEYPOT_FIELD]: z.string().max(0, 'Solicitud inválida').optional(),
});

export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type PipelineFilters = z.infer<typeof pipelineFiltersSchema>;
export type ConvertToSponsorshipInput = z.infer<typeof convertToSponsorshipSchema>;
export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
export type PublicSponsorLeadInput = z.infer<typeof publicSponsorLeadSchema>;
