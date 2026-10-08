import {
  AREAS_VARIANTS,
  BEFORE_AFTER_VARIANTS,
  blockSchema,
  CATALOG_VARIANTS,
  COMPARISON_VARIANTS,
  CONTACT_VARIANTS,
  COUNTDOWN_VARIANTS,
  CTA_VARIANTS,
  DIVIDER_VARIANTS,
  EMBED_VARIANTS,
  FAQ_VARIANTS,
  FEATURE_VARIANTS,
  GALLERY_VARIANTS,
  HERO_VARIANTS,
  HOURS_VARIANTS,
  IMAGE_VARIANTS,
  LINKS_VARIANTS,
  LOGOS_VARIANTS,
  MAP_VARIANTS,
  MARQUEE_VARIANTS,
  POSTS_VARIANTS,
  PRICELIST_VARIANTS,
  PRICING_VARIANTS,
  QUOTE_VARIANTS,
  SCHEDULE_VARIANTS,
  SPLIT_VARIANTS,
  STATS_VARIANTS,
  STEPS_VARIANTS,
  TABS_VARIANTS,
  TEAM_VARIANTS,
  TESTIMONIAL_VARIANTS,
  TEXT_VARIANTS,
  TIMELINE_VARIANTS,
  VIDEO_VARIANTS,
  type BlockOf,
  type BlockType,
  type WebSiteBlock,
} from './blocks';

/**
 * Diseños de cada tipo de sección: el nombre y la explicación que ve el
 * usuario al elegir cómo se ve una sección ("Portada · Collage"). El
 * contenido no cambia al cambiar de diseño: los mismos textos y fotos se
 * reacomodan, como en los creadores de sitios líderes.
 *
 * El orden de cada lista es el de las listas cerradas de `blocks.ts` (el
 * primero es el de fábrica). `tests/web-sites-variants.test.ts` exige que
 * cada valor del esquema tenga su entrada y viceversa.
 */

export type VariantOf<T extends BlockType> = BlockOf<T>['variant'];

export interface LayoutOption<V extends string = string> {
  value: V;
  label: string;
  description: string;
  /** El diseño luce con fotos: sin ellas la vista previa muestra dónde van. */
  photos?: boolean;
}

export interface LayoutInfo<T extends BlockType> {
  /** Consejo para elegir entre los diseños. */
  hint: string;
  options: readonly LayoutOption<VariantOf<T>>[];
}

type LayoutRegistry = { [T in BlockType]: LayoutInfo<T> };

