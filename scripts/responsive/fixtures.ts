import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Datos de prueba para el verificador de responsividad del micrositio de
 * certámenes (`npm run verify:responsive`). Son deliberadamente incómodos:
 * nombres larguísimos, una sola palabra enorme, textos sin espacios y listas
 * largas. Si una pantalla aguanta esto, aguanta cualquier certamen real.
 */

const LOREM =
  'Una noche de gala para celebrar el talento, la elegancia y el compromiso de mujeres que representan a sus comunidades. Cada edición reúne a candidatas, auspiciadores y público en un espectáculo pensado para recordarse.';

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2f63"/><stop offset="1" stop-color="#c9a45c"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><circle cx="300" cy="300" r="120" fill="rgba(255,255,255,.25)"/><rect x="150" y="460" width="300" height="340" rx="150" fill="rgba(255,255,255,.2)"/></svg>'
  );

function candidates(names: string[], reps: Array<string | null>): PublicPageantSite['candidates'] {
  return names.map((name, i) => ({
    id: `c${i}`,
    name,
    number: i + 1,
    representing: reps[i % reps.length] ?? null,
    photoUrl: i % 2 === 0 ? PHOTO : null,
    bio: i % 3 === 0 ? LOREM : null,
    isFinalist: i === 1,
    isWinner: false,
  }));
}

export function baseSite(overrides: Partial<PublicPageantSite> = {}): PublicPageantSite {
  return {
    slug: 'miss-universo-temuco-2026',
    name: 'Miss Universo Temuco 2026',
    organizer: 'Productora Aurora SpA',
    tagline: 'La noche más esperada del sur de Chile',
    description: LOREM,
    galaDate: '2026-12-12T23:30:00.000Z',
    venueName: 'Teatro Municipal de Temuco',
    venueAddress: 'Av. Prat 1234, Temuco',
    coverImageUrl: null,
    faviconUrl: null,
    accent: 'gold',
    instagramHandle: 'missuniversotemuco',
    contactEmail: 'contacto@missuniversotemuco.cl',
    whatsapp: { href: 'https://wa.me/56912345678', label: '+56 9 1234 5678' },
    candidates: candidates(['Camila Rojas', 'Valentina Soto', 'Antonia Fuentes', 'Josefa Araya', 'Isidora Pérez', 'Emilia Contreras'], ['Temuco', 'Pucón', 'Villarrica']),
    sponsorsByTier: [
      { tier: 'GOLD', label: 'Oro', names: ['Banco del Sur', 'Joyería Amanecer'] },
      { tier: 'SILVER', label: 'Plata', names: ['Clínica Estética Andina'] },
    ],
    packages: [
      { id: 'p1', name: 'Sponsor Titular', tierLabel: 'Titular', price: 5000000, benefits: ['Logo en backdrop principal', 'Mención en vivo', 'Stand en la gala'], description: 'El paquete más completo.', slotsLeft: 1 },
      { id: 'p2', name: 'Sponsor Oro', tierLabel: 'Oro', price: 2500000, benefits: ['Logo en backdrop principal', 'Mención en vivo'], description: null, slotsLeft: null },
    ],
    tickets: { href: '/tickets/abc', fromPrice: 15000 },
    voting: { href: '/votar/abc', pricePerVote: 1000 },
    registration: { href: '/register/candidate/abc', token: 'abc', closesAt: '2026-10-19T23:00:00.000Z', minAge: 18, maxCandidates: 12, benefits: ['Clases de pasarela', 'Sesión de fotos profesional'], classesNote: 'Sábados 10:00 h, Gimnasio Municipal' },
    candidateSide: true,
    registrationNotice: null,
    voteRanking: [
      { name: 'Camila Rojas', number: 1, votes: 320 },
      { name: 'Valentina Soto', number: 2, votes: 210 },
    ],
    results: null,
    sponsorLeadForm: true,
    director: { name: 'Marcela Alvarado', title: 'Directora', role: 'Directora nacional', bio: LOREM, photoUrl: PHOTO, highlights: ['Más de 15 años produciendo certámenes', 'Formadora de 200 candidatas'] },
    sponsorNote: 'Exclusividad por rubro: solo un sponsor por categoría.',
    pastWinners: [
      { id: 'w1', name: 'Fernanda Silva', title: 'Ganadora', year: 2025, note: 'Representó a Temuco', photoUrl: PHOTO, featured: true },
      { id: 'w2', name: 'Catalina Muñoz', title: 'Ganadora', year: 2024, note: null, photoUrl: PHOTO, featured: false },
      { id: 'w3', name: 'Daniela Vera', title: 'Virreina', year: 2024, note: 'Representó a Pucón', photoUrl: PHOTO, featured: false },
      { id: 'w4', name: 'Sofía Bravo', title: 'Ganadora', year: 2023, note: null, photoUrl: PHOTO, featured: false },
      { id: 'w5', name: 'Paula Reyes', title: 'Reina de la Simpatía', year: 2022, note: null, photoUrl: PHOTO, featured: false },
      { id: 'w6', name: 'Trinidad Ossa', title: 'Ganadora', year: 2019, note: null, photoUrl: PHOTO, featured: false },
    ],
    customDomain: null,
    ...overrides,
  };
}

