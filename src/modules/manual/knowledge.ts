import type { CompanyFeatureFlags, FeatureKey } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import type { ManualSection } from './content';

/**
 * Conocimiento del asistente que NO es "pasos de un módulo" y por eso no vive
 * en `content.ts` (que además se renderiza e imprime en `/dashboard/manual`):
 *
 * - `NAVIGATION_MAP`: dónde queda cada pantalla. Es lo que le permite al
 *   asistente responder algo útil ("está en Finanzas → Cuentas por Cobrar")
 *   incluso cuando la pregunta no calza con ningún tema del manual, en vez de
 *   contestar "no tengo información" y dejar al usuario sin nada.
 * - `WORKFLOWS`: recetas que cruzan varios módulos (cotizar → vender →
 *   cobrar, cierre de mes, puesta en marcha). El manual documenta cada módulo
 *   por separado; la pregunta real de un usuario casi siempre cruza dos o tres.
 * - `TROUBLESHOOTING`: síntoma → causa probable → qué hacer, para las trabas
 *   que se explican por una regla de negocio del sistema (stock negativo,
 *   permisos, documentos en borrador) y no por un error.
 * - `GLOSSARY`: vocabulario tributario chileno, para que el asistente pueda
 *   explicar QUÉ es un PMP o un remanente de crédito fiscal sin inventar.
 *
 * Todo se filtra por módulos contratados y permisos del usuario con el mismo
 * criterio que el sidebar (`src/app/(dashboard)/layout.tsx`), así el prompt
 * nunca menciona una pantalla que esa persona no puede abrir.
 */

interface Gated {
  /** Módulo que debe estar contratado. Sin esto, disponible para toda empresa. */
  requires?: FeatureKey;
  /** Permiso que el usuario debe tener. Sin esto, disponible para todo rol. */
  permission?: Permission;
  /**
   * Basta con tener UNO de estos permisos. Para las pantallas que el sidebar
   * muestra con un OR (Configuración aparece si tienes cualquiera de sus
   * secciones); sin esto no habría forma de replicar ese gate y el asistente
   * mandaría al usuario a un enlace que él no ve en su propio menú.
   */
  anyOfPermissions?: Permission[];
}

export interface NavigationEntry extends Gated {
  label: string;
  route: string;
  /** Grupo del menú lateral donde aparece, para poder decir "en Finanzas → ...". */
  group: string;
  /** Para qué sirve esa pantalla, en una línea. */
  purpose: string;
}

/**
 * Mapa de pantallas, con las mismas condiciones de visibilidad que el menú
 * lateral. Incluye pantallas navegables que no están en el sidebar
 * (subpáginas de Configuración, F29, plantillas).
 */
