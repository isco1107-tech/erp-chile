import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';

/** Certamen de prueba para el motor de afiches: completo, con lo justo para cada pieza. */
export function posterSite(overrides: Partial<PublicPageantSite> = {}): PublicPageantSite {
  return {
    slug: 'miss-sur',
    name: 'Miss Universo Temuco 2026',
    organizer: 'Aurora SpA',
    tagline: 'La noche más esperada del sur',
    description: null,
    galaDate: '2026-12-12T23:30:00.000Z',
    venueName: 'Teatro Municipal',
    venueAddress: null,
    coverImageUrl: 'https://x.public.blob.vercel-storage.com/pageant-covers/co1/portada.jpg',
    faviconUrl: null,
    accent: 'gold',
    instagramHandle: 'misssur',
    contactEmail: 'hola@misssur.cl',
    whatsapp: { href: 'https://wa.me/56911112222', label: '+56 9 1111 2222' },
    candidates: [
      { id: 'c1', name: 'Camila Rojas', number: 1, representing: 'Temuco', photoUrl: 'https://x.public.blob.vercel-storage.com/c1.jpg', bio: null, isFinalist: false, isWinner: false },
      { id: 'c2', name: 'Antonia Pérez', number: 2, representing: null, photoUrl: 'https://x.public.blob.vercel-storage.com/c2.jpg', bio: null, isFinalist: true, isWinner: false },
      { id: 'c3', name: 'Josefa Soto', number: null, representing: 'Angol', photoUrl: null, bio: null, isFinalist: false, isWinner: false },
    ],
    sponsorsByTier: [{ tier: 'GOLD', label: 'Oro', names: ['Banco del Sur', 'Joyería Brillante'] }],
    packages: [
      { id: 'p1', name: 'Oro', tierLabel: 'Oro', price: 1200000, benefits: ['Logo en escenario'], description: null, slotsLeft: null },
      { id: 'p2', name: 'Colaborador', tierLabel: 'Colaborador', price: null, benefits: [], description: null, slotsLeft: null },
    ],
    tickets: { href: '/tickets/tk', fromPrice: 15000 },
    voting: { href: '/votar/vt', pricePerVote: 1000 },
    registration: { href: '/register/candidate/rg', token: 'rg', closesAt: '2026-10-19T23:59:00.000Z', minAge: 17, maxCandidates: 20, benefits: ['Clases de pasarela'], classesNote: null },
    candidateSide: true,
    registrationNotice: null,
    voteRanking: null,
    results: null,
    sponsorLeadForm: false,
    pastWinners: [{ id: 'w1', name: 'Daniela Contreras', title: 'Miss Universo Temuco', year: 2025, note: null, photoUrl: 'https://x.public.blob.vercel-storage.com/w1.jpg', featured: true }],
    director: null,
    sponsorNote: null,
    customDomain: null,
    ...overrides,
  } as PublicPageantSite;
}