const LONG_WORD = 'Superextraordinariamente';

export const FIXTURES: Record<string, PublicPageantSite> = {
  normal: baseSite(),
  // Caso real que se cortaba: nombre de una sola palabra con "/".
  slash: baseSite({ name: 'Miss Universo Temuco/Longuimay 2026', slug: 'slash' }),
  palabraLarga: baseSite({ name: `Miss Universo Panamericana ${LONG_WORD} 2026`, slug: 'larga' }),
  nombreLargo: baseSite({ name: 'Concurso Nacional de Belleza, Elegancia y Talento de la Región de La Araucanía 2026', slug: 'largo' }),
  unaPalabra: baseSite({ name: 'Aurora', slug: 'aurora' }),
  sinEdicion: baseSite({ name: 'Reina de la Primavera', slug: 'primavera' }),
  estres: baseSite({
    name: 'Reina Internacional de la Solidaridad y el Turismo Sustentable de Sudamérica/Cono Sur 2026',
    slug: 'estres',
    organizer: 'Corporación Cultural y Deportiva Municipal de la Comuna de Pucón y Villarrica',
    tagline: 'Una edición inolvidable con las mejores candidatas de todas las regiones del país, reunidas en una sola noche',
    venueName: 'Centro de Eventos y Convenciones Internacional Gran Hotel Pucón',
    venueAddress: 'Avenida Libertador Bernardo O’Higgins 12345, Oficina 678, Pucón, Región de La Araucanía',
    contactEmail: 'contacto.institucional.certamen.internacional@corporacionculturalmunicipal.example.cl',
    instagramHandle: 'certamen_internacional_reina_solidaridad_turismo_sudamerica',
    candidates: candidates(
      ['María de los Ángeles Fernández-Villanueva de la Barra', 'Constanza Alejandra Valenzuela Rodríguez', 'Su', 'Ana', 'Florencia Belén Hernández Castillo-Larraín'],
      ['Región Metropolitana de Santiago y alrededores', null, 'Pucón']
    ),
    packages: [
      {
        id: 'p1',
        name: 'Sponsor Titular Exclusivo Internacional Premium con Derechos de Transmisión',
        tierLabel: 'Titular principal',
        price: 125000000,
        benefits: [
          'Logo en backdrop principal, pasarela, escenario, credenciales y toda la comunicación oficial del certamen durante toda la temporada',
          'Mención en vivo en cada etapa',
          'https://un-enlace-muy-largo-sin-espacios.example.cl/campana/2026/certamen/sponsor/titular/beneficios',
          'Stand',
        ],
        description: 'Descripción muy larga del paquete que explica todo lo que incluye, cómo se activa la marca y qué compromisos adquiere cada parte durante la temporada completa.',
        slotsLeft: 1,
      },
      { id: 'p2', name: 'Oro', tierLabel: 'Oro', price: 900, benefits: [], description: null, slotsLeft: 0 },
    ],
    sponsorNote: 'Exclusividad por rubro en toda la temporada: solo un sponsor por categoría, sin excepción, incluyendo transmisiones, redes sociales y actividades previas.',
    sponsorsByTier: [{ tier: 'GOLD', label: 'Oro', names: ['Corporación de Desarrollo Productivo y Turismo Sustentable de la Región', 'Banco'] }],
    pastWinners: [
      { id: 'w1', name: 'María de los Ángeles Fernández-Villanueva de la Barra y Echeverría', title: 'Ganadora Absoluta Internacional de la Solidaridad', year: 2025, note: 'Representó a la Región Metropolitana de Santiago y alrededores en la gran final internacional', photoUrl: PHOTO, featured: true },
      { id: 'w2', name: 'Su', title: 'Virreina', year: null, note: null, photoUrl: PHOTO, featured: false },
      { id: 'w3', name: 'Constanza Alejandra Valenzuela Rodríguez-Castillo', title: 'Reina de la Simpatía y la Elegancia', year: 2023, note: 'Nota larga que explica quién fue, de dónde venía y qué hizo durante su reinado', photoUrl: PHOTO, featured: false },
    ],
  }),
  sinDatos: baseSite({
    name: 'Miss Sur',
    slug: 'sin-datos',
    tagline: null,
    description: null,
    galaDate: null,
    venueName: null,
    venueAddress: null,
    contactEmail: null,
    whatsapp: null,
    instagramHandle: null,
    candidates: [],
    sponsorsByTier: [],
    packages: [],
    tickets: null,
    voting: null,
    registration: null,
    candidateSide: false,
    voteRanking: null,
    director: null,
    sponsorNote: null,
    pastWinners: [],
  }),
  // Una sola ganadora: el diseño destacado sin carrusel.
  unaGanadora: baseSite({ pastWinners: [{ id: 'w1', name: 'Fernanda Silva', title: 'Ganadora', year: 2025, note: 'Representó a Temuco', photoUrl: PHOTO, featured: true }] }),
  // Caso real: dos ganadoras de la MISMA última edición (Temuco y Loncoche): las dos con foto completa y el mismo formato.
  dosRecientes: baseSite({
    pastWinners: [
      { id: 'w1', name: 'Krishna Sandoval', title: 'Miss Universo Temuco', year: 2026, note: null, photoUrl: PHOTO, featured: true },
      { id: 'w2', name: 'Victoria Jimenez', title: 'Miss Universo Loncoche', year: 2026, note: null, photoUrl: PHOTO, featured: true },
      { id: 'w3', name: 'Sofía Bravo', title: 'Ganadora', year: 2023, note: null, photoUrl: PHOTO, featured: false },
      { id: 'w4', name: 'Paula Reyes', title: 'Virreina', year: 2022, note: null, photoUrl: PHOTO, featured: false },
    ],
  }),
  // Tres recientes con nombres largos: el formato se mantiene y nada desborda.
  tresRecientes: baseSite({
    pastWinners: [
      { id: 'w1', name: 'María de los Ángeles Fernández-Villanueva de la Barra', title: 'Miss Universo Temuco/Loncoche', year: 2026, note: 'Representó a la Región Metropolitana de Santiago', photoUrl: PHOTO, featured: true },
      { id: 'w2', name: 'Victoria Jimenez', title: 'Miss Universo Loncoche', year: 2026, note: null, photoUrl: PHOTO, featured: true },
      { id: 'w3', name: 'Krishna Sandoval', title: 'Miss Universo Temuco', year: 2026, note: null, photoUrl: PHOTO, featured: true },
    ],
  }),
  // Ninguna marcada como reciente: todas van al carrusel de ediciones anteriores.
  todasAnteriores: baseSite({
    pastWinners: [
      { id: 'w1', name: 'Sofía Bravo', title: 'Ganadora', year: 2023, note: null, photoUrl: PHOTO, featured: false },
      { id: 'w2', name: 'Paula Reyes', title: 'Virreina', year: 2022, note: null, photoUrl: PHOTO, featured: false },
    ],
  }),
  // Sin año ni nota: nada se inventa.
  ganadorasSinAnio: baseSite({
    pastWinners: [
      { id: 'w1', name: 'Fernanda Silva', title: 'Ganadora', year: null, note: null, photoUrl: PHOTO, featured: true },
      { id: 'w2', name: 'Catalina Muñoz', title: 'Virreina', year: null, note: null, photoUrl: PHOTO, featured: false },
    ],
  }),
  convocatoriaCerrada: baseSite({ registration: null, registrationNotice: { state: 'soon', opensAtLabel: '19 de octubre' } }),
};
