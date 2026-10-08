import { z } from 'zod';
import { contactEmailField, contactWhatsappField, instagramHandleField } from '@/lib/events/pageant-contact';
import { publicSlugProblem, slugify } from '@/lib/events/public-slug';

/**
 * Micrositio público de la academia (`/academia/[slug]`). Todo acá es puro:
 * esquema del contenido, plantilla inicial y la lista de «qué falta» para
 * publicar (corre en vivo en el editor y otra vez en el servidor al publicar).
 *
 * Reglas: (1) nunca un dato inventado — una sección sin contenido se omite;
 * (2) el público ve solo lo que se escribe acá más campos explícitos de los
 * grupos (nombre y horario) y un conteo de alumnas si se activa; jamás RUT,
 * contactos, asistencia ni pagos; (3) las fotos solo salen de nuestro
 * almacenamiento, bajo `academy-site/{companyId}/`.
 */

export const ACADEMY_SITE_LIMITS = {
  steps: 6,
  disciplines: 16,
  benefits: 10,
  gallery: 12,
  faq: 10,
  testimonials: 8,
  milestones: 12,
  highlights: 4,
} as const;

/** Colores de acento del sitio (lista cerrada; un valor desconocido cae al dorado). */
export const ACADEMY_ACCENTS = ['gold', 'rose', 'violet', 'emerald', 'ruby'] as const;
export type AcademyAccent = (typeof ACADEMY_ACCENTS)[number];
export const ACADEMY_ACCENT_LABELS: Record<AcademyAccent, string> = { gold: 'Dorado', rose: 'Rosa', violet: 'Violeta', emerald: 'Esmeralda', ruby: 'Rubí' };
export const ACADEMY_ACCENT_SWATCH: Record<AcademyAccent, string> = { gold: '#dbc076', rose: '#e8a4b4', violet: '#b9a3ec', emerald: '#8fcfae', ruby: '#d9667a' };

/** Carpeta de las fotos del sitio en el almacenamiento; el servidor rechaza cualquier otra. */
export function academySiteImagePrefix(companyId: string): string {
  return `academy-site/${companyId}/`;
}

const text = (max: number) => z.string().trim().max(max).default('');
const imageUrl = z.string().trim().max(500).default('');

export const academySiteContentSchema = z.object({
  /** Frase corta bajo el nombre, en la portada. */
  tagline: text(160),
  /** Título de «Quiénes somos»; vacío = «Conócenos». */
  aboutTitle: text(120),
  /** Texto de presentación («quiénes somos»). */
  intro: text(1200),
  /** Historia de la academia. */
  history: text(4000),
  /** «Cómo funciona»: pasos en orden. */
  steps: z.array(z.object({ title: text(80), text: text(400) })).max(ACADEMY_SITE_LIMITS.steps).default([]),
  /** Clases o disciplinas que ofrece; con foto se muestran como tarjeta con imagen. */
  disciplines: z.array(z.object({ title: text(80), text: text(300), photoUrl: imageUrl })).max(ACADEMY_SITE_LIMITS.disciplines).default([]),
  /** Lo que recibe una alumna (título, desfiles, spots…). */
  benefits: z.array(text(200)).max(ACADEMY_SITE_LIMITS.benefits).default([]),
  /** Mensualidad en CLP entero; vacío = no se publica el precio. */
  monthlyFee: z.number().int().min(0).max(10_000_000).nullable().default(null),
  /** Aclaración del precio (matrícula, descuentos, forma de pago…). */
  feeNote: text(300),
  /** Promoción vigente; vacío = sin promoción. */
  promo: text(300),
  /** Carrusel de fotos. */
  gallery: z.array(z.object({ url: imageUrl, caption: text(120) })).max(ACADEMY_SITE_LIMITS.gallery).default([]),
  faq: z.array(z.object({ question: text(160), answer: text(600) })).max(ACADEMY_SITE_LIMITS.faq).default([]),
  director: z
    .object({ name: text(80), role: text(80), photoUrl: imageUrl, bio: text(800) })
    .default({ name: '', role: '', photoUrl: '', bio: '' }),
  /** Mostrar los grupos activos con su horario (se leen en vivo de la academia). */
  showGroups: z.boolean().default(true),
  /** Mostrar «N alumnas» (cuenta real de alumnas activas). */
  showStudentCount: z.boolean().default(false),
  /** Color de acento del sitio. */
  accent: z.enum(ACADEMY_ACCENTS).default('gold').catch('gold'),
  /** Logo (opcional) para la barra superior y el pie. */
  logoUrl: imageUrl,
  /** Cifras destacadas que escribe la academia («+15 · certámenes»). Nunca se inventan. */
  highlights: z.array(z.object({ value: text(12), label: text(40) })).max(ACADEMY_SITE_LIMITS.highlights).default([]),
  /** Testimonios de alumnas o apoderadas, escritos por la academia con su autorización. */
  testimonials: z.array(z.object({ name: text(80), role: text(80), text: text(500), photoUrl: imageUrl })).max(ACADEMY_SITE_LIMITS.testimonials).default([]),
  /** Hitos de la historia («2018 · Primera pasarela»). */
  milestones: z.array(z.object({ year: text(12), text: text(200) })).max(ACADEMY_SITE_LIMITS.milestones).default([]),
});
export type AcademySiteContent = z.infer<typeof academySiteContentSchema>;

