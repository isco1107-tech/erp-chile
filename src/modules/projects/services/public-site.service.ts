import 'server-only';

import type { CandidateStatus, SponsorshipTier } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { pageantContact } from '@/lib/events/pageant-contact';
import type { DirectorTitle } from '@/lib/events/pageant-site';
import { decodeVoteToken } from '@/modules/public-voting/schema';
import { SPONSORSHIP_TIER_LABELS, SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';
import type { PublicAccentKey } from '../schema';
import { PUBLIC_ACCENTS } from '../schema';

/**
 * Datos del micrositio público de un certamen (`/certamen/{slug}`), sin
 * sesión. Todo lo que sale de acá es visible para cualquiera en internet,
 * así que se arma campo por campo (nunca un `include` completo): de una
 * candidata solo nombre artístico, número, a quién representa, foto y la
 * bio que el equipo escribió para el sitio — jamás RUT, fecha de
 * nacimiento, contacto, ficha de postulación ni la empresa del tenant.
 *
 * Una empresa suspendida o sin el módulo de Eventos contratado no publica
 * nada, igual que un sitio apagado: el link responde "no encontrado".
 */

const PUBLIC_CANDIDATE_STATUSES: CandidateStatus[] = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'];

export interface PublicPageantCandidate {
  id: string;
  name: string;
  number: number | null;
  representing: string | null;
  photoUrl: string | null;
  bio: string | null;
  isFinalist: boolean;
  isWinner: boolean;
}

export interface PublicPageantSite {
  slug: string;
  name: string;
  organizer: string;
  tagline: string | null;
  description: string | null;
  galaDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  coverImageUrl: string | null;
  accent: PublicAccentKey;
  instagramHandle: string | null;
  contactEmail: string | null;
  whatsapp: { href: string; label: string } | null;
  candidates: PublicPageantCandidate[];
  sponsorsByTier: Array<{ tier: SponsorshipTier; label: string; names: string[] }>;
  packages: Array<{ id: string; name: string; tierLabel: string; price: number | null; benefits: string[]; description: string | null; slotsLeft: number | null }>;
  tickets: { href: string; fromPrice: number | null } | null;
  voting: { href: string; pricePerVote: number } | null;
  registration: {
    href: string;
    /** Token del link de postulación (público por diseño: es el mismo que va en `href`). */
    token: string;
    closesAt: string | null;
    minAge: number;
    /** Cupo de preseleccionadas, si la convocatoria lo definió. */
    maxCandidates: number | null;
    benefits: string[];
    classesNote: string | null;
  } | null;
  voteRanking: Array<{ name: string; number: number | null; votes: number }> | null;
  results: Array<{ rank: number; name: string; number: number | null; representing: string | null; photoUrl: string | null }> | null;
  sponsorLeadForm: boolean;
  /** "Conoce al Director" (null si el certamen no cargó un nombre). */
  director: { name: string; title: DirectorTitle | null; role: string | null; bio: string | null; photoUrl: string | null; highlights: string[] } | null;
  /** Nota para sponsors bajo los paquetes (exclusividad por rubro, etc.). */
  sponsorNote: string | null;
}

function isAccent(value: string): value is PublicAccentKey {
  return (PUBLIC_ACCENTS as readonly string[]).includes(value);
}

export async function getPublicPageantSite(slug: string): Promise<PublicPageantSite | null> {
  const project = await prisma.project.findUnique({
    where: { publicSlug: slug },
    include: { company: { select: { businessName: true, status: true, features: true } } },
  });
  if (!project || !project.publicSiteEnabled) return null;
  const { company } = project;
  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') return null;
  const features = company.features;
  if (!features?.hasEventProjects) return null;

  const companyId = project.companyId;
  const where = { companyId, projectId: project.id };
  const now = new Date();

  const [candidates, contracts, packages, ticketTypes, finalRound] = await Promise.all([
    features.hasCandidates && project.showCandidatesPublic
      ? prisma.candidate.findMany({
          where: { ...where, status: { in: PUBLIC_CANDIDATE_STATUSES }, showOnPublicSite: true },
          select: { id: true, fullName: true, stageName: true, candidateNumber: true, representing: true, photoUrl: true, publicBio: true, status: true },
          orderBy: [{ candidateNumber: { sort: 'asc', nulls: 'last' } }, { fullName: 'asc' }],
        })
      : Promise.resolve([]),
    features.hasSponsorships && project.showSponsorsPublic
      ? prisma.sponsorshipContract.findMany({
          where: { ...where, status: { in: ['CONFIRMED', 'COMPLETED'] } },
          select: { tier: true, contact: { select: { razonSocial: true, nombreFantasia: true } } },
        })
      : Promise.resolve([]),
    features.hasSponsorships
      ? prisma.sponsorshipPackage.findMany({
          where: { ...where, isPublic: true },
          select: {
            id: true,
            name: true,
            tier: true,
            price: true,
            showPricePublic: true,
            benefits: true,
            description: true,
            maxSlots: true,
            _count: { select: { contracts: { where: { status: { in: ['CONFIRMED', 'COMPLETED'] } } } } },
          },
          orderBy: [{ order: 'asc' }, { price: 'desc' }],
        })
      : Promise.resolve([]),
    features.hasTicketing && project.ticketSalesToken
      ? prisma.ticketType.findMany({ where: { ...where, salesOpen: true }, select: { price: true } })
      : Promise.resolve([]),
    features.hasJudging && project.showResultsPublic
      ? prisma.competitionRound.findFirst({
          where: { ...where, isFinalRound: true, status: 'COMPLETED' },
          select: {
            contestants: {
              where: { rank: { not: null } },
              orderBy: { rank: 'asc' },
              take: 5,
              select: { rank: true, candidate: { select: { fullName: true, stageName: true, candidateNumber: true, representing: true, photoUrl: true } } },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  // Ranking de votos: solo órdenes pagadas, solo si producción decidió mostrarlo.
  let voteRanking: PublicPageantSite['voteRanking'] = null;
  if (features.hasPublicVoting && project.showVoteRankingPublic) {
    const rows = await prisma.voteOrder.groupBy({
      by: ['candidateId'],
      where: { ...where, paymentStatus: 'PAID' },
      _sum: { voteCount: true },
      orderBy: { _sum: { voteCount: 'desc' } },
      take: 10,
    });
    const names = await prisma.candidate.findMany({
      where: { companyId, id: { in: rows.map((r) => r.candidateId) }, showOnPublicSite: true },
      select: { id: true, fullName: true, stageName: true, candidateNumber: true },
    });
    voteRanking = rows
      .map((r) => {
        const c = names.find((n) => n.id === r.candidateId);
        return c ? { name: c.stageName ?? c.fullName, number: c.candidateNumber, votes: r._sum.voteCount ?? 0 } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  const sponsorsByTier = SPONSORSHIP_TIERS.map((tier) => ({
    tier,
    label: SPONSORSHIP_TIER_LABELS[tier],
    names: [...new Set(contracts.filter((c) => c.tier === tier).map((c) => c.contact.nombreFantasia || c.contact.razonSocial))].sort((a, b) => a.localeCompare(b, 'es-CL')),
  })).filter((group) => group.names.length > 0);

  const decodedVote = features.hasPublicVoting && project.voteSalesToken ? decodeVoteToken(project.voteSalesToken) : null;
  const registrationOpen =
    features.hasCandidates &&
    project.candidateRegistrationToken &&
    project.registrationStatus === 'OPEN' &&
    (!project.registrationOpensAt || project.registrationOpensAt <= now) &&
    (!project.registrationClosesAt || project.registrationClosesAt > now);

  const contact = pageantContact(project);

  return {
    slug,
    name: project.name,
    organizer: company.businessName,
    tagline: project.publicTagline,
    description: project.publicDescription,
    galaDate: project.galaDate?.toISOString() ?? null,
    venueName: project.venueName,
    venueAddress: project.venueAddress,
    coverImageUrl: project.coverImageUrl,
    accent: isAccent(project.publicAccent) ? project.publicAccent : 'gold',
    instagramHandle: contact.instagram?.handle ?? null,
    contactEmail: contact.email,
    whatsapp: contact.whatsapp,
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.stageName || c.fullName,
      number: c.candidateNumber,
      representing: c.representing,
      photoUrl: c.photoUrl,
      bio: c.publicBio,
      // Finalista/ganadora solo se revelan si producción publicó resultados.
      isFinalist: project.showResultsPublic && (c.status === 'FINALIST' || c.status === 'WINNER'),
      isWinner: project.showResultsPublic && c.status === 'WINNER',
    })),
    sponsorsByTier,
    packages: packages.map((p) => ({
      id: p.id,
      name: p.name,
      tierLabel: SPONSORSHIP_TIER_LABELS[p.tier],
      price: p.showPricePublic ? p.price : null,
      benefits: p.benefits,
      description: p.description,
      slotsLeft: p.maxSlots === null ? null : Math.max(0, p.maxSlots - p._count.contracts),
    })),
    tickets: ticketTypes.length > 0 && project.ticketSalesToken ? { href: `/tickets/${project.ticketSalesToken}`, fromPrice: Math.min(...ticketTypes.map((t) => t.price)) } : null,
    voting: decodedVote && project.voteSalesToken ? { href: `/votar/${project.voteSalesToken}`, pricePerVote: decodedVote.pricePerVote } : null,
    registration:
      registrationOpen && project.candidateRegistrationToken
        ? {
            href: `/register/candidate/${project.candidateRegistrationToken}`,
            token: project.candidateRegistrationToken,
            closesAt: project.registrationClosesAt?.toISOString() ?? null,
            minAge: project.minCandidateAge,
            maxCandidates: project.maxCandidates,
            benefits: project.registrationBenefits,
            classesNote: project.registrationClassesNote,
          }
        : null,
    voteRanking,
    results:
      finalRound && finalRound.contestants.length > 0
        ? finalRound.contestants.map((c) => ({
            rank: c.rank as number,
            name: c.candidate.stageName || c.candidate.fullName,
            number: c.candidate.candidateNumber,
            representing: c.candidate.representing,
            photoUrl: c.candidate.photoUrl,
          }))
        : null,
    // Con CRM la solicitud entra como prospecto; sin CRM llega por correo a la organización.
    sponsorLeadForm: project.sponsorLeadFormEnabled,
    director: project.directorName?.trim()
      ? {
          name: project.directorName.trim(),
          title: project.directorTitle === 'Directora' ? 'Directora' : project.directorTitle === 'Director' ? 'Director' : null,
          role: project.directorRole,
          bio: project.directorBio,
          photoUrl: project.directorPhotoUrl,
          highlights: project.directorHighlights,
        }
      : null,
    sponsorNote: project.sponsorExclusivityNote?.trim() || null,
  };
}

/** Lo mínimo para registrar un "Quiero ser sponsor": el formulario solo existe si el sitio lo muestra. */
export async function resolveSponsorLeadTarget(
  slug: string
): Promise<{ companyId: string; hasCrm: boolean; contactEmail: string | null; project: { id: string; name: string } } | null> {
  const project = await prisma.project.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      name: true,
      companyId: true,
      publicSiteEnabled: true,
      sponsorLeadFormEnabled: true,
      publicContactEmail: true,
      company: { select: { status: true, features: { select: { hasEventProjects: true, hasSalesPipeline: true } } } },
    },
  });
  if (!project?.publicSiteEnabled || !project.sponsorLeadFormEnabled) return null;
  if (project.company.status === 'SUSPENDED' || project.company.status === 'CANCELLED') return null;
  if (!project.company.features?.hasEventProjects) return null;
  return {
    companyId: project.companyId,
    hasCrm: Boolean(project.company.features.hasSalesPipeline),
    contactEmail: project.publicContactEmail?.trim() || null,
    project: { id: project.id, name: project.name },
  };
}