export const NAVIGATION_MAP: NavigationEntry[] = [
  { label: 'Dashboard', route: '/dashboard', group: 'Principal', purpose: 'Resumen general del negocio al entrar.' },
  { label: 'Punto de Venta', route: '/dashboard/pos', group: 'Principal', requires: 'hasPos', permission: 'pos:operate', purpose: 'Vender en mostrador, abrir y cerrar la caja del turno.' },
  { label: 'Mensajería', route: '/dashboard/messaging', group: 'Principal', permission: 'messaging:use', purpose: 'Chat interno cifrado con el equipo de la empresa.' },
  { label: 'Catálogo de Productos', route: '/dashboard/products', group: 'Inventario', requires: 'hasInventory', permission: 'products:read', purpose: 'Crear y editar productos, precios y categorías.' },
  { label: 'Inventario', route: '/dashboard/inventory', group: 'Inventario', requires: 'hasInventory', permission: 'products:read', purpose: 'Existencias por bodega, Kardex por producto y stock valorizado.' },
  { label: 'Ventas & Facturación', route: '/dashboard/sales', group: 'Ventas', requires: 'hasDteBilling', permission: 'sales:read', purpose: 'Emitir boletas, facturas, notas de crédito y cotizaciones.' },
  { label: 'Nueva venta', route: '/dashboard/sales/new', group: 'Ventas', requires: 'hasDteBilling', permission: 'sales:write', purpose: 'Formulario para emitir un documento de venta nuevo.' },
  { label: 'Clientes & Proveedores', route: '/dashboard/contacts', group: 'Ventas', permission: 'contacts:read', purpose: 'Ficha de cada cliente y proveedor, con RUT, contacto y límite de crédito.' },
  { label: 'Compras', route: '/dashboard/purchases', group: 'Compras', requires: 'hasPurchases', permission: 'purchases:read', purpose: 'Facturas de proveedor, recepción de mercadería y costeo.' },
  { label: 'Órdenes de compra', route: '/dashboard/purchases/orders', group: 'Compras', requires: 'hasPurchases', permission: 'purchases:orders', purpose: 'Pedidos a proveedor antes de que llegue la mercadería.' },
  { label: 'Cuentas por Cobrar', route: '/dashboard/treasury/cxc', group: 'Finanzas', requires: 'hasTreasury', permission: 'treasury:read', purpose: 'Qué te deben los clientes y qué está vencido.' },
  { label: 'Cuentas por Pagar', route: '/dashboard/treasury/cxp', group: 'Finanzas', requires: 'hasTreasury', permission: 'treasury:read', purpose: 'Qué le debes a tus proveedores y cuándo vence.' },
  { label: 'Flujo de Caja', route: '/dashboard/treasury/cashflow', group: 'Finanzas', requires: 'hasTreasury', permission: 'treasury:read', purpose: 'Proyección de entradas y salidas de dinero.' },
  { label: 'Reportes Excel', route: '/dashboard/reports', group: 'Finanzas', requires: 'hasAdvancedReports', permission: 'reports:read', purpose: 'Libro de ventas y compras, Kardex valorizado y márgenes, en Excel.' },
  { label: 'Formulario 29 (F29)', route: '/dashboard/reports/f29', group: 'Finanzas', requires: 'hasAdvancedReports', permission: 'reports:read', purpose: 'IVA débito, crédito, remanente, PPM e impuesto determinado del mes.' },
  { label: 'Presupuestos', route: '/dashboard/budgets', group: 'Finanzas', requires: 'hasBudgets', permission: 'budgets:read', purpose: 'Presupuesto del período y comparación contra lo real.' },
  { label: 'Pagarés', route: '/dashboard/promissory-notes', group: 'Finanzas', requires: 'hasPromissoryNotes', permission: 'promissorynotes:read', purpose: 'Pagarés firmados y su estado de cobro.' },
  { label: 'Cuotas & Mensualidades', route: '/dashboard/payment-plans', group: 'Finanzas', requires: 'hasInstallmentPlans', permission: 'paymentplans:read', purpose: 'Planes de pago en cuotas y registro de cada cuota pagada.' },
  { label: 'Estados Financieros', route: '/dashboard/financial-statements', group: 'Contabilidad', requires: 'hasAccounting', permission: 'reports:financial', purpose: 'Balance, estado de resultados y asientos contables.' },
  { label: 'Agentes', route: '/dashboard/agents', group: 'Inteligencia de Negocio', requires: 'hasCrm', permission: 'agents:view', purpose: 'Recomendaciones automáticas y Copiloto Financiero sobre tus datos reales.' },
  { label: 'Eventos & Proyectos', route: '/dashboard/projects', group: 'Producción de Eventos', requires: 'hasEventProjects', permission: 'projects:read', purpose: 'Certámenes y proyectos, con su presupuesto y su rentabilidad.' },
  { label: 'Calendario & Google Sync', route: '/dashboard/calendar', group: 'Producción de Eventos', requires: 'hasEventProjects', permission: 'projects:read', purpose: 'Sincronizar hitos y cumpleaños con Google Calendar.' },
  { label: 'Auspicios & Marcas', route: '/dashboard/sponsorships', group: 'Producción de Eventos', requires: 'hasSponsorships', permission: 'sponsorships:read', purpose: 'Contratos de auspicio, montos y entregables comprometidos.' },
  { label: 'Cumplimiento de Auspicios', route: '/dashboard/sponsorships/compliance', group: 'Plantillas y Cumplimiento', requires: 'hasSponsorships', permission: 'sponsorships:read', purpose: 'Tablero de qué entregables de auspicio están pendientes.' },
  { label: 'Plantilla: Carta de Compromiso', route: '/dashboard/sponsorships/template', group: 'Plantillas y Cumplimiento', requires: 'hasSponsorships', permission: 'sponsorships:write', purpose: 'Editar el texto de la carta de compromiso de auspicio.' },
  { label: 'Boletas de Honorarios', route: '/dashboard/fees', group: 'Producción de Eventos', requires: 'hasFeeDocuments', permission: 'fees:read', purpose: 'Registrar boletas de honorarios y su retención.' },
  { label: 'Candidatas & Staff', route: '/dashboard/candidates', group: 'Producción de Eventos', requires: 'hasCandidates', permission: 'candidates:read', purpose: 'Fichas, contratos y postulaciones de candidatas y staff.' },
  { label: 'Asistencia', route: '/dashboard/candidates/attendance', group: 'Producción de Eventos', requires: 'hasCandidates', permission: 'candidates:read', purpose: 'Pasar asistencia por sesión a talleres, ensayos y eventos.' },
  { label: 'Cumplimiento de Candidatas', route: '/dashboard/candidates/compliance', group: 'Plantillas y Cumplimiento', requires: 'hasCandidates', permission: 'candidates:read', purpose: 'Tablero de asistencia, pagos y documentos por candidata.' },
  { label: 'Plantilla: Contrato de Imagen', route: '/dashboard/candidates/template', group: 'Plantillas y Cumplimiento', requires: 'hasCandidates', permission: 'candidates:write', purpose: 'Editar el texto del contrato de imagen que se envía a firmar.' },
  { label: 'Acreditaciones', route: '/dashboard/production/accreditation', group: 'Producción de Eventos', requires: 'hasLiveProduction', permission: 'production:read', purpose: 'Acreditar staff y proveedores para el día del evento.' },
  { label: 'Votación & Escrutinio', route: '/dashboard/judging', group: 'Producción de Eventos', requires: 'hasJudging', permission: 'judging:read', purpose: 'Categorías de evaluación, notas del jurado y escrutinio.' },
  { label: 'Venta de Entradas', route: '/dashboard/ticketing', group: 'Producción de Eventos', requires: 'hasTicketing', permission: 'ticketing:read', purpose: 'Tipos de entrada, cupos y ventas del evento.' },
  { label: 'Votación Pagada', route: '/dashboard/voting', group: 'Producción de Eventos', requires: 'hasPublicVoting', permission: 'publicvoting:read', purpose: 'Link público donde el público paga por votar, y su ranking.' },
  { label: 'Organigrama', route: '/dashboard/org-chart', group: 'Equipo', requires: 'hasOrgChart', permission: 'orgchart:read', purpose: 'Estructura del equipo y quién reporta a quién.' },
  { label: 'Manual de Usuario', route: '/dashboard/manual', group: 'Ayuda', purpose: 'El manual completo, con buscador y opción de imprimir.' },
  { label: 'Configuración', route: '/dashboard/settings', group: 'Configuración', anyOfPermissions: ['settings:company', 'settings:users', 'audit:read'], purpose: 'Punto de entrada a empresa, equipo, roles, seguridad e importación.' },
  { label: 'Datos de la Empresa', route: '/dashboard/settings/company', group: 'Configuración', permission: 'settings:company', purpose: 'Razón social, RUT, giro y parámetros tributarios (PPM, retención, stock negativo).' },
  { label: 'Equipo / Usuarios', route: '/dashboard/settings/users', group: 'Configuración', permission: 'settings:users', purpose: 'Invitar gente, cambiar su rol y desactivar a quien ya no trabaja contigo.' },
  { label: 'Roles Personalizados', route: '/dashboard/settings/roles', group: 'Configuración', permission: 'settings:users', purpose: 'Crear roles a medida con la lista exacta de permisos que necesitas.' },
  { label: 'Auditoría', route: '/dashboard/settings/audit', group: 'Configuración', permission: 'audit:read', purpose: 'Registro de quién hizo qué y cuándo.' },
  { label: 'Importación Masiva', route: '/dashboard/settings/import', group: 'Configuración', permission: 'import:data', purpose: 'Cargar productos, contactos, stock e históricos desde Excel o fotos.' },
  { label: 'Mi Perfil', route: '/dashboard/settings/profile', group: 'Configuración', purpose: 'Tus datos de contacto y tu actividad reciente.' },
  { label: 'Seguridad', route: '/dashboard/settings/security', group: 'Configuración', purpose: 'Activar la verificación en dos pasos (2FA) de tu cuenta.' },
  { label: 'Dispositivos Activos', route: '/dashboard/settings/sessions', group: 'Configuración', purpose: 'Sesiones abiertas de tu cuenta, para cerrar las que no reconozcas.' },
];