export function emptyAcademyContent(): AcademySiteContent {
  return academySiteContentSchema.parse({});
}

/** Contenido guardado → contenido válido; un dato viejo o dañado cae al vacío en vez de romper la página. */
export function parseAcademyContent(raw: unknown): AcademySiteContent {
  const parsed = academySiteContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : emptyAcademyContent();
}

/**
 * Textos de partida con las clases y la mensualidad que la propia academia
 * ofrece. Es un borrador editable que se carga a pedido (nunca solo): la
 * academia lo revisa, lo cambia y lo completa con su historia y sus fotos.
 */
export function starterAcademyContent(): AcademySiteContent {
  return academySiteContentSchema.parse({
    disciplines: ['Pasarela', 'Automaquillaje', 'Fotopose', 'Comunicación audiovisual', 'Locución y animación', 'Protocolo y etiqueta', 'Danza', 'Canto'].map((title) => ({ title, text: '', photoUrl: '' })),
    aboutTitle: 'Más que una academia, una familia',
    highlights: [
      { value: '8', label: 'disciplinas' },
      { value: '+15', label: 'certámenes para participar' },
      { value: '1 año', label: 'para tu título de modelo' },
    ],
    benefits: [
      'Con un año académico, la alumna es licenciada con título de modelo profesional.',
      'Ser parte de la academia permite participar sin costo en desfiles y spots publicitarios.',
      'Preparación para participar en los más de 15 certámenes de belleza que dirige nuestra directora, como Miss Universo Temuco.',
    ],
    monthlyFee: 45000,
    steps: [
      { title: 'Te inscribes', text: 'Completa el formulario de inscripción desde esta página.' },
      { title: 'Te contactamos', text: 'Revisamos tu inscripción y te escribimos para confirmar tu grupo y horario.' },
      { title: 'Comienzas tus clases', text: 'Asistes a tus clases y participas de los desfiles y proyectos de la academia.' },
    ],
  });
}

/** Dirección pública: como la de un certamen, pero `inscripcion` queda reservada para el formulario de inscripción. */
export function academySlugProblem(slug: string): string | null {
  if (slug === 'inscripcion') return 'Esa dirección está reservada por el sistema; elige otra';
  return publicSlugProblem(slug);
}

export function suggestAcademySlug(name: string): string {
  return slugify(name);
}

