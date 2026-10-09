import { prisma } from '@/lib/prisma';
import { constraintInvolves } from '@/lib/prisma-errors';
import { isAllowedBlobUrl, blobPathnameStartsWith } from '@/lib/security/blob-url';
import { formatWhatsappNumber, storedInstagramHandles, formatInstagramHandlesForForm } from '@/lib/events/pageant-contact';
import {
  academySiteImagePrefix,
  academySiteImageUrls,
  academySiteReadiness,
  parseAcademyContent,
  publishBlockers,
  type AcademyAccent,
  type AcademySiteContent,
  type AcademySiteInput,
  type ReadinessItem,
} from '@/lib/academy/site';
import { AcademyError } from './academy.service';
import { getEnrollmentToken, getOrCreateEnrollmentToken } from './academy-enrollment.service';

/**
 * Micrositio de la academia. Dos caras:
 *  - el editor del panel (`getAcademySiteForEditor`, `saveAcademySite`,
 *    `setAcademySitePublished`), siempre con `companyId` de la sesión;
 *  - la lectura pública (`getPublicAcademySite`), que arma el sitio CAMPO POR
 *    CAMPO — nunca con un `include` completo — para que ni por error salga una
 *    alumna, un RUT, un contacto o un pago.
 */

export interface AcademySiteEditorView {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  publishedAt: string | null;
  heroImageUrl: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  /** Para el formulario: «@a, @b». */
  instagramHandle: string;
  address: string | null;
  /** Dominio propio ya verificado: el sitio se ve ahí. */
  liveDomain: string | null;
  content: AcademySiteContent;
}

export interface AcademySiteEditorData {
  site: AcademySiteEditorView | null;
  readiness: ReadinessItem[];
  /** Nombre de la empresa, para sugerir el del sitio al crearlo. */
  companyName: string;
}

async function activeGroupCount(companyId: string): Promise<number> {
  return prisma.academyGroup.count({ where: { companyId, isActive: true } });
}

function toEditorView(row: {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  publishedAt: Date | null;
  heroImageUrl: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  instagramHandle: string | null;
  address: string | null;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  content: unknown;
}): AcademySiteEditorView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    heroImageUrl: row.heroImageUrl,
    whatsapp: row.whatsapp,
    contactEmail: row.contactEmail,
    instagramHandle: formatInstagramHandlesForForm(row.instagramHandle),
    address: row.address,
    liveDomain: row.customDomainVerifiedAt ? row.customDomain : null,
    content: parseAcademyContent(row.content),
  };
}

export async function getAcademySiteForEditor(companyId: string): Promise<AcademySiteEditorData> {
  const [row, company, token, groups] = await Promise.all([
    prisma.academySite.findFirst({ where: { companyId } }),
    prisma.company.findFirst({ where: { id: companyId }, select: { businessName: true } }),
    getEnrollmentToken(companyId),
    activeGroupCount(companyId),
  ]);
  const site = row ? toEditorView(row) : null;
  const readiness = site
    ? academySiteReadiness({ ...site, instagramHandle: row?.instagramHandle ?? null, hasEnrollmentLink: Boolean(token), activeGroups: groups })
    : [];
  return { site, readiness, companyName: company?.businessName ?? '' };
}

/** Las fotos del sitio deben ser de nuestro almacenamiento y de la carpeta de esta empresa. */
export function imagesProblem(companyId: string, input: Pick<AcademySiteInput, 'heroImageUrl' | 'content'>): string | null {
  const prefix = academySiteImagePrefix(companyId);
  for (const url of academySiteImageUrls({ heroImageUrl: input.heroImageUrl, content: input.content })) {
    if (!isAllowedBlobUrl(url) || !blobPathnameStartsWith(url, prefix)) return 'Una de las fotos no es válida. Súbela de nuevo desde el editor.';
  }
  return null;
}