export interface Workflow extends Gated {
  title: string;
  /** Módulos que además deben estar contratados (todos), aparte de `requires`. */
  alsoRequires?: FeatureKey[];
  steps: string[];
}

/** Recetas end-to-end que cruzan módulos — el manual documenta cada módulo por separado. */
export const WORKFLOWS: Workflow[] = [
  {
    title: 'Puesta en marcha: dejar el sistema listo para operar',
    steps: [
      'Completa los datos de tu empresa en Configuración → Datos de la Empresa (razón social, RUT, giro y los parámetros tributarios).',
      'Invita a tu equipo en Configuración → Equipo y asígnale a cada uno su rol; si ningún rol base calza, crea uno a medida en Roles Personalizados.',
      'Carga tu catálogo y tu cartera de clientes/proveedores con Configuración → Importación Masiva, en vez de crearlos uno por uno.',
      'Carga el stock inicial de cada producto (también desde Importación Masiva, o con un ajuste de inventario).',
      'Recién ahí empieza a emitir documentos: si vendes antes de cargar el stock, el Kardex parte descuadrado.',
    ],
  },
  {
    title: 'Ciclo completo de una venta a crédito, de la cotización al cobro',
    requires: 'hasDteBilling',
    alsoRequires: ['hasTreasury'],
    steps: [
      'Crea la cotización en Ventas y envíasela al cliente.',
      'Cuando la acepte, conviértela en el documento de venta (boleta o factura) desde la misma cotización, para no volver a tipear las líneas.',
      'Si es a crédito, indica la condición de pago al emitir: el documento genera solo la cuenta por cobrar.',
      'El saldo aparece en Finanzas → Cuentas por Cobrar, donde registras los pagos, totales o parciales.',
      'Si el cliente no paga, filtra Cuentas por Cobrar por vencidas y usa el recordatorio de cobranza.',
      'Si hay que anular o corregir el documento, se hace con una nota de crédito, nunca borrando el original.',
    ],
  },
  {
    title: 'Ciclo completo de una compra, del pedido al pago',
    requires: 'hasPurchases',
    steps: [
      'Si el proveedor lo pide, emite primero una orden de compra en Compras → Órdenes de compra.',
      'Cuando llega la mercadería, registra la factura del proveedor y recepciona las cantidades reales que llegaron, no las pedidas.',
      'La recepción actualiza el stock y recalcula el costo PMP de cada producto automáticamente.',
      'Si tu empresa exige aprobación, la compra queda pendiente hasta que alguien con ese permiso la apruebe.',
      'El saldo por pagar aparece en Finanzas → Cuentas por Pagar, donde después registras el pago.',
    ],
  },
  {
    title: 'Cierre de mes: qué revisar antes de declarar',
    requires: 'hasAdvancedReports',
    steps: [
      'Verifica que no queden documentos de venta en borrador del mes: si no están emitidos, no entran al F29.',
      'Registra todas las compras del mes; una factura de proveedor sin registrar es crédito fiscal que pierdes.',
      'Cuadra la caja del POS: todos los turnos del mes deben estar cerrados con su arqueo.',
      'Revisa Cuentas por Cobrar y por Pagar para detectar saldos mal registrados.',
      'Abre Finanzas → Formulario 29 (F29) y revisa débito, crédito, remanente y PPM del período.',
      'Descarga el libro de ventas y compras en Reportes Excel y mándaselo a tu contador junto con el F29.',
    ],
  },
  {
    title: 'Cuadrar el inventario cuando el stock del sistema no calza con la bodega',
    requires: 'hasInventory',
    steps: [
      'Haz el conteo físico real de los productos que te preocupan.',
      'Abre Inventario, filtra por la bodega correspondiente y compara con tu conteo.',
      'Para cada diferencia, abre el Kardex del producto y busca en qué movimiento se descuadró (una venta sin descontar, una recepción cargada dos veces, un ajuste mal hecho).',
      'Corrige con un ajuste de inventario indicando el motivo real (merma, robo, error de conteo). No edites el producto para "arreglar" el número.',
      'Los ajustes quedan en el Kardex y en Auditoría, así que son trazables.',
    ],
  },
  {
    title: 'Alguien nuevo entra al equipo (o alguien se va)',
    permission: 'settings:users',
    steps: [
      'Entra: invítalo en Configuración → Equipo con su correo y su rol. Recibe un correo con un link para poner su contraseña.',
      'Si ningún rol base calza con lo que tiene que hacer, crea un rol personalizado con los permisos exactos y asígnaselo.',
      'Se va: desactívalo en Configuración → Equipo. No lo elimines: sus documentos y su rastro en Auditoría tienen que seguir existiendo.',
      'Desactivar corta el acceso de inmediato, no cuando expire su sesión.',
    ],
  },
  {
    title: 'Montar un certamen o evento de principio a fin',
    requires: 'hasEventProjects',
    steps: [
      'Crea el proyecto/certamen con sus fechas y su presupuesto.',
      'Carga las candidatas o el staff y envíales el contrato a firmar por correo.',
      'Registra los auspicios y sus entregables comprometidos, y usa el tablero de cumplimiento para no dejar ninguno afuera.',
      'Configura las entradas y, si corresponde, la votación pagada del público.',
      'Durante el proceso, pasa asistencia por sesión a talleres y ensayos, y cobra las cuotas con los planes de pago.',
      'El día del evento, acredita staff y proveedores desde Acreditaciones, y usa Votación & Escrutinio para las notas del jurado.',
      'Al final, revisa la rentabilidad del proyecto: ingresos por auspicios y entradas contra los costos cargados.',
    ],
  },
];