export const BLOCK_LAYOUTS: LayoutRegistry = {
  hero: {
    hint: '“Dividida” va muy bien para servicios y profesionales. “Pantalla completa” o “Tarjeta”, con una foto propia bonita, lucen en restaurantes, turismo y belleza. “Degradado” no necesita foto.',
    options: [
      { value: 'center', label: 'Centrada', description: 'Título al centro sobre color o foto.' },
      { value: 'split', label: 'Dividida', description: 'Texto a la izquierda y foto a la derecha.', photos: true },
      { value: 'split-left', label: 'Dividida (foto a la izquierda)', description: 'Foto a la izquierda y texto a la derecha.', photos: true },
      { value: 'full', label: 'Pantalla completa', description: 'Foto grande que ocupa toda la pantalla.', photos: true },
      { value: 'minimal', label: 'Mínima', description: 'Solo texto, sin franja de color.' },
      { value: 'card', label: 'Tarjeta sobre foto', description: 'El texto en una tarjeta flotando sobre la foto.', photos: true },
      { value: 'collage', label: 'Collage', description: 'Texto y un mosaico de hasta cuatro fotos.', photos: true },
      { value: 'editorial', label: 'Editorial', description: 'Título enorme, estilo revista, y la foto a lo ancho.', photos: true },
      { value: 'gradient', label: 'Degradado', description: 'Fondo de colores de tu marca con brillo suave.' },
      { value: 'stacked', label: 'Foto abajo', description: 'Texto centrado y una foto grande debajo, como las apps.', photos: true },
    ],
  },
  text: {
    hint: '“Título al costado” se ve muy profesional en pantallas grandes. “Destacado” sirve para un párrafo corto e importante.',
    options: [
      { value: 'standard', label: 'Clásico', description: 'Título y párrafos en una columna cómoda de leer.' },
      { value: 'columns', label: 'Dos columnas', description: 'El texto se reparte en dos columnas, como un diario.' },
      { value: 'sidebar', label: 'Título al costado', description: 'Título a la izquierda y el texto a la derecha.' },
      { value: 'lead', label: 'Destacado', description: 'Texto grande y centrado para una idea importante.' },
      { value: 'card', label: 'En tarjeta', description: 'El texto dentro de un recuadro que resalta.' },
    ],
  },
  split: {
    hint: 'Alterna el lado de la foto entre secciones seguidas para que la página respire.',
    options: [
      { value: 'standard', label: 'Clásico', description: 'Foto y texto en dos mitades.', photos: true },
      { value: 'overlap', label: 'Superpuesto', description: 'El texto en una tarjeta que se monta sobre la foto.', photos: true },
      { value: 'framed', label: 'Con marco', description: 'La foto con un bloque de color desplazado detrás.', photos: true },
      { value: 'circle', label: 'Foto redonda', description: 'Foto circular; ideal para presentar a una persona.', photos: true },
      { value: 'wide', label: 'Foto grande', description: 'La foto ocupa más espacio que el texto.', photos: true },
    ],
  },
  image: {
    hint: 'El marco cambia cómo se presenta la foto; el ancho lo eliges abajo.',
    options: [
      { value: 'shadow', label: 'Con sombra', description: 'Bordes redondeados y sombra suave.', photos: true },
      { value: 'plain', label: 'Limpia', description: 'Sin sombra ni bordes: solo la foto.', photos: true },
      { value: 'frame', label: 'Marco', description: 'Un marco fino del color de acento.', photos: true },
      { value: 'polaroid', label: 'Polaroid', description: 'Borde blanco y la descripción abajo, como foto impresa.', photos: true },
      { value: 'arch', label: 'Arco', description: 'Parte de arriba en arco; elegante y moderna.', photos: true },
    ],
  },
  gallery: {
    hint: '“Destacada” y “Mosaico” lucen con 5 o más fotos. “Carrusel” y “Tira” ahorran espacio en el celular.',
    options: [
      { value: 'grid', label: 'Cuadrícula', description: 'Fotos del mismo tamaño en filas.', photos: true },
      { value: 'masonry', label: 'Muro', description: 'Fotos de distinta altura, como Pinterest.', photos: true },
      { value: 'carousel', label: 'Carrusel', description: 'Se pasan de lado a lado; ahorra espacio.', photos: true },
      { value: 'featured', label: 'Destacada', description: 'Una foto grande y las demás más chicas al lado.', photos: true },
      { value: 'bento', label: 'Mosaico', description: 'Cuadros de distintos tamaños, muy moderno.', photos: true },
      { value: 'strip', label: 'Tira', description: 'Fotos altas en una fila que se desliza.', photos: true },
      { value: 'polaroid', label: 'Polaroid', description: 'Fotos con marco blanco, levemente giradas.', photos: true },
    ],
  },
  features: {
    hint: '“Tarjetas” sirve para casi todo. “Mosaico” y “Sobre foto” lucen con fotos propias. “Zigzag” cuenta servicios con más detalle.',
    options: [
      { value: 'cards', label: 'Tarjetas', description: 'Cada servicio en su tarjeta, con ícono o foto.' },
      { value: 'icons', label: 'Íconos', description: 'Ícono grande al centro, sin recuadro.' },
      { value: 'list', label: 'Lista', description: 'Renglones con un ícono pequeño; compacta.' },
      { value: 'bento', label: 'Mosaico', description: 'Tarjetas de distintos tamaños; la primera destaca.' },
      { value: 'zigzag', label: 'Zigzag', description: 'Foto y texto alternando de lado, uno bajo otro.', photos: true },
      { value: 'numbered', label: 'Numerada', description: 'Números grandes (01, 02, 03) junto a cada idea.' },
      { value: 'minimal', label: 'Minimalista', description: 'Solo una línea arriba de cada idea; muy limpia.' },
      { value: 'overlay', label: 'Sobre foto', description: 'El título va encima de la foto de cada tarjeta.', photos: true },
      { value: 'carousel', label: 'Carrusel', description: 'Tarjetas que se deslizan de lado.' },
    ],
  },
  stats: {
    hint: '“Al costado” deja espacio para una introducción más larga.',
    options: [
      { value: 'plain', label: 'Números grandes', description: 'Cifras grandes y su descripción debajo.' },
      { value: 'cards', label: 'Tarjetas', description: 'Cada cifra en un recuadro.' },
      { value: 'divided', label: 'Con divisiones', description: 'Cifras separadas por líneas verticales.' },
      { value: 'side', label: 'Al costado', description: 'Título a la izquierda y cifras a la derecha.' },
    ],
  },
  steps: {
    hint: '“Horizontal” se ve muy bien con 3 o 4 pasos cortos.',
    options: [
      { value: 'vertical', label: 'Vertical', description: 'Pasos numerados uno bajo otro, unidos por una línea.' },
      { value: 'horizontal', label: 'Horizontal', description: 'Los pasos en una fila, de izquierda a derecha.' },
      { value: 'cards', label: 'Tarjetas', description: 'Cada paso en su tarjeta con el número grande.' },
      { value: 'timeline', label: 'Zigzag', description: 'Pasos alternados a cada lado de una línea central.' },
    ],
  },
  pricing: {
    hint: '“Lista” va bien con muchos planes o servicios con precio fijo.',
    options: [
      { value: 'cards', label: 'Tarjetas', description: 'Planes lado a lado; el destacado resalta.' },
      { value: 'minimal', label: 'Minimalista', description: 'Columnas limpias separadas por líneas.' },
      { value: 'list', label: 'Lista', description: 'Un plan por fila con su precio y botón.' },
    ],
  },
  team: {
    hint: '“Retratos” luce con fotos verticales parecidas entre sí.',
    options: [
      { value: 'circles', label: 'Fotos redondas', description: 'Foto circular, nombre y cargo.' },
      { value: 'cards', label: 'Tarjetas', description: 'Cada persona en su tarjeta con foto arriba.', photos: true },
      { value: 'portrait', label: 'Retratos', description: 'Fotos verticales grandes con el nombre encima.', photos: true },
      { value: 'list', label: 'Lista', description: 'Foto a un lado y una descripción más larga al otro.' },
    ],
  },
  testimonials: {
    hint: '“Muro” luce con muchos testimonios; “Destacado” con uno muy bueno y su foto.',
    options: [
      { value: 'cards', label: 'Tarjetas', description: 'Opiniones en tarjetas con estrellas.' },
      { value: 'quotes', label: 'Citas grandes', description: 'Texto grande, sin recuadro.' },
      { value: 'carousel', label: 'Carrusel', description: 'Se deslizan de lado a lado.' },
      { value: 'masonry', label: 'Muro', description: 'Muchas opiniones de distinto largo, como un muro.' },
      { value: 'spotlight', label: 'Destacado', description: 'Una opinión grande con la foto de quien la escribe.' },
      { value: 'minimal', label: 'Minimalista', description: 'Columnas limpias separadas por líneas.' },
    ],
  },
  quote: {
    hint: '“Con foto” transmite cercanía cuando la frase es de una persona real.',
    options: [
      { value: 'plain', label: 'Clásica', description: 'Comillas y la frase grande al centro.' },
      { value: 'card', label: 'En tarjeta', description: 'La frase dentro de un recuadro con color.' },
      { value: 'bar', label: 'Con barra', description: 'Alineada a la izquierda con una barra de color.' },
      { value: 'photo', label: 'Con foto', description: 'La foto de quien la dice al lado de la frase.', photos: true },
    ],
  },
  logos: {
    hint: '“En movimiento” llama la atención; úsalo con 6 o más logos.',
    options: [
      { value: 'row', label: 'En fila', description: 'Logos en gris que toman color al pasar el mouse.', photos: true },
      { value: 'grid', label: 'Cuadrícula', description: 'Cada logo en su casilla.', photos: true },
      { value: 'marquee', label: 'En movimiento', description: 'Una cinta que desfila sola.', photos: true },
    ],
  },
  pricelist: {
    hint: '“Carta” es el clásico de restaurantes; “Con fotos” vende más si tus fotos son buenas.',
    options: [
      { value: 'columns', label: 'Columnas', description: 'Categorías en dos columnas con línea de puntos.' },
      { value: 'menu', label: 'Carta', description: 'Elegante y centrada, como la carta de un restaurante.' },
      { value: 'cards', label: 'Tarjetas', description: 'Cada categoría en su tarjeta.' },
      { value: 'photos', label: 'Con fotos', description: 'Cada producto con su foto pequeña.', photos: true },
    ],
  },
  catalog: {
    hint: '“Lista” muestra más detalle de cada producto; “Carrusel” ahorra espacio.',
    options: [
      { value: 'grid', label: 'Fichas', description: 'Fichas con foto, precio y botón.', photos: true },
      { value: 'list', label: 'Lista', description: 'Foto a un lado y la descripción completa al otro.', photos: true },
      { value: 'carousel', label: 'Carrusel', description: 'Fichas que se deslizan de lado.', photos: true },
      { value: 'minimal', label: 'Minimalista', description: 'Foto grande y el texto debajo, sin recuadro.', photos: true },
    ],
  },
  schedule: {
    hint: '“Tabla” es la más compacta; “Agenda” sirve para el programa de un evento.',
    options: [
      { value: 'cards', label: 'Por día', description: 'Una tarjeta por día con sus horarios.' },
      { value: 'table', label: 'Tabla', description: 'Todo en una sola tabla: día, hora y actividad.' },
      { value: 'timeline', label: 'Agenda', description: 'Línea de tiempo con la hora destacada.' },
    ],
  },
  faq: {
    hint: '“Al costado” deja el título fijo a la izquierda; “Tarjetas” muestra todas las respuestas a la vista.',
    options: [
      { value: 'accordion', label: 'Desplegable', description: 'Se abre cada pregunta al tocarla.' },
      { value: 'split', label: 'Al costado', description: 'Título a la izquierda y preguntas a la derecha.' },
      { value: 'columns', label: 'Dos columnas', description: 'Preguntas desplegables en dos columnas.' },
      { value: 'cards', label: 'Tarjetas', description: 'Pregunta y respuesta siempre a la vista.' },
    ],
  },
  cta: {
    hint: 'Usa un solo llamado por pantalla. “Con foto” y “Degradado” llaman mucho la atención.',
    options: [
      { value: 'card', label: 'Tarjeta', description: 'Un recuadro de color con el mensaje.' },
      { value: 'band', label: 'Franja', description: 'Una franja de color de lado a lado.' },
      { value: 'split', label: 'Con foto', description: 'Mensaje y botón junto a una foto.', photos: true },
      { value: 'minimal', label: 'Minimalista', description: 'Solo texto y botón, sin fondo.' },
      { value: 'banner', label: 'Barra', description: 'Mensaje a la izquierda y botón a la derecha.' },
      { value: 'gradient', label: 'Degradado', description: 'Recuadro con un degradado de tus colores.' },
    ],
  },
  video: {
    hint: '“Al costado” permite explicar el video con más texto.',
    options: [
      { value: 'standard', label: 'Centrado', description: 'El video al centro con su título.' },
      { value: 'wide', label: 'Ancho', description: 'El video ocupa todo el ancho del sitio.' },
      { value: 'split', label: 'Al costado', description: 'Texto a un lado y el video al otro.' },
    ],
  },
  map: {
    hint: '“Con datos” muestra la dirección y una explicación junto al mapa.',
    options: [
      { value: 'standard', label: 'Mapa', description: 'El mapa con la dirección arriba.' },
      { value: 'split', label: 'Con datos', description: 'Dirección y texto a un lado, mapa al otro.' },
    ],
  },
  countdown: {
    hint: '“Gigante” funciona como portada de un lanzamiento.',
    options: [
      { value: 'boxes', label: 'Recuadros', description: 'Días, horas, minutos y segundos en cajas.' },
      { value: 'minimal', label: 'Minimalista', description: 'Números separados por dos puntos, sin cajas.' },
      { value: 'big', label: 'Gigante', description: 'Números enormes; ocupa toda la franja.' },
    ],
  },
  contact: {
    hint: '“Centrado” queda bien al final de una página de captación.',
    options: [
      { value: 'split', label: 'Datos y formulario', description: 'Datos a la izquierda, formulario a la derecha.' },
      { value: 'centered', label: 'Centrado', description: 'Formulario al centro y los datos debajo.' },
      { value: 'cards', label: 'Tarjetas', description: 'Cada forma de contacto en su tarjeta.' },
      { value: 'minimal', label: 'Minimalista', description: 'Datos grandes, sin recuadros.' },
    ],
  },
  divider: {
    hint: 'Los separadores con forma (ola, zigzag) dan un toque distinto; úsalos poco.',
    options: [
      { value: 'line', label: 'Línea', description: 'Una línea fina.' },
      { value: 'dots', label: 'Puntos', description: 'Tres puntos al centro.' },
      { value: 'space', label: 'Espacio', description: 'Solo aire, sin línea.' },
      { value: 'ornament', label: 'Adorno', description: 'Una estrella entre dos líneas.' },
      { value: 'gradient', label: 'Degradado', description: 'Línea que se desvanece en los extremos.' },
      { value: 'wave', label: 'Ola', description: 'Una línea ondulada.' },
      { value: 'zigzag', label: 'Zigzag', description: 'Una línea en zigzag.' },
    ],
  },
  timeline: {
    hint: '“Horizontal” se desliza de lado y ahorra espacio con muchos hitos.',
    options: [
      { value: 'alternating', label: 'Alternada', description: 'Hitos a cada lado de una línea central.' },
      { value: 'vertical', label: 'Vertical', description: 'Hitos uno bajo otro, a un lado de la línea.' },
      { value: 'horizontal', label: 'Horizontal', description: 'Hitos en una fila que se desliza.' },
      { value: 'cards', label: 'Tarjetas', description: 'Cada hito en una tarjeta con su fecha grande.' },
    ],
  },
  comparison: {
    hint: '“Nosotros vs. otros” usa solo las dos primeras columnas.',
    options: [
      { value: 'table', label: 'Tabla', description: 'Filas y columnas; la columna destacada resalta.' },
      { value: 'versus', label: 'Nosotros vs. otros', description: 'Dos tarjetas lado a lado con vistos y cruces.' },
    ],
  },
  beforeafter: {
    hint: '“Deslizable” es el más llamativo: se arrastra para ver el cambio.',
    options: [
      { value: 'slider', label: 'Deslizable', description: 'Una foto sobre la otra; se desliza para comparar.', photos: true },
      { value: 'side', label: 'Lado a lado', description: 'Las dos fotos una junto a la otra.', photos: true },
    ],
  },
  links: {
    hint: '“Botones” es el formato clásico de enlace en la bio.',
    options: [
      { value: 'stack', label: 'Botones', description: 'Botones grandes uno bajo otro.' },
      { value: 'grid', label: 'Cuadrícula', description: 'Enlaces en dos columnas, con ícono.' },
    ],
  },
  marquee: {
    hint: 'El movimiento se detiene solo si la persona pidió menos animaciones en su teléfono.',
    options: [
      { value: 'scroll', label: 'En movimiento', description: 'Una cinta que desfila de lado a lado.' },
      { value: 'big', label: 'Gigante', description: 'Letras enormes que desfilan lentamente.' },
      { value: 'static', label: 'Quieta', description: 'Las frases quietas, separadas por un adorno.' },
    ],
  },
  tabs: {
    hint: '“Al costado” funciona mejor con nombres de pestaña largos o muchas pestañas.',
    options: [
      { value: 'top', label: 'Arriba', description: 'Pestañas arriba y el contenido debajo.' },
      { value: 'side', label: 'Al costado', description: 'Pestañas en una columna a la izquierda.' },
      { value: 'pills', label: 'Botones', description: 'Pestañas como botones redondeados al centro.' },
    ],
  },
  hours: {
    hint: '“En línea” ocupa poco espacio y va bien junto a otra sección.',
    options: [
      { value: 'card', label: 'Tarjeta', description: 'Horario en una tarjeta con el estado arriba.' },
      { value: 'table', label: 'Tabla', description: 'Los siete días, uno por fila.' },
      { value: 'inline', label: 'En línea', description: 'Los horarios en una fila, compactos.' },
    ],
  },
  areas: {
    hint: '“Etiquetas” se lee rápido; “Columnas” ordena listas largas.',
    options: [
      { value: 'chips', label: 'Etiquetas', description: 'Cada comuna en una etiqueta redondeada.' },
      { value: 'columns', label: 'Columnas', description: 'Lista ordenada en columnas con un visto.' },
    ],
  },
  embed: {
    hint: '“Al costado” permite explicar qué hacer (por ejemplo, cómo agendar).',
    options: [
      { value: 'standard', label: 'Centrado', description: 'El contenido incrustado al centro.' },
      { value: 'split', label: 'Al costado', description: 'Texto a un lado y el contenido al otro.' },
    ],
  },
  posts: {
    hint: '“Destacada” pone la última novedad en grande.',
    options: [
      { value: 'grid', label: 'Tarjetas', description: 'Novedades en tarjetas con foto.' },
      { value: 'list', label: 'Lista', description: 'Una novedad por fila, foto a un lado.' },
      { value: 'featured', label: 'Destacada', description: 'La primera grande y las demás al lado.' },
    ],
  },
};

