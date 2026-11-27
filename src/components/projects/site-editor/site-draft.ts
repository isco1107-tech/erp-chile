import type { Project } from '@prisma/client';
import { formatInstagramHandlesForForm, formatWhatsappNumber } from '@/lib/events/pageant-contact';
import type { PageantEditorDraft } from '@/lib/events/pageant-editor-draft';
import { parseFooterPartners } from '@/lib/events/pageant-partners';
import type { DirectorTitle } from '@/lib/events/pageant-site';
import { pageantSiteDesignSchema, parsePageantSiteDesign } from '@/lib/events/pageant-site-design';
import { parsePageantPalette } from '@/lib/events/pageant-palette';
import { parsePageantTypography } from '@/lib/events/pageant-typography';
import { PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';
import type { FooterPartnersDraft } from '../FooterPartnersEditor';

/**
 * Borrador del «Sitio público» del certamen: lo comparten el formulario
 * clásico y el editor visual (los dos editan el MISMO estado y se guarda con el
 * mismo botón y la misma acción, `updatePublicSiteAction`).
 */

export function initialSiteFormValues(project: Project) {
  return {
    publicSiteDesign: parsePageantSiteDesign(project.publicSiteDesign) ?? pageantSiteDesignSchema.parse({}),
    publicSlug: project.publicSlug ?? '',
    publicSiteEnabled: project.publicSiteEnabled,
    publicTagline: project.publicTagline ?? '',
    publicDescription: project.publicDescription ?? '',
    coverImageUrl: project.coverImageUrl ?? '',
    publicTypography: parsePageantTypography(project.publicTypography),
    // Tres colores de la portada (o a mano); `null` = sin paleta, vale el acento de abajo.
    publicPalette: parsePageantPalette(project.publicPalette),
    publicAccent: ((PUBLIC_ACCENTS as readonly string[]).includes(project.publicAccent) ? project.publicAccent : 'gold') as PublicAccentKey,
    instagramHandle: formatInstagramHandlesForForm(project.instagramHandle),
    publicContactEmail: project.publicContactEmail ?? '',
    publicWhatsapp: project.publicWhatsapp ? formatWhatsappNumber(project.publicWhatsapp) : '',
    showCandidatesPublic: project.showCandidatesPublic,
    showSponsorsPublic: project.showSponsorsPublic,
    showVoteRankingPublic: project.showVoteRankingPublic,
    showResultsPublic: project.showResultsPublic,
    sponsorLeadFormEnabled: project.sponsorLeadFormEnabled,
    directorName: project.directorName ?? '',
    directorTitle: (project.directorTitle === 'Directora' ? 'Directora' : 'Director') as DirectorTitle,
    directorRole: project.directorRole ?? '',
    directorBio: project.directorBio ?? '',
    directorPhotoUrl: project.directorPhotoUrl ?? '',
    faviconUrl: project.faviconUrl ?? '',
    sponsorExclusivityNote: project.sponsorExclusivityNote ?? '',
  };
}

export type SiteFormValues = ReturnType<typeof initialSiteFormValues>;

/** Logos del pie: el enlace queda como se escribió y se normaliza al guardar. */
export function initialPartners(project: Project): FooterPartnersDraft {
  const saved = parseFooterPartners(project.footerPartners);
  return { title: saved.title ?? '', items: saved.items.map((item) => ({ id: item.id, name: item.name, logoUrl: item.logoUrl, href: item.href ?? '' })) };
}

/** Todo lo que se guarda con «Guardar». */
export interface SiteEditorState {
  values: SiteFormValues;
  partners: FooterPartnersDraft;
  /** La trayectoria se edita como texto, un logro por línea. */
  highlightsText: string;
}

/** Huella para saber si hay cambios sin guardar. */
export function stateFingerprint(state: SiteEditorState): string {
  return JSON.stringify(state);
}

/** Lo que el lienzo necesita para pintar el borrador (`applyDraftToSite`). */
export function toCanvasDraft(state: SiteEditorState, includeDesign = true): PageantEditorDraft {
  const { values, partners, highlightsText } = state;
  return {
    tagline: values.publicTagline,
    description: values.publicDescription,
    coverImageUrl: values.coverImageUrl,
    accent: values.publicAccent,
    palette: values.publicPalette,
    typography: values.publicTypography,
    instagram: values.instagramHandle,
    email: values.publicContactEmail,
    whatsapp: values.publicWhatsapp,
    director: {
      name: values.directorName,
      title: values.directorTitle,
      role: values.directorRole,
      bio: values.directorBio,
      photoUrl: values.directorPhotoUrl,
      highlights: highlightsText,
    },
    sponsorNote: values.sponsorExclusivityNote,
    toggles: {
      candidates: values.showCandidatesPublic,
      sponsors: values.showSponsorsPublic,
      ranking: values.showVoteRankingPublic,
      results: values.showResultsPublic,
      sponsorLead: values.sponsorLeadFormEnabled,
    },
    partners: { title: partners.title, items: partners.items },
    ...(includeDesign && { design: values.publicSiteDesign }),
  };
}