export interface TroubleshootingItem extends Gated {
  problem: string;
  answer: string[];
}

/** Síntoma → causa → qué hacer, para las trabas que son reglas de negocio y no errores. */
export const TROUBLESHOOTING: TroubleshootingItem[] = [
  {
    problem: 'No veo un módulo o una opción que sé que existe',
    answer: [
      'Son dos cosas distintas: el plan de tu empresa (qué módulos se contrataron) y tu rol (qué permisos te dieron dentro de esos módulos).',
      'Si nadie de tu empresa lo ve, es el plan: lo tiene que activar el dueño de la cuenta con soporte.',
      'Si otros lo ven y tú no, es tu rol: pídele al administrador que lo revise en Configuración → Equipo o en Roles Personalizados.',
    ],
  },
  {
    problem: 'El sistema no me deja vender porque no hay stock',
    requires: 'hasInventory',
    answer: [
      'Por defecto está bloqueado vender más de lo que hay en la bodega, para que el Kardex no quede en negativo.',
      'Si el stock del sistema está mal, corrígelo con un ajuste de inventario, no forzando la venta.',
      'Si tu negocio vende contra pedido de verdad, el dueño de la cuenta puede activar "permitir stock negativo" en Configuración → Datos de la Empresa.',
    ],
  },
  {
    problem: 'Emití un documento con un error',
    requires: 'hasDteBilling',
    answer: [
      'Un documento emitido no se edita ni se borra: se corrige con una nota de crédito que lo anula total o parcialmente.',
      'Después emites el documento correcto. Así el correlativo de folios y el libro de ventas quedan consistentes.',
      'Si todavía está en borrador (no emitido), ahí sí lo puedes editar directamente.',
    ],
  },
  {
    problem: 'Los números del F29 no me cuadran',
    requires: 'hasAdvancedReports',
    answer: [
      'Revisa que todos los documentos de venta del período estén emitidos y no en borrador.',
      'Revisa que estén registradas todas las facturas de compra del mes, que son tu crédito fiscal.',
      'El remanente de crédito fiscal del mes anterior se arrastra al siguiente, así que un mes puede salir en cero por eso.',
      'Los productos marcados como exentos no generan IVA: si un producto afecto quedó marcado exento en el catálogo, el débito sale bajo.',
    ],
  },
  {
    problem: 'El costo de un producto cambió solo',
    requires: 'hasInventory',
    answer: [
      'Es el Precio Medio Ponderado (PMP): al recepcionar una compra, el costo se recalcula como promedio ponderado entre lo que tenías y lo que compraste.',
      'Es el comportamiento correcto y no hay que corregirlo a mano.',
      'Si el costo saltó a un valor raro, revisa el Kardex del producto: casi siempre es una compra cargada con la cantidad o el precio equivocados.',
    ],
  },
  {
    problem: 'La caja del POS no cuadra al cerrar el turno',
    requires: 'hasPos',
    answer: [
      'El arqueo compara lo que el sistema esperaba en caja contra lo que contaste físicamente.',
      'Revisa las ventas anuladas del turno y los pagos registrados con el medio de pago equivocado (efectivo vs. tarjeta).',
      'Cierra el turno igual con la diferencia declarada: dejarlo abierto para "arreglarlo después" descuadra también el día siguiente.',
    ],
  },
  {
    problem: 'Olvidé mi contraseña o no puedo entrar',
    answer: [
      'Usa la opción de recuperar contraseña en la pantalla de inicio de sesión.',
      'Si tienes 2FA activo y perdiste el teléfono, necesitas uno de tus códigos de respaldo.',
      'Si tu usuario fue desactivado, ningún reseteo te va a dejar entrar: tiene que reactivarte el administrador de tu empresa.',
    ],
  },
  {
    problem: 'Cargué un archivo por importación y quedó mal',
    permission: 'import:data',
    answer: [
      'La importación siempre muestra una vista previa antes de guardar: si algo se ve mal ahí, cancela y corrige el archivo.',
      'Si ya confirmaste, corrige los registros afectados en su propia pantalla (producto, contacto), o con un ajuste de inventario si fue stock.',
      'Para tandas grandes, importa un archivo chico de prueba primero y revisa el resultado antes de subir las 2.000 filas.',
    ],
  },
];