/** Los valores de cada lista cerrada (para comprobar que el registro está completo). */
export const VARIANT_VALUES: { [T in BlockType]: readonly VariantOf<T>[] } = {
  hero: HERO_VARIANTS,
  text: TEXT_VARIANTS,
  split: SPLIT_VARIANTS,
  image: IMAGE_VARIANTS,
  gallery: GALLERY_VARIANTS,
  features: FEATURE_VARIANTS,
  stats: STATS_VARIANTS,
  steps: STEPS_VARIANTS,
  pricing: PRICING_VARIANTS,
  team: TEAM_VARIANTS,
  testimonials: TESTIMONIAL_VARIANTS,
  quote: QUOTE_VARIANTS,
  logos: LOGOS_VARIANTS,
  pricelist: PRICELIST_VARIANTS,
  catalog: CATALOG_VARIANTS,
  schedule: SCHEDULE_VARIANTS,
  faq: FAQ_VARIANTS,
  cta: CTA_VARIANTS,
  video: VIDEO_VARIANTS,
  map: MAP_VARIANTS,
  countdown: COUNTDOWN_VARIANTS,
  contact: CONTACT_VARIANTS,
  divider: DIVIDER_VARIANTS,
  timeline: TIMELINE_VARIANTS,
  comparison: COMPARISON_VARIANTS,
  beforeafter: BEFORE_AFTER_VARIANTS,
  links: LINKS_VARIANTS,
  marquee: MARQUEE_VARIANTS,
  tabs: TABS_VARIANTS,
  hours: HOURS_VARIANTS,
  areas: AREAS_VARIANTS,
  embed: EMBED_VARIANTS,
  posts: POSTS_VARIANTS,
};

/** Diseños de un tipo de sección. */
export function layoutsOf(type: BlockType): readonly LayoutOption[] {
  return BLOCK_LAYOUTS[type].options;
}

/** Nombre del diseño actual de una sección ("Collage"). */
export function layoutLabel(block: WebSiteBlock): string {
  return layoutsOf(block.type).find((option) => option.value === block.variant)?.label ?? '';
}

/** La misma sección con otro diseño; un diseño que no existe para ese tipo deja la sección como estaba. */
export function withVariant(block: WebSiteBlock, variant: string): WebSiteBlock {
  if (!layoutsOf(block.type).some((option) => option.value === variant)) return block;
  const parsed = blockSchema.safeParse({ ...block, variant });
  return parsed.success ? parsed.data : block;
}

/** Cantidad total de diseños de sección que ofrece el constructor. */
export function totalLayouts(): number {
  return Object.values(BLOCK_LAYOUTS).reduce((sum, info) => sum + info.options.length, 0);
}