/** `previousSlug` permite revalidar también la dirección anterior si se cambió. */
export async function saveAcademySite(companyId: string, input: AcademySiteInput): Promise<{ id: string; previousSlug: string | null }> {
  const problem = imagesProblem(companyId, input);
  if (problem) throw new AcademyError(problem);
  const data = {
    slug: input.slug,
    name: input.name,
    heroImageUrl: input.heroImageUrl,
    whatsapp: input.whatsapp,
    contactEmail: input.contactEmail,
    instagramHandle: input.instagramHandle,
    address: input.address,
    content: input.content,
  };
  const previous = await prisma.academySite.findFirst({ where: { companyId }, select: { slug: true } });
  try {
    const saved = await prisma.academySite.upsert({ where: { companyId }, create: { companyId, ...data }, update: data, select: { id: true } });
    return { id: saved.id, previousSlug: previous?.slug ?? null };
  } catch (error) {
    if (constraintInvolves(error, 'slug')) throw new AcademyError('Esa dirección ya la usa otro sitio. Elige otra.');
    throw error;
  }
}

/** Publicar exige lo imprescindible (la misma lista del editor, recalculada acá); despublicar siempre se puede. */
export async function setAcademySitePublished(companyId: string, publish: boolean): Promise<{ id: string; slug: string }> {
  const row = await prisma.academySite.findFirst({ where: { companyId } });
  if (!row) throw new AcademyError('Primero guarda el sitio');
  if (publish) {
    const token = await getOrCreateEnrollmentToken(companyId);
    const blockers = publishBlockers(
      academySiteReadiness({
        name: row.name,
        slug: row.slug,
        heroImageUrl: row.heroImageUrl,
        whatsapp: row.whatsapp,
        contactEmail: row.contactEmail,
        instagramHandle: row.instagramHandle,
        content: parseAcademyContent(row.content),
        hasEnrollmentLink: Boolean(token),
        activeGroups: await activeGroupCount(companyId),
      })
    );
    if (blockers.length > 0) throw new AcademyError(`No se puede publicar todavía. ${blockers.join('. ')}.`);
  }
  await prisma.academySite.updateMany({ where: { id: row.id, companyId }, data: { isPublished: publish, publishedAt: publish ? (row.publishedAt ?? new Date()) : row.publishedAt } });
  return { id: row.id, slug: row.slug };
}

// ---------------------------------------------------------------------------
// Lectura pública
// ---------------------------------------------------------------------------

export interface PublicAcademySite {
  creative?: import('@/lib/web-sites/creative').CreativeSite;
  slug: string;
  name: string;
  /** Razón social de la empresa, para el pie. */
  organizer: string;
  tagline: string;
  aboutTitle: string;
  intro: string;
  history: string;
  heroImageUrl: string | null;
  accent: AcademyAccent;
  logoUrl: string | null;
  /** Cifras que escribe la academia; vacío si no escribió ninguna. */
  highlights: Array<{ value: string; label: string }>;
  steps: Array<{ title: string; text: string }>;
  disciplines: Array<{ title: string; text: string; photoUrl: string | null }>;
  testimonials: Array<{ name: string; role: string; text: string; photoUrl: string | null }>;
  milestones: Array<{ year: string; text: string }>;
  benefits: string[];
  monthlyFee: number | null;
  feeNote: string;
  promo: string;
  gallery: Array<{ url: string; caption: string }>;
  faq: Array<{ question: string; answer: string }>;
  director: { name: string; role: string; photoUrl: string | null; bio: string } | null;
  /** Grupos activos con su horario (sin alumnas ni precios); vacío si el sitio no los muestra. */
  groups: Array<{ name: string; schedule: string | null }>;
  /** Alumnas activas, solo si el sitio lo muestra y hay al menos una. */
  studentCount: number | null;
  contact: {
    email: string | null;
    whatsapp: { href: string; label: string } | null;
    instagrams: Array<{ handle: string; href: string }>;
    address: string | null;
  };
  /** Ruta del formulario de inscripción; `null` si la academia aún no generó su link. */
  enrollmentHref: string | null;
  /** Dominio propio YA verificado (canónico del sitio); `null` si se ve solo en `/academia/{slug}`. */
  customDomain: string | null;
}