export interface GlossaryTerm {
  term: string;
  definition: string;
}

/** Vocabulario tributario y de negocio chileno que el asistente puede explicar sin inventar. */
export const GLOSSARY: GlossaryTerm[] = [
  { term: 'IVA', definition: 'Impuesto al Valor Agregado, 19% en Chile, aplicado sobre el monto neto de las líneas afectas. Los productos marcados como exentos no lo pagan.' },
  { term: 'Neto / Bruto', definition: 'El neto es el monto sin IVA; el bruto es el neto más el IVA. En este sistema los montos finales se manejan en pesos enteros, sin decimales.' },
  { term: 'Débito fiscal', definition: 'El IVA que recaudaste en tus ventas del período y le debes al SII.' },
  { term: 'Crédito fiscal', definition: 'El IVA que pagaste en tus compras del período y puedes descontar del débito.' },
  { term: 'Remanente de crédito fiscal', definition: 'Cuando el crédito del mes supera al débito, la diferencia no se pierde: queda como remanente y se arrastra al mes siguiente.' },
  { term: 'F29', definition: 'Formulario mensual del SII donde se declara el IVA y el PPM. El sistema lo calcula sobre tus documentos reales del período como apoyo; la declaración formal la hace tu contador.' },
  { term: 'PPM', definition: 'Pago Provisional Mensual: un anticipo del impuesto a la renta, calculado como un porcentaje de tus ventas netas. La tasa se configura en los datos de la empresa.' },
  { term: 'DTE', definition: 'Documento Tributario Electrónico: boleta (39), factura afecta (33), factura exenta (34), guía de despacho (52), nota de débito (56) y nota de crédito (61).' },
  { term: 'Folio', definition: 'El número correlativo de cada documento tributario. No se reutiliza ni se salta: por eso un documento emitido se corrige con nota de crédito y no borrándolo.' },
  { term: 'Nota de crédito', definition: 'Documento que anula o rebaja, total o parcialmente, uno emitido antes. Es la forma correcta de corregir una factura o boleta ya emitida.' },
  { term: 'PMP', definition: 'Precio Medio Ponderado: el costo unitario de un producto, recalculado en cada compra como promedio entre el stock que tenías a su costo y lo que entró al suyo.' },
  { term: 'Kardex', definition: 'El historial de movimientos de un producto: cada entrada, salida, ajuste y transferencia, con su cantidad, su costo y el documento que lo originó.' },
  { term: 'Stock valorizado', definition: 'La cantidad en bodega multiplicada por el costo PMP vigente. Es el valor contable de tu inventario.' },
  { term: 'Boleta de honorarios', definition: 'Documento que emite un profesional independiente por sus servicios. Lleva una retención de impuesto que el sistema calcula con la tasa configurada en tu empresa.' },
  { term: 'Cuenta por cobrar (CxC)', definition: 'Lo que un cliente te debe por un documento a crédito todavía no pagado del todo.' },
  { term: 'Cuenta por pagar (CxP)', definition: 'Lo que le debes a un proveedor por una factura de compra todavía no pagada del todo.' },
  { term: 'Arqueo de caja', definition: 'El conteo del efectivo al cerrar un turno del POS, comparado contra lo que el sistema esperaba, para dejar la diferencia declarada.' },
];