/** Datos del sitio que van en columnas (el resto vive en `content`). Vacío → `null`. */
export const academySiteFieldsSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la academia').max(120),
  slug: z.string().trim().toLowerCase().superRefine((value, ctx) => {
    const problem = academySlugProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }),
  heroImageUrl: z.string().trim().max(500).nullish().transform((v) => v || null),
  whatsapp: contactWhatsappField,
  contactEmail: contactEmailField,
  instagramHandle: instagramHandleField,
  address: z.string().trim().max(200).nullish().transform((v) => v || null),
});

export const academySiteInputSchema = academySiteFieldsSchema.extend({ content: academySiteContentSchema });
export type AcademySiteInput = z.infer<typeof academySiteInputSchema>;

/** Todas las URLs de fotos del contenido, en el orden en que aparecen. */
export function academySiteImageUrls(site: { heroImageUrl: string | null; content: AcademySiteContent }): string[] {
  const { content } = site;
  return [
    site.heroImageUrl,
    content.logoUrl,
    ...content.gallery.map((g) => g.url),
    ...content.disciplines.map((d) => d.photoUrl),
    ...content.testimonials.map((t) => t.photoUrl),
    content.director.photoUrl,
  ].filter((url): url is string => Boolean(url));
}

export interface ReadinessItem {
  id: string;
  label: string;
  /** `true` = impide publicar; `false` = recomendado. */
  blocking: boolean;
  done: boolean;
}

export interface ReadinessInput {
  name: string;
  slug: string;
  heroImageUrl: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  instagramHandle: string | null;
  content: AcademySiteContent;
  /** ¿Hay link de inscripción? */
  hasEnrollmentLink: boolean;
  /** ¿Hay grupos activos en la academia? */
  activeGroups: number;
}

/** Qué le falta al sitio para publicarse bien. Los bloqueantes impiden publicar; el resto es recomendación. */
export function academySiteReadiness(site: ReadinessInput): ReadinessItem[] {
  const { content } = site;
  const hasContact = Boolean(site.whatsapp || site.contactEmail || site.instagramHandle);
  return [
    { id: 'name', label: 'El nombre de la academia', blocking: true, done: site.name.trim().length >= 2 },
    { id: 'slug', label: 'Una dirección válida para el sitio', blocking: true, done: academySlugProblem(site.slug) === null },
    { id: 'hero', label: 'La foto de portada', blocking: true, done: Boolean(site.heroImageUrl) },
    { id: 'disciplines', label: 'Al menos una clase o disciplina', blocking: true, done: content.disciplines.some((d) => d.title.trim()) },
    { id: 'contact', label: 'Un medio de contacto (WhatsApp, correo o Instagram)', blocking: true, done: hasContact },
    { id: 'intro', label: 'El texto de presentación', blocking: false, done: Boolean(content.intro.trim()) },
    { id: 'history', label: 'La historia de la academia', blocking: false, done: Boolean(content.history.trim()) },
    { id: 'steps', label: 'Cómo funciona (pasos)', blocking: false, done: content.steps.some((s) => s.title.trim()) },
    { id: 'gallery', label: 'Fotos para el carrusel', blocking: false, done: content.gallery.some((g) => g.url) },
    { id: 'testimonials', label: 'Testimonios de alumnas o apoderadas', blocking: false, done: content.testimonials.some((t) => t.text.trim()) },
    { id: 'enrollment', label: 'Un link de inscripción (se crea solo al publicar)', blocking: false, done: site.hasEnrollmentLink },
    { id: 'groups', label: 'Grupos con horario en la academia (se muestran en el sitio)', blocking: false, done: !content.showGroups || site.activeGroups > 0 },
  ];
}

/** Motivos que impiden publicar, en español; vacío = se puede publicar. */
export function publishBlockers(items: ReadinessItem[]): string[] {
  return items.filter((item) => item.blocking && !item.done).map((item) => `Falta: ${item.label.charAt(0).toLowerCase()}${item.label.slice(1)}`);
}
