/**
 * Guía editorial del marketing PROPIO de Aether (ADR 0015). Es la vara con
 * la que el agente de marketing de la Supersuite escribe, diseña y se revisa:
 * viaja completa en la orden `marketing.contexto`, así que cambiarla aquí
 * cambia lo que produce la Supersuite sin tocar su código.
 *
 * El objetivo no es "publicar más" sino que cada pieza se note hecha por
 * alguien que conoce el oficio: concreta, útil, verificable y con el producto
 * real a la vista. Una pieza que podría haber escrito cualquier marca no sale.
 *
 * Los topes por canal son los que revisa `copy-review.ts` (mismo objeto).
 */

export const MARKETING_CHANNELS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'google_business'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export interface ChannelRules {
  nombre: string;
  /** Tope duro del texto (lo impone la red o, si es menor, esta guía). */
  maxCaracteres: number;
  /** Lo que se ve antes de «más»: la primera línea tiene que sostenerse sola. */
  ganchoMax: number;
  hashtagsMax: number;
  emojisMax: number;
  /** ¿Se puede tocar un enlace escrito en el texto? (en Instagram y TikTok no). */
  enlacesEnTexto: boolean;
  formatos: string[];
  notas: string;
}

export const CHANNEL_RULES: Record<MarketingChannel, ChannelRules> = {
  instagram: {
    nombre: 'Instagram',
    maxCaracteres: 2200,
    ganchoMax: 125,
    hashtagsMax: 5,
    emojisMax: 2,
    enlacesEnTexto: false,
    formatos: ['carrusel 4:5 (1080×1350)', 'reel 9:16 (1080×1920)', 'historia 9:16', 'imagen 4:5'],
    notas: 'El carrusel es el formato que se guarda: una idea por lámina, máximo 8 láminas, la última dice qué hacer. El enlace va en la bio o en la historia con sticker, nunca escrito en el texto.',
  },
  facebook: {
    nombre: 'Facebook',
    maxCaracteres: 1500,
    ganchoMax: 140,
    hashtagsMax: 2,
    emojisMax: 2,
    enlacesEnTexto: true,
    formatos: ['imagen 4:5', 'carrusel 1:1', 'video 4:5'],
    notas: 'Público más adulto y dueño de negocio: explica el beneficio en pesos o en horas, con el enlace a la página del módulo.',
  },
  linkedin: {
    nombre: 'LinkedIn',
    maxCaracteres: 3000,
    ganchoMax: 140,
    hashtagsMax: 3,
    emojisMax: 1,
    enlacesEnTexto: true,
    formatos: ['documento PDF (carrusel)', 'imagen 4:5', 'texto largo con una imagen'],
    notas: 'Tono de oficio: decisiones de producto, por qué algo funciona como funciona, aprendizajes con contadores y dueños. Nada de autoayuda corporativa.',
  },
  tiktok: {
    nombre: 'TikTok',
    maxCaracteres: 2200,
    ganchoMax: 100,
    hashtagsMax: 4,
    emojisMax: 2,
    enlacesEnTexto: false,
    formatos: ['video 9:16 de 15 a 45 s, grabación de pantalla real con voz'],
    notas: 'El gancho son los primeros 2 segundos del video, no el texto. Pantalla real grabada, voz humana, subtítulos legibles.',
  },
  google_business: {
    nombre: 'Perfil de Google',
    maxCaracteres: 1500,
    ganchoMax: 140,
    hashtagsMax: 0,
    emojisMax: 0,
    enlacesEnTexto: true,
    formatos: ['novedad con imagen 4:3'],
    notas: 'Para quien ya busca «ERP Chile»: directo, informativo y con un solo botón.',
  },
};

