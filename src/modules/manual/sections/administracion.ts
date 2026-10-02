import type { ManualSection } from '../types';

/** Reportes tributarios, contabilidad y la configuración de la empresa. */
export const ADMINISTRACION_SECTIONS: ManualSection[] = [
  {
    id: 'reportes-f29',
    key: 'hasAdvancedReports',
    permission: 'reports:read',
    chapter: 'Reportes & SII',
    title: 'Reportes Excel y Formulario 29',
    summary:
      'El libro de ventas y compras, el Kardex valorizado y los márgenes en un Excel con fórmulas, y el F29 del mes calculado sobre tus documentos reales: lo que tu contador necesita para declarar.',
    route: '/dashboard/reports',
    topics: [
      {
        id: 'libro-excel',
        title: 'Descargar el Excel del período',
        steps: [
          'Ve a Reportes & SII → Reportes Excel.',
          'Elige el período con "Desde" y "Hasta" o con los atajos (Mes en curso, Mes anterior, Últimos 3 meses, Año en curso).',
          'Presiona "Descargar .xlsx". Trae las hojas Panel, Productos, Inventario, Kardex, Ventas, Ventas detalle, Compras, Compras detalle y Pagos.',
          'El catálogo y el stock salen completos al día de hoy; ventas, compras, pagos y movimientos se filtran por el período.',
        ],
      },
      {
        id: 'pantalla-f29',
        title: 'Revisar el F29 del mes',
        route: '/dashboard/reports/f29',
        steps: [
          'Ve a Reportes & SII → Formulario 29 (F29) y elige mes y año.',
          'Verás ventas netas, débito fiscal, crédito fiscal, remanente del mes anterior y para el próximo, PPM, retención de honorarios e impuesto determinado. Cada línea explica qué significa.',
          'Es una estimación sobre tus documentos emitidos y recibidos: la declaración formal ante el SII la presenta tu contador.',
        ],
        tip: 'Si un número no cuadra: revisa que no haya ventas en borrador, que estén registradas todas las compras del mes y que los productos exentos estén bien marcados en el catálogo.',
      },
    ],
  },
  {
    id: 'rcv',
    key: 'hasAdvancedReports',
    permission: 'reports:read',
    chapter: 'Reportes & SII',
    title: 'Registro de Compras y Ventas (RCV)',
    summary: 'Cuadra el RCV que arma el SII con tus documentos del mes antes de declarar: facturas de proveedores que faltan registrar, montos distintos y documentos que el SII no tiene.',
    route: '/dashboard/reports/rcv',
    topics: [
      {
        id: 'cuadrar-rcv',
        title: 'Cuadrar el RCV del mes',
        steps: [
          'En sii.cl → Servicios online → Factura electrónica → Registro de Compras y Ventas, elige el período, entra a Compras (o Ventas) y usa "Descargar detalles".',
          'En Reportes & SII → Registro de Compras y Ventas elige el período y el registro (Compras o Ventas) y presiona "Importar RCV del SII" para subir ese CSV.',
          'Revisa los tres grupos: "Están en el SII y no en el ERP", "Montos distintos" y "Están en el ERP y no en el SII".',
          'Para una compra que falta, usa "Crear borrador de compra" o "Registrar desde la bandeja" (DTE recibidos) y emítela.',
        ],
        tip: 'Las boletas no se cruzan por folio: el SII las informa agregadas en el resumen del RCV.',
      },
    ],
  },
  {
    id: 'contabilidad',
    key: 'hasAccounting',
    anyOfPermissions: ['reports:financial', 'accounting:view'],
    chapter: 'Contabilidad',
    title: 'Contabilidad',
    summary:
      'Asientos automáticos desde ventas, compras, pagos, inventario y cierres de caja, con Libro Diario, Libro Mayor, Balance de Comprobación, Cuadraturas y Estados Financieros. No necesitas digitar asientos: se generan solos.',
    route: '/dashboard/financial-statements',
    topics: [
      {
        id: 'activar-contabilidad',
        title: 'Cómo funciona la contabilidad automática',
        steps: [
          'Al activar el módulo se crea el plan de cuentas base. Desde ese momento cada venta, compra, pago, ajuste de stock y cierre de caja genera su asiento.',
          'Si ves el aviso "Falta el plan de cuentas", el Dueño o el Contador lo crea con un clic desde ese mismo aviso.',
          'Los documentos anteriores a la activación no tienen asiento: pide a soporte cargarlos si necesitas estados financieros completos del año.',
        ],
      },
      {
        id: 'estados-financieros',
        title: 'Ver los estados financieros',
        permission: 'reports:financial',
        steps: [
          'Ve a Contabilidad → Estados Financieros y elige el período.',
          'Cambia entre Balance General (activo, pasivo y patrimonio), Estado de Resultados (resultado bruto y del período) y Flujo de Efectivo (caja inicial, variación y final).',
        ],
      },
      {
        id: 'libro-diario',
        title: 'Revisar el Libro Diario',
        permission: 'accounting:view',
        route: '/dashboard/accounting/journal',
        steps: [
          'Ve a Contabilidad → Libro Diario y elige el período.',
          'Verás todos los asientos en orden cronológico, con su glosa, debe y haber. "Ver documento" abre la venta, compra o pago que lo originó.',
        ],
      },
      {
        id: 'libro-mayor',
        title: 'Revisar el Libro Mayor de una cuenta',
        permission: 'accounting:view',
        route: '/dashboard/accounting/ledger',
        steps: [
          'Ve a Contabilidad → Libro Mayor y elige la cuenta y el período.',
          'Verás sus movimientos con el saldo acumulado desde el saldo al inicio del período (D = saldo deudor, A = saldo acreedor). "Ver" abre el asiento.',
        ],
      },
      {
        id: 'balance-comprobacion',
        title: 'Balance de Comprobación (8 columnas)',
        permission: 'accounting:view',
        route: '/dashboard/accounting/trial-balance',
        steps: [
          'Ve a Contabilidad → Balance de Comprobación y elige el período.',
          'Muestra el balance acumulado al cierre con sumas, saldos, inventario y resultados: es el que pide tu contador para el balance tributario.',
        ],
      },
      {
        id: 'cuadraturas',
        title: 'Cuadraturas: comprobar que la contabilidad calza con la operación',
        permission: 'accounting:view',
        route: '/dashboard/accounting/reconciliation',
        steps: [
          'Ve a Contabilidad → Cuadraturas: compara cada saldo del mayor (existencias, clientes, proveedores, IVA, caja) con su fuente operativa.',
          'Si todo cuadra lo dice en verde. Si alguna no cuadra, hay un error real en uno de los dos lados: revisa los asientos del período en el Libro Diario.',
          'Incluye el F29 del período, con enlace al formulario completo.',
        ],
      },
    ],
  },
  {
    id: 'configuracion',
    key: 'always',
    anyOfPermissions: ['settings:company', 'settings:users', 'audit:read'],
    chapter: 'Configuración',
    title: 'Empresa, equipo, roles y módulos',
    summary: 'Los datos de tu empresa, quiénes entran al sistema y qué puede hacer cada uno, y qué secciones del menú se muestran. Lo configura el Dueño o un Administrador.',
    route: '/dashboard/settings',
    topics: [
      {
        id: 'datos-empresa',
        title: 'Completar los datos de la empresa',
        permission: 'settings:company',
        route: '/dashboard/settings/company',
        steps: [
          'Ve a Configuración → Perfil de Empresa.',
          'Completa razón social, RUT, giro, dirección, comuna, ciudad, teléfono, código de actividad económica y sube el logo (también colorea el panel con los tonos de tu marca).',
          'En parámetros tributarios revisa la industria, la tasa de PPM, la retención de honorarios y el año fiscal.',
          'Define si permites ventas con stock negativo y el umbral de aprobación de compras.',
        ],
        tip: 'Estos datos salen impresos en tus facturas y boletas: revísalos antes de emitir el primer documento.',
      },
      {
        id: 'conectar-cuentas',
        title: 'Conectar tus propias cuentas (Brevo, ZapSign, Khipu)',
        permission: 'settings:company',
        route: '/dashboard/settings/company',
        steps: [
          'Ve a Configuración → Perfil de Empresa y baja hasta "Integraciones". Sin conectar nada, tu empresa usa las cuentas de la plataforma.',
          'Correo (Brevo): pega la API key, escribe el nombre y el correo del remitente (debe estar verificado en Brevo) y haz clic en "Conectar Brevo". Después puedes usar "Enviarme un correo de prueba".',
          'Firma de contratos (ZapSign): pega el token de tu cuenta, deja el modo de prueba apagado si tu token es de producción y haz clic en "Conectar ZapSign".',
          'Cobro en línea (Khipu): pega la API key de tu cuenta de cobro y haz clic en "Guardar".',
          'Para volver a las cuentas de la plataforma usa "Desconectar" en cada una. La sección "Dominio propio" te lleva a donde se configura el dominio de cada certamen o sitio web.',
        ],
        tip: 'Las claves se guardan cifradas y no se vuelven a mostrar: para cambiarlas, escribe una nueva. Si desconectas ZapSign con contratos pendientes de firma, esos no se actualizarán solos.',
      },
      {
        id: 'proteccion-datos',
        title: 'Atender los derechos de los titulares de datos (Ley 21.719)',
        permission: 'settings:company',
        route: '/dashboard/settings/privacy',
        steps: [
          'Ve a Configuración → Protección de datos. En "Solicitudes de titulares" haz clic en "Generar enlace del formulario" y publica ese enlace en tu política de privacidad y en tu sitio.',
          'Cuando una persona usa el formulario, la solicitud aparece con su plazo legal y te llega un aviso en la campanita. Si la recibiste por otro medio, haz clic en "Registrar solicitud recibida por otro medio".',
          'Abre la solicitud, haz clic en "Buscar sus datos" para ver todo lo que tienes de esa persona y, si pidió acceso o portabilidad, usa "Descargar copia (JSON)".',
          'Marca "Identidad verificada" cuando compruebes que quien pide es el titular, escribe la constancia de lo que hiciste y haz clic en "Resolver" (o en "Rechazar" con el motivo). Si necesitas más tiempo, usa "Prorrogar" con su motivo.',
          'En "Registro de actividades" revisa y descarga qué datos trata tu empresa, y en "Incidentes de seguridad" deja constancia de cualquier filtración o acceso no autorizado y de a quién avisaste.',
        ],
        tip: 'Eliminar o corregir datos se hace desde la ficha de cada registro (el buscador te lleva a ella). Los documentos tributarios, contables y laborales no se pueden eliminar mientras dure el plazo legal de conservación. Valida los plazos y textos con tu asesoría legal.',
      },
      {
        id: 'invitar-usuario',
        title: 'Invitar a alguien de tu equipo',
        permission: 'settings:users',
        route: '/dashboard/settings/users',
        steps: [
          'Ve a Configuración → Equipo & Colaboradores y haz clic en "+ Agregar Colaborador".',
          'Elige "Invitar por correo" (le llega un enlace para crear su contraseña) o "Crear cuenta directamente" (te muestra una contraseña temporal para entregarle).',
          'Escribe nombre y correo, elige su rol base y, si quieres, un rol personalizado.',
          'En "Invitaciones Pendientes" puedes copiar el enlace, reenviarlo o revocarlo. Arriba ves cuántas licencias de tu plan están en uso.',
        ],
      },
      {
        id: 'roles-personalizados',
        title: 'Crear un rol a medida',
        permission: 'settings:users',
        route: '/dashboard/settings/roles',
        steps: [
          'Ve a Configuración → Roles Personalizados y crea uno nuevo.',
          'Ponle nombre (ej. "Vendedor Mostrador") y marca exactamente los permisos que necesita: solo aparecen los de los módulos de tu plan.',
          'Asígnalo a la persona en Equipo & Colaboradores. Sus permisos reemplazan a los del rol base.',
        ],
      },
      {
        id: 'desactivar-usuario',
        title: 'Desactivar a alguien que ya no trabaja contigo',
        permission: 'settings:users',
        route: '/dashboard/settings/users',
        steps: [
          'En Equipo & Colaboradores, usa el botón de estado de la persona para desactivarla: pierde el acceso de inmediato.',
          'No la elimines si tiene historial (ventas, documentos): desactivarla conserva su rastro en Auditoría.',
          '"Ver perfil y actividad" muestra su último inicio de sesión, dispositivos y últimas acciones. "Restablecer contraseña" le genera una clave temporal.',
        ],
      },
      {
        id: 'modulos-menu',
        title: 'Encender o apagar secciones del menú',
        permission: 'settings:company',
        route: '/dashboard/settings/modules',
        steps: [
          'Ve a Configuración → Módulos y Menú.',
          'Cada sección del menú tiene un interruptor: apágala para ocultarla a todo el equipo (también de la búsqueda Ctrl+K y de su dirección web). También hay "Activar todo" y "Ocultar todo".',
          'Apagar una sección no borra datos ni cambia permisos: al encenderla vuelve tal como estaba. Inicio y Configuración siempre quedan visibles.',
          'Al final ves los módulos que no están en tu plan: pídeselos a tu ejecutivo de Aether.',
        ],
      },
      {
        id: 'auditoria',
        title: 'Revisar quién hizo qué (auditoría)',
        permission: 'audit:read',
        route: '/dashboard/settings/audit',
        steps: [
          'Ve a Configuración → Auditoría & Trazabilidad: cada fila muestra fecha y hora, usuario, acción y módulo.',
          'Busca por usuario o entidad y usa "Ver JSON" para ver el detalle completo de un evento. "Exportar a Excel" descarga la bitácora.',
        ],
      },
    ],
  },
  {
    id: 'folios-sii',
    key: 'hasDteBilling',
    permission: 'dte:manage_caf',
    chapter: 'Configuración',
    title: 'Folios del SII (CAF)',
    summary:
      'Los folios autorizados por el SII para cada tipo de documento. Sin un CAF vigente, tus documentos llevan numeración interna y no tienen validez tributaria.',
    route: '/dashboard/settings/folios',
    topics: [
      {
        id: 'cargar-caf',
        title: 'Cargar folios autorizados',
        steps: [
          'Descarga el CAF desde sii.cl: Servicios Online → Factura Electrónica → Timbraje Electrónico, para el tipo de documento que necesitas.',
          'Ve a Configuración → Folios del SII y sube el archivo XML en "Cargar folios autorizados (CAF)".',
          'En "Folios disponibles" verás el rango y cuántos quedan de cada tipo.',
        ],
        tip: 'El CAF contiene la llave con que se timbran tus documentos: se guarda cifrado y nunca se muestra completo. Pide folios nuevos antes de agotarlos; puedes crear una automatización con el disparador "Folios del SII por agotarse".',
      },
      {
        id: 'alcance-sii',
        title: 'Qué hace hoy el sistema con el SII',
        steps: [
          'Con CAF cargado, cada documento sale con folio autorizado y timbre electrónico, verificable.',
          'El envío automático de los documentos al SII aún no está disponible: confírmalo con tu contador para cumplir con la entrega.',
        ],
      },
    ],
  },
  {
    id: 'importacion-masiva',
    key: 'always',
    permission: 'import:data',
    chapter: 'Configuración',
    title: 'Importación masiva (Excel, texto y fotos)',
    summary: 'Carga tu catálogo, clientes, stock inicial y ventas o compras históricas de una sola vez, con vista previa fila por fila antes de guardar nada.',
    route: '/dashboard/settings/import',
    topics: [
      {
        id: 'importar-excel',
        title: 'Cargar datos desde Excel o CSV',
        steps: [
          'Ve a Configuración → Importación Masiva y elige "¿Qué vas a importar?": productos, contactos, stock inicial, ventas o compras históricas (solo aparecen los que puedes crear).',
          'Descarga la "Plantilla Excel (.xlsx)" (o CSV) y llénala: la primera fila debe tener los encabezados. La tabla "Columnas reconocidas" muestra cuáles son obligatorias.',
          'Sube el archivo y revisa la vista previa: filas leídas, válidas y con errores.',
          'Confirma: se importan solo las filas válidas. Corrige las demás en el archivo y vuelve a subirlas.',
        ],
        tip: 'Si un RUT o un producto no existe, se crea automáticamente. Prueba primero con un archivo chico antes de subir miles de filas.',
      },
      {
        id: 'importar-texto',
        title: 'Cargar ventas describiéndolas por texto',
        steps: [
          'En la misma pantalla, "Importar ventas describiéndolas por texto": pega la descripción de una o varias boletas o facturas (cliente, RUT, tipo, folio, fecha y detalle de productos).',
          'La IA las interpreta y te las muestra como filas para revisar antes de confirmar.',
        ],
      },
      {
        id: 'importar-fotos',
        title: 'Cargar facturas desde fotos (escaneo con IA)',
        steps: [
          'Sube fotos de facturas (máximo 8 por envío, 5 MB cada una; puedes escanear varios lotes seguidos): la IA extrae los datos de cada documento.',
          'Revisa fila por fila antes de confirmar: con fotos borrosas, cortadas o con reflejos se equivoca. No se guarda nada hasta que confirmas.',
        ],
      },
    ],
  },
  {
    id: 'automatizaciones',
    key: 'always',
    permission: 'automation:manage',
    chapter: 'Configuración',
    title: 'Automatizaciones',
    summary: 'Reglas propias del tipo "cuando pase X, si se cumple Y, hacer Z": enviar un correo, avisar en la campanita o llamar a otro sistema (webhook), sin escribir código.',
    route: '/dashboard/settings/automations',
    topics: [
      {
        id: 'crear-regla',
        title: 'Crear una regla',
        steps: [
          'Ve a Configuración → Automatizaciones y haz clic en "Nueva regla".',
          '1. Disparador: elige qué evento la activa (venta emitida o anulada, stock bajo el mínimo, cuenta por cobrar vencida, folios por agotarse, compra por aprobar, candidata inscrita, entrada o voto pagado, mensaje de un sitio web, etc.).',
          '2. Condiciones (opcional): por ejemplo "Total mayor a 1.000.000". Vacío = siempre.',
          '3. Acciones: enviar correo, notificación interna o webhook. En los textos usa {{campo}} para insertar datos del evento (ej. {{contactName}}).',
          'Guarda y deja la regla activa.',
        ],
        tip: 'Un correo o webhook nunca frena la venta que lo dispara: si falla, la venta igual queda guardada y el error se ve en el Historial de la regla.',
      },
      {
        id: 'historial-regla',
        title: 'Revisar si una regla funcionó',
        steps: [
          'Usa "Historial" en la regla: cada ejecución muestra las acciones ejecutadas y los datos del evento.',
          'Para un webhook, "Secreto" muestra la clave con la que va firmada la llamada (cabecera X-Aether-Signature). Debe ser https:// y no puede apuntar a una red interna.',
        ],
      },
    ],
  },
];
