import type { PublicAcademySite } from '@/modules/academy/services/academy-site.service';

/**
 * Datos de prueba del verificador de responsividad del micrositio de la
 * academia (`npm run verify:responsive:academy`). Deliberadamente incómodos:
 * nombres larguísimos, una palabra enorme, correos y URLs sin espacios, listas
 * en su tope y un sitio mínimo con solo lo imprescindible.
 */

const LOREM =
  'Formamos modelos y comunicadoras con disciplina, elegancia y confianza. Cada alumna avanza a su ritmo con clases prácticas, pasarelas reales y el acompañamiento de un equipo que la conoce por su nombre.';

const photo = (hue: number) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},40%,22%)"/><stop offset="1" stop-color="hsl(${hue + 40},55%,62%)"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="380" r="150" fill="rgba(255,255,255,.25)"/><rect x="200" y="580" width="400" height="420" rx="200" fill="rgba(255,255,255,.2)"/></svg>`
  );
const WIDE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2142"/><stop offset="1" stop-color="#c9a45c"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>'
  );

function base(overrides: Partial<PublicAcademySite> = {}): PublicAcademySite {
  return {
    slug: 'academia-cr',
    name: 'Academia de Modelaje CR Producciones',
    organizer: 'CR Producciones SpA',
    tagline: 'Modelaje y multidisciplinas en Temuco',
    aboutTitle: 'Más que una academia, una familia',
    intro: LOREM,
    accent: 'gold',
    logoUrl: null,
    highlights: [
      { value: '8', label: 'disciplinas' },
      { value: '+15', label: 'certámenes para participar' },
      { value: '1 año', label: 'para tu título de modelo' },
    ],
    testimonials: [
      { name: 'Valentina Soto', role: 'Alumna 2025', text: 'Llegué sin saber caminar en tacos y hoy desfilo con seguridad. Las profesoras te acompañan en todo.', photoUrl: photo(330) },
      { name: 'Marcela Pérez', role: 'Apoderada', text: 'Mi hija ganó confianza y amigas. Se nota el cariño con que trabajan.', photoUrl: null },
    ],
    milestones: [
      { year: '2018', text: 'Primera generación de alumnas.' },
      { year: '2021', text: 'Comenzamos a preparar candidatas para certámenes regionales.' },
      { year: '2025', text: 'Más de 15 certámenes producidos por nuestra directora.' },
    ],
    customDomain: null,
    history: `${LOREM}\n\n${LOREM}`,
    heroImageUrl: WIDE,
    steps: [
      { title: 'Te inscribes', text: 'Completa el formulario de inscripción desde esta página.' },
      { title: 'Te contactamos', text: 'Revisamos tu inscripción y te escribimos para confirmar tu grupo y horario.' },
      { title: 'Comienzas tus clases', text: 'Asistes a tus clases y participas de los desfiles y proyectos.' },
    ],
    disciplines: ['Pasarela', 'Automaquillaje', 'Fotopose', 'Comunicación audiovisual', 'Locución y animación', 'Protocolo y etiqueta', 'Danza', 'Canto'].map((title, i) => ({ title, text: i % 2 === 0 ? 'Clases prácticas con profesora a cargo.' : '', photoUrl: i < 3 ? photo(i * 70 + 10) : null })),
    benefits: ['Con un año académico, la alumna es licenciada con título de modelo profesional.', 'Participación sin costo en desfiles y spots publicitarios.'],
    monthlyFee: 45000,
    feeNote: 'Consulta por la matrícula vigente.',
    promo: 'Inscríbete este mes y no pagas matrícula',
    gallery: [0, 1, 2, 3, 4].map((i) => ({ url: photo(i * 50), caption: i % 2 === 0 ? `Pasarela anual ${2022 + i}` : '' })),
    faq: [
      { question: '¿Desde qué edad puedo ingresar?', answer: 'Desde los 7 años; las menores de edad se inscriben con su apoderado.' },
      { question: '¿Cuánto dura el año académico?', answer: LOREM },
    ],
    director: { name: 'Carolina Riffo', role: 'Directora', photoUrl: photo(280), bio: LOREM },
    groups: [
      { name: 'Modelaje juvenil', schedule: 'Sábados 10:00 a 12:00' },
      { name: 'Modelaje adultas', schedule: 'Miércoles 19:00 a 21:00' },
    ],
    studentCount: 48,
    contact: {
      email: 'contacto@crproducciones.cl',
      whatsapp: { href: 'https://wa.me/56912345678', label: '+56 9 1234 5678' },
      instagrams: [
        { handle: 'academia.cr', href: 'https://instagram.com/academia.cr' },
        { handle: 'cr.producciones', href: 'https://instagram.com/cr.producciones' },
      ],
      address: 'Temuco, Región de La Araucanía',
    },
    enrollmentHref: '/academia/inscripcion/' + 'a'.repeat(64),
    ...overrides,
  };
}

