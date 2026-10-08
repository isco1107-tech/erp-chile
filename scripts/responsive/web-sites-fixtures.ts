import { blockSchema, BLOCK_TYPES, type BlockType, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { industryDocument, findIndustry } from '@/lib/web-sites/industries';
import { SAMPLE_WEEK } from '@/lib/web-sites/section-samples';
import { documentFromBlocks, type SiteDocument } from '@/lib/web-sites/site';
import { kitTheme, parseTheme, THEME_KITS, type WebSiteTheme } from '@/lib/web-sites/theme';
import { layoutsOf } from '@/lib/web-sites/variants';

/**
 * Casos incómodos para `npm run verify:responsive:web-sites`: CADA diseño de
 * CADA tipo de sección, con los textos que más cuesta acomodar (títulos
 * larguísimos, una palabra enorme, `Temuco/Longuimay`, correos y URLs sin
 * espacios, listas largas) y fotos de proporciones distintas. Las fotos se
 * sirven desde `https://img.test/…` (el verificador intercepta esas
 * direcciones y devuelve imágenes generadas, sin red).
 *
 * Al agregar un tipo de sección o un diseño, entra solo: los casos se arman
 * recorriendo `BLOCK_TYPES` y `layoutsOf`.
 */

export const IMG = {
  wide: 'https://img.test/wide.svg',
  tall: 'https://img.test/tall.svg',
  square: 'https://img.test/square.svg',
  logo: 'https://img.test/logo.svg',
} as const;

const LONG_TITLE = 'Remodelaciones integrales de cocinas y baños en Temuco/Longuimay y alrededores';
const HUGE_WORD = 'Supercalifragilisticoespialidoso';
const LONG_TEXT = 'Atendemos a familias y empresas de toda la región con un equipo propio, garantía por escrito y presupuesto sin costo. Coordinamos la visita, medimos el espacio y te entregamos una propuesta detallada en menos de 48 horas, con materiales de primera y plazos que se cumplen.';
const EMAIL = 'contacto.ventas.departamento@empresaconnombremuylargo.cl';
const URL = 'https://www.empresaconnombremuylargoparaprobar.cl/servicios/remodelaciones';

const card = (n: number, image: string) => ({ title: n === 1 ? HUGE_WORD : `Servicio número ${n} con nombre largo`, text: LONG_TEXT.slice(0, 160 + n * 10), imageUrl: image, icon: 'sparkles', href: n === 1 ? URL : '' });

/** Sección con contenido incómodo para un tipo y diseño. */
function stress(type: BlockType, variant: string, index: number): WebSiteBlock {
  const id = `${type}-${variant}-${index}`;
  const raw: Record<string, unknown> = (() => {
    switch (type) {
      case 'hero':
        return { eyebrow: 'Desde 1998 en Temuco/Longuimay', title: LONG_TITLE, subtitle: LONG_TEXT, imageUrl: IMG.wide, images: [{ url: IMG.tall, alt: 'Foto' }, { url: IMG.square, alt: 'Foto' }, { url: IMG.wide, alt: 'Foto' }], ctaLabel: 'Cotizar por WhatsApp ahora', ctaHref: URL, secondaryLabel: 'Ver trabajos realizados', secondaryHref: '#x' };
      case 'text':
        return { heading: `${HUGE_WORD} y un título de sección bastante largo`, body: `${LONG_TEXT}\n\n**Negrita** con ${URL} y ${EMAIL} sin espacios.\n\n- Primer punto de la lista\n- Segundo punto con ${HUGE_WORD}\n\n${LONG_TEXT}` };
      case 'split':
        return { eyebrow: 'Nuestro taller', heading: LONG_TITLE, body: LONG_TEXT, imageUrl: IMG.wide, alt: 'Taller', buttonLabel: 'Conocer más del servicio', buttonHref: URL };
      case 'image':
        return { imageUrl: IMG.wide, alt: 'Foto', caption: `Una descripción larga de la foto con ${EMAIL}`, size: index % 3 === 0 ? 'full' : index % 3 === 1 ? 'wide' : 'normal' };
      case 'gallery':
        return { heading: 'Galería de trabajos terminados', images: [IMG.wide, IMG.tall, IMG.square, IMG.wide, IMG.tall, IMG.square, IMG.wide, IMG.square].map((url, i) => ({ url, alt: `Foto ${i}`, caption: i === 0 ? `Temuco/Longuimay ${HUGE_WORD}` : '' })), columns: '4' };
      case 'features':
        return { heading: 'Servicios que ofrecemos a familias y empresas', intro: LONG_TEXT.slice(0, 200), items: [1, 2, 3, 4, 5].map((n) => card(n, n % 2 ? IMG.wide : IMG.square)), columns: '3' };
      case 'stats':
        return { heading: 'Nuestra trayectoria en cifras', intro: LONG_TEXT.slice(0, 120), items: [{ value: '+12.500', label: 'Clientes atendidos en toda la región' }, { value: '98 %', label: 'Recomienda' }, { value: '25 años', label: 'De experiencia' }, { value: '1.250', label: HUGE_WORD }, { value: '$9.990', label: 'Desde' }] };
      case 'steps':
        return { heading: 'Cómo trabajamos contigo', items: [1, 2, 3, 4, 5].map((n) => ({ title: n === 2 ? HUGE_WORD : `Paso ${n}: nos cuentas tu proyecto completo`, text: LONG_TEXT.slice(0, 140) })) };
      case 'pricing':
        return { heading: 'Planes', items: [1, 2, 3, 4].map((n) => ({ name: n === 1 ? HUGE_WORD : `Plan ${n} completo`, price: '$1.249.990', period: 'al mes + IVA', description: LONG_TEXT.slice(0, 120), features: `Beneficio uno muy completo\n${HUGE_WORD}\nSoporte por WhatsApp todos los días`, buttonLabel: 'Contratar este plan', buttonHref: URL, highlighted: n === 2, badge: n === 2 ? 'El más elegido' : '' })) };
      case 'team':
        return { heading: 'Nuestro equipo', items: [1, 2, 3, 4, 5].map((n) => ({ name: n === 1 ? `María José ${HUGE_WORD}` : `Persona número ${n} Apellido Apellido`, role: 'Directora de proyectos y obras', photoUrl: n % 2 ? IMG.tall : '', bio: LONG_TEXT.slice(0, 140) })) };
      case 'testimonials':
        return { heading: 'Lo que dicen nuestros clientes', items: [1, 2, 3, 4, 5].map((n) => ({ quote: LONG_TEXT.slice(0, 80 + n * 40), author: n === 1 ? HUGE_WORD : `Cliente ${n} Apellido`, role: 'Temuco/Longuimay', photoUrl: n === 1 ? IMG.square : '', rating: 5 })) };
      case 'quote':
        return { quote: `${LONG_TEXT.slice(0, 180)} ${HUGE_WORD}`, author: 'Pedro Muñoz Fuenzalida', role: 'Chef y dueño', photoUrl: IMG.square };
      case 'logos':
        return { heading: 'Confían en nosotros', items: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ imageUrl: IMG.logo, alt: `Logo ${n}`, href: n === 1 ? URL : '' })) };
      case 'pricelist':
        return { heading: 'Lista de precios', categories: [1, 2, 3].map((c) => ({ title: c === 1 ? HUGE_WORD : `Categoría ${c}`, items: [1, 2, 3].map((n) => ({ name: n === 1 ? `Corte + barba + lavado ${HUGE_WORD}` : `Servicio ${n}`, description: LONG_TEXT.slice(0, 100), price: '$1.249.990', tag: n === 2 ? 'Nuevo' : '', imageUrl: n === 3 ? '' : IMG.square })) })), note: 'Precios con IVA incluido.' };
      case 'catalog':
        return { heading: 'Catálogo', items: [1, 2, 3, 4].map((n) => ({ imageUrl: n % 2 ? IMG.square : IMG.wide, title: n === 1 ? HUGE_WORD : `Producto ${n} con nombre largo`, price: '$1.249.990', description: LONG_TEXT.slice(0, 120), details: '3 dormitorios · 2 baños · 80 m² · estacionamiento', code: 'SKU-123456', badge: n === 1 ? 'Oferta' : '' })), whatsapp: '+56912345678', buttonLabel: 'Pedir por WhatsApp' };
      case 'schedule':
        return { heading: 'Horario de clases', rows: [1, 2, 3, 4, 5, 6].map((n) => ({ day: n < 3 ? 'Lunes' : n < 5 ? 'Miércoles y viernes por la tarde' : HUGE_WORD, time: '18:30 – 20:00', title: n === 1 ? HUGE_WORD : `Actividad ${n} de nombre largo`, detail: 'Sala 2, profesora María José' })) };
      case 'faq':
        return { heading: 'Preguntas frecuentes', intro: LONG_TEXT.slice(0, 100), items: [1, 2, 3, 4, 5].map((n) => ({ question: n === 1 ? `¿${HUGE_WORD}?` : `¿Pregunta número ${n} bastante larga sobre despachos y pagos?`, answer: `${LONG_TEXT.slice(0, 150)} ${EMAIL}` })) };
      case 'cta':
        return { title: LONG_TITLE, text: LONG_TEXT.slice(0, 160), buttonLabel: 'Escribir por WhatsApp ahora', buttonHref: URL, secondaryLabel: 'Ver precios', secondaryHref: '#x', imageUrl: IMG.wide };
      case 'video':
        return { heading: 'Conócenos en video', intro: LONG_TEXT.slice(0, 160), url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: EMAIL };
      case 'map':
        return { heading: 'Dónde estamos', text: LONG_TEXT.slice(0, 140), address: 'Avenida Libertador Bernardo O’Higgins 1234, oficina 567, Temuco/Longuimay' };
      case 'countdown':
        return { heading: 'Falta poco para el lanzamiento', text: LONG_TEXT.slice(0, 120), target: '2030-12-31T23:00:00-03:00', endedText: 'Ya comenzó', buttonLabel: 'Inscribirme', buttonHref: URL };
      case 'contact':
        return { heading: 'Contacto', text: LONG_TEXT.slice(0, 140), email: EMAIL, phone: '+56 2 2345 6789', whatsapp: '+56 9 1234 5678', address: 'Avenida Libertador Bernardo O’Higgins 1234, Temuco/Longuimay', hours: 'Lunes a viernes: 9:00 a 18:00\nSábado: 10:00 a 14:00', showForm: true, showMap: index % 2 === 0 };
      case 'divider':
        return { size: 'md' };
      case 'timeline':
        return { heading: 'Nuestra historia', items: [1, 2, 3, 4, 5].map((n) => ({ date: n === 5 ? 'Marzo de 2026' : String(1998 + n * 5), title: n === 1 ? HUGE_WORD : `Hito ${n} con un nombre largo`, text: LONG_TEXT.slice(0, 140), imageUrl: n === 2 ? IMG.wide : '' })) };
      case 'comparison':
        return { heading: 'Compara y elige', intro: LONG_TEXT.slice(0, 100), columns: [{ title: 'Nosotros' }, { title: HUGE_WORD }, { title: 'Otros' }], rows: [1, 2, 3, 4, 5].map((n) => ({ label: n === 1 ? HUGE_WORD : `Característica ${n} con descripción larga`, values: ['Sí', n % 2 ? 'No' : '24 horas hábiles', 'No'] })), highlight: 0 };
      case 'beforeafter':
        return { heading: 'Antes y después', intro: LONG_TEXT.slice(0, 100), items: [1, 2, 3].map((n) => ({ beforeUrl: IMG.wide, afterUrl: IMG.square, caption: n === 1 ? `Cocina en Temuco/Longuimay ${HUGE_WORD}` : 'Baño remodelado', alt: 'Remodelación' })) };
      case 'links':
        return { imageUrl: IMG.square, title: `Pastelería ${HUGE_WORD}`, text: LONG_TEXT.slice(0, 120), items: [1, 2, 3, 4, 5].map((n) => ({ label: n === 1 ? `Haz tu pedido por WhatsApp ${HUGE_WORD}` : `Enlace número ${n} bastante largo`, href: URL, icon: n % 2 ? 'phone' : '' })), showSocial: true };
      case 'marquee':
        return { items: [{ text: 'Envíos a todo Chile' }, { text: HUGE_WORD }, { text: 'Hecho a mano' }, { text: 'Temuco/Longuimay' }] };
      case 'tabs':
        return { heading: 'Lo que ofrecemos', items: [1, 2, 3, 4, 5].map((n) => ({ label: n === 1 ? HUGE_WORD : `Pestaña ${n} larga`, title: LONG_TITLE, body: `${LONG_TEXT}\n\n- Punto uno\n- ${EMAIL}`, imageUrl: n % 2 ? IMG.wide : '', buttonLabel: 'Reservar hora', buttonHref: URL })) };
      case 'hours':
        return { heading: 'Horario de atención', intro: LONG_TEXT.slice(0, 100), week: SAMPLE_WEEK.map((day, n) => (n === 2 ? { ...day, open: '09:00', close: '13:00', open2: '15:00', close2: '19:30' } : day)), note: `Feriados cerrado. ${EMAIL}` };
      case 'areas':
        return { heading: 'Comunas que atendemos', intro: LONG_TEXT.slice(0, 100), items: ['Temuco/Longuimay', HUGE_WORD, 'Padre Las Casas', 'Pedro Aguirre Cerda', 'Lo Barnechea', 'San José de la Mariquina', 'Ñuñoa', 'Providencia', 'Las Condes', 'Vitacura', 'Estación Central', 'La Florida'].map((name) => ({ name })), note: 'Otras comunas con recargo.' };
      case 'embed':
        return { heading: 'Agenda tu hora', text: `${LONG_TEXT.slice(0, 160)} ${EMAIL}`, url: 'https://calendly.com/mi-negocio-con-nombre-largo/evaluacion-inicial', height: 'md', caption: URL };
      case 'posts':
        return { heading: 'Novedades', items: [1, 2, 3, 4].map((n) => ({ imageUrl: n % 2 ? IMG.wide : '', date: '12 de septiembre de 2026', tag: n === 1 ? 'Noticia' : 'Consejos prácticos', title: n === 1 ? `${HUGE_WORD} y un título de novedad muy largo` : `Novedad número ${n} con un título largo`, excerpt: LONG_TEXT.slice(0, 160), href: URL })) };
    }
  })();
  return blockSchema.parse({ ...raw, id, type, variant });
}

