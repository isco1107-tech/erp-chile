/**
 * Texto comercial compartido por la landing y sus datos estructurados
 * (JSON-LD). Vive aquí para que la respuesta que ve Google sea, palabra por
 * palabra, la que ve la persona en pantalla.
 */

export const faqs: [question: string, answer: string][] = [
  ['¿Cuánto cuesta y cómo lo contrato?', 'La cotización se prepara según los módulos y el alcance que necesita tu empresa. Selecciona tus áreas de interés en el formulario y solicita una demo por correo. Antes de contratar, podrás revisar la propuesta y resolver tus dudas con el equipo de Aether.'],
  ['¿Qué incluye Aether ERP?', 'Aether reúne gestión comercial, inventario, compras, tesorería, contabilidad y producción de certámenes y eventos. Los módulos disponibles para tu empresa dependen de su configuración y de los servicios contratados.'],
  ['¿Está preparado para empresas chilenas?', 'Incluye RUT, IVA, folios CAF, timbre electrónico y reportes como F29. La firma digital y el envío automático al SII todavía no están disponibles. Revisa con nuestro equipo el alcance tributario y la configuración que necesita tu empresa antes de contratar.'],
  ['¿Puedo traer los datos que ya tengo?', 'Sí. Puedes cargar productos, clientes, proveedores, stock inicial e historial de ventas y compras desde planillas Excel o CSV. La carga revisa los datos antes de confirmarlos, así que no empiezas de cero ni digitas todo de nuevo.'],
  ['¿Quién puede ver la información de mi empresa?', 'Solo las personas que invites, con el acceso que les asignes. Cada consulta queda acotada a tu empresa, las contraseñas se guardan cifradas y las acciones relevantes quedan registradas para auditoría.'],
  ['¿Puedo llevarme mis datos si me voy?', 'Sí. Cualquier persona con el permiso de exportación puede descargar la información completa de la empresa en formato JSON, sin contraseñas ni credenciales en el archivo.'],
];

export interface TrustFact {
  title: string;
  text: string;
}

/**
 * Reemplaza a los testimonios: sin clientes que citar todavía, la prueba de
 * confianza son hechos verificables del producto (cada uno debe poder
 * comprobarse leyendo el código, no una promesa de marketing).
 */
export const trustFacts: TrustFact[] = [
  { title: 'Timbre electrónico verificable', text: 'Cada DTE se firma con la llave del propio CAF y se puede comprobar sin conexión.' },
  { title: 'Respaldo completo por empresa', text: 'Exporta toda tu información en un archivo JSON, sin contraseñas ni credenciales.' },
  { title: 'Registro de auditoría', text: 'Las acciones que importan quedan con fecha, autor y detalle.' },
  { title: 'Datos cifrados de fábrica', text: 'Contraseñas con bcrypt y folios CAF con AES-256-GCM: nunca en texto plano.' },
];

/*
 * ── Textos restaurados para /landing-v2 ──────────────────────────────────
 * Salieron de `/` en el commit 60927e9 (rediseño de la landing), pero la
 * landing cinematográfica los usa. Se copiaron palabra por palabra desde
 * 60927e9^ (Plans en content.ts, los pares de Shift.tsx y las tarjetas de
 * resultados de Landing.tsx): no reescribirlos sin revisar ambas landings.
 */

export interface Plan {
  name: string;
  audience: string;
  /**
   * Precio mensual "desde", en CLP enteros y sin IVA. `null` muestra "Precio
   * según módulos". Poner aquí solo precios reales vigentes: lo que se publica
   * en el landing es una oferta comercial.
   */
  priceFrom: number | null;
  featured?: boolean;
  includes: string[];
}

export const plans: Plan[] = [
  {
    name: 'Comercio',
    audience: 'Para quien vende productos y mueve bodega: tiendas, distribuidoras y ferreterías.',
    priceFrom: null,
    includes: [
      'Ventas y facturación con folios CAF y timbre',
      'Punto de venta con boleta y arqueo de caja',
      'Inventario multibodega con costo PMP',
      'Compras, órdenes y recepción',
      'Clientes, proveedores y reportes Excel',
    ],
  },
  {
    name: 'Gestión completa',
    audience: 'Para la empresa que quiere operación, finanzas y contabilidad en el mismo sistema.',
    priceFrom: null,
    featured: true,
    includes: [
      'Todo lo del plan Comercio',
      'Cuentas por cobrar y pagar con antigüedad de saldos',
      'Contabilidad automática: diario, mayor y balance de 8 columnas',
      'F29 del período y cuadraturas contra el mayor',
      'Presupuestos, automatizaciones y agentes de IA',
    ],
  },
  {
    name: 'Eventos y certámenes',
    audience: 'Para productoras que además de producir tienen que rendir cuentas.',
    priceFrom: null,
    includes: [
      'Proyectos con presupuesto por evento',
      'Escaleta en vivo, vestuario y acreditaciones QR',
      'Auspicios con portal para cada marca',
      'Venta de entradas y votación del público',
      'Jurado con escrutinio en línea',
    ],
  },
];

/** Cada par es el mismo problema visto sin sistema conectado y con Aether. */
export const shifts: [before: string, after: string][] = [
  ['El stock real lo sabe una planilla que alguien actualiza cuando puede.', 'La venta descuenta la bodega correcta en el mismo momento en que se emite.'],
  ['El costo de lo que vendiste es una estimación que nadie quiere revisar.', 'Cada salida toma el promedio ponderado vigente en ese instante y queda en el kardex.'],
  ['Los folios se llevan en un cuaderno y de vez en cuando se salta uno.', 'Los folios salen del rango que autorizó el SII, uno a la vez y sin dejar huecos.'],
  ['El F29 se arma a mano el día 10, revisando carpetas y correos.', 'Débito, crédito, remanente del mes anterior y PPM salen de los documentos del período.'],
  ['La cobranza se acuerda de un cliente cuando el cliente llama.', 'La cuenta por cobrar nace con el documento y el vencimiento aparece antes de vencer.'],
  ['Nadie sabe quién cambió ese precio, ni cuándo, ni con qué autorización.', 'Permisos por persona y registro de auditoría de las acciones que importan.'],
];

export interface Outcome {
  label: string;
  title: [first: string, second: string];
  text: string;
  link: string;
  /** Índice de la vista de `catalog.ts` que abre el enlace en #plataforma. */
  view: number;
}

/** Tarjetas de «QUE TU SISTEMA TRABAJE CONTIGO». */
export const outcomes: Outcome[] = [
  { label: 'VENDE CON CONTEXTO', title: ['Una venta.', 'Toda la historia.'], text: 'Revisa el cliente, el documento y sus pagos sin reconstruir la operación entre archivos.', link: 'Conoce el área comercial', view: 1 },
  { label: 'ANTICIPA TU OPERACIÓN', title: ['El stock correcto.', 'La decisión a tiempo.'], text: 'Consulta existencias, movimientos y costos por bodega para preparar tu próxima compra.', link: 'Explora el inventario', view: 2 },
  { label: 'MIRA HACIA ADELANTE', title: ['Conoce tu caja.', 'Planifica lo que viene.'], text: 'Ten a la vista cobros, pagos y vencimientos para decidir con el panorama financiero completo.', link: 'Descubre las finanzas', view: 3 },
];