/** El sitio se ve solo si está publicado, la empresa está operando y tiene el módulo; si no, es como si no existiera. */
export async function getPublicAcademySite(slug: string): Promise<PublicAcademySite | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const site = await prisma.academySite.findFirst({
    where: { slug, isPublished: true },
    select: {
      companyId: true,
      slug: true,
      name: true,
      heroImageUrl: true,
      whatsapp: true,
      contactEmail: true,
      instagramHandle: true,
      address: true,
      content: true,
      customDomain: true,
      customDomainVerifiedAt: true,
      company: { select: { businessName: true, status: true, features: { select: { hasAcademy: true } } } },
    },
  });
  if (!site) return null;
  if (site.company.status !== 'ACTIVE' && site.company.status !== 'TRIAL') return null;
  if (!site.company.features?.hasAcademy) return null;

  const content = parseAcademyContent(site.content);
  const [groups, studentCount, token] = await Promise.all([
    content.showGroups
      ? prisma.academyGroup.findMany({ where: { companyId: site.companyId, isActive: true }, orderBy: { name: 'asc' }, select: { name: true, schedule: true } })
      : Promise.resolve([]),
    content.showStudentCount ? prisma.academyStudent.count({ where: { companyId: site.companyId, isActive: true } }) : Promise.resolve(0),
    getEnrollmentToken(site.companyId),
  ]);

  const director = content.director;
  const hasDirector = Boolean(director.name.trim() || director.bio.trim());
  return {
    slug: site.slug,
    name: site.name,
    organizer: site.company.businessName,
    creative: content.creative,
    tagline: content.tagline,
    aboutTitle: content.aboutTitle.trim() || 'Conócenos',
    intro: content.intro,
    history: content.history,
    heroImageUrl: site.heroImageUrl,
    accent: content.accent,
    logoUrl: content.logoUrl || null,
    highlights: content.highlights.filter((h) => h.value.trim() && h.label.trim()),
    steps: content.steps.filter((s) => s.title.trim()),
    disciplines: content.disciplines.filter((d) => d.title.trim()).map((d) => ({ title: d.title, text: d.text, photoUrl: d.photoUrl || null })),
    testimonials: content.testimonials.filter((t) => t.text.trim() && t.name.trim()).map((t) => ({ name: t.name, role: t.role, text: t.text, photoUrl: t.photoUrl || null })),
    milestones: content.milestones.filter((m) => m.year.trim() && m.text.trim()),
    benefits: content.benefits.filter((b) => b.trim()),
    monthlyFee: content.monthlyFee,
    feeNote: content.feeNote,
    promo: content.promo,
    gallery: content.gallery.filter((g) => g.url),
    faq: content.faq.filter((f) => f.question.trim() && f.answer.trim()),
    director: hasDirector ? { name: director.name, role: director.role, photoUrl: director.photoUrl || null, bio: director.bio } : null,
    groups,
    studentCount: studentCount > 0 ? studentCount : null,
    contact: {
      email: site.contactEmail,
      whatsapp: site.whatsapp ? { href: `https://wa.me/${site.whatsapp}`, label: formatWhatsappNumber(site.whatsapp) } : null,
      instagrams: storedInstagramHandles(site.instagramHandle).map((handle) => ({ handle, href: `https://instagram.com/${handle}` })),
      address: site.address,
    },
    enrollmentHref: token ? `/academia/inscripcion/${token}` : null,
    customDomain: site.customDomainVerifiedAt ? site.customDomain : null,
  };
}

/**
 * Slug del sitio de academia publicado bajo un dominio propio (para `/sitio/[host]`).
 * `reachedViaDomain`: la petición llegó por ese mismo host, prueba de que los
 * DNS y el certificado ya funcionan; un dominio aún sin verificar se marca
 * verificado en el acto. Sin esa prueba, solo responde por uno ya verificado.
 */
export async function getAcademySlugByDomain(domain: string, reachedViaDomain = false): Promise<string | null> {
  const site = await prisma.academySite.findUnique({ where: { customDomain: domain }, select: { id: true, companyId: true, slug: true, customDomainVerifiedAt: true } });
  if (!site) return null;
  if (!site.customDomainVerifiedAt) {
    if (!reachedViaDomain) return null;
    await prisma.academySite.updateMany({ where: { id: site.id, companyId: site.companyId, customDomain: domain, customDomainVerifiedAt: null }, data: { customDomainVerifiedAt: new Date() } });
  }
  return site.slug;
}
