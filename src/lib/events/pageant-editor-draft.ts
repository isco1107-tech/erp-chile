import { z } from 'zod';
import { pageantContact } from './pageant-contact';
import { editableLayout } from './pageant-layout';
import { normalizePartnerLink } from './pageant-partners';
import { DIRECTOR_TITLES } from './pageant-site';
import { parsePageantSiteDesign } from './pageant-site-design';
import { parsePageantTypography } from './pageant-typography';
import { PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Borrador del editor visual del micrositio: lo que la persona está cambiando
 * en el panel y todavía no guarda. El editor lo manda al lienzo (iframe) y el
 * lienzo lo pinta sobre los datos reales del certamen (`applyDraftToSite`).
 *
 * Solo sirve para MIRAR: nada de esto se guarda desde aquí (guardar pasa por
 * `updatePublicSiteAction`, que valida todo de nuevo en el servidor). Igual se
 * lee con tolerancia: un campo raro vuelve a su valor vacío y una imagen solo se
 * muestra si es `https`.
 */

const text = (max: number) => z.string().max(max).catch('');

export const pageantEditorDraftSchema = z.object({
  tagline: text(400),
  description: text(8000),
  coverImageUrl: text(1000),
  accent: z.enum(PUBLIC_ACCENTS).catch('gold'),
  typography: z.unknown().optional(),
  instagram: text(400),
  email: text(160),
  whatsapp: text(30),
  director: z
    .object({
      name: text(120),
      title: z.enum(DIRECTOR_TITLES).catch('Director'),
      role: text(160),
      bio: text(1500),
      photoUrl: text(1000),
      /** Un logro por línea, como en el formulario. */
      highlights: text(10000),
    })
    .catch({ name: '', title: 'Director', role: '', bio: '', photoUrl: '', highlights: '' }),
  sponsorNote: text(800),
  toggles: z
    .object({
      candidates: z.boolean().catch(true),
      sponsors: z.boolean().catch(true),
      ranking: z.boolean().catch(false),
      results: z.boolean().catch(false),
      sponsorLead: z.boolean().catch(false),
    })
    .catch({ candidates: true, sponsors: true, ranking: false, results: false, sponsorLead: false }),
  partners: z
    .object({
      title: text(60),
      items: z
        .array(z.object({ id: text(40), name: text(80), logoUrl: text(1000), href: text(300) }))
        .max(12)
        .catch([]),
    })
    .catch({ title: '', items: [] }),
  /** `publicSiteDesign` tal cual del formulario (se valida con su esquema al aplicar). */
  design: z.unknown().optional(),
});

export type PageantEditorDraft = z.infer<typeof pageantEditorDraftSchema>;

const httpsOrNull = (value: string) => (/^https:\/\//i.test(value.trim()) ? value.trim() : null);
const textOrNull = (value: string) => value.trim() || null;

/**
 * El sitio que se ve con el borrador: los datos del certamen salen de `base`
 * (armada en el servidor con todas las secciones, `getPageantSiteEditorBase`)
 * y lo editable sale del borrador. Pura: el lienzo la llama en cada cambio.
 */
export function applyDraftToSite(base: PublicPageantSite, draft: PageantEditorDraft): PublicPageantSite {
  const contact = pageantContact({ publicContactEmail: textOrNull(draft.email), publicWhatsapp: textOrNull(draft.whatsapp), instagramHandle: draft.instagram });
  const design = parsePageantSiteDesign(draft.design) ?? base.creative;
  // El editor siempre trabaja con una sola lista: un diseño anterior se ve ya convertido (lo mismo que mostrará al guardar un cambio de orden).
  const creative = design
    ? { ...design, layout: design.layout ?? editableLayout({ blockIds: design.blocks.map((block) => block.id), placement: design.placement }) }
    : undefined;
  const { toggles } = draft;
  const directorName = draft.director.name.trim();
  const highlights = [...new Set(draft.director.highlights.split('\n').map((line) => line.trim()).filter(Boolean))].slice(0, 40);
  return {
    ...base,
    tagline: textOrNull(draft.tagline),
    description: textOrNull(draft.description),
    coverImageUrl: httpsOrNull(draft.coverImageUrl),
    accent: draft.accent as PublicAccentKey,
    typography: parsePageantTypography(draft.typography),
    instagramHandles: contact.instagrams.map((entry) => entry.handle),
    contactEmail: contact.email,
    whatsapp: contact.whatsapp,
    candidates: toggles.candidates ? base.candidates.map((c) => ({ ...c, isFinalist: toggles.results && c.isFinalist, isWinner: toggles.results && c.isWinner })) : [],
    sponsorsByTier: toggles.sponsors ? base.sponsorsByTier : [],
    voteRanking: toggles.ranking ? base.voteRanking : null,
    results: toggles.results ? base.results : null,
    sponsorLeadForm: toggles.sponsorLead,
    director: directorName
      ? {
          name: directorName,
          title: draft.director.title,
          role: textOrNull(draft.director.role),
          bio: textOrNull(draft.director.bio),
          photoUrl: httpsOrNull(draft.director.photoUrl),
          highlights,
        }
      : null,
    sponsorNote: textOrNull(draft.sponsorNote),
    footerPartners: {
      title: textOrNull(draft.partners.title),
      items: draft.partners.items.flatMap((item) => {
        const logoUrl = httpsOrNull(item.logoUrl);
        const href = normalizePartnerLink(item.href);
        return logoUrl && item.name.trim() ? [{ id: item.id || logoUrl, name: item.name.trim(), logoUrl, href: href ?? null }] : [];
      }),
    },
    creative,
  };
}
