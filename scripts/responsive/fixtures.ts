import { pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';
import { pageantCompositions } from '@/lib/events/pageant-compositions';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { buildFiestaDesign } from '../lib/fiesta-primavera';

/**
 * Datos de prueba para el verificador de responsividad del micrositio de
 * certámenes (`npm run verify:responsive`). Son deliberadamente incómodos:
 * nombres larguísimos, una sola palabra enorme, textos sin espacios y listas
 * largas. Si una pantalla aguanta esto, aguanta cualquier certamen real.
 */

const LOREM =
  'Una noche de gala para celebrar el talento, la elegancia y el compromiso de mujeres que representan a sus comunidades. Cada edición reúne a candidatas, auspiciadores y público en un espectáculo pensado para recordarse.';
const invitation = pageantCompositions('#b89a5c').find(({ id }) => id === 'cta')!;

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
    typography: {},
    footerPartners: { title: null, items: [] },
    instagramHandles: ['missuniversotemuco', 'miss.universo.araucania'],
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
    registration: { href: '/register/candidate/abc', token: 'abc', closesAt: '2026-10-19T23:00:00.000Z', minAge: 18, requirements: { minAge: 18, chileanNationality: true, instagram: true, photo: true }, maxCandidates: 12, benefits: ['Clases de pasarela', 'Sesión de fotos profesional'], classesNote: 'Sábados 10:00 h, Gimnasio Municipal' },
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

/** La galería del certamen con fotos de prueba (`img.test/foto-N.svg`), para ver cómo luce con imágenes. */
function withPhotos(design: ReturnType<typeof buildFiestaDesign>): ReturnType<typeof buildFiestaDesign> {
  return {
    ...design,
    blocks: design.blocks.map((block) =>
      block.type === 'gallery'
        ? { ...block, images: [0, 1, 2, 3, 4, 5].map((i) => ({ url: `https://img.test/foto-${i}.svg`, alt: `Foto ${i + 1}`, caption: i === 0 ? 'Carro alegórico en Temuco/Longuimay' : '' })) }
        : block
    ),
  };
}

export const FIXTURES: Record<string, PublicPageantSite> = {
  normal: baseSite(),
  portadaLogos: baseSite({
    name: 'Fiesta de la Primavera Temuco',
    slug: 'portada-logos',
    accent: 'primavera',
    creative: pageantSiteDesignSchema.parse({
      enabled: true,
      overlays: { inicio: { enabled: true, elements: [
        {
          id: 'portada-municipio', kind: 'image', imageUrl: 'https://img.test/logo-1.svg', alt: 'Municipalidad de Temuco',
          href: 'https://example.cl/municipalidad', desktop: { x: 6, y: 40, width: 19, height: 26 },
        },
        {
          id: 'portada-produccion', kind: 'image', imageUrl: 'https://img.test/logo-cuadrado.svg', alt: 'CR Producciones',
          desktop: { x: 78, y: 36, width: 15, height: 34 },
        },
        {
          id: 'portada-ajuste-manual', kind: 'image', imageUrl: 'https://img.test/logo-2.svg', alt: 'Organización invitada',
          desktop: { x: 90, y: 84, width: 8, height: 10 },
          tablet: { x: 4, y: 8, width: 10, height: 7 },
          mobile: { x: 4, y: 8, width: 12, height: 7 },
        },
        {
          id: 'portada-oculto-movil', kind: 'image', imageUrl: 'https://img.test/logo-2.svg', alt: 'Patrocinador',
          desktop: { x: 22, y: 80, width: 12, height: 10 }, mobileHidden: true,
        },
      ] } },
      options: { ribbon: false, countdown: false, pills: false },
    }),
  }),
  lienzoVisual: baseSite({
    creative: pageantSiteDesignSchema.parse({
      enabled: true,
      blocks: [
        { id: 'studio-statement', type: 'text', heading: 'Información para las delegaciones', body: LOREM },
        { id: 'studio-canvas', type: 'text', style: { spacing: 'none', canvas: {
          enabled: true, replaceContent: true, height: 240, mobileHeight: 260,
          elements: [{ id: 'studio-note', text: 'Certamen Temuco/Longuimay', desktop: { x: 10, y: 10, width: 70, height: 40 }, mobile: { x: 10, y: 20, width: 80, height: 50 } }],
        } } },
        { id: 'studio-invitation', type: 'text', style: { spacing: 'none', canvas: {
          enabled: true, replaceContent: true, height: invitation.height, mobileHeight: invitation.mobileHeight,
          elements: invitation.elements,
        } } },
      ],
      blockPlacements: { 'studio-statement': 'certamen', 'studio-canvas': 'gala', 'studio-invitation': 'beforeFooter' },
      relocated: { 'inicio.tagline': 'studio-tagline' },
      overlays: {
        inicio: { enabled: true, elements: [{
          id: 'studio-tagline',
          text: 'Un certamen para toda la región',
          color: '#ffffff',
          desktop: { x: 16, y: 63, width: 68, height: 12 },
          mobile: { x: 10, y: 60, width: 80, height: 10 },
          fontSize: 23, mobileFontSize: 16,
        }] },
        gala: { enabled: true, elements: [{
          id: 'gala-overlay',
          text: 'Una noche especial',
          richText: [{ text: 'Una noche ' }, { text: 'especial', bold: true, italic: true }],
          desktop: { x: 8, y: 4, width: 65, height: 10 },
          mobile: { x: 8, y: 2, width: 84, height: 8 },
          fontSize: 24,
        }, {
          id: 'gala-photo', kind: 'image', imageUrl: 'https://img.test/gala.png', alt: 'Logo de la gala',
          desktop: { x: 80, y: 4, width: 12, height: 14 },
          mobile: { x: 74, y: 10, width: 20, height: 10 },
          imageFrame: { fit: 'cover', x: 72, y: 45, zoom: 130 }, radius: 8,
        }] },
      },
    }),
  }),
  // Caso real que se cortaba: nombre de una sola palabra con "/".
  slash: baseSite({ name: 'Miss Universo Temuco/Longuimay 2026', slug: 'slash' }),
  palabraLarga: baseSite({ name: `Miss Universo Panamericana ${LONG_WORD} 2026`, slug: 'larga' }),
  nombreLargo: baseSite({ name: 'Concurso Nacional de Belleza, Elegancia y Talento de la Región de La Araucanía 2026', slug: 'largo' }),
  unaPalabra: baseSite({ name: 'Aurora', slug: 'aurora' }),
  sinEdicion: baseSite({ name: 'Reina de la Primavera', slug: 'primavera' }),
  estres: baseSite({
    footerPartners: {
      title: 'Con el apoyo de las instituciones y empresas de toda la Región de La Araucanía',
      items: Array.from({ length: 6 }, (_, n) => ({ id: `p${n}`, name: `Institución con un nombre larguísimo número ${n + 1}`, logoUrl: `https://img.test/logo-${n % 2 ? 1 : 3}.svg`, href: n % 2 ? 'https://www.instagram.com/cuenta/' : null })),
    },
    name: 'Reina Internacional de la Solidaridad y el Turismo Sustentable de Sudamérica/Cono Sur 2026',
    slug: 'estres',
    organizer: 'Corporación Cultural y Deportiva Municipal de la Comuna de Pucón y Villarrica',
    tagline: 'Una edición inolvidable con las mejores candidatas de todas las regiones del país, reunidas en una sola noche',
    venueName: 'Centro de Eventos y Convenciones Internacional Gran Hotel Pucón',
    venueAddress: 'Avenida Libertador Bernardo O’Higgins 12345, Oficina 678, Pucón, Región de La Araucanía',
    contactEmail: 'contacto.institucional.certamen.internacional@corporacionculturalmunicipal.example.cl',
    instagramHandles: ['certamen_internacional_reina_solidaridad_turismo_sudamerica', 'otra_cuenta_oficial'],
    creative: pageantSiteDesignSchema.parse({ footer: {
      title: 'Corporación Cultural de Turismo Sustentable de Sudamérica',
      description: 'Organización del certamen internacional de la solidaridad.\nPromovemos la participación de las comunidades en todas las regiones.',
      copyright: '© 2026 Corporación Cultural de Turismo Sustentable de Sudamérica',
      links: [{ id: 'rules', label: 'Bases oficiales del certamen', href: 'https://example.cl/bases' }],
    } }),
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
    instagramHandles: [],
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
  // Acento Primavera + estudio visual después de la portada (pétalos, historia, carrusel de logos). Logos servidos por `img.test`.
  primavera: baseSite({
    name: 'Fiesta de la Primavera Temuco',
    slug: 'fiesta-primavera',
    accent: 'primavera',
    footerPartners: {
      title: 'Organizan',
      items: [
        { id: 'muni', name: 'Ilustre Municipalidad de Temuco', logoUrl: 'https://img.test/logo-1.svg', href: 'https://www.instagram.com/cuenta_municipal/' },
        { id: 'cr', name: 'CR Producciones', logoUrl: 'https://img.test/logo-2.svg', href: null },
      ],
    },
    creative: withPhotos(
      buildFiestaDesign(
        ['Panadería Temuco/Longuimay', 'Supercalifragilisticoespialidoso', 'Banco', 'Radio', 'Ferretería del Sur', 'Clínica'].map((name, i) => ({ name, url: `https://img.test/logo-${i}.svg` }))
      )
    ),
  }),
  // Diseño libre del editor visual: un bloque ANTES de la portada, secciones reordenadas, bloques intercalados,
  // textos propios larguísimos, fondos y espaciados cambiados, secciones ocultas y piezas globales apagadas.
  disenoLibre: baseSite({
    name: 'Fiesta de la Primavera Temuco',
    slug: 'diseno-libre',
    accent: 'primavera',
    creative: (() => {
      const design = withPhotos(buildFiestaDesign(['Panadería Temuco/Longuimay', 'Banco', 'Radio'].map((name, i) => ({ name, url: `https://img.test/logo-${i}.svg` }))));
      const ids = design.blocks.map((block) => block.id);
      const block = (index: number) => ({ kind: 'block' as const, id: ids[index % ids.length]! });
      const section = (id: 'inicio' | 'candidatas' | 'certamen' | 'gala' | 'auspicios' | 'postula' | 'director' | 'ganadoras') => ({ kind: 'section' as const, id });
      return pageantSiteDesignSchema.parse({
        ...design,
        layout: [block(1), section('inicio'), section('candidatas'), block(2), block(3), section('certamen'), section('gala'), block(4), section('postula'), section('auspicios'), section('ganadoras'), section('director'), ...ids.slice(5).map((id) => ({ kind: 'block', id }))],
        sections: {
          candidatas: { kicker: 'Candidatas de todas las comunas de La Araucanía', title: 'Conoce a todas', titleAccent: 'las candidatas de esta edición Temuco/Longuimay', tone: 'deep', spacing: 'compact', navLabel: 'Reinas' },
          certamen: { tone: 'soft', spacing: 'airy', kicker: '' },
          gala: { title: 'La gran noche', titleAccent: 'Supercalifragilisticoespialidoso', tone: 'soft' },
          auspicios: { tone: 'deep', title: '', titleAccent: 'Paquetes' },
          director: { tone: 'night', spacing: 'compact' },
          preguntas: { hidden: true },
          inicio: { kicker: 'Vuelve la fiesta más esperada del sur de Chile', title: 'Temuco vuelve a florecer con su reina, sus carros alegóricos y toda la ciudad' },
        },
        options: { ribbon: false, numbers: false, pills: false },
      });
    })(),
  }),
  // Tipografía elegida por bloque (más anchas que las de fábrica): nada debe desbordar.
  tipografia: baseSite({
    name: 'Miss Universo Temuco/Longuimay 2026',
    slug: 'tipografia',
    typography: { display: 'playfair', serif: 'lora', sans: 'raleway', heroTitle: 'cinzel', names: 'cinzel' },
  }),
  // Lo más ancho del catálogo en cada familia y bloque: la compensación de ancho tiene que bastar.
  tipografiaAncha: baseSite({
    name: 'Concurso Nacional de Belleza, Elegancia y Talento de la Región de La Araucanía 2026',
    slug: 'tipografia-ancha',
    typography: { display: 'unbounded', serif: 'libre-baskerville', sans: 'montserrat', heroTitle: 'cinzel', titleAccent: 'abril', dropCap: 'unbounded', names: 'cinzel', numbers: 'unbounded', kickers: 'work-sans', lead: 'merriweather', quotes: 'fraunces' },
  }),
};