export const BRAND_VOICE = {
  version: '2026-10-30',
  esencia:
    'Aether es el ERP chileno que entiende cómo se trabaja acá: el SII, el IVA, la boleta, la caja del local, la bodega y también los eventos. Hablamos como alguien que ha cerrado un mes, cuadrado una caja y peleado con un folio: con conocimiento y sin exagerar.',
  audiencias: [
    { id: 'comercio', quien: 'Dueñas y dueños de comercio y retail (1 a 50 personas)', lesDuele: 'stock que no cuadra, cajas que no cierran, no saber qué se vende', lesImporta: 'tiempo, plata detenida en bodega, control sin estar en el local' },
    { id: 'elaboradoras', quien: 'Elaboradoras de alimentos y producción pequeña', lesDuele: 'costo real del producto, lotes y vencimientos, calidad sanitaria', lesImporta: 'margen real, trazabilidad, no botar mercadería' },
    { id: 'eventos', quien: 'Productoras de certámenes y eventos', lesDuele: 'candidatas, jurado, auspicios, entradas y votación en planillas separadas', lesImporta: 'que el show salga, cobrar auspicios, un sitio que se vea profesional' },
    { id: 'servicios', quien: 'Academias, servicios técnicos y empresas de servicios', lesDuele: 'cobranza de mensualidades, órdenes de trabajo, agenda', lesImporta: 'cobrar a tiempo y ordenarse sin contratar a nadie' },
    { id: 'contadores', quien: 'Contadores y contadoras que llevan pymes', lesDuele: 'recibir la información tarde y desordenada', lesImporta: 'asientos automáticos, F29 con respaldo, libros que cuadran' },
  ],
  tono: [
    'Tú, español de Chile neutro: «celular», «computador», «boleta», «la caja». Sin modismos forzados ni chilenismos de caricatura.',
    'Concreto antes que inspirador: un caso, una pantalla, un número real o un paso exacto. Si una frase no dice algo verificable, se borra.',
    'Una idea por pieza. Si hay dos ideas, son dos piezas.',
    'Mostrar, no prometer: la captura real de la pantalla dice más que un adjetivo.',
    'Respeto por quien lee: no se le asusta con multas del SII ni se le trata como si no supiera de su negocio.',
    'Frases cortas, verbos de acción, sin relleno. El texto se lee en el celular, entre dos clientes.',
    'Humor seco y ocasional está bien; memes, tendencias forzadas y «hilos 🧵» no.',
  ],
  pilares: [
    {
      id: 'saber-tributario',
      nombre: 'Saber tributario y operativo',
      proporcion: 0.3,
      objetivo: 'Que la pieza se guarde y se comparta porque resuelve una duda real: IVA, F29, boleta vs. factura, nota de crédito, PMP, cierre de caja.',
      reglas: 'Exactitud absoluta: cada dato tributario debe venir de la ley o del SII (con la fuente anotada en la ficha de la pieza). Si hay dudas, no se publica. No vende el producto en el cuerpo; a lo más una línea al final.',
    },
    {
      id: 'producto-real',
      nombre: 'El producto, tal como es',
      proporcion: 0.3,
      objetivo: 'Una pantalla real resolviendo un problema concreto, en el orden en que la persona lo vive.',
      reglas: 'Solo pantallas y funciones que existen hoy y están en la oferta (lista `oferta` del contexto). Capturas reales con datos de demostración; nunca pantallas inventadas.',
    },
    {
      id: 'oficio',
      nombre: 'Cómo y por qué lo construimos así',
      proporcion: 0.15,
      objetivo: 'Confianza por competencia: por qué los folios no dejan huecos, por qué no se vende con stock negativo, por qué la IA propone y la persona decide.',
      reglas: 'Una decisión real del producto explicada en simple. Nada de jerga técnica sin traducir.',
    },
    {
      id: 'casos',
      nombre: 'Clientes reales',
      proporcion: 0.15,
      objetivo: 'Un negocio real contando qué cambió, con sus palabras.',
      reglas: 'Solo con autorización escrita del cliente y con el texto final aprobado por él. Nunca datos de sus clientes, montos ni RUT. Sin autorización, no existe el caso.',
    },
    {
      id: 'novedades',
      nombre: 'Novedades',
      proporcion: 0.1,
      objetivo: 'Lo que salió y para qué sirve, con la pantalla.',
      reglas: 'Solo lo que ya está en producción y en la oferta. Nunca «próximamente» con fecha.',
    },
  ],
  estructura: [
    'Gancho: la situación o la pregunta que la audiencia ya se hace, en sus palabras. Nada de «¿Sabías que…?».',
    'Desarrollo: el paso, el dato o la pantalla que la resuelve.',
    'Cierre: una sola acción clara (guardar, ver el módulo, pedir la demo). Una, no tres.',
  ],
  reglasVisuales: [
    'Capturas reales del producto (lista `pantallas` del contexto) en un marco limpio; si se recorta, se recorta la captura real, no se redibuja.',
    'Paleta de marca: tinta #12161f, dorado #dbc076 y blanco; el dorado es acento, no fondo de todo.',
    'Tipografía: titulares en Anton (condensada, en mayúsculas cortas), texto en Geist. Nunca más de dos tipografías.',
    'Texto sobre la imagen: máximo 12 palabras por lámina, contraste AA como mínimo, y nada importante en los bordes que la red recorta.',
    'Prohibido: personas, rostros o manos generadas por IA; oficinas de banco de imágenes; pantallas de software inventadas; íconos 3D brillantes; degradados arcoíris; logos de terceros sin permiso.',
    'Personas reales solo con su autorización escrita y nombre real.',
    'Mucho aire: un elemento protagonista por lámina. El logo de Aether discreto, en la última lámina o en una esquina.',
    'Video: grabación de pantalla real a 1080 px de ancho o más, cursor visible y lento, voz humana; subtítulos quemados en Geist.',
  ],
  proceso: [
    'Brief: pilar, audiencia, objetivo medible y la fuente de cada dato (contexto, ley, SII o el cliente).',
    'Borrador: el agente escribe 3 variantes de gancho y elige con razones, no al azar.',
    'Crítica: un segundo pase, con instrucciones de editor exigente, revisa la pieza contra esta guía y la reescribe si hace falta.',
    'Revisión automática: `marketing.revisar` sin bloqueos y con puntaje ≥ 76.',
    'Aprobación humana: según el nivel de autonomía; la primera pieza de cada pilar y toda pieza de pago la aprueba siempre una persona.',
    'Medición: cada enlace con UTM; a los 7 días se compara contra el objetivo del brief y se anota qué se aprendió.',
  ],
  ritmo: 'Mejor 3 piezas buenas a la semana que 7 de relleno. Ningún día se publica por cumplir.',
} as const;