function isAvailable(item: Gated, features: CompanyFeatureFlags, permissions: Permission[]): boolean {
  if (item.requires && !features[item.requires]) return false;
  if (item.permission && !permissions.includes(item.permission)) return false;
  if (item.anyOfPermissions && !item.anyOfPermissions.some((permission) => permissions.includes(permission))) return false;
  return true;
}

/** Pantallas que este usuario en particular puede abrir de verdad. */
export function getVisibleNavigation(features: CompanyFeatureFlags, permissions: Permission[]): NavigationEntry[] {
  return NAVIGATION_MAP.filter((entry) => isAvailable(entry, features, permissions));
}

/** Flujos cuyos módulos están todos contratados y a los que el usuario tiene acceso. */
export function getVisibleWorkflows(features: CompanyFeatureFlags, permissions: Permission[]): Workflow[] {
  return WORKFLOWS.filter(
    (workflow) =>
      isAvailable(workflow, features, permissions) && (workflow.alsoRequires ?? []).every((key) => features[key])
  );
}

/** Problemas frecuentes aplicables al plan y al rol de este usuario. */
export function getVisibleTroubleshooting(features: CompanyFeatureFlags, permissions: Permission[]): TroubleshootingItem[] {
  return TROUBLESHOOTING.filter((item) => isAvailable(item, features, permissions));
}