/** Grupos de secciones por página (una página con las 135 sería inmanejable en una captura). */
const GROUPS: Record<string, BlockType[]> = {
  portadas: ['hero'],
  contenido: ['text', 'split', 'features', 'stats', 'steps'],
  confianza: ['testimonials', 'quote', 'logos', 'team', 'timeline', 'comparison', 'beforeafter'],
  venta: ['pricing', 'pricelist', 'catalog', 'cta', 'countdown', 'posts'],
  medios: ['gallery', 'image', 'video', 'map', 'embed'],
  contacto: ['contact', 'hours', 'areas', 'faq', 'tabs', 'links', 'marquee', 'schedule', 'divider'],
};

const covered = new Set(Object.values(GROUPS).flat());
const missing = BLOCK_TYPES.filter((type) => !covered.has(type));
if (missing.length) throw new Error(`Faltan tipos en los casos: ${missing.join(', ')}`);

export interface WebSiteFixture {
  name: string;
  theme: WebSiteTheme;
  document: SiteDocument;
}

const STYLES = ['none', 'dots', 'grid', 'diagonal', 'rings'] as const;
const SHAPES = ['none', 'wave', 'curve', 'slant', 'zigzag', 'triangle', 'steps'] as const;
const BACKGROUNDS = ['default', 'muted', 'primary', 'soft', 'dark', 'gradient', 'accent'] as const;

