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
];

export function pageTemplate(id: string): PageTemplate {
  return PAGE_TEMPLATES.find((template) => template.id === id) ?? PAGE_TEMPLATES[0]!;
}
