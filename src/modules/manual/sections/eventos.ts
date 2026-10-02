import type { ManualSection } from '../types';

/** Producción de certámenes y eventos: del certamen y sus candidatas al show en vivo y lo que se vende al público. */
export const EVENTOS_SECTIONS: ManualSection[] = [
  {
    id: 'certamenes',
    key: 'hasEventProjects',
    permission: 'projects:read',
    chapter: 'Certámenes & Eventos',
    title: 'Certámenes y eventos (centro de mando)',
    summary:
      'Cada certamen o evento con su centro de mando: cuánto falta para la gala, un checklist de preparación calculado con datos reales, indicadores de candidatas, auspicios, entradas, votación, jurado y escaleta, y sus finanzas.',
    route: '/dashboard/projects',
    topics: [
      {
        id: 'crear-proyecto',
        title: 'Crear un certamen o evento',
        permission: 'projects:write',
        route: '/dashboard/projects/new',
        steps: [
          'Ve a Certámenes & Eventos y haz clic en "Nuevo Proyecto".',
          'Completa código, nombre, presupuesto de ingresos y de gastos, fechas de inicio y término y estado.',
          'Indica la fecha y hora de la gala final (alimenta la cuenta regresiva del sitio y el checklist), el recinto con su dirección y el WhatsApp para dudas.',
        ],
        tip: 'El Asistente puede crearlo por ti: "crea el certamen Reina de Viña 2027, código RV27, gala el 15 de febrero".',
      },
      {
        id: 'centro-de-mando',
        title: 'Usar el centro de mando',
        steps: [
          'Entra al certamen: arriba ves los días que faltan para la gala (defínela en "Editar certamen").',
          '"¿Listos para la gala?" es un checklist calculado con datos reales: candidatas oficiales, contratos firmados, rondas y jurados, escaleta, looks, credenciales, auspicios, entradas y sitio publicado. Cada ítem te lleva a donde se resuelve.',
          'A 14 días o menos de la gala, lo pendiente se marca como crítico en rojo.',
          'Las tarjetas por módulo resumen candidatas, auspicios (cobrado contra comprometido, entregables vencidos), entradas vendidas e ingresadas, votos, jurado, producción y negocios del CRM del certamen.',
        ],
      },
      {
        id: 'rentabilidad-proyecto',
        title: 'Ver cuánto gana o pierde un certamen',
        steps: [
          'En el centro de mando, la sección de finanzas compara presupuesto contra real.',
          'El ingreso se desglosa en auspicios cobrados, entradas, votación del público y ventas facturadas, menos compras y honorarios vinculados al proyecto.',
          'Para que una compra, venta u honorario cuente, asócialo al proyecto al registrarlo.',
        ],
      },
    ],
  },
  {
    id: 'sitio-publico',
    key: 'hasEventProjects',
    permission: 'projects:write',
    chapter: 'Certámenes & Eventos',
    title: 'Sitio público del certamen y afiches',
    summary:
      'La página oficial del certamen para el público, las marcas y las postulantes (portada con cuenta regresiva, candidatas, auspiciadores, entradas, votación y resultados), y un estudio que arma afiches listos para redes e impresión con esos mismos datos.',
    route: '/dashboard/projects',
    topics: [
      {
        id: 'publicar-sitio',
        title: 'Publicar el sitio del certamen',
        steps: [
          'En el centro de mando haz clic en "Sitio público".',
          'Define la dirección (/certamen/tu-certamen; "Usar el nombre" la arma sola), sube la portada (horizontal, idealmente 1600 × 900 px) y el logo de la pestaña del navegador.',
          'Escribe la frase principal y el texto "Sobre el certamen", elige el color de acento y completa Instagram, WhatsApp y correo públicos.',
          'Elige qué secciones mostrar. Los botones de entradas, votación y postulación aparecen solos cuando cada enlace está activo, y los planes de auspicio salen del tarifario (solo los marcados como públicos).',
          'Activa "Sitio publicado" y guarda. El día de la coronación enciende los resultados oficiales para revelar ganadora y podio.',
        ],
        tip: 'Nunca se publica RUT, edad, contacto ni la ficha de postulación: de cada candidata oficial solo sale nombre artístico, número, a quién representa, foto y la bio que el equipo escribe en el Tablero de casting.',
      },
      {
        id: 'salon-fama',
        title: 'Salón de la fama (ganadoras anteriores)',
        steps: [
          'En la misma pantalla del sitio, sección "Salón de la fama", usa "Agregar ganadora": foto vertical, nombre, título (Ganadora, Virreina…) y año.',
          'Activa "Reciente, con foto completa" para las de la última edición: se ven grandes; las demás van en el carrusel de ediciones anteriores.',
        ],
      },
      {
        id: 'dominio-propio-certamen',
        title: 'Publicar el sitio en un dominio propio',
        steps: [
          'En la configuración del sitio escribe tu dominio y crea en tu proveedor de DNS los registros que muestra el sistema.',
          'Cuando el dominio queda verificado, el sitio se ve en su raíz y la dirección /certamen/... redirige a él.',
        ],
      },
      {
        id: 'afiches',
        title: 'Crear afiches de campaña',
        steps: [
          'En el centro de mando haz clic en "Afiches".',
          'Elige la pieza (convocatoria, gran final, cuenta regresiva, candidata, votación, agradecimiento a auspiciadores, resultados, etc.), el estilo, el formato (feed, story, cuadrado, horizontal o A4 para imprimir) y el color.',
          'Personaliza textos, oculta bloques, cambia la foto o agrega logos de auspiciadores. Activa "Incluir código QR" para que lleve directo a postular, comprar o votar.',
          'Usa "Descargar PNG" o "Copiar imagen" (para pegarla en WhatsApp), guarda el diseño para reutilizarlo, o "Campaña completa (ZIP)" para bajar todas las piezas de una vez.',
        ],
        tip: 'Una pieza sin sus datos no está disponible: el estudio te dice qué configurar (por ejemplo, publicar el sitio o numerar a las candidatas).',
      },
    ],
  },
  {
    id: 'calendario',
    key: 'hasEventProjects',
    permission: 'projects:read',
    chapter: 'Certámenes & Eventos',
    title: 'Calendario y Google Calendar',
    summary: 'Los certámenes, galas y cumpleaños de candidatas en un calendario, sincronizado con tu Google Calendar.',
    route: '/dashboard/calendar',
    topics: [
      {
        id: 'sincronizar-google',
        title: 'Sincronizar con Google Calendar',
        steps: [
          'Ve a Certámenes & Eventos → Calendario.',
          'Conecta tu cuenta de Google desde esa pantalla.',
          'Se envían al calendario los certámenes y galas y los cumpleaños de las candidatas, con recordatorios.',
          'Necesitas permiso de escritura sobre proyectos para cambiar la sincronización.',
        ],
      },
    ],
  },
  {
    id: 'candidatas',
    key: 'hasCandidates',
    permission: 'candidates:read',
    chapter: 'Certámenes & Eventos',
    title: 'Candidatas y staff',
    summary:
      'La ficha de cada candidata (y del staff), la convocatoria con formulario de postulación, el tablero de casting de postulante a ganadora, contratos de imagen con firma electrónica, documentos, fotos y asistencia a talleres y ensayos.',
    route: '/dashboard/candidates',
    topics: [
      {
        id: 'convocatoria',
        title: 'Abrir la convocatoria de postulaciones',
        permission: 'candidates:write',
        steps: [
          'En Candidatas & Staff usa "Convocatoria": elige el estado, las fechas de apertura y cierre, la edad mínima y el cupo máximo.',
          'Completa el contacto para postulantes (correo, WhatsApp, Instagram), el lugar y horario de clases y "Qué incluye la inscripción".',
          'Copia el enlace de postulación (también está en el centro de mando como "Postulación de candidatas") y compártelo: mientras esté abierta, las postulantes se registran solas y aparecen como fichas nuevas.',
        ],
      },
      {
        id: 'ficha-candidata',
        title: 'Crear o completar la ficha de una candidata',
        permission: 'candidates:write',
        route: '/dashboard/candidates/new',
        steps: [
          'Haz clic en "Nueva Candidata" (o recibe la postulación por el enlace).',
          'En la ficha cambias su estado, subes documentos (con vencimiento) y fotos, y ves su historial y asistencia.',
          'Para descartar una postulación, el sistema exige el motivo. Las descartadas se purgan automáticamente después del plazo de retención de datos.',
        ],
        tip: 'El Asistente puede crear la ficha: "crea a la candidata María Pérez, RUT 20.123.456-7, nacida el 3 de mayo de 2003, en el certamen Reina de Viña".',
      },
      {
        id: 'casting',
        title: 'Tablero de casting: de postulante a reina',
        permission: 'candidates:write',
        route: '/dashboard/candidates/casting',
        steps: [
          'Ve a Candidatas → Tablero de Casting y elige el certamen.',
          'Mueve cada ficha a su etapa con el selector "Mover a etapa". Para descartar, indica el motivo.',
          'Cuando estén definidas las oficiales, "Numerar oficiales" asigna N° 1, 2, 3… según el orden elegido.',
          'Con "Presentación" defines lo que se publica: N° oficial, "Representa a", la bio para el sitio y si se muestra en el sitio público.',
        ],
      },
      {
        id: 'firma-contrato',
        title: 'Enviar el contrato de imagen a firmar',
        permission: 'candidates:write',
        steps: [
          'En la ficha de la candidata, sección "Contrato de imagen", usa "Solicitar firma por correo": le llega un correo para firmar electrónicamente (debe tener correo registrado). "Descargar borrador" baja el contrato antes de enviarlo.',
          'Con "Copiar link de firma" puedes reenviárselo por WhatsApp. Cuando firma, el contrato queda marcado como firmado solo y puedes "Ver contrato firmado".',
          'El texto sale de la "Plantilla: Contrato de Imagen" (Plantillas y Cumplimiento), que puedes editar.',
        ],
      },
      {
        id: 'pasar-asistencia',
        title: 'Pasar asistencia por sesión',
        permission: 'candidates:write',
        route: '/dashboard/candidates/attendance',
        steps: [
          'Ve a Candidatas → Asistencia, elige el certamen y haz clic en "Crear sesiones": un evento puntual o una serie recurrente (ej. martes y jueves entre dos fechas).',
          'Entra a una sesión y pasa lista: todas parten "presentes", solo desmarcas a las ausentes y guardas.',
          'La ficha de cada candidata muestra su historial completo de asistencia.',
        ],
        tip: 'También puedes dictárselo al Asistente: "registra que Valentina faltó al ensayo del jueves".',
      },
      {
        id: 'cumplimiento-candidatas',
        title: 'Ver el cumplimiento general',
        route: '/dashboard/candidates/compliance',
        steps: [
          'Ve a Plantillas y Cumplimiento → Cumplimiento de Candidatas: por candidata, su % de asistencia, pagos y el estado de sus documentos y contrato.',
        ],
      },
    ],
  },
  {
    id: 'contratos-firmados',
    key: 'always',
    anyOfFeatures: ['hasCandidates', 'hasSponsorships'],
    anyOfPermissions: ['candidates:read', 'sponsorships:read'],
    chapter: 'Certámenes & Eventos',
    title: 'Contratos firmados',
    summary: 'Un checklist único de contratos de imagen de candidatas y cartas de compromiso de auspicio de todos tus certámenes, con lo que requiere acción primero.',
    route: '/dashboard/contracts',
    topics: [
      {
        id: 'revisar-contratos',
        title: 'Saber qué contratos faltan',
        steps: [
          'Ve a Candidatas → Contratos firmados.',
          'Filtra por estado (Por resolver, Pendiente de firma, Sin generar, Firmados), por certamen y por tipo de contrato, o busca por candidata o marca.',
          'En los pendientes usa "Link" para copiar el enlace de firma y reenviarlo.',
        ],
      },
    ],
  },
  {
    id: 'auspicios',
    key: 'hasSponsorships',
    permission: 'sponsorships:read',
    chapter: 'Certámenes & Eventos',
    title: 'Auspicios y marcas',
    summary:
      'El tarifario de planes que ofreces a las marcas y los contratos de auspicio en efectivo o canje, con checklist de entregables, evidencias, pagos, carta de compromiso y un portal para cada marca.',
    route: '/dashboard/sponsorships',
    topics: [
      {
        id: 'tarifario',
        title: 'Armar el tarifario de auspicios',
        permission: 'sponsorships:write',
        route: '/dashboard/sponsorships/packages',
        steps: [
          'Ve a Auspicios & Marcas → Tarifario de Auspicios y elige el tarifario (el general o el de un certamen).',
          'Usa "Nuevo plan": nombre (ej. "Auspiciador Oro"), nivel, precio de lista neto, cupos, orden, beneficios (uno por línea) y descripción.',
          'Marca "Mostrar en el sitio público del certamen" y, si quieres, "Publicar el precio".',
          'Los planes del tarifario general son plantillas internas: "Copiar planes desde" los trae a un certamen.',
        ],
      },
      {
        id: 'crear-auspicio',
        title: 'Registrar un contrato de auspicio',
        permission: 'sponsorships:write',
        route: '/dashboard/sponsorships/new',
        steps: [
          'Haz clic en "Nuevo Contrato de Auspicio" (o conviértelo desde un negocio ganado del CRM).',
          'Elige el proyecto, la marca (puedes crearla ahí mismo), el nivel y el estado.',
          'Indica el aporte en efectivo y, si hay canje, su valorización y descripción (deja el efectivo en $0 si es 100% canje).',
        ],
      },
      {
        id: 'entregables',
        title: 'Cumplir los entregables y registrar pagos',
        permission: 'sponsorships:write',
        steps: [
          'En el contrato, "Checklist de entregables": agrega cada compromiso (ej. logo en backdrop, mención en Instagram), márcalo al cumplirlo y adjunta la evidencia (foto o PDF).',
          'Registra los abonos con "Actualizar monto pagado" y la forma de pago.',
          'La "Carta de compromiso" sale de la plantilla estándar; márcala como firmada cuando corresponda.',
          'Comparte el portal de la marca (enlace) para que vea sus entregables y evidencias sin pedírtelos.',
        ],
      },
      {
        id: 'cumplimiento-auspicios',
        title: 'Revisar qué entregables faltan',
        route: '/dashboard/sponsorships/compliance',
        steps: [
          'Ve a Plantillas y Cumplimiento → Cumplimiento de Auspicios: por marca, el % de entregables completados.',
          'La "Plantilla: Carta de Compromiso" (mismo grupo) ajusta el texto de las cartas nuevas.',
        ],
      },
    ],
  },
  {
    id: 'produccion-en-vivo',
    key: 'hasLiveProduction',
    permission: 'production:read',
    chapter: 'Certámenes & Eventos',
    title: 'Producción en vivo (escaleta, vestuario y acreditaciones)',
    summary:
      'El show minuto a minuto con modo show en tiempo real, los looks de cada candidata por bloque y las credenciales con QR para staff y proveedores.',
    route: '/dashboard/production/timeline',
    topics: [
      {
        id: 'armar-escaleta',
        title: 'Armar la escaleta de la gala',
        permission: 'production:write',
        steps: [
          'Ve a Show en vivo → Escaleta en Vivo, elige el certamen y agrega bloques: segmento (apertura, traje de baño, gala, preguntas, coronación…), título, hora, duración, candidata y quién da el pie.',
          'En "pies técnicos" anota audio, luces y pantalla/cámara de cada bloque: es lo que ven cabina y switcher.',
          'Reordena con las flechas y usa "Encadenar horarios" para que cada bloque parta cuando termina el anterior.',
          '"Imprimir escaleta" genera la hoja para cabina, piso y conductores.',
        ],
      },
      {
        id: 'modo-show',
        title: 'Dirigir el show en vivo (modo show)',
        steps: [
          '"Modo show" abre a pantalla completa el bloque al aire, la cuenta regresiva, lo que sigue, sus pies técnicos y los looks.',
          '"Siguiente bloque" cierra el que está al aire y pone el siguiente, marcando la hora real. El indicador muestra el atraso o adelanto acumulado y la hora estimada de término.',
          'Quien solo tiene permiso de lectura ve el modo show como monitor de backstage, sin botones.',
        ],
      },
      {
        id: 'vestuario',
        title: 'Organizar el vestuario',
        permission: 'production:write',
        route: '/dashboard/production/wardrobe',
        steps: [
          'Ve a Vestuario. "Generar plan de looks" crea un look pendiente por candidata oficial en cada bloque que requiere vestuario.',
          'Cada look tiene origen (producción, diseñador, auspicio, arriendo, propio), talla, color, valor declarado, fecha de prueba y de devolución.',
          'Avanza el estado con un clic (Pendiente → Lista → Entregada → Devuelta). Las devoluciones vencidas y pruebas próximas se destacan arriba.',
        ],
      },
      {
        id: 'acreditar',
        title: 'Acreditar staff y proveedores',
        permission: 'production:write',
        route: '/dashboard/production/accreditation',
        steps: [
          'Ve a Acreditaciones, elige el certamen y registra a la persona: nombre, rol, empresa o proveedor, nivel de acceso y código de acreditación. Con correo, le llega su QR.',
          'Con "Diseño de credencial" creas plantillas (fondo, imagen, colores) y descargas la credencial lista para imprimir.',
          'El día del evento usa "Check-in" para registrar su ingreso.',
        ],
      },
    ],
  },
  {
    id: 'jurado',
    key: 'hasJudging',
    permission: 'judging:read',
    chapter: 'Certámenes & Eventos',
    title: 'Votación del jurado y escrutinio',
    summary:
      'Rondas del certamen con sus criterios ponderados, un enlace de votación por jurado (desde su celular o tablet, sin cuenta), resultados en vivo y acta oficial en PDF.',
    route: '/dashboard/judging',
    topics: [
      {
        id: 'rondas-criterios',
        title: 'Configurar rondas y criterios',
        permission: 'judging:write',
        steps: [
          'Ve a Show en vivo → Votación & Escrutinio y elige el certamen.',
          'Crea cada ronda con "+ Nueva Ronda": nombre (ej. "Traje de baño"), orden y corte (cuántas clasifican). Marca la ronda final: define 1°, 2° y 3° lugar.',
          'En cada ronda agrega criterios con "+ Agregar Criterio a esta Ronda": nombre, ponderación (%) y puntaje máximo. "Distribuir 100% equitativamente" reparte las ponderaciones.',
        ],
      },
      {
        id: 'jurados',
        title: 'Registrar a los jurados',
        permission: 'judging:write',
        steps: [
          'Usa "+ Registrar Nuevo Jurado" con su nombre y correo opcional.',
          'Copia su enlace con "Link" y envíaselo: califica desde su celular o tablet sin crear cuenta.',
        ],
      },
      {
        id: 'votar-escrutar',
        title: 'Votar, cerrar y publicar resultados',
        permission: 'judging:write',
        steps: [
          'Cuando la ronda empieza, presiona "Votar ahora": los jurados ya pueden calificar. La pantalla se actualiza sola cada pocos segundos con los votos emitidos.',
          'Al terminar, "Finalizar votaciones de esta ronda": se calculan los resultados oficiales con las ponderaciones y se marcan las que clasifican.',
          'Descarga el "Acta PDF" o exporta a Excel. Si hubo un error, "Reabrir votación" permite corregir.',
        ],
        tip: 'Una planilla enviada por un jurado queda bloqueada: así el escrutinio es confiable.',
      },
    ],
  },
  {
    id: 'entradas',
    key: 'hasTicketing',
    permission: 'ticketing:read',
    chapter: 'Certámenes & Eventos',
    title: 'Venta de entradas',
    summary: 'Tipos de entrada con precio y cupo, venta por enlace público con pago confirmado por tu equipo, y control de acceso con código QR el día del evento.',
    route: '/dashboard/ticketing',
    topics: [
      {
        id: 'tipos-entrada',
        title: 'Configurar los tipos de entrada',
        permission: 'ticketing:write',
        steps: [
          'Ve a Entradas & Votación → Venta de Entradas y elige el certamen.',
          'En "Tipos de entrada" agrega cada tipo (General, VIP…) con precio y cupo opcional, y presiona "Agregar". Ábrelo o ciérralo a la venta con su interruptor.',
          'El enlace público "Venta de entradas" está en el centro de mando del certamen (y en el sitio público, cuando la venta está activa).',
        ],
      },
      {
        id: 'confirmar-pago-entrada',
        title: 'Confirmar el pago de una compra',
        permission: 'ticketing:write',
        steps: [
          'Las compras llegan como reservadas. Cuando verifiques la transferencia, usa "Confirmar pago" e ingresa el monto pagado.',
          'Arriba ves entradas vendidas, confirmadas, ingresos confirmados y check-in realizado.',
        ],
      },
      {
        id: 'control-acceso',
        title: 'Controlar el acceso el día del evento',
        permission: 'ticketing:write',
        steps: [
          'En "Control de acceso (check-in)", escanea o pega el código QR de la entrada y presiona "Registrar ingreso".',
          'Una entrada sin pago confirmado se rechaza; si ya había ingresado, el sistema avisa que es un reingreso.',
        ],
      },
    ],
  },
  {
    id: 'votacion-publico',
    key: 'hasPublicVoting',
    permission: 'publicvoting:read',
    chapter: 'Certámenes & Eventos',
    title: 'Votación pagada del público',
    summary: 'El público paga por votar a su candidata favorita desde un enlace; tu equipo confirma los pagos y el ranking se actualiza en vivo.',
    route: '/dashboard/voting',
    topics: [
      {
        id: 'votacion-publica',
        title: 'Administrar la votación',
        permission: 'publicvoting:write',
        steps: [
          'Ve a Entradas & Votación → Votación Pagada y elige el certamen. El enlace público de votación está en el centro de mando y en el sitio del certamen.',
          'En las órdenes pendientes, usa "Confirmar pago" con el monto pagado cuando verifiques el pago: recién ahí cuentan los votos.',
          'El "Ranking en vivo" muestra los votos confirmados de cada candidata; arriba ves votos e ingresos confirmados y órdenes pendientes.',
        ],
      },
    ],
  },
];
