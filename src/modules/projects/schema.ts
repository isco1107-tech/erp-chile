import { z } from 'zod';
import { contactEmailField, contactWhatsappField, instagramHandleField } from '@/lib/events/pageant-contact';
import type { ProjectStatus } from '@prisma/client';
import { publicSlugProblem } from '@/lib/events/public-slug';

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
  budgetedIncome: z.number().int('El presupuesto de ingresos debe ser un número entero').nonnegative('No puede ser negativo').default(0),
  budgetedExpense: z.number().int('El presupuesto de gastos debe ser un número entero').nonnegative('No puede ser negativo').default(0),
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