function groupDocument(types: BlockType[]): SiteDocument {
  let n = 0;
  const blocks = types.flatMap((type) =>
    layoutsOf(type).map((option) => {
      const block = stress(type, option.value, n);
      n += 1;
      // Se recorren fondos, texturas y bordes con forma para probarlos con contenido real.
      return { ...block, style: { ...block.style, background: BACKGROUNDS[n % BACKGROUNDS.length]!, pattern: STYLES[n % STYLES.length]!, shape: SHAPES[n % SHAPES.length]! } };
    })
  );
  const doc = documentFromBlocks(blocks);
  return {
    ...doc,
    header: { ...doc.header, ctaLabel: 'Cotizar ahora', ctaHref: '#x', tagline: 'Temuco/Longuimay', announcement: { enabled: true, text: `Despacho gratis sobre $30.000 a ${HUGE_WORD}`, href: URL, linkLabel: 'Ver más', style: 'accent' } },
    footer: { ...doc.footer, layout: 'big', about: LONG_TEXT.slice(0, 200) },
    social: { ...doc.social, instagram: '@minegocio', facebook: 'facebook.com/minegocio', tiktok: '@minegocio' },
    whatsapp: { enabled: true, number: '+56912345678', message: 'Hola', label: 'Escríbenos' },
    actionBar: { enabled: true, phone: '+56223456789', address: 'Temuco' },
  };
}

