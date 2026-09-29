import type { z } from 'zod';
import type { blockSchema } from './blocks';

/**
 * Contenido de ejemplo de las plantillas iniciales. Redactado como borrador y
 * revisado a mano: son textos genéricos (sin marcas reales) que dicen qué
 * reemplazar. `readiness.ts` los reconoce para avisar "esto sigue siendo el
 * ejemplo": por eso no se deben modificar a la ligera (un cambio de texto
 * hace que los sitios ya creados dejen de detectarse como ejemplo).
 * Los `heading` son el menú del sitio; el de contacto es siempre "Contacto",
 * y los enlaces `#ancla` apuntan al título de la sección (ver `blockAnchors`).
 */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type StarterDraft = DistributiveOmit<z.input<typeof blockSchema>, 'id'>;
export type StarterKind = 'LANDING' | 'CORPORATE' | 'PORTFOLIO' | 'CATALOG' | 'EVENT' | 'PERSONAL';

export const STARTER_CONTENT: Record<StarterKind, StarterDraft[]> = {
  LANDING: [
    {
      type: 'hero',
      title: 'Tu solución para [problema] en Chile',
      subtitle: 'Cuenta en dos líneas qué hace tu negocio y a quién ayudas. Ej: Automatizamos la facturación de pymes para que ganen tiempo y eviten errores.',
      imageUrl: '',
      ctaLabel: 'Quiero saber más',
      ctaHref: '#contacto',
    },
    {
      type: 'features',
      heading: 'Beneficios',
      intro: 'Tres razones por las que [tu cliente ideal] nos elige.',
      items: [
        {
          title: 'Ahorro de tiempo',
          text: 'Describe el beneficio principal en una frase corta. Ej: Reducimos 10 horas semanales de trabajo manual.',
          imageUrl: '',
        },
        {
          title: 'Menos errores',
          text: 'Segundo beneficio clave. Ej: Validación automática según normativa SII vigente.',
          imageUrl: '',
        },
        {
          title: 'Soporte real',
          text: 'Tercer beneficio. Ej: Equipo en Chile que responde por WhatsApp en horario comercial.',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'text',
      heading: 'Cómo funciona',
      body: 'Explica en 3-4 pasos simples cómo contratar o usar tu servicio. Ej: 1) Agendas una llamada. 2) Diagnóstico gratis. 3) Propuesta a la medida. 4) Implementamos y capacitamos.',
    },
    {
      type: 'testimonials',
      heading: 'Clientes',
      items: [
        {
          quote: 'Escribe aquí una opinión real de un cliente (máx. 500 caracteres). Pide autorización antes de publicar.',
          author: 'Nombre Apellido',
          role: 'Cargo, Empresa',
        },
        {
          quote: 'Otro testimonio breve que destaque un resultado concreto. Ej: "En una semana teníamos todo andando."',
          author: 'Nombre Apellido',
          role: 'Cargo, Empresa',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'Preguntas',
      items: [
        {
          question: '¿Cuánto cuesta?',
          answer: 'Responde en pocas líneas. Ej: Planes desde $X/mes. Sin contratos de permanencia.',
        },
        {
          question: '¿En qué zonas atienden?',
          answer: 'Ej: Todo Chile de forma remota. Visitas presenciales en RM y V Región.',
        },
        {
          question: '¿Cómo empiezo?',
          answer: 'Ej: Agendas una llamada de 15 min en el botón de abajo. Sin compromiso.',
        },
      ],
    },
    {
      type: 'cta',
      title: '¿Listo para empezar?',
      text: 'Escríbenos y te respondemos en menos de 24 horas hábiles.',
      buttonLabel: 'Contactar por WhatsApp',
      buttonHref: '#contacto',
    },
    {
      type: 'contact',
      heading: 'Contacto',
      text: 'Completa el formulario o escríbenos directo. Atendemos de lunes a viernes, 9:00-18:00.',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      showForm: true,
    },
  ],
  CORPORATE: [
    {
      type: 'hero',
      title: 'Soluciones que impulsan tu negocio',
      subtitle: 'Ayudamos a empresas chilenas a crecer con servicios personalizados, cercanos y de confianza.',
      imageUrl: '',
      ctaLabel: 'Conversemos',
      ctaHref: '#contacto',
    },
    {
      type: 'text',
      heading: 'Nosotros',
      body: 'Cuenta en 3–4 líneas quiénes son, qué los mueve y a qué tipo de clientes ayudan. Ejemplo: "Somos un equipo de profesionales con 10 años de experiencia en consultoría de gestión. Trabajamos codo a codo con pymes de todo Chile para ordenar sus procesos y mejorar sus resultados."',
    },
    {
      type: 'features',
      heading: 'Servicios',
      intro: 'Nuestros principales servicios. Cada tarjeta resume un beneficio claro para tu cliente.',
      items: [
        {
          title: 'Diagnóstico integral',
          text: 'Revisamos tus procesos y detectamos oportunidades de mejora en 2 semanas.',
          imageUrl: '',
        },
        {
          title: 'Plan de acción a medida',
          text: 'Diseñamos una hoja de ruta concreta con hitos, responsables y métricas.',
          imageUrl: '',
        },
        {
          title: 'Implementación guiada',
          text: 'Acompañamos la ejecución con reuniones quincenales y ajustes en marcha.',
          imageUrl: '',
        },
        {
          title: 'Capacitación interna',
          text: 'Transfirmamos conocimiento a tu equipo para que la mejora sea sostenible.',
          imageUrl: '',
        },
        {
          title: 'Monitoreo y reporting',
          text: 'Tableros simples para que veas avances y tomes decisiones con datos.',
          imageUrl: '',
        },
        {
          title: 'Soporte continuo',
          text: 'Estamos disponibles por WhatsApp y correo para dudas y ajustes menores.',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'text',
      heading: 'Por qué elegirnos',
      body: 'Enumera 3–4 razones diferenciadoras en viñetas cortas. Ejemplo: "• Enfoque 100% práctico, nada de teoría vacía. • Equipos senior que conocen la realidad PYME chilena. • Compromiso de resultados medibles en 90 días. • Relación directa, sin intermediarios ni burocracia."',
    },
    {
      type: 'gallery',
      heading: 'Galería',
      images: [
        {
          url: '',
          alt: 'Equipo en reunión de trabajo',
        },
        {
          url: '',
          alt: 'Taller con cliente',
        },
        {
          url: '',
          alt: 'Tablero de seguimiento de proyecto',
        },
        {
          url: '',
          alt: 'Capacitación en oficina del cliente',
        },
        {
          url: '',
          alt: 'Entrega de informe final',
        },
        {
          url: '',
          alt: 'Equipo celebrando logro',
        },
      ],
    },
    {
      type: 'testimonials',
      heading: 'Clientes',
      items: [
        {
          quote: 'Nos ordenaron la casa en tiempo récord. Hoy tenemos claridad y control.',
          author: 'María González',
          role: 'Gerente General, Pyme industrial',
        },
        {
          quote: 'El acompañamiento fue clave: no nos dejaron solos en la implementación.',
          author: 'Carlos Rojas',
          role: 'Dueño, Empresa de servicios',
        },
        {
          quote: 'Equipo cercano, profesional y que habla nuestro idioma. 100% recomendados.',
          author: 'Paula Méndez',
          role: 'Socia fundadora, Comercio',
        },
      ],
    },
    {
      type: 'contact',
      heading: 'Contacto',
      text: 'Déjanos tu mensaje y te respondemos en menos de 24 hrs hábiles.',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      showForm: true,
    },
  ],
  PORTFOLIO: [
    {
      type: 'hero',
      title: 'Portafolio creativo',
      subtitle: 'Diseño, desarrollo y estrategia digital para marcas que quieren destacar.',
      imageUrl: '',
      ctaLabel: 'Ver trabajos',
      ctaHref: '#contacto',
    },
    {
      type: 'text',
      heading: 'Sobre mí',
      body: 'Cuenta en dos o tres párrafos quién eres, tu enfoque y a qué tipo de clientes ayudas. Usa lenguaje cercano y evita jerga técnica innecesaria. Separa párrafos con una línea en blanco.',
    },
    {
      type: 'gallery',
      heading: 'Trabajos',
      images: [
        {
          url: '',
          alt: 'Proyecto 1: descripción breve del trabajo',
        },
        {
          url: '',
          alt: 'Proyecto 2: descripción breve del trabajo',
        },
        {
          url: '',
          alt: 'Proyecto 3: descripción breve del trabajo',
        },
        {
          url: '',
          alt: 'Proyecto 4: descripción breve del trabajo',
        },
        {
          url: '',
          alt: 'Proyecto 5: descripción breve del trabajo',
        },
        {
          url: '',
          alt: 'Proyecto 6: descripción breve del trabajo',
        },
      ],
    },
    {
      type: 'features',
      heading: 'Servicios',
      intro: 'Qué ofrezco y cómo ayudo a mis clientes a crecer.',
      items: [
        {
          title: 'Diseño web',
          text: 'Sitios claros, rápidos y adaptados a móvil. Enfoque en conversión y experiencia de usuario.',
          imageUrl: '',
        },
        {
          title: 'Identidad visual',
          text: 'Logotipo, paleta, tipografía y guía de marca para que te reconozcan al instante.',
          imageUrl: '',
        },
        {
          title: 'Estrategia digital',
          text: 'Plan de contenidos, SEO básico y embudos simples para atraer clientes ideales.',
          imageUrl: '',
        },
        {
          title: 'Mantenimiento',
          text: 'Actualizaciones, backups y soporte técnico para que tu sitio siga andando sin problemas.',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'features',
      heading: 'Proceso',
      intro: 'Cómo trabajamos juntos, paso a paso.',
      items: [
        {
          title: '1. Conversación',
          text: 'Entendemos tus objetivos, público y referencias. Definimos alcance y plazos.',
          imageUrl: '',
        },
        {
          title: '2. Propuesta',
          text: 'Entregamos wireframes, moodboard y cronograma. Ajustamos antes de producir.',
          imageUrl: '',
        },
        {
          title: '3. Producción',
          text: 'Diseñamos y desarrollamos en iteraciones cortas. Validas avances semanalmente.',
          imageUrl: '',
        },
        {
          title: '4. Entrega',
          text: 'Lanzamos, capacitamos y dejamos todo documentado. Quedamos disponibles post-lanzamiento.',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'testimonials',
      heading: 'Clientes',
      items: [
        {
          quote: 'Entendieron mi negocio desde la primera reunión. El sitio nuevo triplicó los contactos calificados en dos meses.',
          author: 'María González',
          role: 'Fundadora, tienda online',
        },
        {
          quote: 'Proceso ordenado, comunicación clara y cumplieron cada fecha. Hoy administro mi web sin depender de nadie.',
          author: 'Carlos Ruiz',
          role: 'Director, consultora',
        },
        {
          quote: 'La identidad visual reflejó exactamente lo que quería transmitir. Mis clientes lo notaron y lo comentan.',
          author: 'Javiera Soto',
          role: 'Dueña, café de especialidad',
        },
      ],
    },
    {
      type: 'contact',
      heading: 'Contacto',
      text: '¿Tienes un proyecto en mente? Escríbeme y agendamos una llamada breve sin compromiso.',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      showForm: true,
    },
  ],
  CATALOG: [
    {
      type: 'hero',
      title: 'Catálogo de productos de calidad',
      subtitle: 'Explora nuestra selección y solicita tu cotización sin compromiso. Entregas en todo Chile.',
      imageUrl: '',
      ctaLabel: 'Ver productos',
      ctaHref: '#productos',
    },
    {
      type: 'gallery',
      heading: 'Productos',
      images: [
        {
          url: '',
          alt: 'Producto 1 - Imagen principal',
        },
        {
          url: '',
          alt: 'Producto 2 - Detalle',
        },
        {
          url: '',
          alt: 'Producto 3 - En uso',
        },
        {
          url: '',
          alt: 'Producto 4 - Variantes',
        },
        {
          url: '',
          alt: 'Producto 5 - Empaque',
        },
        {
          url: '',
          alt: 'Producto 6 - Aplicación',
        },
      ],
    },
    {
      type: 'features',
      heading: 'Por qué comprar aquí',
      intro: 'Resumen de ventajas que nos diferencian. Reemplaza cada tarjeta por tus argumentos reales.',
      items: [
        {
          title: 'Stock real y despacho rápido',
          text: 'Contamos con bodega propia en Santiago y regiones. Despachamos en 24–48 hrs hábiles a todo Chile.',
          imageUrl: '',
        },
        {
          title: 'Precios por volumen',
          text: 'Descuentos progresivos desde 5, 20 y 50 unidades. Cotización formal en menos de 2 horas.',
          imageUrl: '',
        },
        {
          title: 'Garantía y soporte local',
          text: '6 meses de garantía por fallas de fábrica. Atención por WhatsApp y correo en horario comercial.',
          imageUrl: '',
        },
        {
          title: 'Facturación electrónica',
          text: 'Emitimos boleta o factura al instante. Compatible con tu sistema contable (SII, ERP).',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'Preguntas',
      items: [
        {
          question: '¿Cuánto demora el despacho a mi comuna?',
          answer: 'RM: 24–48 hrs hábiles. Regiones: 2–5 días según zona. Te enviamos número de seguimiento al despachar.',
        },
        {
          question: '¿Puedo retirar en bodega?',
          answer: 'Sí, en nuestra bodega de Santiago (coordinar horario). También en puntos de retiro en regiones principales.',
        },
        {
          question: '¿Qué medios de pago aceptan?',
          answer: 'Transferencia, Webpay (tarjetas débito/crédito), cheque al día y pago contra entrega (sujeto a validación).',
        },
        {
          question: '¿Emiten factura electrónica?',
          answer: 'Sí, automáticamente al confirmar el pago. Llega a tu correo y al portal del SII.',
        },
        {
          question: '¿Hay pedido mínimo?',
          answer: 'No hay mínimo para compra directa. Para precios mayoristas, aplica desde 5 unidades por SKU.',
        },
        {
          question: '¿Cómo solicito cotización formal?',
          answer: 'Usa el botón «Cotizar por WhatsApp» o el formulario de contacto. Responderemos con PDF en < 2 hrs hábiles.',
        },
      ],
    },
    {
      type: 'cta',
      title: '¿Necesitas cotización formal?',
      text: 'Escríbenos por WhatsApp y te enviamos el detalle con precios, stock y plazos de entrega.',
      buttonLabel: 'Cotizar por WhatsApp',
      buttonHref: '#contacto',
    },
    {
      type: 'contact',
      heading: 'Contacto',
      text: 'Completa el formulario o escríbenos directo. Respondemos en horario comercial (lun–vie 9:00–18:00).',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      showForm: true,
    },
  ],
  EVENT: [
    {
      type: 'hero',
      title: 'Encuentro Anual de Innovación 2025',
      subtitle: 'Ingresa aquí la fecha, hora y lugar de tu evento. Ej: 15 de noviembre, 09:00 hrs. Centro de Eventos, Santiago.',
      imageUrl: '',
      ctaLabel: 'Reservar entradas',
      ctaHref: '#contacto',
    },
    {
      type: 'text',
      heading: 'El Evento',
      body: 'Describe en este espacio de qué se trata el evento, sus objetivos y a quién está dirigido. Puedes detallar los temas clave que se abordarán, la experiencia esperada y por qué los asistentes no se lo pueden perder.',
    },
    {
      type: 'features',
      heading: 'Programa',
      intro: 'Revisa el cronograma de actividades planificadas para la jornada.',
      items: [
        {
          title: '09:00 - Acreditación y bienvenida',
          text: 'Recepción de participantes, entrega de credenciales y café de bienvenida.',
          imageUrl: '',
        },
        {
          title: '10:30 - Charlas y exposiciones',
          text: 'Presentaciones a cargo de destacados relatores e invitados especiales.',
          imageUrl: '',
        },
        {
          title: '15:00 - Talleres y networking',
          text: 'Espacio interactivo para compartir experiencias y generar contactos.',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'gallery',
      heading: 'Galería',
      images: [
        {
          url: '',
          alt: 'Muestra fotos de ediciones anteriores o del recinto del evento',
        },
        {
          url: '',
          alt: 'Foto de asistentes en charlas o actividades',
        },
        {
          url: '',
          alt: 'Ambiente general del evento',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'Preguntas',
      items: [
        {
          question: '¿Cómo se adquieren las entradas?',
          answer: 'Explica el proceso de compra o inscripción. Ej: Puedes reservar completando el formulario al final de esta página.',
        },
        {
          question: '¿Hay estacionamiento disponible en el lugar?',
          answer: 'Indica si el recinto cuenta con estacionamiento propio, pagado o alternativas cercanas de transporte público.',
        },
        {
          question: '¿El evento cuenta con accesibilidad universal?',
          answer: 'Detalla las facilidades de acceso para personas con movilidad reducida o necesidades específicas.',
        },
      ],
    },
    {
      type: 'cta',
      title: '¡Los cupos son limitados!',
      text: 'Reserva tu entrada con anticipación y asegura tu lugar en este gran evento.',
      buttonLabel: 'Reservar mi entrada',
      buttonHref: '#contacto',
    },
    {
      type: 'contact',
      heading: 'Contacto',
      text: 'Escríbenos si tienes consultas sobre las entradas, el programa o solicitudes de acreditación.',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      showForm: true,
    },
  ],
  PERSONAL: [
    {
      type: 'hero',
      title: '[Tu Nombre] | [Tu Especialidad o Profesión]',
      subtitle: 'Escribe aquí una breve descripción de tus servicios profesionales y cómo ayudas a tus clientes o pacientes.',
      imageUrl: '',
      ctaLabel: 'Agendar consulta',
      ctaHref: '#contacto',
    },
    {
      type: 'text',
      heading: 'Sobre mí',
      body: 'Cuéntale a tus visitantes quién eres, cuál es tu trayectoria y qué te apasiona de tu trabajo.\n\nPuedes mencionar tu formación, años de experiencia y la forma en que trabajas con tus clientes para entregar un servicio cercano y personalizado.',
    },
    {
      type: 'features',
      heading: 'Servicios',
      intro: 'Conoce las principales áreas de atención y asesoría que pongo a tu disposición.',
      items: [
        {
          title: 'Consultoría personalizada',
          text: 'Describe en dos líneas de qué trata este servicio y cuál es el beneficio principal que obtiene el cliente.',
          imageUrl: '',
        },
        {
          title: 'Evaluación y diagnóstico',
          text: 'Explica brevemente cómo analizas el caso o requerimiento antes de proponer una solución.',
          imageUrl: '',
        },
        {
          title: 'Acompañamiento y seguimiento',
          text: 'Detalla si ofreces revisiones periódicas, soporte continuo o asesoría tras la atención.',
          imageUrl: '',
        },
      ],
    },
    {
      type: 'testimonials',
      heading: 'Testimonios',
      items: [
        {
          quote: 'Escribe aquí la opinión o recomendación de un cliente satisfecho con tu trabajo o atención.',
          author: 'Nombre del cliente',
          role: 'Profesión o Cargo',
        },
        {
          quote: 'Agrega otra experiencia positiva que destaque tu compromiso, puntualidad o profesionalismo.',
          author: 'Nombre del cliente',
          role: 'Cliente particular',
        },
      ],
    },
    {
      type: 'faq',
      heading: 'Preguntas',
      items: [
        {
          question: '¿Cómo es la modalidad de atención?',
          answer: 'Aclara si atiendes de forma presencial, online o ambas, y en qué días y horarios agendas citas.',
        },
        {
          question: '¿Cuáles son los medios de pago?',
          answer: 'Indica si aceptas transferencia bancaria, tarjetas de débito, crédito u otros medios.',
        },
      ],
    },
    {
      type: 'contact',
      heading: 'Contacto',
      text: 'Déjame tu mensaje para coordinar una atención o resolver tus dudas. Te responderé a la brevedad.',
      email: '',
      phone: '',
      whatsapp: '',
      address: '',
      showForm: true,
    },
  ],
};
