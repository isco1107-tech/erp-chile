import { blockSchema, newBlockId, type BlockType, type HoursDay, type WebSiteBlock } from './blocks';
import type { StarterDraft } from './templates-content';
import { withVariant } from './variants';

/**
 * Contenido de muestra de cada tipo de sección: lo que se ve en las
 * miniaturas de "Elige un diseño" y lo que trae una sección recién agregada
 * desde la biblioteca, para que el diseño se vea de inmediato. Los textos
 * dicen qué escribir y la lista "qué le falta" los reconoce (`isSampleText`):
 * un sitio no se publica con ellos. Los textos cortos que no deben publicarse
 * nunca van además en `SAMPLE_PLACEHOLDERS`.
 *
 * Sin fotos: no hay fotos de muestra (solo se publican fotos propias); la
 * vista previa marca dónde van.
 */

/** Textos cortos de muestra que se reconocen aunque midan menos de 25 caracteres. */
export const SAMPLE_PLACEHOLDERS = [
  'Nombre del servicio',
  'Nombre del producto',
  'Nombre del plan',
  'Nombre y apellido',
  'Cargo o especialidad',
  'Nombre del cliente',
  'Nombre del hito',
  'Tu nombre o marca',
  'Título de la novedad',
  'Comuna 1',
  'Comuna 2',
  'Comuna 3',
  'Comuna 4',
  'Comuna 5',
  'Comuna 6',
  'Frase corta 1',
  'Frase corta 2',
  'Frase corta 3',
  'Frase corta 4',
  'Pestaña 1',
  'Pestaña 2',
  'Pestaña 3',
  'Característica 1',
  'Característica 2',
  'Característica 3',
  'Característica 4',
  'Enlace 1',
  'Enlace 2',
  'Enlace 3',
  'Enlace 4',
  'Tu frase corta aquí',
  'Nombre de la actividad',
  'Sala, profesor o lugar',
  'Comuna o empresa',
  'Categoría',
  'Otra categoría',
] as const;

const CARD_TEXT = 'Explica en una o dos frases qué gana tu cliente con esto, sin tecnicismos.';
const STEP_TEXT = 'Explica qué pasa en este paso y cuánto demora, en una o dos frases.';
const QUOTE_TEXT = 'Pega aquí la opinión real de un cliente (por ejemplo, de Google), con su autorización.';
const MILESTONE_TEXT = 'Cuenta en una o dos frases qué pasó en este momento y por qué fue importante.';
const PRICE_DESC = 'Describe en una línea qué incluye y para quién es.';
const POST_TEXT = 'Resume la novedad en dos líneas: qué pasó, cuándo y por qué le importa a tu cliente.';
const TAB_TEXT = 'Explica en dos o tres frases qué incluye esta categoría, para quién es y cuánto demora.\n\n- Un beneficio concreto\n- Otro beneficio concreto';

/** Horario de muestra (lunes a viernes 09:00–18:00, sábado 10:00–14:00, domingo cerrado). */
export const SAMPLE_WEEK: HoursDay[] = [
  ...Array.from({ length: 5 }, () => ({ closed: false, open: '09:00', close: '18:00', open2: '', close2: '' })),
  { closed: false, open: '10:00', close: '14:00', open2: '', close2: '' },
  { closed: true, open: '', close: '', open2: '', close2: '' },
];

