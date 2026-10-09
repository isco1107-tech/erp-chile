import { z } from 'zod';
import { blocksSchema } from '@/lib/web-sites/blocks';
import { FORM_DESTINATIONS, FORM_PURPOSES } from '@/lib/web-sites/forms';
import { siteDocumentSchema } from '@/lib/web-sites/site';
import { MAX_HTML_BYTES } from '@/lib/web-sites/html';
import { WEB_SITE_KINDS } from '@/lib/web-sites/templates';
import { themeSchema } from '@/lib/web-sites/theme';
import { siteSlugProblem, slugify } from '@/lib/web-sites/urls';

export const WEB_SITE_MODES = ['GUIDED', 'HTML'] as const;
export const WEB_SITE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Dirección pública: se normaliza (minúsculas, sin tildes) y se valida su forma. */
const slugField = z
  .string()
  .trim()
  .transform((value) => slugify(value))
  .superRefine((value, ctx) => {
    const problem = siteSlugProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

export const createWebSiteSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre al sitio').max(80, 'El nombre puede tener hasta 80 caracteres'),
  /** Vacío = se arma a partir del nombre. */
  slug: slugField.optional().or(z.literal('').transform(() => undefined)),
  kind: z.enum(WEB_SITE_KINDS),
  mode: z.enum(WEB_SITE_MODES),
  contactId: z.string().min(1).nullable().optional(),
  /** Rubro (`industries.ts`): arma el sitio completo de ese rubro en modo guiado. */
  industry: z.string().trim().max(40).nullable().optional(),
});

export type CreateWebSiteInput = z.infer<typeof createWebSiteSchema>;

export const saveWebSiteContentSchema = z.object({
  /** Sitio completo en modo guiado (páginas, encabezado, pie…). */
  document: siteDocumentSchema.optional(),
  /** Compatibilidad: sitio de una sola página con estas secciones. */
  blocks: blocksSchema.optional(),
  theme: themeSchema.optional(),
  html: z.string().max(MAX_HTML_BYTES * 2, 'El HTML es demasiado largo').nullable().optional(),
  /** Versión del contenido que el editor cargó (`WebSiteDetail.version`): si cambió, otra persona guardó antes. */
  expectedUpdatedAt: z.string().datetime().optional(),
});

export type SaveWebSiteContentInput = z.infer<typeof saveWebSiteContentSchema>;

export const webSiteSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre al sitio').max(80),
  slug: slugField,
  seoTitle: optionalText(70),
  seoDescription: optionalText(200),
  indexable: z.boolean(),
  logoUrl: optionalText(500),
  ogImageUrl: optionalText(500),
  faviconUrl: optionalText(500),
  contactId: z.string().min(1).nullable().optional(),
});

export type WebSiteSettingsInput = z.infer<typeof webSiteSettingsSchema>;

/** Búsqueda de productos del inventario para el catálogo del sitio. */
export const catalogProductsQuerySchema = z.string().trim().max(100).optional();

export const webSiteAssetAltSchema = z.object({ alt: z.string().trim().max(160, 'La descripción puede tener hasta 160 caracteres') });

export const webSiteDomainSchema = z.object({ domain: z.string().trim().min(1, 'Escribe el dominio').max(253) });

export { WEB_SITE_HONEYPOT_FIELD } from '@/lib/web-sites/constants';

export const publicWebSiteMessageSchema = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  email: z.string().trim().toLowerCase().email('Escribe un correo válido').max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[\d\s()+-]*$/, 'El teléfono solo puede llevar números, espacios y +')
    .optional()
    .or(z.literal('')),
  message: z.string().trim().min(5, 'Cuéntanos en qué podemos ayudarte').max(2000, 'El mensaje puede tener hasta 2000 caracteres'),
});

export type PublicWebSiteMessageInput = z.infer<typeof publicWebSiteMessageSchema>;

/**
 * Envío de un formulario del sitio publicado. Las respuestas llegan como
 * `{ idDePregunta: valor }` y se validan contra la definición PUBLICADA del
 * formulario (`validateFormAnswers`); acá solo se acota la forma del cuerpo.
 */
export const publicFormSubmissionSchema = z.object({
  formId: z.string().trim().min(1).max(40).nullable().optional(),
  answers: z.record(z.string().max(24), z.union([z.string().max(4000), z.boolean(), z.number()])).refine((value) => Object.keys(value).length <= 40, 'Demasiadas respuestas'),
  acceptPrivacy: z.boolean().optional(),
});

export type PublicFormSubmissionInput = z.infer<typeof publicFormSubmissionSchema>;

export const MESSAGE_STATUS_FILTERS = ['inbox', 'unread', 'archived', 'all'] as const;

/** Filtro de la bandeja de formularios (de un sitio o de toda la empresa). */
export const messageFilterSchema = z.object({
  siteId: z.string().trim().max(40).nullable().optional(),
  /** Id del bloque del formulario; `legacy` = mensajes anteriores a los formularios a medida. */
  formId: z.string().trim().max(40).nullable().optional(),
  purpose: z.enum(FORM_PURPOSES).nullable().optional(),
  destination: z.enum(FORM_DESTINATIONS).nullable().optional(),
  tag: z.string().trim().max(30).nullable().optional(),
  status: z.enum(MESSAGE_STATUS_FILTERS).default('inbox'),
  q: z.string().trim().max(100).nullable().optional(),
});

export type MessageFilterInput = z.infer<typeof messageFilterSchema>;

/** Destino al que se envía a mano un mensaje de la bandeja. */
export const routeDestinationSchema = z.enum(['crm', 'academy', 'tasks']);