const base = parseTheme({ animation: 'none', font: 'inter' });

export const WEB_SITE_FIXTURES: Record<string, WebSiteFixture> = {
  ...Object.fromEntries(Object.entries(GROUPS).map(([name, types]) => [name, { name: `Sitio de pruebas ${HUGE_WORD}`, theme: base, document: groupDocument(types) }])),
  // Estilos completos con letras anchas y extremos: lo que más cuesta acomodar.
  ...Object.fromEntries(
    ['tech-dark', 'brutal', 'neon', 'sport'].map((id) => {
      const kit = THEME_KITS.find((entry) => entry.id === id)!;
      const types: BlockType[] = ['hero', 'features', 'pricing', 'testimonials', 'contact'];
      const doc = documentFromBlocks(types.map((type, i) => stress(type, layoutsOf(type)[i % layoutsOf(type).length]!.value, i)));
      return [`estilo-${id}`, { name: 'Estilo completo con nombre largo', theme: parseTheme({ ...kitTheme(kit), animation: 'none' }), document: { ...doc, header: { ...doc.header, layout: 'split', style: 'floating', ctaLabel: 'Agenda una demo', ctaHref: '#x' }, footer: { ...doc.footer, layout: 'centered' } } }];
    })
  ),
  // Sitios por rubro tal como los arma el asistente (con su encabezado y su pie).
  ...Object.fromEntries(
    ['restaurant', 'tech', 'creative', 'home-services'].map((id) => {
      const industry = findIndustry(id)!;
      const { document, theme } = industryDocument(industry, { name: 'Remodelaciones Temuco/Longuimay', contact: { email: EMAIL, phone: '+56912345678', address: 'Av. Alemania 1234, Temuco' } });
      return [`rubro-${id}`, { name: 'Remodelaciones Temuco/Longuimay', theme: parseTheme({ ...theme, animation: 'none' }), document }];
    })
  ),
};