export const SECTION_SAMPLES: Record<BlockType, StarterDraft> = {
  hero: {
    type: 'hero',
    eyebrow: 'Tu frase corta aquí',
    title: 'Di en una frase qué haces y para quién',
    subtitle: 'Agrega una frase de apoyo con el beneficio principal. Ej: Respondemos en menos de 24 horas y trabajamos en todo Chile.',
    // Espacios para las fotos extra del diseño "Collage" (vacíos no se publican).
    images: [{}, {}, {}],
    ctaLabel: 'Escríbenos',
    secondaryLabel: 'Ver más',
  },
  text: {
    type: 'text',
    heading: 'Quiénes somos',
    body: 'Cuenta tu historia en dos o tres párrafos cortos: desde cuándo existes, qué te mueve y por qué la gente confía en ti.\n\nUsa **negritas** para lo más importante. Los párrafos de tres o cuatro líneas se leen mejor en el celular.',
  },
  split: {
    type: 'split',
    eyebrow: 'Lo que hacemos',
    heading: 'Presenta aquí un servicio o tu local',
    body: 'Describe en dos o tres frases qué ofreces, cómo trabajas y qué te diferencia. Acompáñalo con una foto real.',
    buttonLabel: 'Conocer más',
  },
  image: { type: 'image', alt: '', caption: 'Escribe una descripción breve de lo que muestra la foto.' },
  gallery: { type: 'gallery', heading: 'Galería', images: [{}, {}, {}, {}, {}, {}] },
  features: {
    type: 'features',
    heading: 'Servicios',
    intro: 'Una tarjeta por servicio: qué es y qué gana el cliente.',
    items: [
      { icon: 'sparkles', title: 'Nombre del servicio', text: CARD_TEXT },
      { icon: 'shield', title: 'Nombre del servicio', text: CARD_TEXT },
      { icon: 'clock', title: 'Nombre del servicio', text: CARD_TEXT },
    ],
  },
  stats: {
    type: 'stats',
    heading: 'Nuestra trayectoria',
    intro: 'Cifras reales que demuestran tu experiencia (cámbialas por las tuyas).',
    items: [
      { value: '+500', label: 'Escribe qué significa esta cifra' },
      { value: '12', label: 'Escribe qué significa esta cifra' },
      { value: '98 %', label: 'Escribe qué significa esta cifra' },
    ],
  },
  steps: {
    type: 'steps',
    heading: 'Cómo trabajamos',
    items: [
      { title: 'Nos cuentas lo que necesitas', text: STEP_TEXT },
      { title: 'Te enviamos una propuesta', text: STEP_TEXT },
      { title: 'Hacemos el trabajo', text: STEP_TEXT },
    ],
  },
  pricing: {
    type: 'pricing',
    heading: 'Planes',
    items: [
      { name: 'Nombre del plan', price: '$19.990', period: 'al mes', description: PRICE_DESC, features: 'Escribe un beneficio por línea\nOtro beneficio del plan\nUno más', buttonLabel: 'Elegir' },
      { name: 'Nombre del plan', price: '$29.990', period: 'al mes', description: PRICE_DESC, features: 'Escribe un beneficio por línea\nOtro beneficio del plan\nUno más', buttonLabel: 'Elegir', highlighted: true, badge: 'Recomendado' },
      { name: 'Nombre del plan', price: '$49.990', period: 'al mes', description: PRICE_DESC, features: 'Escribe un beneficio por línea\nOtro beneficio del plan\nUno más', buttonLabel: 'Elegir' },
    ],
  },
  team: {
    type: 'team',
    heading: 'Nuestro equipo',
    items: [
      { name: 'Nombre y apellido', role: 'Cargo o especialidad', bio: 'Una línea sobre su experiencia y qué hace en el equipo.' },
      { name: 'Nombre y apellido', role: 'Cargo o especialidad', bio: 'Una línea sobre su experiencia y qué hace en el equipo.' },
      { name: 'Nombre y apellido', role: 'Cargo o especialidad', bio: 'Una línea sobre su experiencia y qué hace en el equipo.' },
    ],
  },
  testimonials: {
    type: 'testimonials',
    heading: 'Opiniones de clientes',
    items: [
      { quote: QUOTE_TEXT, author: 'Nombre del cliente', role: 'Comuna o empresa', rating: 5 },
      { quote: QUOTE_TEXT, author: 'Nombre del cliente', role: 'Comuna o empresa', rating: 5 },
      { quote: QUOTE_TEXT, author: 'Nombre del cliente', role: 'Comuna o empresa', rating: 5 },
    ],
  },
  quote: { type: 'quote', quote: 'Escribe aquí una frase potente: tu lema, una promesa o la cita de un cliente.', author: 'Tu nombre o marca', role: 'Cargo o especialidad' },
  logos: { type: 'logos', heading: 'Confían en nosotros', items: [{}, {}, {}, {}, {}, {}] },
  pricelist: {
    type: 'pricelist',
    heading: 'Lista de precios',
    categories: [
      { title: 'Categoría', items: [{ name: 'Nombre del producto', description: PRICE_DESC, price: '$9.990' }, { name: 'Nombre del producto', description: PRICE_DESC, price: '$12.990', tag: 'Nuevo' }] },
      { title: 'Otra categoría', items: [{ name: 'Nombre del producto', description: PRICE_DESC, price: '$7.990' }, { name: 'Nombre del producto', description: PRICE_DESC, price: '$14.990' }] },
    ],
    note: 'Aclara si los precios incluyen IVA y desde cuándo rigen.',
  },
  catalog: {
    type: 'catalog',
    heading: 'Catálogo',
    buttonLabel: 'Pedir por WhatsApp',
    items: [
      { title: 'Nombre del producto', price: '$19.990', details: 'Dato clave · otro dato · medida', description: PRICE_DESC },
      { title: 'Nombre del producto', price: '$24.990', details: 'Dato clave · otro dato · medida', description: PRICE_DESC, badge: 'Nuevo' },
      { title: 'Nombre del producto', price: '$14.990', details: 'Dato clave · otro dato · medida', description: PRICE_DESC },
    ],
  },
  schedule: {
    type: 'schedule',
    heading: 'Horario de clases',
    rows: [
      { day: 'Lunes', time: '09:00', title: 'Nombre de la actividad', detail: 'Sala, profesor o lugar' },
      { day: 'Lunes', time: '18:30', title: 'Nombre de la actividad', detail: 'Sala, profesor o lugar' },
      { day: 'Miércoles', time: '19:00', title: 'Nombre de la actividad', detail: 'Sala, profesor o lugar' },
    ],
  },
  faq: {
    type: 'faq',
    heading: 'Preguntas frecuentes',
    intro: 'Responde aquí lo que más te preguntan antes de comprar.',
    items: [
      { question: '¿Cuánto demora?', answer: 'Responde en pocas líneas, con plazos concretos.' },
      { question: '¿Cómo puedo pagar?', answer: 'Indica los medios de pago y si hay cuotas.' },
      { question: '¿Llegan a mi comuna?', answer: 'Indica dónde atiendes o despachas y si tiene costo.' },
    ],
  },
  cta: { type: 'cta', title: '¿Listo para empezar?', text: 'Invita a dar el siguiente paso en una frase. Ej: Cuéntanos tu proyecto y te respondemos hoy mismo.', buttonLabel: 'Escríbenos', secondaryLabel: 'Ver precios' },
  video: { type: 'video', heading: 'Conócenos en video', intro: 'Pega el enlace de un video de YouTube o Vimeo que muestre tu trabajo.' },
  map: { type: 'map', heading: 'Dónde estamos', text: 'Indica cómo llegar y si hay estacionamiento.', address: '' },
  countdown: { type: 'countdown', heading: 'Falta poco', text: 'Explica qué pasa cuando termine la cuenta: un lanzamiento, una oferta o un evento.', endedText: '¡Ya comenzó!' },
  contact: { type: 'contact', heading: 'Contacto', text: 'Invita a escribir y di en cuánto tiempo respondes.', showForm: true },
  divider: { type: 'divider' },
  timeline: {
    type: 'timeline',
    heading: 'Nuestra historia',
    items: [
      { date: '2015', title: 'Nombre del hito', text: MILESTONE_TEXT },
      { date: '2019', title: 'Nombre del hito', text: MILESTONE_TEXT },
      { date: '2023', title: 'Nombre del hito', text: MILESTONE_TEXT },
      { date: 'Hoy', title: 'Nombre del hito', text: MILESTONE_TEXT },
    ],
  },
  comparison: {
    type: 'comparison',
    heading: 'Compara y elige',
    intro: 'Muestra en qué te diferencias o qué incluye cada opción.',
    columns: [{ title: 'Nosotros' }, { title: 'Otros' }],
    rows: [
      { label: 'Característica 1', values: ['Sí', 'No'] },
      { label: 'Característica 2', values: ['Sí', 'No'] },
      { label: 'Característica 3', values: ['Sí', 'Sí'] },
      { label: 'Característica 4', values: ['24 horas', '5 días'] },
    ],
    highlight: 0,
  },
  beforeafter: { type: 'beforeafter', heading: 'Antes y después', intro: 'Sube dos fotos tomadas desde el mismo ángulo para que el cambio se note.', items: [{ caption: 'Describe brevemente el trabajo realizado.' }] },
  links: {
    type: 'links',
    title: 'Tu nombre o marca',
    text: 'Una frase sobre lo que haces. Ej: Repostería artesanal a pedido en Valdivia.',
    items: [
      { label: 'Enlace 1', icon: 'phone' },
      { label: 'Enlace 2', icon: 'shopping-bag' },
      { label: 'Enlace 3', icon: 'calendar' },
      { label: 'Enlace 4', icon: 'map-pin' },
    ],
  },
  marquee: { type: 'marquee', items: [{ text: 'Frase corta 1' }, { text: 'Frase corta 2' }, { text: 'Frase corta 3' }, { text: 'Frase corta 4' }] },
  tabs: {
    type: 'tabs',
    heading: 'Lo que ofrecemos',
    items: [
      { label: 'Pestaña 1', title: 'Título de la primera categoría', body: TAB_TEXT },
      { label: 'Pestaña 2', title: 'Título de la segunda categoría', body: TAB_TEXT },
      { label: 'Pestaña 3', title: 'Título de la tercera categoría', body: TAB_TEXT },
    ],
  },
  hours: { type: 'hours', heading: 'Horario de atención', week: SAMPLE_WEEK, note: 'Aclara aquí los feriados o si se atiende con hora.' },
  areas: {
    type: 'areas',
    heading: 'Dónde atendemos',
    intro: 'Escribe las comunas o ciudades a las que llegas.',
    items: [{ name: 'Comuna 1' }, { name: 'Comuna 2' }, { name: 'Comuna 3' }, { name: 'Comuna 4' }, { name: 'Comuna 5' }, { name: 'Comuna 6' }],
    note: 'Aclara si el despacho o la visita tiene costo en alguna zona.',
  },
  embed: { type: 'embed', heading: 'Agenda tu hora', text: 'Pega el enlace de Calendly, Google Forms, Google Calendar, Spotify o SoundCloud y explica aquí qué hacer.' },
  posts: {
    type: 'posts',
    heading: 'Novedades',
    items: [
      { date: '12 de marzo de 2026', tag: 'Noticia', title: 'Título de la novedad', excerpt: POST_TEXT },
      { date: '28 de febrero de 2026', tag: 'Consejos', title: 'Título de la novedad', excerpt: POST_TEXT },
      { date: '3 de febrero de 2026', tag: 'Evento', title: 'Título de la novedad', excerpt: POST_TEXT },
    ],
  },
};

/** Sección nueva con el contenido de muestra y el diseño elegido (id nuevo). */
export function sampleBlock(type: BlockType, variant?: string): WebSiteBlock {
  const block = blockSchema.parse({ ...structuredClone(SECTION_SAMPLES[type]), id: newBlockId() });
  return variant ? withVariant(block, variant) : block;
}

/** ¿El horario sigue siendo el de muestra? (la lista "qué le falta" lo recuerda, sin bloquear: puede ser el real). */
export function isSampleWeek(week: HoursDay[]): boolean {
  return JSON.stringify(week) === JSON.stringify(SAMPLE_WEEK);
}
