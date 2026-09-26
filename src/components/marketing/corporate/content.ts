/**
 * Textos de la landing corporativa `/empresas`.
 *
 * Todo el texto vive acá, no incrustado en los componentes (ver CLAUDE.md).
 * Ninguna cifra de clientes, testimonio ni logo ajeno: son hechos verificables
 * del producto, tomados de `src/lib/auth/modules.ts` y del alcance DTE real
 * descrito en CLAUDE.md §3 (ver brief de diseño para la trazabilidad exacta
 * de cada afirmación).
 */

export const navLinks: [href: string, label: string][] = [
  ['#modulos', 'Módulos'],
  ['#cumplimiento', 'Cumplimiento SII'],
  ['#seguridad', 'Seguridad'],
  ['#certamenes', 'Certámenes y eventos'],
  ['#preguntas', 'Preguntas frecuentes'],
];

export const hero = {
  kicker: 'ERP CHILENO PARA EMPRESAS',
  title: 'El ERP que ordena tu empresa y cumple con el SII.',
  lead: 'Ventas, inventario, compras, tesorería y contabilidad en un solo sistema, con documentos timbrados según la normativa chilena. Activa los módulos que tu empresa necesita hoy y suma el resto cuando estés listo.',
  trustLine: 'Folios CAF y timbre electrónico · Multiempresa y roles a medida · Tus datos, exportables cuando quieras',
  mockCaption: 'Vista ilustrativa del panel · datos de ejemplo',
};

export const trustStripHeading = 'Hechos, no promesas.';

export const benefits = {
  kicker: 'PARA QUIEN DECIDE',
  title: 'Pensado para quien decide, no solo para quien opera.',
  lead: 'Cuatro razones por las que un ERP chileno tiene que resolver más que una planilla.',
  items: [
    { title: 'Un solo sistema, no una colección de planillas', text: 'Ventas, inventario, compras, tesorería y contabilidad comparten la misma base de datos: un documento de venta ya movió el stock y ya generó la cuenta por cobrar.' },
    { title: 'Cumples con el SII desde el núcleo', text: 'RUT con dígito verificador, IVA calculado línea a línea, folios autorizados por el SII y F29 del período, no un cálculo aparte.' },
    { title: 'Pagas por lo que usas', text: 'Cada módulo se activa por separado. Empiezas con ventas e inventario y sumas contabilidad, remuneraciones o producción de eventos cuando tu empresa lo necesite.' },
    { title: 'Seguridad pensada para varias empresas', text: 'Cada empresa opera en su propio espacio, con roles a medida y sesiones que se revisan en cada acción, no solo al iniciar sesión.' },
  ],
};

export const modulesSection = {
  kicker: 'UN LUGAR PARA CADA ÁREA',
  title: 'Todo el negocio, en un mismo lugar.',
  lead: 'Los módulos se agrupan por área. Contratas los que tu empresa necesita; el resto queda disponible para cuando lo requieras.',
  note: 'Los módulos disponibles para tu empresa dependen del plan contratado. Puedes revisar el alcance completo antes de contratar.',
  groups: [
    {
      name: 'Comercial y operación',
      modules: [
        { title: 'Ventas y facturación', text: 'Documentos comerciales, folios y seguimiento de pagos, con control de folios y DTE.' },
        { title: 'Compras y proveedores', text: 'Solicitudes y cotizaciones, órdenes de compra, recepción de mercadería, facturas de proveedor e importaciones con costeo.' },
        { title: 'Inventario y bodegas', text: 'Multibodega, kardex y costo promedio ponderado (PMP), con alertas de stock.' },
        { title: 'Punto de venta (POS)', text: 'Terminal de mostrador, arqueo de caja por turno y ticket térmico de 80mm.' },
        { title: 'CRM comercial', text: 'Embudo de oportunidades, contactos, agenda y reportes de venta.' },
      ],
    },
    {
      name: 'Finanzas y contabilidad',
      modules: [
        { title: 'Tesorería y cobranzas', text: 'Cuentas por cobrar y pagar, pagos y flujo de caja.' },
        { title: 'Contabilidad', text: 'Asientos automáticos desde ventas, compras, pagos e inventario; libro diario y mayor, balance y cierre mensual.' },
        { title: 'Presupuestos', text: 'Presupuesto operativo por categoría, con seguimiento de real versus planificado.' },
        { title: 'Activo fijo', text: 'Depreciación lineal o acelerada y valor libro al día.' },
        { title: 'Rendición de gastos', text: 'Cada colaborador rinde sus gastos; jefatura aprueba y finanzas registra el reembolso.' },
        { title: 'Boletas de honorarios y pagarés', text: 'Registro de honorarios con retención, y pagarés con seguimiento de vencimiento.' },
      ],
    },
    {
      name: 'Personas',
      modules: [
        { title: 'Remuneraciones', text: 'Ficha de trabajadores, liquidaciones de sueldo con AFP, salud, cesantía e impuesto único, y vacaciones con aprobación.' },
      ],
    },
    {
      name: 'Inteligencia de negocio',
      modules: [
        { title: 'Centro de Inteligencia 360', text: 'Radiografía de la empresa, ciclo de caja, caja proyectada a 13 semanas y flujos del negocio, calculados sobre tus documentos reales.' },
        { title: 'Agentes ejecutivos', text: 'Asistentes para dirección, finanzas y ventas que revisan tus datos y proponen acciones para que tu equipo las revise.' },
      ],
    },
  ],
};

