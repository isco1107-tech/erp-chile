import type { IndustryTemplate } from './industries';

/**
 * Contenido de los sitios por rubro. Basado en un estudio de sitios chilenos
 * reales y de los creadores líderes (septiembre 2026): páginas, orden de
 * secciones, botón destacado, paleta con contraste verificado y errores
 * comunes. Los textos largos son ejemplos que dicen qué escribir; la lista
 * "qué le falta" los reconoce (ver `isSampleText`), así que no deben llevar
 * `{nombre}` (el nombre cambia el texto y dejaría de reconocerse): `{nombre}`
 * va solo en textos cortos (eyebrow, tagline, pie).
 */
export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: 'restaurant',
    label: 'Restaurante o cafetería',
    description: 'Carta, reservas, horario y ubicación a un toque.',
    examples: 'Restaurante, cafetería, pizzería, sushi, food truck, pastelería.',
    icon: 'UtensilsCrossed',
    kind: 'CORPORATE',
    goal: 'Que te reserven una mesa o te pidan delivery.',
    colors: { primary: '#9a3412', accent: '#b45309', background: '#fbf6ee', text: '#2b1d14' },
    font: 'lora',
    headingFont: 'playfair',
    header: { layout: 'classic', style: 'transparent', ctaLabel: 'Reservar mesa', ctaTarget: 'whatsapp', announcement: 'Menú ejecutivo de lunes a viernes', tagline: '' },
    footerAbout: '{nombre}: cocina de temporada con productos de la zona.',
    whatsappButton: true,
    actionBar: true,
    whatsappMessage: 'Hola, quiero reservar una mesa',
    pages: [
      {
        title: 'Inicio',
        blocks: [
          { type: 'hero', variant: 'full', eyebrow: '{nombre}', title: 'Cocina de temporada en el corazón de [tu barrio]', subtitle: 'Cuenta en una frase qué cocinas y qué te hace especial. Ej: Almuerzos, onces y cenas con productos de la zona. Reserva tu mesa en un minuto.', ctaLabel: 'Reservar mesa', secondaryLabel: 'Ver la carta' },
          { type: 'features', variant: 'icons', heading: 'Por qué venir', items: [{ icon: 'clock', title: 'Abierto todos los días', text: 'Escribe tu horario de atención real, por ejemplo: Lunes a sábado de 12:30 a 23:00.' }, { icon: 'truck', title: 'Delivery y retiro', text: 'Explica si haces delivery, por qué aplicación y a qué comunas llegas.' }, { icon: 'leaf', title: 'Productos de la zona', text: 'Cuenta de dónde vienen tus ingredientes o qué te diferencia de otros locales.' }] },
          { type: 'split', heading: 'Nuestra historia', body: 'Cuenta cómo nació tu restaurante, quién cocina y qué plato no se pueden perder. Dos o tres párrafos cortos bastan.\n\nSube una foto real de tu cocina o de tu equipo: da mucha más confianza que una foto de internet.', imageSide: 'right' },
          { type: 'gallery', variant: 'carousel', heading: 'Nuestros platos', images: [{}, {}, {}, {}, {}] },
          { type: 'testimonials', heading: 'Lo que dicen nuestros clientes', items: [{ quote: 'Pega aquí la opinión de un cliente real (por ejemplo, de Google), con su autorización.', author: 'Nombre del cliente', role: 'Comuna', rating: 5 }] },
          { type: 'cta', variant: 'band', title: 'Reserva tu mesa', text: 'Invita a reservar en una frase. Ej: Grupos y celebraciones con menú especial: escríbenos y te preparamos una propuesta.', buttonLabel: 'Reservar por WhatsApp' },
          { type: 'contact', heading: 'Contacto', text: 'Indica cómo llegar y si hay estacionamiento. Ej: A pasos del metro. Estacionamiento gratis para clientes.', hours: 'Lunes a jueves: 12:30 a 22:00\nViernes y sábado: 12:30 a 23:30\nDomingo: 12:30 a 17:00', showForm: true, showMap: true },
        ],
      },
      {
        title: 'Carta',
        blocks: [
          { type: 'hero', variant: 'minimal', eyebrow: 'Carta', title: 'Nuestra carta', subtitle: 'Explica en una frase cómo es tu carta. Ej: Cambiamos algunos platos cada temporada; pregunta por las sugerencias del día.' },
          { type: 'pricelist', heading: 'Carta', categories: [{ title: 'Entradas', items: [{ name: 'Nombre del plato', description: 'Describe el plato en una línea: ingredientes principales y cómo se prepara.', price: '$6.900' }, { name: 'Nombre del plato', description: 'Describe el plato en una línea: ingredientes principales y cómo se prepara.', price: '$7.500', tag: 'Vegano' }] }, { title: 'Fondos', items: [{ name: 'Nombre del plato', description: 'Describe el plato en una línea: ingredientes principales y cómo se prepara.', price: '$12.900' }, { name: 'Nombre del plato', description: 'Describe el plato en una línea: ingredientes principales y cómo se prepara.', price: '$13.500', tag: 'Nuevo' }] }], note: 'Precios con IVA incluido. Propina sugerida 10 %.' },
        ],
      },
      {
        title: 'Reservas',
        blocks: [
          { type: 'hero', variant: 'minimal', eyebrow: 'Reservas', title: 'Reserva tu mesa', subtitle: 'Explica cómo reservar y con cuánta anticipación. Ej: Reservas por WhatsApp hasta las 18:00 del mismo día.' },
          { type: 'faq', heading: 'Antes de venir', items: [{ question: '¿Aceptan grupos grandes?', answer: 'Explica desde cuántas personas es un grupo, si hay menú especial y si piden abono.' }, { question: '¿Tienen opciones veganas o sin gluten?', answer: 'Indica qué opciones tienes y si se pueden adaptar platos.' }] },
          { type: 'contact', heading: 'Contacto', text: 'Déjanos la fecha, la hora y cuántas personas vienen, y te confirmamos.', showForm: true },
        ],
      },
    ],
    tips: [
      'No subas la carta como foto o PDF: no se lee en el celular y Google no la encuentra.',
      'Mantén al día el horario de feriados y los precios.',
      'Usa fotos reales de tus platos y de tu local, con buena luz.',
      'Di si hay estacionamiento y acceso para sillas de ruedas.',
    ],
  },
];