const HUGE = 'Superextraordinariamente' + 'x'.repeat(40);

export const ACADEMY_FIXTURES: Record<string, PublicAcademySite> = {
  normal: base(),
  incomodo: base({
    name: 'Academia Internacional de Modelaje, Comunicación Audiovisual y Artes Escénicas Temuco/Longuimay',
    tagline: `${LOREM} ${HUGE}`,
    promo: `${HUGE} sin espacios para probar el recorte de la promoción`,
    intro: `${HUGE} ${LOREM}`,
    history: `https://www.instagram.com/${'a'.repeat(120)}\n\n${LOREM}`,
    aboutTitle: `${HUGE} ${HUGE}`,
    accent: 'ruby',
    logoUrl: WIDE,
    highlights: [
      { value: '+1234567', label: HUGE },
      { value: '99', label: 'disciplinas distintas con nombre largo' },
      { value: '1 año', label: 'para tu título' },
      { value: '24/7', label: 'acompañamiento' },
    ],
    testimonials: Array.from({ length: 8 }, (_, i) => ({ name: i === 0 ? HUGE : `Alumna número ${i + 1} con nombre largo`, role: i % 2 ? `Rol ${HUGE}` : '', text: i === 0 ? HUGE : LOREM, photoUrl: i % 3 === 0 ? photo(i * 30) : null })),
    milestones: Array.from({ length: 12 }, (_, i) => ({ year: i === 0 ? '1999-2026' : String(2010 + i), text: i === 0 ? HUGE : LOREM })),
    disciplines: Array.from({ length: 16 }, (_, i) => ({ title: i === 0 ? HUGE : `Disciplina número ${i + 1} con un nombre bastante largo`, text: i % 3 === 0 ? LOREM : '', photoUrl: i % 2 === 0 ? photo(i * 20) : null })),
    steps: Array.from({ length: 6 }, (_, i) => ({ title: i === 0 ? HUGE : `Paso ${i + 1}: un título largo que debe partirse`, text: LOREM })),
    benefits: Array.from({ length: 10 }, (_, i) => (i === 0 ? HUGE : `Beneficio ${i + 1}: ${LOREM}`)),
    monthlyFee: 9999999,
    feeNote: `${HUGE} ${LOREM}`,
    gallery: Array.from({ length: 12 }, (_, i) => ({ url: photo(i * 28), caption: i === 0 ? HUGE : i % 2 === 0 ? LOREM : '' })),
    faq: Array.from({ length: 10 }, (_, i) => ({ question: i === 0 ? `¿${HUGE}?` : `¿Pregunta frecuente número ${i + 1} bastante larga para que ocupe varias líneas en una pantalla angosta?`, answer: i === 0 ? HUGE : LOREM })),
    director: { name: `${HUGE} Riffo`, role: 'Directora general y fundadora de la academia', photoUrl: photo(10), bio: `${HUGE} ${LOREM}` },
    groups: Array.from({ length: 12 }, (_, i) => ({ name: i === 0 ? HUGE : `Grupo ${i + 1} de modelaje`, schedule: i % 2 === 0 ? `Lunes y miércoles de 18:30 a 20:00 en la sede ${i + 1}` : null })),
    studentCount: 1234,
    contact: {
      email: `contacto.academia.con.un.correo.larguisimo@${'subdominio.'.repeat(5)}crproducciones.cl`,
      whatsapp: { href: 'https://wa.me/56912345678', label: '+56 9 1234 5678' },
      instagrams: Array.from({ length: 5 }, (_, i) => ({ handle: `academia_cr_producciones_oficial_${i}`, href: `https://instagram.com/academia_cr_producciones_oficial_${i}` })),
      address: `Avenida ${HUGE} 1234, oficina 567, Temuco, Región de La Araucanía, Chile`,
    },
  }),
  minimo: base({
    name: 'Academia CR',
    tagline: '',
    intro: '',
    history: '',
    steps: [],
    disciplines: [{ title: 'Pasarela', text: '', photoUrl: null }],
    aboutTitle: 'Conócenos',
    highlights: [],
    testimonials: [],
    milestones: [],
    benefits: [],
    monthlyFee: null,
    feeNote: '',
    promo: '',
    gallery: [],
    faq: [],
    director: null,
    groups: [],
    studentCount: null,
    contact: { email: null, whatsapp: { href: 'https://wa.me/56912345678', label: '+56 9 1234 5678' }, instagrams: [], address: null },
    enrollmentHref: null,
  }),
  'sin-portada': base({ heroImageUrl: null, accent: 'violet', gallery: [{ url: photo(120), caption: '' }], director: { name: 'Carolina Riffo', role: 'Directora', photoUrl: null, bio: LOREM } }),
};

export const ACADEMY_FIXTURE_NAMES = Object.keys(ACADEMY_FIXTURES);