/**
 * Pantalla en la que está parado el usuario, para que el asistente pueda
 * responder "en esta pantalla..." sin que se lo expliquen. Elige la ruta más
 * específica que sea prefijo del path actual.
 */
export function describeCurrentScreen(path: string): NavigationEntry | null {
  const matches = NAVIGATION_MAP.filter((entry) => path === entry.route || path.startsWith(`${entry.route}/`));
  if (matches.length === 0) return null;
  return matches.reduce((best, entry) => (entry.route.length > best.route.length ? entry : best));
}

/**
 * Los flujos, los problemas frecuentes y el glosario, con la forma de una
 * sección del manual, para poder mostrarlos en `/dashboard/manual` con el
 * mismo buscador y la misma impresión que el resto — no solo dentro del chat
 * del asistente. Filtrado con el mismo criterio que usa el prompt.
 */
export function getKnowledgeAsManualSections(features: CompanyFeatureFlags, permissions: Permission[]): ManualSection[] {
  const sections: ManualSection[] = [];

  const workflows = getVisibleWorkflows(features, permissions);
  if (workflows.length > 0) {
    sections.push({
      key: 'always',
      title: 'Flujos completos (de principio a fin)',
      route: '/dashboard',
      topics: workflows.map((workflow, index) => ({
        id: `flujo-${index}`,
        title: workflow.title,
        steps: workflow.steps,
      })),
    });
  }

  const troubleshooting = getVisibleTroubleshooting(features, permissions);
  if (troubleshooting.length > 0) {
    sections.push({
      key: 'always',
      title: 'Problemas frecuentes',
      route: '/dashboard',
      topics: troubleshooting.map((item, index) => ({
        id: `problema-${index}`,
        title: item.problem,
        steps: item.answer,
      })),
    });
  }

  sections.push({
    key: 'always',
    title: 'Glosario',
    route: '/dashboard',
    topics: [
      {
        id: 'glosario',
        title: 'Qué significa cada término',
        steps: GLOSSARY.map((entry) => `${entry.term}: ${entry.definition}`),
      },
    ],
  });

  return sections;
}
