import type { Role } from '@prisma/client';

/**
 * Catálogo de permisos: datos puros, sin dependencias de servidor.
 *
 * Lo importan tanto Server Actions como componentes de cliente (constructor de
 * roles, panel de módulos), así que aquí no puede entrar Prisma ni
 * `next/headers`. La escritura de auditoría vive en `./audit`.
 */

const ALL_ROLES: Role[] = ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'];

/**
 * Matriz de permisos por rol. Fuente única de verdad para las restricciones
 * de acceso de cada Server Action y de la visibilidad condicional en la UI.
 */
export const PERMISSIONS = {
  'contacts:read': ALL_ROLES,
  'contacts:write': ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE'],

  'sales:read': ['OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT'],
  'sales:write': ['OWNER', 'ADMIN', 'SALES'],
  'sales:cancel': ['OWNER', 'ADMIN'],

  // Cargar un CAF habilita un rango de folios autorizados por el SII y trae
  // consigo la llave privada que timbra los documentos de ese rango. Es una
  // acción tributaria, no comercial: queda fuera de SALES a propósito, aunque
  // SALES sí pueda emitir documentos que consuman esos folios.
  'dte:manage_caf': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  'purchases:read': ['OWNER', 'ADMIN', 'WAREHOUSE', 'ACCOUNTANT'],
  'purchases:write': ['OWNER', 'ADMIN', 'WAREHOUSE'],
  'purchases:cancel': ['OWNER', 'ADMIN'],
  // Aprobar una compra que superó el umbral configurado: nivel gerencial,
  // fuera a propósito de WAREHOUSE aunque tenga purchases:write.
  'purchases:approve': ['OWNER', 'ADMIN'],
  // Crear/enviar/anular Órdenes de Compra y registrar Recepciones de
  // Mercadería: mismo nivel que purchases:write, es la misma operación de
  // bodega/compras solo que en dos pasos en vez de uno.
  'purchases:orders': ['OWNER', 'ADMIN', 'WAREHOUSE'],
  // Forzar el pago de una factura que no cuadra con su Orden de Compra
  // (matching de 3 vías): nivel gerencial, igual que purchases:approve.
  'purchases:override_match': ['OWNER', 'ADMIN'],

  'products:read': ALL_ROLES,
  'products:write': ['OWNER', 'ADMIN', 'WAREHOUSE'],
  'products:costs': ['OWNER', 'ADMIN', 'WAREHOUSE', 'ACCOUNTANT'],

  'inventory:write': ['OWNER', 'ADMIN', 'WAREHOUSE'],

  'pos:operate': ['OWNER', 'ADMIN', 'SALES'],
  // Cerrar la caja es el control sobre el propio cajero: quien vende no debería
  // ser quien declara cuánto había. Por defecto queda fuera de SALES.
  'pos:close': ['OWNER', 'ADMIN'],

  'treasury:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'treasury:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  'reports:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  'settings:company': ['OWNER', 'ADMIN'],
  // Descargar el respaldo completo de la empresa. Separado de
  // `settings:company` a propósito: editar la razón social y llevarse TODO el
  // dato del tenant en un archivo (incluidos RUT y contacto de candidatas) no
  // son el mismo nivel de riesgo. Mismo criterio que `candidates:sensitive`.
  'company:export': ['OWNER', 'ADMIN'],
  // Una regla de automatización puede enviar correos a nombre de la empresa y
  // llamar webhooks externos con datos del negocio — mismo nivel de riesgo
  // que administrar el token saliente de n8n, así que mismo criterio de
  // acceso que `settings:company`.
  'automation:manage': ['OWNER', 'ADMIN'],
  'settings:users': ['OWNER', 'ADMIN'],
  'audit:read': ['OWNER', 'ADMIN'],
  // La importación masiva crea productos y contactos de golpe: es una operación
  // de administrador, no algo que deba poder disparar un vendedor.
  'import:data': ['OWNER', 'ADMIN'],

  'accounting:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'accounting:post': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'accounting:manual_entry': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  // Cerrar un período exige revisar cuadraturas y es difícil de deshacer:
  // ADMIN queda fuera a propósito, solo Dueño y Contador lo tienen.
  'accounting:close_period': ['OWNER', 'ACCOUNTANT'],
  'accounting:manage_accounts': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'reports:financial': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  // Inteligencia de Negocio (Agentes): ver el panel de recomendaciones y
  // marcarlas como revisadas/descartadas es nivel gerencial a propósito
  // (cruza ventas, márgenes, tesorería e inventario de toda la empresa) —
  // mismo criterio que purchases:approve, fuera de SALES/ACCOUNTANT/WAREHOUSE.
  'agents:view': ['OWNER', 'ADMIN'],
  'agents:approve': ['OWNER', 'ADMIN'],

  // Producción de Eventos (franquicias de certámenes): Proyectos y Auspicios
  // los opera el equipo comercial/producción, igual criterio que sales:write.
  'projects:read': ['OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT'],
  'projects:write': ['OWNER', 'ADMIN', 'SALES'],
  'sponsorships:read': ['OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT'],
  'sponsorships:write': ['OWNER', 'ADMIN', 'SALES'],
  // Boletas de Honorarios son documentos tributarios con retención: nivel
  // administración/contabilidad, fuera de SALES a propósito (mismo criterio
  // que accounting:*).
  'fees:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'fees:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  // Candidatas: dato sensible (RUT, fecha de nacimiento, contacto de
  // emergencia) — restringido a OWNER/ADMIN a propósito, más estricto que el
  // resto del sistema. Una empresa que quiera dar acceso a su equipo de
  // casting sin volverlo ADMIN completo puede crear un CustomRole con estos
  // dos permisos sueltos.
  'candidates:read': ['OWNER', 'ADMIN'],
  'candidates:write': ['OWNER', 'ADMIN'],
  // Datos de contacto (RUT, dirección, teléfono, email) y fotografías de la
  // postulación pública: permiso DISTINTO de `candidates:read` (Sección 6 —
  // "acceso a datos de contacto y fotografías debe requerir un permiso
  // distinto del de solo lectura del listado"), no necesariamente más
  // restrictivo entre los roles base. Se mantiene en OWNER+ADMIN (igual que
  // `candidates:write`, del que ya dependen el envío de contratos de imagen
  // y el resto de la ficha) para no quitarle a ADMIN una capacidad que ya
  // tenía; el valor de tener un permiso separado es para un `CustomRole` que
  // reciba solo `candidates:read` (ej. un equipo de casting externo) y por
  // eso NO vea RUT/contacto/fotos, no para restringir a ADMIN.
  'candidates:sensitive': ['OWNER', 'ADMIN'],
  'production:read': ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE'],
  'production:write': ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE'],
  // Diseño de credencial (fondo, colores, marca de agua): a diferencia de
  // production:write, restringido a OWNER/ADMIN — es branding/identidad
  // visual de la empresa, no una tarea operativa del día del evento.
  'production:design': ['OWNER', 'ADMIN'],
  'judging:read': ['OWNER', 'ADMIN'],
  'judging:write': ['OWNER', 'ADMIN'],

  // Organigrama: ver la estructura de la empresa no es dato sensible (sin
  // RUT/sueldo) — a diferencia de candidatas, no hay razón para restringirlo.
  'orgchart:read': ALL_ROLES,
  // Asignar cargo/jefe de OTRA persona y aplicar la sugerencia de IA es nivel
  // gerencial, mismo criterio que settings:users.
  'orgchart:write': ['OWNER', 'ADMIN'],
  // Generar la sugerencia (consume cuota de Gemini) separado de :write a
  // propósito: son acciones distintas (proponer vs. aplicar), mismo criterio
  // que agents:view / agents:approve.
  'orgchart:ai': ['OWNER', 'ADMIN'],

  // Presupuestos, pagarés y cuotas: dato financiero, mismo criterio que
  // treasury:* — fuera de SALES/WAREHOUSE.
  'budgets:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'budgets:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'promissorynotes:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'promissorynotes:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'paymentplans:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'paymentplans:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  // Entradas y votación: venta/atención de público, mismo criterio que
  // sales:*/production:* — el equipo comercial/producción también opera esto,
  // no solo administración.
  'ticketing:read': ['OWNER', 'ADMIN', 'SALES'],
  'ticketing:write': ['OWNER', 'ADMIN', 'SALES'],
  'publicvoting:read': ['OWNER', 'ADMIN', 'SALES'],
  'publicvoting:write': ['OWNER', 'ADMIN', 'SALES'],

  // Centro de Inteligencia 360: cruza ventas, márgenes, caja, cartera y
  // cumplimiento tributario de TODA la empresa — mismo criterio que
  // `reports:financial` (dirección y contabilidad), fuera de SALES/WAREHOUSE.
  'intelligence:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  // CRM comercial: lo opera el equipo de ventas, mismo criterio que sales:*.
  'crm:read': ['OWNER', 'ADMIN', 'SALES'],
  'crm:write': ['OWNER', 'ADMIN', 'SALES'],

  // Remuneraciones: sueldos, RUT, AFP, Isapre y cuentas bancarias del equipo
  // son el dato más sensible de la empresa — solo dirección y contabilidad.
  'payroll:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'payroll:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  // Cerrar un mes congela las liquidaciones (no se recalculan más): mismo
  // criterio de separación que `accounting:close_period`.
  'payroll:close': ['OWNER', 'ACCOUNTANT'],
  // Aprobar vacaciones/permisos es decisión de jefatura, no de contabilidad.
  'leave:approve': ['OWNER', 'ADMIN'],

  // Activo fijo: registro contable/tributario, mismo criterio que accounting:*.
  'assets:read': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'assets:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  // Rendición de gastos: cualquiera rinde lo suyo; aprobar es jefatura y
  // reembolsar es tesorería. Quien rinde nunca debería aprobar su propia
  // rendición — el servicio lo bloquea aunque tenga ambos permisos.
  'expenses:submit': ALL_ROLES,
  'expenses:approve': ['OWNER', 'ADMIN'],
  'expenses:reimburse': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  // Contratos recurrentes: los arma el equipo comercial (mismo criterio que
  // sales:write); contabilidad los ve para anticipar la facturación del mes.
  'contracts:read': ['OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT'],
  'contracts:write': ['OWNER', 'ADMIN', 'SALES'],

  // Control de horas: todo el equipo registra las suyas; ver las de todos,
  // editarlas y convertirlas en factura es de jefatura.
  'timesheets:log': ALL_ROLES,
  'timesheets:manage': ['OWNER', 'ADMIN'],

  // Conciliación bancaria: crea y enlaza movimientos de Tesorería, mismo
  // criterio que treasury:write.
  'bank:reconcile': ['OWNER', 'ADMIN', 'ACCOUNTANT'],

  // Llaves de la API pública: dan acceso programático a datos de la empresa,
  // mismo nivel de riesgo que `automation:manage`.
  'api:manage': ['OWNER', 'ADMIN'],

  // Mensajería interna: entorno de productividad transversal, no un módulo
  // vertical del negocio — todo el equipo puede usarla, mismo criterio que
  // contacts:read.
  'messaging:use': ALL_ROLES,
  // Acceso a WhatsApp Web personal (ventana popup) desde el header — mismo
  // criterio que otras acciones sensibles de administración (sales:cancel,
  // purchases:approve): solo OWNER/ADMIN, nunca por chequeo de rol crudo en
  // el componente (así un CustomRole equivalente también puede verlo).
  'messaging:whatsapp_personal': ['OWNER', 'ADMIN'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

export function checkPermission(userRole: Role, requiredPermission: Permission): boolean {
  return (PERMISSIONS[requiredPermission] as Role[]).includes(userRole);
}

export function rolesWithPermission(permission: Permission): Role[] {
  return PERMISSIONS[permission] as Role[];
}

/** Permisos que otorga un rol base, derivados de la misma matriz. */
export function permissionsForRole(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((permission) => checkPermission(role, permission));
}

/**
 * Etiquetas en lenguaje de negocio para el constructor de roles personalizados.
 * El dueño de la empresa marca casillas, no claves técnicas.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'contacts:read': 'Ver clientes y proveedores',
  'contacts:write': 'Crear y editar clientes y proveedores',
  'sales:read': 'Ver ventas y documentos emitidos',
  'sales:write': 'Crear ventas y cotizaciones',
  'sales:cancel': 'Anular facturas emitidas',
  'dte:manage_caf': 'Cargar y administrar folios autorizados del SII (CAF)',
  'purchases:read': 'Ver compras y facturas de proveedor',
  'purchases:write': 'Registrar compras y recepción de mercadería',
  'purchases:cancel': 'Anular compras',
  'purchases:approve': 'Aprobar compras que superan el límite configurado',
  'purchases:orders': 'Crear órdenes de compra y registrar recepción de mercadería',
  'purchases:override_match': 'Forzar pago de facturas que no cuadran con su orden de compra',
  'products:read': 'Ver catálogo de productos',
  'products:write': 'Crear y editar productos',
  'products:costs': 'Ver costos de compra y PMP',
  'inventory:write': 'Ajustar stock en bodega',
  'pos:operate': 'Vender en el Punto de Venta y abrir caja',
  'pos:close': 'Cerrar caja y hacer el arqueo',
  'treasury:read': 'Ver cuentas por cobrar y pagar',
  'treasury:write': 'Registrar pagos y cobranzas',
  'reports:read': 'Descargar reportes y libro Excel',
  'settings:company': 'Editar datos de la empresa',
  'company:export': 'Descargar el respaldo completo de la empresa',
  'automation:manage': 'Crear y administrar reglas de automatización (flujos de trabajo)',
  'settings:users': 'Gestionar equipo y roles',
  'audit:read': 'Ver bitácora de auditoría',
  'import:data': 'Importación masiva: productos, clientes, stock inicial y documentos históricos (Excel o fotos con IA)',
  'accounting:view': 'Ver plan de cuentas, asientos y libro mayor',
  'accounting:post': 'Contabilizar asientos generados por documentos',
  'accounting:manual_entry': 'Crear asientos contables manuales',
  'accounting:close_period': 'Cerrar y reabrir períodos contables',
  'accounting:manage_accounts': 'Editar el plan de cuentas y sus mapeos',
  'reports:financial': 'Ver estados financieros y ratios',
  'agents:view': 'Ver el panel de agentes de inteligencia de negocio y sus recomendaciones',
  'agents:approve': 'Marcar como revisadas o descartar las recomendaciones de los agentes',
  'projects:read': 'Ver proyectos/eventos y su rentabilidad',
  'projects:write': 'Crear y editar proyectos/eventos',
  'sponsorships:read': 'Ver contratos de auspicio y su checklist de entregables',
  'sponsorships:write': 'Crear y editar contratos de auspicio y su checklist',
  'fees:read': 'Ver boletas de honorarios de staff freelance',
  'fees:write': 'Registrar boletas de honorarios y marcarlas como pagadas',
  'candidates:read': 'Ver fichas de candidatas y staff',
  'candidates:write': 'Crear y editar fichas de candidatas y staff',
  'candidates:sensitive': 'Ver datos de contacto, fotografías y certificados médicos de postulaciones',
  'production:read': 'Ver acreditaciones de staff y proveedores',
  'production:write': 'Acreditar staff y proveedores y validar accesos',
  'production:design': 'Personalizar el diseño (fondo, colores, marca de agua) de las credenciales',
  'judging:read': 'Ver categorías de evaluación y resultados de escrutinio',
  'judging:write': 'Configurar categorías, jurados y exportar el acta de escrutinio',
  'orgchart:read': 'Ver el organigrama de la empresa',
  'orgchart:write': 'Asignar cargos y jefes, y aplicar sugerencias de IA',
  'orgchart:ai': 'Generar una sugerencia de organigrama con IA',
  'budgets:read': 'Ver presupuestos y su avance real vs. planificado',
  'budgets:write': 'Crear y editar presupuestos y sus líneas por categoría',
  'promissorynotes:read': 'Ver pagarés registrados',
  'promissorynotes:write': 'Registrar pagarés y sus pagos',
  'paymentplans:read': 'Ver planes de cuotas/mensualidades',
  'paymentplans:write': 'Crear planes de cuotas y registrar pagos de cuotas',
  'ticketing:read': 'Ver ventas de entradas de la gala',
  'ticketing:write': 'Configurar tipos de entrada, confirmar pagos y hacer control de acceso',
  'publicvoting:read': 'Ver órdenes y ranking de votación pagada',
  'publicvoting:write': 'Confirmar pagos de votación pagada',
  'intelligence:view': 'Ver el Centro de Inteligencia 360 (salud de la empresa, proyecciones y flujos)',
  'crm:read': 'Ver oportunidades y actividades del CRM',
  'crm:write': 'Crear oportunidades, moverlas de etapa y registrar actividades',
  'payroll:read': 'Ver trabajadores, sueldos y liquidaciones',
  'payroll:write': 'Crear trabajadores y calcular liquidaciones',
  'payroll:close': 'Cerrar el mes de remuneraciones',
  'leave:approve': 'Aprobar o rechazar vacaciones y permisos',
  'assets:read': 'Ver el registro de activo fijo y su depreciación',
  'assets:write': 'Registrar, editar y dar de baja activos fijos',
  'expenses:submit': 'Rendir gastos propios',
  'expenses:approve': 'Aprobar o rechazar rendiciones de gastos del equipo',
  'expenses:reimburse': 'Registrar el reembolso de rendiciones aprobadas',
  'contracts:read': 'Ver contratos de servicio y su facturación recurrente',
  'contracts:write': 'Crear, pausar y editar contratos de servicio recurrentes',
  'timesheets:log': 'Registrar sus propias horas trabajadas',
  'timesheets:manage': 'Ver y corregir las horas de todo el equipo y facturarlas',
  'bank:reconcile': 'Importar cartolas bancarias y conciliar movimientos',
  'api:manage': 'Crear y revocar llaves de la API pública',
  'messaging:use': 'Usar la mensajería interna de la empresa',
  'messaging:whatsapp_personal': 'Abrir WhatsApp Web personal desde el header del ERP',
};

/**
 * Permisos transversales al plan: no dependen de ningún módulo contratado y por
 * eso no aparecen en el registro de `modules.ts`.
 */
export const CORE_PERMISSION_GROUP = {
  label: 'General',
  permissions: [
    'contacts:read',
    'contacts:write',
    'settings:company',
    'company:export',
    'automation:manage',
    'settings:users',
    'audit:read',
    'import:data',
    'messaging:use',
    'messaging:whatsapp_personal',
  ] as Permission[],
};

