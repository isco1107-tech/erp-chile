import { SAMPLE_WEEK } from './section-samples';
import type { StarterDraft } from './templates-content';

/**
 * Páginas listas para agregar a un sitio ("Nosotros", "Servicios"…). Cada una
 * trae secciones con textos que dicen qué escribir; la lista "qué le falta"
 * los reconoce como ejemplo (ver `isSampleText`) y no deja publicar hasta que
 * se cambien. Los enlaces `#contacto` bajan a la sección Contacto de la misma
 * página cuando existe.
 */

export interface PageTemplate {
  id: string;
  label: string;
  /** Para qué sirve, en una línea. */
  description: string;
  /** Nombre inicial de la página (y de su dirección). */
  title: string;
  blocks: StarterDraft[];
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'blank',
    label: 'En blanco',
    description: 'Una página vacía para armar a tu gusto.',
    title: 'Página nueva',
    blocks: [],
  },
  {
    id: 'about',
    label: 'Nosotros',
    description: 'Tu historia, tu equipo y lo que te diferencia.',
    title: 'Nosotros',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Quiénes somos', title: 'Nuestra historia', subtitle: 'Cuenta en una frase desde cuándo existes y qué te mueve. Ej: Desde 2012 ayudamos a familias de Temuco a tener la casa que sueñan.' },
      { type: 'split', heading: 'Cómo empezamos', body: 'Cuenta cómo nació tu negocio, qué problema viste y cómo lo resolviste. Dos o tres párrafos cortos se leen mejor que uno largo.\n\nAgrega una foto tuya, de tu equipo o de tu local: da confianza.', imageSide: 'right' },
      { type: 'stats', heading: 'En números', items: [{ value: '10+', label: 'Años de experiencia (cambia por tu cifra real)' }, { value: '500', label: 'Clientes atendidos (cambia por tu cifra real)' }, { value: '98%', label: 'Clientes que nos recomiendan (cambia por tu cifra real)' }] },
      { type: 'team', heading: 'Nuestro equipo', intro: 'Las personas detrás de cada proyecto. Sube una foto de cada una con el mismo encuadre.', items: [{ name: 'Nombre y apellido', role: 'Cargo', bio: 'Una línea sobre su experiencia o lo que más le gusta de su trabajo.' }, { name: 'Nombre y apellido', role: 'Cargo', bio: 'Una línea sobre su experiencia o lo que más le gusta de su trabajo.' }, { name: 'Nombre y apellido', role: 'Cargo', bio: 'Una línea sobre su experiencia o lo que más le gusta de su trabajo.' }] },
      { type: 'cta', title: '¿Conversamos?', text: 'Invita a dar el siguiente paso en una frase. Ej: Cuéntanos tu proyecto y te respondemos en el día.', buttonLabel: 'Escríbenos', buttonHref: '' },
    ],
  },
  {
    id: 'services',
    label: 'Servicios',
    description: 'Lo que ofreces, cómo trabajas y preguntas frecuentes.',
    title: 'Servicios',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Lo que hacemos', title: 'Nuestros servicios', subtitle: 'Resume en una frase qué resuelves y para quién. Ej: Mantención y reparación de calderas para hogares y edificios.' },
      { type: 'features', variant: 'icons', heading: 'Servicios', intro: 'Una tarjeta por servicio: qué es y qué gana el cliente.', items: [{ icon: 'wrench', title: 'Servicio 1', text: 'Describe el servicio en una o dos frases, pensando en lo que gana tu cliente.' }, { icon: 'shield', title: 'Servicio 2', text: 'Describe el servicio en una o dos frases, pensando en lo que gana tu cliente.' }, { icon: 'clock', title: 'Servicio 3', text: 'Describe el servicio en una o dos frases, pensando en lo que gana tu cliente.' }] },
      { type: 'steps', heading: 'Cómo trabajamos', items: [{ title: 'Nos cuentas lo que necesitas', text: 'Explica cómo es el primer contacto: por WhatsApp, formulario o llamada.' }, { title: 'Te enviamos una propuesta', text: 'Explica qué incluye la cotización y en cuánto tiempo la envías.' }, { title: 'Hacemos el trabajo', text: 'Explica cómo es la entrega y qué garantía das.' }] },
      { type: 'faq', heading: 'Preguntas frecuentes', items: [{ question: '¿Cuánto cuesta?', answer: 'Explica cómo cobras: precio fijo, por hora o según cotización. Si puedes, da un rango.' }, { question: '¿En qué zonas atienden?', answer: 'Indica las comunas o ciudades donde trabajas y si cobras traslado.' }] },
      { type: 'cta', title: '¿Te ayudamos?', text: 'Invita a pedir una cotización en una frase. Ej: Te respondemos con una propuesta en menos de 24 horas.', buttonLabel: 'Pedir cotización', buttonHref: '' },
    ],
  },
  {
    id: 'pricing',
    label: 'Precios',
    description: 'Planes o paquetes para comparar y contratar.',
    title: 'Precios',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Planes', title: 'Elige tu plan', subtitle: 'Explica en una frase cómo elegir. Ej: Todos los planes incluyen soporte por WhatsApp y puedes cambiarte cuando quieras.' },
      { type: 'pricing', heading: 'Planes', items: [{ name: 'Básico', price: '$19.990', period: 'al mes', description: 'Para quien recién empieza (cambia por tu descripción).', features: 'Beneficio 1 (cambia por lo que incluye)\nBeneficio 2 (cambia por lo que incluye)\nBeneficio 3 (cambia por lo que incluye)', buttonLabel: 'Elegir', buttonHref: '' }, { name: 'Profesional', price: '$39.990', period: 'al mes', description: 'El más elegido (cambia por tu descripción).', features: 'Todo lo del plan Básico (cambia por lo que incluye)\nBeneficio extra (cambia por lo que incluye)\nBeneficio extra (cambia por lo que incluye)', buttonLabel: 'Elegir', buttonHref: '', highlighted: true, badge: 'Recomendado' }, { name: 'Empresa', price: 'A convenir', period: '', description: 'Para equipos grandes (cambia por tu descripción).', features: 'Todo lo del plan Profesional (cambia por lo que incluye)\nAtención dedicada (cambia por lo que incluye)', buttonLabel: 'Conversemos', buttonHref: '' }] },
      { type: 'faq', heading: 'Preguntas sobre los planes', items: [{ question: '¿Puedo cambiarme de plan?', answer: 'Explica si se puede subir o bajar de plan y desde cuándo corre el cambio.' }, { question: '¿Qué formas de pago aceptan?', answer: 'Indica transferencia, tarjetas, Webpay u otras formas de pago que aceptes.' }] },
    ],
  },
  {
    id: 'portfolio',
    label: 'Trabajos',
    description: 'Galería de proyectos terminados y opiniones de clientes.',
    title: 'Trabajos',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Portafolio', title: 'Trabajos realizados', subtitle: 'Cuenta en una frase qué tipo de proyectos muestras. Ej: Algunas de las cocinas y baños que remodelamos en la Región Metropolitana.' },
      { type: 'gallery', variant: 'masonry', heading: 'Proyectos', images: [{}, {}, {}, {}, {}, {}] },
      { type: 'testimonials', heading: 'Lo que dicen nuestros clientes', items: [{ quote: 'Pega aquí la opinión de un cliente real, con su autorización. Las opiniones concretas convencen más.', author: 'Nombre del cliente', role: 'Comuna o empresa', rating: 5 }] },
    ],
  },
  {
    id: 'team',
    label: 'Equipo',
    description: 'Las personas detrás del negocio.',
    title: 'Equipo',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Equipo', title: 'Las personas detrás de cada proyecto', subtitle: 'Presenta a tu equipo en una frase. Ej: Profesionales con años de experiencia y ganas de hacer las cosas bien.' },
      { type: 'team', heading: 'Nuestro equipo', items: [{ name: 'Nombre y apellido', role: 'Cargo', bio: 'Una línea sobre su experiencia o lo que más le gusta de su trabajo.' }, { name: 'Nombre y apellido', role: 'Cargo', bio: 'Una línea sobre su experiencia o lo que más le gusta de su trabajo.' }, { name: 'Nombre y apellido', role: 'Cargo', bio: 'Una línea sobre su experiencia o lo que más le gusta de su trabajo.' }] },
    ],
  },
  {
    id: 'faq',
    label: 'Preguntas frecuentes',
    description: 'Respuestas a lo que más te preguntan.',
    title: 'Preguntas frecuentes',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Ayuda', title: 'Preguntas frecuentes', subtitle: 'Resume en una frase qué encontrarán aquí. Ej: Todo sobre despachos, pagos, cambios y garantías.' },
      { type: 'faq', heading: 'Preguntas frecuentes', items: [{ question: '¿Hacen despacho?', answer: 'Explica a dónde despachas, con qué empresa, cuánto demora y cuánto cuesta.' }, { question: '¿Qué formas de pago aceptan?', answer: 'Indica transferencia, tarjetas, Webpay u otras formas de pago que aceptes.' }, { question: '¿Tienen garantía?', answer: 'Explica qué cubre la garantía, por cuánto tiempo y cómo se hace válida.' }] },
    ],
  },
  {
    id: 'contact',
    label: 'Contacto',
    description: 'Formulario, datos, horario y mapa.',
    title: 'Contacto',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Contacto', title: 'Hablemos', subtitle: 'Invita a escribir en una frase. Ej: Cuéntanos qué necesitas y te respondemos en menos de 24 horas.' },
      { type: 'contact', heading: 'Contacto', text: 'Déjanos tu mensaje o escríbenos directo por WhatsApp.', showForm: true },
    ],
  },
  {
    id: 'links',
    label: 'Enlaces (link en bio)',
    description: 'Tu foto y botones grandes a WhatsApp, catálogo y redes, para poner en Instagram o TikTok.',
    title: 'Enlaces',
    blocks: [
      {
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
    ],
  },
  {
    id: 'visit',
    label: 'Horario y ubicación',
    description: 'Cuándo atiendes (con "Abierto ahora"), dónde estás y cómo llegar.',
    title: 'Visítanos',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Visítanos', title: 'Horario y ubicación', subtitle: 'Explica cómo llegar en una frase. Ej: A dos cuadras del metro, con estacionamiento para clientes.' },
      { type: 'hours', variant: 'card', heading: 'Horario de atención', week: SAMPLE_WEEK, note: 'Cambia este horario por el tuyo y anota aquí los feriados o la atención con hora.' },
      { type: 'map', variant: 'split', heading: 'Cómo llegar', text: 'Indica referencias para encontrarte: una esquina conocida, el color de la fachada o el local de al lado.', address: '' },
    ],
  },
  {
    id: 'history',
    label: 'Nuestra historia',
    description: 'Tu trayectoria hito por hito, con fotos y cifras.',
    title: 'Historia',
    blocks: [
      { type: 'hero', variant: 'editorial', eyebrow: 'Nuestra historia', title: 'Cómo llegamos hasta aquí', subtitle: 'Resume tu historia en una frase. Ej: De un pequeño taller familiar a atender a más de mil clientes en la región.' },
      {
        type: 'timeline',
        variant: 'alternating',
        heading: 'Hitos',
        items: [
          { date: '2015', title: 'Nombre del hito', text: 'Cuenta en una o dos frases qué pasó en este momento y por qué fue importante.' },
          { date: '2019', title: 'Nombre del hito', text: 'Cuenta en una o dos frases qué pasó en este momento y por qué fue importante.' },
          { date: '2023', title: 'Nombre del hito', text: 'Cuenta en una o dos frases qué pasó en este momento y por qué fue importante.' },
          { date: 'Hoy', title: 'Nombre del hito', text: 'Cuenta en una o dos frases qué pasó en este momento y por qué fue importante.' },
        ],
      },
      { type: 'stats', variant: 'divided', heading: 'En números', items: [{ value: '+500', label: 'Escribe qué significa esta cifra' }, { value: '12', label: 'Escribe qué significa esta cifra' }, { value: '98 %', label: 'Escribe qué significa esta cifra' }] },
    ],
  },
  {
    id: 'news',
    label: 'Novedades',
    description: 'Noticias, lanzamientos y anuncios con foto y fecha.',
    title: 'Novedades',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Novedades', title: 'Lo último', subtitle: 'Explica qué publicas aquí. Ej: Lanzamientos, eventos y consejos para sacarle partido a nuestros productos.' },
      {
        type: 'posts',
        variant: 'featured',
        heading: 'Novedades',
        items: [
          { date: '12 de marzo de 2026', tag: 'Noticia', title: 'Título de la novedad', excerpt: 'Resume la novedad en dos líneas: qué pasó, cuándo y por qué le importa a tu cliente.' },
          { date: '28 de febrero de 2026', tag: 'Consejos', title: 'Título de la novedad', excerpt: 'Resume la novedad en dos líneas: qué pasó, cuándo y por qué le importa a tu cliente.' },
          { date: '3 de febrero de 2026', tag: 'Evento', title: 'Título de la novedad', excerpt: 'Resume la novedad en dos líneas: qué pasó, cuándo y por qué le importa a tu cliente.' },
        ],
      },
    ],
  },
  {
    id: 'compare',
    label: 'Comparar',
    description: 'Tabla comparativa de planes u opciones, con preguntas frecuentes.',
    title: 'Comparar',
    blocks: [
      { type: 'hero', variant: 'minimal', eyebrow: 'Comparar', title: 'Encuentra la opción para ti', subtitle: 'Explica en una frase cómo elegir. Ej: Todas las opciones incluyen soporte por WhatsApp y garantía.' },
      {
        type: 'comparison',
        variant: 'table',
        heading: 'Compara y elige',
        columns: [{ title: 'Básico' }, { title: 'Completo' }, { title: 'Premium' }],
        rows: [
          { label: 'Característica 1', values: ['Sí', 'Sí', 'Sí'] },
          { label: 'Característica 2', values: ['No', 'Sí', 'Sí'] },
          { label: 'Característica 3', values: ['No', 'No', 'Sí'] },
          { label: 'Característica 4', values: ['48 horas', '24 horas', 'El mismo día'] },
        ],
        highlight: 1,
      },
      { type: 'faq', variant: 'columns', heading: 'Preguntas frecuentes', items: [{ question: '¿Puedo cambiarme?', answer: 'Explica si se puede cambiar de opción y cómo.' }, { question: '¿Cómo puedo pagar?', answer: 'Indica los medios de pago y si hay cuotas.' }] },
    ],
  },
];

export function pageTemplate(id: string): PageTemplate {
  return PAGE_TEMPLATES.find((template) => template.id === id) ?? PAGE_TEMPLATES[0]!;
}