export const compliance = {
  kicker: 'CUMPLIMIENTO SII',
  title: 'Tributación chilena, no un módulo adaptado.',
  lead: 'El RUT, los folios y el timbre están en el núcleo del sistema.',
  points: [
    { title: 'RUT validado', text: 'Dígito verificador con Módulo 11, en el formato 12.345.678-K.' },
    { title: 'IVA que siempre cuadra', text: '19% repartido entre líneas afectas, sin diferencias de redondeo contra el total del documento.' },
    { title: 'Folios autorizados por el SII (CAF)', text: 'Los folios se toman del rango autorizado y cada documento queda con timbre electrónico (TED), verificable sin conexión.' },
    { title: 'F29 del período', text: 'Débito fiscal, crédito fiscal, remanente del mes anterior y PPM, calculados sobre los documentos emitidos reales.' },
  ],
  scopeNotice: 'Hoy los documentos se emiten con folio autorizado y timbre electrónico. La firma con certificado digital y el envío automático al SII están en desarrollo: por ahora ese paso se realiza fuera del sistema.',
};

export const security = {
  kicker: 'SEGURIDAD',
  title: 'Tu información, resguardada por diseño.',
  points: [
    { title: 'Cada empresa en su propio espacio', text: 'Ninguna consulta cruza entre empresas, ni por error ni a propósito.' },
    { title: 'Contraseñas que nadie puede leer', text: 'Se guardan cifradas con bcrypt; ni el equipo de Aether puede recuperarlas, solo restablecerlas.' },
    { title: 'Permisos al nivel del detalle', text: 'Roles base y roles a medida por empresa: decides quién ve costos, quién emite documentos y quién solo consulta.' },
    { title: 'Tus folios del SII, cifrados', text: 'El archivo CAF se guarda cifrado con AES-256-GCM.' },
    { title: 'Tus datos se van contigo', text: 'Exporta la información completa de tu empresa en un archivo JSON, sin contraseñas ni credenciales, cuando lo necesites.' },
  ],
};

export const implementation = {
  kicker: 'DE LA DECISIÓN AL PRIMER DOCUMENTO',
  title: 'De la decisión al primer documento.',
  closing: 'El valor se cotiza según los módulos que activas, tu tamaño y el acompañamiento que necesites para partir. Sin lista de precios genérica ni cobro por lo que no usas.',
};

export const eventsSection = {
  kicker: 'PRODUCCIÓN DE CERTÁMENES',
  title: '¿Tu empresa también produce certámenes?',
  lead: 'Sobre la misma base de empresa, permisos y contabilidad, Aether suma una línea para producir certámenes y eventos: candidatas, jurado, escaleta en vivo, auspicios, entradas y votación del público.',
  chips: [
    { title: 'Candidatas y staff', text: 'Ficha de postulación y ficha de staff de producción por certamen.' },
    { title: 'Producción en vivo', text: 'Escaleta minuto a minuto con modo show, vestuario y acreditación con código QR.' },
    { title: 'Auspicios y ticketing', text: 'Tarifario de auspicios por certamen y venta de entradas con control de acceso por QR.' },
    { title: 'Jurado y votación', text: 'Planillas de puntuación por link y votación pagada del público, con ranking en vivo.' },
  ],
};

export const faqSection = {
  kicker: 'ANTES DE CONTRATAR',
  title: 'Preguntas frecuentes',
  questions: [
    '¿Qué incluye Aether ERP?',
    '¿Está preparado para empresas chilenas?',
    '¿Puedo traer los datos que ya tengo?',
    '¿Quién puede ver la información de mi empresa?',
    '¿Puedo llevarme mis datos si me voy?',
    '¿Cuánto cuesta y cómo lo contrato?',
  ],
};

export const ctaBand = {
  title: 'Conversemos de tu empresa.',
  lead: 'Una demo sobre tus propios procesos, no sobre un catálogo de funciones.',
  action: 'Solicitar demo',
};

export const contactForm = {
  heading: 'Solicita tu demo y cotización.',
  lead: 'Cuéntanos qué quieres ordenar primero. Te contactamos para coordinar una demo sobre tu propia operación.',
};

export const footer = {
  brandLine: 'ERP chileno para cualquier empresa, con una línea propia para producir certámenes y eventos.',
  productLinks: [
    ['#modulos', 'Módulos'],
    ['#cumplimiento', 'Cumplimiento SII'],
    ['#seguridad', 'Seguridad'],
    ['#certamenes', 'Certámenes y eventos'],
  ] as [href: string, label: string][],
  desktopNote: 'También disponible para escritorio',
};
