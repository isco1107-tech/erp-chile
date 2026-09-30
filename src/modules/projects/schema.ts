import { z } from 'zod';
import { contactEmailField, contactWhatsappField, instagramHandleField } from '@/lib/events/pageant-contact';
import type { ProjectStatus } from '@prisma/client';
import { publicSlugProblem } from '@/lib/events/public-slug';
import { DIRECTOR_TITLES } from '@/lib/events/pageant-site';

/** Las columnas de monto son INT de PostgreSQL (32 bits): un valor mayor revienta al guardar en vez de avisar. */
const MAX_CLP_INT = 2_147_483_647;

export const PROJECT_STATUSES = ['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planificación',
  IN_PROGRESS: 'En Curso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const projectCreateSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  budgetedIncome: z.number().int('El presupuesto de ingresos debe ser un número entero').nonnegative('No puede ser negativo').max(MAX_CLP_INT, 'El presupuesto de ingresos no puede superar $2.147.483.647').default(0),
  budgetedExpense: z.number().int('El presupuesto de gastos debe ser un número entero').nonnegative('No puede ser negativo').max(MAX_CLP_INT, 'El presupuesto de gastos no puede superar $2.147.483.647').default(0),
  startDate: z.coerce.date('Fecha de inicio inválida'),
  endDate: z.coerce.date('Fecha de término inválida').optional(),
  status: z.enum(PROJECT_STATUSES).default('PLANNING'),
  notes: z.string().optional(),
  /** Fecha y hora de la gala final (cuenta regresiva, modo show). */
  galaDate: z.coerce.date('Fecha de gala inválida').nullable().optional(),
  venueName: z.string().trim().max(160).optional(),
  venueAddress: z.string().trim().max(300).optional(),
  /** WhatsApp del certamen para responder dudas (botón flotante del sitio y de la postulación). */
  publicWhatsapp: contactWhatsappField,
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema.partial();
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ---------------------------------------------------------------------------
// Micrositio público del certamen (`/certamen/{publicSlug}`)
// ---------------------------------------------------------------------------

export const PUBLIC_ACCENTS = ['gold', 'violet', 'rose', 'cyan', 'emerald'] as const;
export type PublicAccentKey = (typeof PUBLIC_ACCENTS)[number];

export const PUBLIC_ACCENT_LABELS: Record<PublicAccentKey, string> = {
  gold: 'Dorado',
  violet: 'Violeta',
  rose: 'Rosa',
  cyan: 'Turquesa',
  emerald: 'Esmeralda',
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const projectPublicSiteSchema = z
  .object({
    publicSlug: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((value) => (value ? value : null)),
    publicSiteEnabled: z.boolean(),
    publicTagline: optionalText(160),
    publicDescription: optionalText(4000),
    coverImageUrl: z
      .string()
      .trim()
      .url('La imagen de portada no es una URL válida')
      .max(1000)
      .optional()
      .or(z.literal(''))
      .transform((value) => (value ? value : null)),
    publicAccent: z.enum(PUBLIC_ACCENTS).default('gold'),
    instagramHandle: instagramHandleField,
    publicContactEmail: contactEmailField,
    publicWhatsapp: contactWhatsappField,
    showCandidatesPublic: z.boolean(),
    showSponsorsPublic: z.boolean(),
    showVoteRankingPublic: z.boolean(),
    showResultsPublic: z.boolean(),
    sponsorLeadFormEnabled: z.boolean(),
    // "Conoce al Director" (sin nombre, la sección no aparece).
    directorName: optionalText(120),
    directorTitle: z
      .enum(DIRECTOR_TITLES, 'Elige Director o Directora')
      .nullish()
      .transform((value) => value ?? null),
    directorRole: optionalText(160),
    directorBio: optionalText(1500),
    directorPhotoUrl: z
      .string()
      .trim()
      .url('La foto del director no es una URL válida')
      .max(1000)
      .optional()
      .or(z.literal(''))
      .transform((value) => (value ? value : null)),
    // Un logro por ítem; se ignoran líneas vacías o repetidas antes de contar el máximo.
    directorHighlights: z.preprocess(
      (value) => (Array.isArray(value) ? [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== ''))] : value),
      z.array(z.string().max(200, 'Cada logro de la trayectoria tiene un máximo de 200 caracteres')).max(40, 'Máximo 40 logros en la trayectoria').default([])
    ),
    sponsorExclusivityNote: optionalText(800),
  })
  .superRefine((data, ctx) => {
    if (data.publicSlug) {
      const problem = publicSlugProblem(data.publicSlug);
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['publicSlug'] });
    }
    if (data.publicSiteEnabled && !data.publicSlug) {
      ctx.addIssue({ code: 'custom', message: 'Para publicar el sitio define su dirección', path: ['publicSlug'] });
    }
  });

export type ProjectPublicSiteInput = z.infer<typeof projectPublicSiteSchema>;

// ---------------------------------------------------------------------------
// Salón de la fama: ganadoras de ediciones anteriores (`PastWinner`)
// ---------------------------------------------------------------------------

/** Máximo de fotos por certamen: una galería más larga deja de ser un "salón de la fama" y pesa en el teléfono. */
export const MAX_PAST_WINNERS = 24;

/** Sugerencias para el título del pie de foto; el campo es libre (cada franquicia tiene sus propias coronas). */
export const PAST_WINNER_TITLE_SUGGESTIONS = ['Ganadora', 'Virreina', 'Segunda virreina', 'Finalista', 'Reina de la Simpatía', 'Miss Fotogenia', 'Miss Elegancia'] as const;

export const pastWinnerSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la ganadora').max(120, 'El nombre admite hasta 120 caracteres'),
  title: z
    .string()
    .trim()
    .max(60, 'El título admite hasta 60 caracteres')
    .optional()
    .transform((value) => (value ? value : 'Ganadora')),
  year: z
    .number()
    .int('El año debe ser un número entero')
    .min(1950, 'El año debe ser 1950 o posterior')
    .max(new Date().getFullYear() + 1, 'El año no puede ser futuro')
    .nullish()
    .transform((value) => value ?? null),
  note: optionalText(160),
  photoUrl: z.string().trim().url('La foto no es una URL válida').max(1000),
});

export type PastWinnerInput = z.infer<typeof pastWinnerSchema>;
