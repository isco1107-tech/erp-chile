import { MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { ALL_PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import type { ManualSection } from './types';

/**
 * Conocimiento del asistente que NO es "pasos de un módulo" y por eso no vive
 * en `content.ts`:
 *
 * - Mapa de pantallas: dónde queda cada pantalla y para qué sirve. Es lo que
 *   le permite al asistente orientar ("está en Finanzas → Cobranza") aunque
 *   la pregunta no calce con ningún tema del manual. Se DERIVA del menú real
 *   (`buildAvailableWorkspaceNav`), así que nunca menciona una pantalla que
 *   el usuario no ve en su propio menú, ni se desfasa cuando se agrega una:
 *   `SCREEN_PURPOSES` solo aporta el "para qué sirve" (un test exige que cada
 *   ítem del menú tenga el suyo).
 * - `WORKFLOWS`: recetas que cruzan varios módulos (cotizar → vender →
 *   cobrar, cierre de mes, puesta en marcha).
 * - `TROUBLESHOOTING`: síntoma → causa → qué hacer, para las trabas que se
 *   explican por una regla de negocio y no por un error.
 * - `GLOSSARY`: vocabulario tributario y del sistema, para explicar QUÉ es
 *   algo sin inventar.
 */

interface Gated {
  /** Módulo que debe estar contratado. Sin esto, disponible para toda empresa. */
  requires?: FeatureKey;
  /** Permiso que el usuario debe tener. Sin esto, disponible para todo rol. */
  permission?: Permission;
  /** Basta con tener UNO de estos permisos. */
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

/** Para qué sirve cada ítem del menú lateral, por su `id` estable de `workspace-nav.ts`. */
export const SCREEN_PURPOSES: Record<string, string> = {
  home: 'Resumen del negocio al entrar: ventas, compras, IVA, stock crítico y accesos rápidos.',
  pos: 'Vender en mostrador: abrir la caja, cobrar con boleta y cerrar el turno con arqueo.',
  messaging: 'Chat interno cifrado con el equipo de la empresa.',
  intelligence: 'Salud de la empresa, señales de alerta, clientes RFM, productos ABC y simulador de decisiones.',
  'intelligence-cash': 'Saldo de caja proyectado semana a semana con todos los compromisos con fecha.',
  'intelligence-flows': 'De cotización a cobro y de compra a pago, con tiempos y cuellos de botella.',
  agents: 'Recomendaciones de los agentes ejecutivos (CEO, CFO, COO, Ventas) sobre tus datos reales.',
  products: 'Crear y editar productos, precios, códigos de barras, categorías, empaques y si son exentos de IVA.',
  inventory: 'Existencias por bodega, Kardex de cada producto, ajustes de stock y transferencias.',
  'inventory-counts': 'Toma de inventario: contar la bodega (a mano o con lector) y ajustar el stock a lo contado.',
  'inventory-lots': 'Saldo por lote y fechas de vencimiento; las salidas consumen primero lo que vence antes.',
  'inventory-labels': 'Imprimir etiquetas con código de barras en hoja A4 o rollo.',
  crm: 'Embudo de negocios por etapa (auspicios, eventos, entradas corporativas…), con pronóstico ponderado.',
  'crm-tasks': 'Agenda comercial: llamadas, reuniones y seguimientos vencidos, de hoy y próximos.',
  'crm-people': 'Personas detrás de cada marca (gerentes de marketing, agencias) con sus negocios.',
  'crm-reports': 'Pronóstico por mes y rendimiento por tipo de negocio, certamen, origen y responsable.',
  sales: 'Emitir facturas, boletas, guías, notas de crédito/débito y cotizaciones; anular y duplicar documentos.',
  'sales-orders': 'Notas de venta (pedidos): reservan stock y se facturan o despachan por partes.',
  'price-lists': 'Listas de precios por tipo de cliente y por volumen, asignables a cada cliente.',
  'sales-commissions': 'Comisión de cada vendedor según su venta neta del mes y su tasa.',
  contacts: 'Ficha de clientes y proveedores: RUT, contacto, crédito, lista de precios, datos bancarios y portal del cliente.',
  'customer-care': 'Canal de origen de clientes, encuestas de satisfacción (CSAT y NPS) y seguimiento de clientes inactivos.',
  'invoice-archive': 'Archivo de facturas de proveedores con su foto o PDF e histórico por proveedor.',
  purchases: 'Registrar facturas de proveedores, aprobar compras y anularlas.',
  'purchase-requests': 'Solicitudes de compra del equipo, aprobación, comparativo de cotizaciones y generación de órdenes de compra.',
  'purchase-orders': 'Órdenes de compra a proveedores, recepción de mercadería por entregas y facturación de lo recibido.',
  'purchases-imports': 'Carpetas de importación: FOB y costos hasta bodega repartidos para ingresar la mercadería a su costo real.',
  'purchases-inbox': 'DTE recibidos de proveedores: cargar el XML, verificar el timbre, aceptar o reclamar y pasarlos a Compras.',
  manufacturing: 'Órdenes de producción que consumen insumos y dejan el producto terminado a su costo real.',
  'manufacturing-boms': 'Recetas (lista de materiales): qué insumos y cuánto lleva cada producto que fabricas.',
  'service-desk': 'Servicio técnico: recepción de equipos, diagnóstico, presupuesto aprobado por el cliente, reparación, entrega y cobro.',
  quality: 'Procedimientos con acuse de lectura, inspecciones de calidad por plantilla y ficha de productores.',
  academy: 'Ficha de cada alumna de la academia, lista de asistencia por clase y control de la mensualidad pagada.',
  tasks: 'Tareas del equipo con responsable y repetición, y reglas de delegación de decisiones.',
  'web-sites': 'Crear y publicar sitios web (guiado o HTML propio), dominio propio y mensajes del formulario de contacto.',
  'treasury-cxc': 'Cuentas por cobrar: qué te deben los clientes, lo vencido, registrar cobros y enviar recordatorios.',
  'treasury-cxp': 'Cuentas por pagar: qué le debes a tus proveedores, lo que vence pronto y registrar pagos.',
  'treasury-cashflow': 'Ingresos y egresos reales del período por medio de pago, exportables a CSV.',
  'treasury-collections': 'Cobranza: antigüedad de la deuda por cliente, gestiones, promesas de pago y recordatorios automáticos.',
  'treasury-banks': 'Cuentas bancarias y conciliación de la cartola con tus cobros y pagos.',
  'treasury-cheques': 'Cartera de cheques recibidos y girados: depositar, cobrar o protestar.',
  'treasury-payment-batches': 'Nóminas de pago a proveedores: archivo para el banco y registro del pago de cada factura.',
  reports: 'Excel del período con libro de ventas y compras, Kardex valorizado, márgenes y pagos.',
  'reports-f29': 'F29 del mes: IVA débito y crédito, remanente, PPM, retenciones e impuesto determinado.',
  'reports-rcv': 'Cuadrar el Registro de Compras y Ventas del SII con tus documentos antes de declarar.',
  budgets: 'Presupuesto del período por categoría y su desviación.',
  expenses: 'Rendición de gastos: rendir boletas, aprobarlas y registrar su reembolso.',
  'fixed-assets': 'Bienes de uso con depreciación, valor libro, mantenciones, etiquetas y bajas.',
  'promissory-notes': 'Pagarés firmados, su vencimiento y los abonos recibidos.',
  'payment-plans': 'Planes de pago en cuotas, cobro de cada cuota, multas, recordatorios y pago en línea.',
  fees: 'Boletas de honorarios con su retención de 2ª categoría.',
  'financial-statements': 'Balance general, estado de resultados y flujo de efectivo desde los asientos contables.',
  'accounting-journal': 'Libro Diario: todos los asientos del período con su documento de origen.',
  'accounting-ledger': 'Libro Mayor: movimientos y saldo acumulado de una cuenta.',
  'accounting-trial-balance': 'Balance de comprobación de 8 columnas al cierre del período.',
  'accounting-reconciliation': 'Cuadraturas: cada saldo contable comparado con su fuente operativa.',
  projects: 'Certámenes y eventos con su centro de mando: checklist "¿listos para la gala?", indicadores, finanzas, sitio público y afiches.',
  calendar: 'Calendario de certámenes, galas y cumpleaños, sincronizado con Google Calendar.',
  sponsorships: 'Contratos de auspicio en efectivo o canje, entregables con evidencia, pagos y portal de la marca.',
  'sponsorships-packages': 'Tarifario de planes de auspicio con precio, cupos y beneficios, por certamen.',
  'sponsorships-compliance': 'Qué entregables de auspicio están pendientes, por marca.',
  'sponsorships-template': 'Texto de la carta de compromiso de auspicio.',
  candidates: 'Fichas de candidatas y staff, convocatoria con postulación pública, documentos, fotos y contrato de imagen.',
  'candidates-casting': 'Tablero de casting: mover fichas entre etapas, numerar oficiales y definir su presentación pública.',
  'candidates-attendance': 'Asistencia por sesión a talleres, ensayos y eventos.',
  'candidates-compliance': 'Asistencia, pagos y documentos de cada candidata en un tablero.',
  'candidates-template': 'Texto del contrato de imagen que se envía a firmar.',
  contracts: 'Checklist de contratos de imagen y cartas de compromiso firmados y pendientes, de todos los certámenes.',
  'production-timeline': 'Escaleta minuto a minuto, modo show en vivo con atraso acumulado e impresión para cabina.',
  'production-wardrobe': 'Looks por candidata y bloque: pruebas, entregas, devoluciones y valor declarado.',
  'production-accreditation': 'Credenciales con QR para staff y proveedores, diseño de credencial y check-in.',
  judging: 'Rondas, criterios ponderados, enlaces de jurado, votación en vivo, escrutinio y acta.',
  ticketing: 'Tipos de entrada, confirmación de pagos y control de acceso con QR.',
  voting: 'Votación pagada del público: confirmación de pagos y ranking en vivo.',
  'hr-employees': 'Ficha de trabajadores: contrato, sueldo, previsión, préstamos, anticipos, finiquito y portal del trabajador.',
  'hr-payroll': 'Liquidaciones del mes, libro de remuneraciones, planilla de cotizaciones y cierre del período.',
  'hr-leave': 'Vacaciones y permisos con aprobación y saldo de feriado legal.',
  'org-chart': 'Organigrama: cargos del equipo y quién reporta a quién.',
  manual: 'El manual de usuario de los módulos de tu empresa, con buscador, capturas y descarga en Word.',
  settings: 'Punto de entrada a empresa, folios, equipo, roles, módulos del menú, importación, automatizaciones y auditoría.',
  platform: 'Panel de administración de la plataforma (solo superadministradores).',
};

/**
 * Pantallas navegables que NO son un ítem del menú (subpáginas de
 * Configuración, formularios de alta, vistas secundarias). Llevan su propio
 * gate con el mismo criterio que la pantalla.
 */
const EXTRA_SCREENS: (NavigationEntry & Gated)[] = [
  { label: 'Nueva venta', route: '/dashboard/sales/new', group: 'Ventas', requires: 'hasDteBilling', permission: 'sales:write', purpose: 'Formulario para emitir una factura, boleta, guía, nota o cotización.' },
  { label: 'Nueva factura de proveedor', route: '/dashboard/purchases/new', group: 'Compras', requires: 'hasPurchases', permission: 'purchases:write', purpose: 'Formulario para registrar una factura o nota de un proveedor.' },
  { label: 'Lista de oportunidades', route: '/dashboard/crm/list', group: 'CRM Comercial', requires: 'hasSalesPipeline', permission: 'crm:read', purpose: 'Todos los negocios en tabla, ordenables, con alertas de riesgo y exportación a Excel.' },
  { label: 'Nuevo certamen', route: '/dashboard/projects/new', group: 'Certámenes & Eventos', requires: 'hasEventProjects', permission: 'projects:write', purpose: 'Formulario para crear un certamen o evento con fechas, presupuesto y gala.' },
  { label: 'Recibir equipo', route: '/dashboard/service/new', group: 'Operaciones', requires: 'hasServiceDesk', permission: 'service:write', purpose: 'Registrar el ingreso de un equipo al servicio técnico.' },
  { label: 'Tesorería & Cobranza (resumen)', route: '/dashboard/treasury', group: 'Finanzas', requires: 'hasTreasury', permission: 'treasury:read', purpose: 'Resumen de lo que entra y sale de la caja y el banco, y lo que falta por cobrar y pagar.' },
  { label: 'Protección de datos', route: '/dashboard/settings/privacy', group: 'Configuración', permission: 'settings:company', purpose: 'Cumplimiento de la Ley 21.719: formulario público de derechos de los titulares con su plazo, búsqueda y copia de los datos de una persona, registro de actividades de tratamiento e incidentes de seguridad.' },
  { label: 'Perfil de Empresa', route: '/dashboard/settings/company', group: 'Configuración', permission: 'settings:company', purpose: 'Razón social, RUT, giro, logo, parámetros tributarios (PPM, retención), stock negativo y umbral de aprobación de compras. También las integraciones propias de la empresa: Brevo (correo), ZapSign (firma de contratos) y Khipu (cobro en línea).' },
  { label: 'Módulos y Menú', route: '/dashboard/settings/modules', group: 'Configuración', permission: 'settings:company', purpose: 'Encender o apagar cada sección del menú lateral para todo el equipo.' },
  { label: 'Planes y Módulos', route: '/dashboard/settings/plans', group: 'Configuración', permission: 'settings:company', purpose: 'Ver el precio de cada plan y módulo de Aether, armar una selección y solicitar su contratación.' },
  { label: 'Folios del SII', route: '/dashboard/settings/folios', group: 'Configuración', requires: 'hasDteBilling', permission: 'dte:manage_caf', purpose: 'Cargar los CAF del SII y ver cuántos folios quedan por tipo de documento.' },
  { label: 'Equipo & Colaboradores', route: '/dashboard/settings/users', group: 'Configuración', permission: 'settings:users', purpose: 'Invitar personas, cambiar su rol, restablecer contraseñas y desactivar a quien ya no trabaja contigo.' },
  { label: 'Roles Personalizados', route: '/dashboard/settings/roles', group: 'Configuración', permission: 'settings:users', purpose: 'Crear roles a medida con la lista exacta de permisos.' },
  { label: 'Importación Masiva', route: '/dashboard/settings/import', group: 'Configuración', permission: 'import:data', purpose: 'Cargar productos, contactos, stock e históricos desde Excel, texto o fotos.' },
  { label: 'Automatizaciones', route: '/dashboard/settings/automations', group: 'Configuración', permission: 'automation:manage', purpose: 'Reglas "cuando pase X, hacer Z": correo, aviso en la campanita o webhook.' },
  { label: 'Auditoría & Trazabilidad', route: '/dashboard/settings/audit', group: 'Configuración', permission: 'audit:read', purpose: 'Registro de quién hizo qué y cuándo.' },
  { label: 'Mi Perfil', route: '/dashboard/settings/profile', group: 'Configuración', purpose: 'Tus datos de contacto, tu foto y tu actividad reciente.' },
  { label: 'Seguridad', route: '/dashboard/settings/security', group: 'Configuración', purpose: 'Activar la verificación en dos pasos (2FA) de tu cuenta.' },
  { label: 'Dispositivos Activos', route: '/dashboard/settings/sessions', group: 'Configuración', purpose: 'Sesiones abiertas de tu cuenta, para cerrar las que no reconozcas.' },
];

function isAvailable(item: Gated, features: CompanyFeatureFlags, permissions: readonly Permission[]): boolean {
  if (item.requires && !features[item.requires]) return false;
  if (item.permission && !permissions.includes(item.permission)) return false;
  if (item.anyOfPermissions && !item.anyOfPermissions.some((permission) => permissions.includes(permission))) return false;
  return true;
}

/** Pantallas que este usuario en particular puede abrir de verdad: su menú lateral más las subpantallas a las que tiene acceso. */
export function getVisibleNavigation(features: CompanyFeatureFlags, permissions: readonly Permission[]): NavigationEntry[] {
  const fromMenu = buildAvailableWorkspaceNav({ permissions, features, isSuperAdmin: false }).flatMap((group) =>
    group.links.map((link) => ({
      label: link.label,
      route: link.href,
      group: group.label,
      purpose: SCREEN_PURPOSES[link.id] ?? link.label,
    }))
  );
  const menuRoutes = new Set(fromMenu.map((entry) => entry.route));
  const extras = EXTRA_SCREENS.filter((entry) => !menuRoutes.has(entry.route) && isAvailable(entry, features, permissions));
  return [...fromMenu, ...extras];
}

const ALL_FEATURES = Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as CompanyFeatureFlags;

/** El mapa completo (todo contratado, todos los permisos). */
export const NAVIGATION_MAP: NavigationEntry[] = getVisibleNavigation(ALL_FEATURES, ALL_PERMISSIONS);

/**
 * Pantalla en la que está parado el usuario, para que el asistente pueda
 * responder "en esta pantalla..." sin que se lo expliquen. Elige la ruta más
 * específica que sea prefijo del path actual.
 */
export function describeCurrentScreen(path: string): NavigationEntry | null {
  const matches = NAVIGATION_MAP.filter((entry) =>
    entry.route === '/dashboard' ? path === '/dashboard' : path === entry.route || path.startsWith(`${entry.route}/`)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, entry) => (entry.route.length > best.route.length ? entry : best));
}

export interface Workflow extends Gated {
  title: string;
  /** Módulos que además deben estar contratados (todos), aparte de `requires`. */
  alsoRequires?: FeatureKey[];
  steps: string[];
}

/** Recetas de punta a punta que cruzan módulos — el manual documenta cada módulo por separado. */
export const WORKFLOWS: Workflow[] = [
  {
    title: 'Puesta en marcha: dejar el sistema listo para operar',
    steps: [
      'Completa los datos de tu empresa en Configuración → Perfil de Empresa (razón social, RUT, giro, logo y parámetros tributarios).',
      'Si emites documentos tributarios, carga tus folios del SII (CAF) en Configuración → Folios del SII.',
      'Invita a tu equipo en Configuración → Equipo & Colaboradores con su rol; si ningún rol calza, crea uno en Roles Personalizados.',
      'Carga tu catálogo y tu cartera de clientes y proveedores con Configuración → Importación Masiva, en vez de crearlos uno por uno.',
      'Carga el stock inicial de cada producto (Importación Masiva → stock inicial, o un ajuste de inventario).',
      'Recién entonces empieza a vender: si vendes antes de cargar el stock, el Kardex parte descuadrado.',
      'Apaga en Configuración → Módulos y Menú las secciones que tu equipo no usará, para que el menú quede simple.',
    ],
  },
  {
    title: 'Ciclo completo de una venta a crédito, de la cotización al cobro',
    requires: 'hasDteBilling',
    alsoRequires: ['hasTreasury'],
    steps: [
      'Crea la cotización en Ventas → Nueva Venta (tipo Cotización) y envíasela al cliente.',
      'Cuando la acepte, ábrela y usa "Convertir en nota de venta"; desde la nota emite la factura (o la boleta) sin volver a tipear las líneas.',
      'Elige "Crédito 30 días" como forma de pago: la factura queda en Finanzas → Cuentas por Cobrar.',
      'Si el cliente se atrasa, regístralo en Finanzas → Cobranza (gestiones, promesas y recordatorios automáticos).',
      'Cuando pague, usa "Registrar pago" en Cuentas por Cobrar indicando la cuenta bancaria, para que se concilie sola con la cartola.',
      'Si hay que corregir la factura, se hace con una nota de crédito, nunca borrándola.',
    ],
  },
  {
    title: 'Pedido con despacho por partes',
    requires: 'hasDteBilling',
    steps: [
      'Registra el pedido en Ventas → Notas de venta: el stock queda reservado.',
      'En cada entrega, abre la nota y usa "Guía de despacho" (o "Facturar") con solo lo que sale ese día.',
      'Cuando se formaliza, factura las guías desde la misma nota: la factura no vuelve a descontar stock.',
      'La nota muestra por producto lo pedido, despachado y facturado, y se concluye sola al completarse.',
    ],
  },
  {
    title: 'Compra completa: de la necesidad al pago',
    requires: 'hasPurchases',
    steps: [
      'Quien necesita algo lo pide en Compras → Solicitudes de compra; su jefatura la aprueba.',
      'Agrega las cotizaciones de varios proveedores, adjudica al mejor precio y genera las órdenes de compra.',
      'Cuando llega la mercadería, registra la recepción en la orden con las cantidades reales (el stock sube y el PMP se recalcula).',
      'Con la factura del proveedor, usa "Facturar" en la orden (o regístrala desde DTE recibidos).',
      'Si supera el umbral de aprobación, queda pendiente hasta que alguien con permiso la apruebe.',
      'Págala en Finanzas → Cuentas por Pagar o, si son varias, con una Nómina de pago.',
    ],
  },
  {
    title: 'Cierre de mes: qué revisar antes de declarar',
    requires: 'hasAdvancedReports',
    steps: [
      'Verifica que no queden ventas en borrador del mes: si no están emitidas, no entran al F29.',
      'Registra todas las facturas de compra del mes (DTE recibidos te ayuda a no olvidar ninguna).',
      'Cuadra el RCV en Reportes & SII → Registro de Compras y Ventas con el archivo que bajas del SII.',
      'Cierra todos los turnos de caja del POS del mes con su arqueo.',
      'Concilia tus cuentas en Finanzas → Bancos y conciliación.',
      'Si tienes Contabilidad, revisa Contabilidad → Cuadraturas: todo debe cuadrar.',
      'Abre Reportes & SII → Formulario 29 y descarga el Excel del mes para tu contador.',
    ],
  },
  {
    title: 'Conciliar el banco una vez al mes',
    requires: 'hasTreasury',
    steps: [
      'Descarga la cartola del mes desde el portal de tu banco.',
      'En Finanzas → Bancos y conciliación abre la cuenta, presiona "Conciliar" y sube la cartola.',
      'Usa "Conciliar automáticamente" y resuelve lo pendiente: aceptar sugerencia, "Buscar en registros" o "Sin registro en libros".',
      'La cuadratura debe quedar en cero; si no, revisa el saldo inicial y la fecha desde la que concilias.',
    ],
  },
  {
    title: 'Remuneraciones del mes',
    requires: 'hasPayroll',
    steps: [
      'Antes de fin de mes, aprueba las vacaciones pendientes y registra anticipos y préstamos en la ficha de cada trabajador.',
      'En Personas & Equipo → Remuneraciones abre el período y confirma UF, UTM, topes y tasas contra previred.com.',
      'Ajusta días, horas extra, bonos y descuentos y presiona "Calcular liquidaciones".',
      'Revisa las liquidaciones, cuadra la "Planilla de cotizaciones" con Previred y descarga el libro de remuneraciones.',
      'Cierra el período: las liquidaciones quedan congeladas y visibles en el portal de cada trabajador.',
    ],
  },
  {
    title: 'Cuadrar el inventario cuando el stock no calza con la bodega',
    requires: 'hasInventory',
    steps: [
      'Abre una toma de inventario en Inventario → Toma de inventario para la bodega que te preocupa.',
      'Cuenta con el lector o a mano y revisa el filtro "Con diferencia".',
      'Para diferencias grandes, abre el Kardex del producto y busca el movimiento que descuadró (una venta sin descontar, una recepción duplicada).',
      'Contabiliza la toma: el stock se ajusta a lo contado y queda trazado en el Kardex y en Auditoría.',
    ],
  },
  {
    title: 'Reparar un equipo de punta a punta',
    requires: 'hasServiceDesk',
    steps: [
      'Recibe el equipo en Operaciones → Servicio técnico → "Recibir equipo" y entrega el comprobante con el enlace de seguimiento.',
      'Diagnostica, arma el presupuesto (repuestos y mano de obra) y envíalo al cliente: lo aprueba desde su enlace.',
      'Repara y márcalo "Listo para retiro" (el cliente lo ve en su enlace).',
      'Genera la nota de venta del cobro, emite la boleta o factura y entrega el equipo.',
    ],
  },
  {
    title: 'Fabricar un producto y conocer su costo real',
    requires: 'hasProduction',
    steps: [
      'Crea los insumos y el producto terminado en el Catálogo de Productos.',
      'Arma su receta en Operaciones → Recetas.',
      'Crea una orden en Operaciones → Producción, iníciala y, al terminar, registra el consumo real y la mano de obra.',
      'El producto entra a bodega con su costo unitario real y ya puedes venderlo con margen correcto.',
    ],
  },
  {
    title: 'Alguien nuevo entra al equipo (o alguien se va)',
    permission: 'settings:users',
    steps: [
      'Entra: en Configuración → Equipo & Colaboradores usa "+ Agregar Colaborador" con su correo y su rol.',
      'Si ningún rol base calza, crea un rol personalizado con los permisos exactos y asígnaselo.',
      'Se va: desactívalo en la misma pantalla. No lo elimines: sus documentos y su rastro en Auditoría deben seguir existiendo.',
      'Desactivar corta el acceso de inmediato, no cuando expire su sesión.',
    ],
  },
  {
    title: 'Montar un certamen de principio a fin',
    requires: 'hasEventProjects',
    steps: [
      'Crea el certamen en Certámenes & Eventos con su fecha de gala, recinto y presupuesto.',
      'Abre la convocatoria en Candidatas & Staff y comparte el enlace de postulación; avanza las fichas en el Tablero de casting y numera a las oficiales.',
      'Envía los contratos de imagen a firmar y controla los pendientes en Contratos firmados.',
      'Arma el tarifario de auspicios, registra los contratos y cumple sus entregables con evidencia.',
      'Publica el sitio del certamen y crea los afiches de campaña.',
      'Configura entradas y votación del público; cobra las cuotas de las candidatas con Cuotas & Mensualidades.',
      'Arma la escaleta, el vestuario, las credenciales y las rondas del jurado; usa el checklist "¿Listos para la gala?" del centro de mando.',
      'El día del evento: modo show, check-in de entradas y credenciales, votación del jurado y acta.',
      'Al final revisa las finanzas del certamen en su centro de mando.',
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
      'Son dos cosas distintas: el plan de tu empresa (qué módulos se contrataron) y tu rol (qué permisos te dieron).',
      'Si nadie de tu empresa lo ve, es el plan o la sección está apagada en Configuración → Módulos y Menú.',
      'Si otros lo ven y tú no, es tu rol: pide al administrador que lo revise en Configuración → Equipo & Colaboradores o en Roles Personalizados.',
    ],
  },
  {
    problem: 'El sistema no me deja vender porque no hay stock',
    requires: 'hasInventory',
    answer: [
      'Por defecto está bloqueado vender más de lo que hay en la bodega, para que el Kardex no quede negativo.',
      'Si el stock del sistema está mal, corrígelo con un ajuste o una toma de inventario, no forzando la venta.',
      'Si tu negocio vende contra pedido, el Dueño puede activar "Permitir ventas con stock negativo" en Configuración → Perfil de Empresa.',
    ],
  },
  {
    problem: 'Emití un documento con un error',
    requires: 'hasDteBilling',
    answer: [
      'Si todavía está en borrador, edítalo y emítelo.',
      'Si ya está emitido y no se envió al SII, usa "Anular" en el listado de Ventas: repone stock y revierte pagos.',
      'Si es una boleta de un turno de caja ya cerrado, no se puede anular: emite una Nota de Crédito que la referencie.',
      'Después emite el documento correcto (con "Duplicar" ahorras tipear de nuevo).',
    ],
  },
  {
    problem: 'Mis documentos salen sin validez tributaria o con folio interno',
    requires: 'hasDteBilling',
    answer: [
      'Sin un CAF vigente, el sistema numera con un contador interno y el documento no tiene validez ante el SII.',
      'Carga los folios en Configuración → Folios del SII (descárgalos en sii.cl → Timbraje Electrónico) antes de seguir emitiendo.',
    ],
  },
  {
    problem: 'Los números del F29 no me cuadran',
    requires: 'hasAdvancedReports',
    answer: [
      'Revisa que todas las ventas del período estén emitidas y no en borrador.',
      'Revisa que estén registradas todas las facturas de compra del mes: son tu crédito fiscal. El RCV te muestra las que faltan.',
      'El remanente de crédito fiscal del mes anterior se arrastra al siguiente: un mes puede salir en cero por eso.',
      'Si un producto afecto quedó marcado exento en el catálogo, el débito sale bajo.',
    ],
  },
  {
    problem: 'El costo de un producto cambió solo',
    requires: 'hasInventory',
    answer: [
      'Es el Precio Medio Ponderado (PMP): al recibir una compra, el costo se recalcula como promedio entre lo que tenías y lo que entró.',
      'Si el costo saltó a un valor raro, revisa el Kardex: casi siempre es una compra con la cantidad o el precio mal ingresados.',
    ],
  },
  {
    problem: 'La caja del POS no cuadra al cerrar el turno',
    requires: 'hasPos',
    answer: [
      'El arqueo compara el efectivo esperado con lo contado. Débito, crédito y transferencias no cuentan para el cajón.',
      'Revisa las boletas anuladas (ya están descontadas: no registres además un retiro) y los pagos con el medio equivocado.',
      'Cierra igual el turno con la diferencia explicada: dejarlo abierto descuadra el día siguiente.',
    ],
  },
  {
    problem: 'No puedo cerrar la caja',
    requires: 'hasPos',
    answer: ['Cerrar caja requiere el permiso de cierre (por defecto Dueño y Administrador). Avisa a quien lo tenga para hacer el arqueo.'],
  },
  {
    problem: 'Una compra quedó "Pendiente de aprobación" o "No coincide con OC"',
    requires: 'hasPurchases',
    answer: [
      'Pendiente de aprobación: supera el umbral definido en Perfil de Empresa; alguien con permiso de aprobar compras debe aprobarla.',
      'No coincide con OC: la factura difiere de su orden de compra; corrígela o pide a quien tenga el permiso que autorice la diferencia. Mientras tanto no se puede pagar.',
    ],
  },
  {
    problem: 'Un cliente no recibe los recordatorios de cobranza',
    requires: 'hasTreasury',
    answer: [
      'Revisa que tenga correo en su ficha de Clientes & Proveedores.',
      'Revisa que los recordatorios estén activados en Finanzas → Cobranza y que ese cliente no los tenga pausados.',
      'Cada documento recibe cada aviso una sola vez.',
    ],
  },
  {
    problem: 'La conciliación bancaria no cuadra',
    requires: 'hasTreasury',
    answer: [
      'Revisa el saldo inicial y la fecha "Conciliar desde" de la cuenta.',
      'Revisa los movimientos "Sin registro en libros" y los cobros registrados en otra cuenta bancaria.',
    ],
  },
  {
    problem: 'No puedo publicar un sitio web',
    requires: 'hasWebSites',
    answer: [
      'Abre la pestaña "Qué le falta": los ítems obligatorios (portada con título, forma de contacto, enlaces válidos, textos de ejemplo reemplazados) bloquean la publicación.',
      'Publicar requiere el permiso de publicar sitios (Dueño o Administrador).',
    ],
  },
  {
    problem: 'Un jurado no puede votar',
    requires: 'hasJudging',
    answer: [
      'La ronda debe estar abierta con "Votar ahora" y tener al menos un criterio.',
      'Revisa que el jurado use su propio enlace (botón "Link") y que su planilla no esté ya enviada: una vez enviada queda bloqueada.',
    ],
  },
  {
    problem: 'Olvidé mi contraseña o no puedo entrar',
    answer: [
      'Usa "¿La olvidaste?" en la pantalla de inicio de sesión.',
      'Si tienes 2FA y perdiste el teléfono, usa uno de tus códigos de respaldo.',
      'Si tu usuario fue desactivado, tiene que reactivarte el administrador de tu empresa.',
    ],
  },
  {
    problem: 'Cargué un archivo por importación y quedó mal',
    permission: 'import:data',
    answer: [
      'La importación muestra una vista previa antes de guardar: si algo se ve mal ahí, no confirmes y corrige el archivo.',
      'Si ya confirmaste, corrige los registros en su propia pantalla, o con un ajuste de inventario si fue stock.',
      'Para tandas grandes, prueba primero con un archivo chico.',
    ],
  },
];

export interface GlossaryTerm {
  term: string;
  definition: string;
}

/** Vocabulario tributario y del sistema que el asistente puede explicar sin inventar. */
export const GLOSSARY: GlossaryTerm[] = [
  { term: 'IVA', definition: 'Impuesto al Valor Agregado, 19% en Chile, sobre el monto neto de las líneas afectas. Los productos marcados como exentos no lo pagan.' },
  { term: 'Neto / Bruto', definition: 'El neto es el monto sin IVA; el bruto es el neto más el IVA. Los montos finales se manejan en pesos enteros.' },
  { term: 'Débito fiscal', definition: 'El IVA que recaudaste en tus ventas del período y le debes al SII.' },
  { term: 'Crédito fiscal', definition: 'El IVA que pagaste en tus compras del período y puedes descontar del débito.' },
  { term: 'Remanente de crédito fiscal', definition: 'Cuando el crédito del mes supera al débito, la diferencia queda como remanente y se arrastra al mes siguiente.' },
  { term: 'F29', definition: 'Formulario mensual del SII donde se declara el IVA y el PPM. El sistema lo calcula sobre tus documentos reales como apoyo; la declaración la hace tu contador.' },
  { term: 'PPM', definition: 'Pago Provisional Mensual: anticipo del impuesto a la renta, un porcentaje de tus ventas netas. La tasa se configura en el Perfil de Empresa.' },
  { term: 'RCV', definition: 'Registro de Compras y Ventas: el libro que el SII arma con los documentos electrónicos informados. Se cuadra con el ERP antes de declarar.' },
  { term: 'DTE', definition: 'Documento Tributario Electrónico: boleta (39), factura afecta (33), factura exenta (34), guía de despacho (52), nota de débito (56) y nota de crédito (61).' },
  { term: 'Folio', definition: 'Número correlativo de cada documento tributario. No se reutiliza ni se salta: un documento emitido se corrige con nota de crédito, no borrándolo.' },
  { term: 'CAF', definition: 'Código de Autorización de Folios: archivo del SII que autoriza un rango de folios para un tipo de documento y trae la llave con que se timbra.' },
  { term: 'Timbre electrónico (TED)', definition: 'Firma que va en cada documento emitido con CAF; permite verificar que no fue alterado.' },
  { term: 'Cotización', definition: 'Propuesta de precio al cliente. No es un documento tributario: no usa folio ni mueve stock.' },
  { term: 'Nota de venta', definition: 'Pedido del cliente que reserva stock y se factura o despacha por partes.' },
  { term: 'Guía de despacho', definition: 'Documento que acompaña la mercadería que sale; mueve stock y después se factura.' },
  { term: 'Nota de crédito', definition: 'Documento que anula o rebaja, total o parcialmente, uno emitido antes.' },
  { term: 'PMP', definition: 'Precio Medio Ponderado: el costo unitario de un producto, recalculado en cada compra como promedio entre el stock que tenías y lo que entró.' },
  { term: 'Kardex', definition: 'Historial de movimientos de un producto: cada entrada, salida, ajuste y transferencia, con cantidad, costo y documento de origen.' },
  { term: 'Stock valorizado', definition: 'La cantidad en bodega multiplicada por su costo PMP vigente: el valor contable del inventario.' },
  { term: 'Lote / FEFO', definition: 'Un lote agrupa unidades con la misma fecha de vencimiento. FEFO ("primero en vencer, primero en salir") es la regla con que se despachan.' },
  { term: 'Boleta de honorarios', definition: 'Documento de un profesional independiente por sus servicios, con una retención de impuesto calculada con la tasa de tu empresa.' },
  { term: 'Cuenta por cobrar (CxC)', definition: 'Lo que un cliente te debe por un documento a crédito todavía no pagado del todo.' },
  { term: 'Cuenta por pagar (CxP)', definition: 'Lo que le debes a un proveedor por una factura todavía no pagada del todo.' },
  { term: 'Conciliación bancaria', definition: 'Comparar la cartola del banco con tus cobros y pagos registrados para que ambos saldos calcen.' },
  { term: 'Nómina de pago', definition: 'Lote de facturas de proveedores que se pagan juntas con un archivo para el portal del banco.' },
  { term: 'Arqueo de caja', definition: 'Conteo del efectivo al cerrar un turno del POS, comparado contra lo esperado, dejando la diferencia declarada.' },
  { term: 'Liquidación de sueldo', definition: 'Detalle mensual del sueldo de un trabajador: haberes, descuentos previsionales, impuesto único y líquido a pagar.' },
  { term: 'Previred', definition: 'Plataforma donde se pagan las cotizaciones previsionales y que publica cada mes los indicadores (UF, UTM, topes y tasas) que usa el cálculo de sueldos.' },
  { term: 'UF / UTM', definition: 'Unidades reajustables chilenas. Se usan para topes previsionales, planes de salud y tramos del impuesto único; su valor se confirma cada mes.' },
  { term: 'Finiquito', definition: 'Documento que cierra la relación laboral con el cálculo de lo que se le debe al trabajador al término del contrato.' },
  { term: 'NPS / CSAT', definition: 'Indicadores de satisfacción: CSAT mide qué tan conforme quedó el cliente (1 a 5) y NPS cuánto te recomendaría (0 a 10).' },
  { term: 'RFM', definition: 'Segmentación de clientes por Recencia (cuándo compró), Frecuencia (cuántas veces) y Monto (cuánto).' },
  { term: 'Canje', definition: 'Aporte de un auspiciador en productos o servicios en vez de dinero; se valoriza y se reporta aparte del efectivo.' },
];

/** Flujos cuyos módulos están todos contratados y a los que el usuario tiene acceso. */
export function getVisibleWorkflows(features: CompanyFeatureFlags, permissions: readonly Permission[]): Workflow[] {
  return WORKFLOWS.filter(
    (workflow) => isAvailable(workflow, features, permissions) && (workflow.alsoRequires ?? []).every((key) => features[key])
  );
}

/** Problemas frecuentes aplicables al plan y al rol de este usuario. */
export function getVisibleTroubleshooting(features: CompanyFeatureFlags, permissions: readonly Permission[]): TroubleshootingItem[] {
  return TROUBLESHOOTING.filter((item) => isAvailable(item, features, permissions));
}

/**
 * Los flujos, los problemas frecuentes y el glosario, con la forma de una
 * sección del manual, para mostrarlos en `/dashboard/manual` y en el Word con
 * el mismo buscador e impresión que el resto. Sin `permissions` (manual de
 * la empresa) se filtran solo por módulos contratados.
 */
export function getKnowledgeAsManualSections(features: CompanyFeatureFlags, permissions?: readonly Permission[]): ManualSection[] {
  const effectivePermissions = permissions ?? ALL_PERMISSIONS;
  const sections: ManualSection[] = [];

  const workflows = getVisibleWorkflows(features, effectivePermissions);
  if (workflows.length > 0) {
    sections.push({
      id: 'flujos',
      key: 'always',
      chapter: 'Referencia',
      title: 'Flujos completos (de principio a fin)',
      summary: 'Las tareas reales casi siempre cruzan varios módulos. Aquí están en orden, de punta a punta.',
      route: '/dashboard',
      screenshot: null,
      topics: workflows.map((workflow, index) => ({ id: `flujo-${index}`, title: workflow.title, steps: workflow.steps })),
    });
  }

  const troubleshooting = getVisibleTroubleshooting(features, effectivePermissions);
  if (troubleshooting.length > 0) {
    sections.push({
      id: 'problemas-frecuentes',
      key: 'always',
      chapter: 'Referencia',
      title: 'Problemas frecuentes',
      summary: 'Cuando el sistema "no te deja", casi siempre es una regla de negocio que te protege. Aquí está la causa y qué hacer.',
      route: '/dashboard',
      screenshot: null,
      topics: troubleshooting.map((item, index) => ({ id: `problema-${index}`, title: item.problem, steps: item.answer })),
    });
  }

  sections.push({
    id: 'glosario',
    key: 'always',
    chapter: 'Referencia',
    title: 'Glosario',
    summary: 'Los términos tributarios y del sistema explicados en simple.',
    route: '/dashboard',
    screenshot: null,
    topics: [{ id: 'glosario', title: 'Qué significa cada término', steps: GLOSSARY.map((entry) => `${entry.term}: ${entry.definition}`) }],
  });

  return sections;
}
