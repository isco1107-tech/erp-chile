/**
 * Contenido de los tutoriales de bienvenida por módulo. La clave de cada
 * entrada es la que devuelve `getModuleKeyForPath` (`tutorial-routes.ts`).
 *
 * Agregar un módulo nuevo es solo agregar una entrada acá + su ruta en
 * `tutorial-routes.ts` — `ModuleTutorial` y `HowToUseButton` no necesitan
 * tocarse.
 */
export interface TutorialStep {
  title: string;
  description: string;
}

export interface TutorialModuleContent {
  /** Nombre del módulo mostrado en el encabezado del tutorial. */
  title: string;
  steps: TutorialStep[];
}

export const TUTORIAL_CONTENT: Record<string, TutorialModuleContent> = {
  dashboard: {
    title: 'Dashboard',
    steps: [
      {
        title: 'Tu resumen del día',
        description: 'Ventas, compras, IVA y stock crítico en un vistazo, con la tendencia respecto al período anterior.',
      },
      {
        title: 'Accesos rápidos',
        description: 'Las tarjetas de acción te llevan directo a emitir una venta, registrar una compra o revisar cuentas por cobrar.',
      },
      {
        title: 'Gráficos y ventas recientes',
        description: 'Más abajo encuentras la evolución de ventas y las últimas boletas o facturas emitidas.',
      },
      {
        title: 'Ayuda en cualquier momento',
        description: 'El botón "Cómo usar" (arriba, junto a las notificaciones) te vuelve a mostrar este tutorial cuando quieras, módulo por módulo.',
      },
    ],
  },
  pos: {
    title: 'Punto de Venta',
    steps: [
      {
        title: 'Abre tu turno',
        description: 'Antes de vender, elige la caja y la bodega, y registra el monto inicial en efectivo.',
      },
      {
        title: 'Arma la venta',
        description: 'Busca productos por nombre o código de barras y ajusta cantidades en el carrito.',
      },
      {
        title: 'Emite el documento',
        description: 'Elige boleta o factura y el medio de pago. El folio y el timbre se generan solos si tu empresa tiene CAF cargado.',
      },
      {
        title: 'Cierra el turno',
        description: 'Al terminar el día, cierra la caja y cuadra el efectivo contado contra el esperado.',
      },
    ],
  },
  products: {
    title: 'Catálogo de Productos',
    steps: [
      {
        title: 'Crea o importa productos',
        description: 'Da de alta cada producto con su precio, si es exento de IVA y su bodega. Para cargas grandes usa el Importador Masivo.',
      },
      {
        title: 'Exento de IVA',
        description: 'Marca esta opción solo en la ficha del producto: el sistema siempre calcula el IVA según ese dato del catálogo, nunca según lo que se elija al vender.',
      },
      {
        title: 'Costo y kardex',
        description: 'El costo de cada producto se actualiza solo, al Precio Medio Ponderado (PMP), cada vez que registras una compra.',
      },
    ],
  },
  inventory: {
    title: 'Inventario',
    steps: [
      {
        title: 'Existencias por bodega',
        description: 'Consulta el stock disponible de cada producto en cada una de tus bodegas.',
      },
      {
        title: 'Kardex de movimientos',
        description: 'Cada entrada, salida y ajuste queda registrado con fecha, costo PMP y usuario responsable.',
      },
      {
        title: 'Ajustes y transferencias',
        description: 'Corrige diferencias de stock o mueve mercadería entre bodegas sin perder trazabilidad.',
      },
      {
        title: 'Stock negativo',
        description: 'Si tu empresa lo permite (Configuración), una venta puede salir aunque el stock esté en cero; si no, queda bloqueada.',
      },
    ],
  },
  sales: {
    title: 'Ventas & Facturación',
    steps: [
      {
        title: 'Cotización o venta directa',
        description: 'Arma una cotización sin validez tributaria, o emite boleta/factura directamente.',
      },
      {
        title: 'Documentos electrónicos',
        description: 'Boletas, facturas, guías de despacho, notas de crédito y débito — todos con folio y timbre si tu empresa tiene CAF cargado.',
      },
      {
        title: 'Notas de crédito',
        description: 'Anula o corrige un documento ya emitido generando la nota de crédito asociada, sin borrar el original.',
      },
      {
        title: 'Historial y filtros',
        description: 'Filtra por cliente, estado o rango de fechas para encontrar cualquier documento emitido.',
      },
    ],
  },
  contacts: {
    title: 'Clientes & Proveedores',
    steps: [
      {
        title: 'Ficha única',
        description: 'Cada contacto guarda su RUT (validado con Módulo 11), sus datos y su historial de compras o ventas.',
      },
      {
        title: 'Autocompletado por RUT',
        description: 'Al ingresar un RUT nuevo, el sistema busca el nombre y giro asociados automáticamente.',
      },
      {
        title: 'Cuentas pendientes',
        description: 'Desde la ficha ves los documentos por cobrar o por pagar de ese contacto, sin salir de la pantalla.',
      },
    ],
  },
  purchases: {
    title: 'Compras & Facturas de Proveedor',
    steps: [
      {
        title: 'Registra la recepción',
        description: 'Ingresa lo que compraste — el costo actualiza el PMP del producto automáticamente.',
      },
      {
        title: 'Factura de proveedor',
        description: 'Sube la factura del proveedor y sigue su estado de pago.',
      },
      {
        title: 'Aprobación',
        description: 'Si tu empresa lo exige, las compras sobre el monto configurado quedan pendientes hasta que alguien con permiso las apruebe.',
      },
    ],
  },
  treasury: {
    title: 'Tesorería',
    steps: [
      {
        title: 'Cuentas por Cobrar (CxC)',
        description: 'Ve qué clientes te deben, cuánto y desde cuándo, y registra sus pagos.',
      },
      {
        title: 'Cuentas por Pagar (CxP)',
        description: 'Lo mismo, con tus proveedores, para no perder el control de tus propios pagos pendientes.',
      },
      {
        title: 'Flujo de Caja',
        description: 'Proyecta los ingresos y egresos esperados para saber si te vas a quedar corto de caja.',
      },
    ],
  },
  reports: {
    title: 'Reportes Excel & F29',
    steps: [
      {
        title: 'Exporta todo a Excel',
        description: 'Descarga productos, inventario y finanzas en un libro con panel de indicadores, listo para tu contador.',
      },
      {
        title: 'Formulario 29 (F29)',
        description: 'Calcula débito fiscal, crédito fiscal, remanente y PPM del mes a partir de tus documentos ya emitidos — no es una estimación, corre sobre datos reales.',
      },
    ],
  },
  budgets: {
    title: 'Presupuestos',
    steps: [
      {
        title: 'Define un presupuesto',
        description: 'Fija los montos que esperas vender o gastar por categoría o período.',
      },
      {
        title: 'Compara contra lo real',
        description: 'El sistema compara tu presupuesto contra lo efectivamente vendido o gastado.',
      },
    ],
  },
  accounting: {
    title: 'Estados Financieros',
    steps: [
      {
        title: 'Se arma sola',
        description: 'La contabilidad se genera a partir de tus documentos de venta, compra y pagos — no necesitas ingresar asientos a mano.',
      },
      {
        title: 'Balance y resultado',
        description: 'Consulta el balance general y el estado de resultados siempre actualizados.',
      },
      {
        title: 'Cierre mensual',
        description: 'Cierra el período cuando termines de revisar el mes.',
      },
    ],
  },
  'promissory-notes': {
    title: 'Pagarés',
    steps: [
      {
        title: 'Registra un pagaré',
        description: 'Deja constancia de un compromiso de pago firmado por un cliente, con su fecha de vencimiento.',
      },
      {
        title: 'Seguimiento de vencimientos',
        description: 'El sistema te avisa cuando un pagaré está por vencer o ya venció sin pago.',
      },
    ],
  },
  'payment-plans': {
    title: 'Cuotas & Mensualidades',
    steps: [
      {
        title: 'Crea un plan de cuotas',
        description: 'Divide un monto en cuotas con sus fechas de vencimiento.',
      },
      {
        title: 'Marca pagos',
        description: 'Registra cada cuota pagada y ve el estado general del plan de un vistazo.',
      },
    ],
  },
  fees: {
    title: 'Boletas de Honorarios',
    steps: [
      {
        title: 'Emite una boleta de honorarios',
        description: 'Para pagos a personas naturales (jurado, animadores, staff externo) sujetos a retención.',
      },
      {
        title: 'Retención automática',
        description: 'El porcentaje de retención se aplica según la tasa configurada en tu empresa, sin que tengas que calcularla a mano.',
      },
    ],
  },
  projects: {
    title: 'Eventos & Proyectos',
    steps: [
      {
        title: 'Crea tu certamen o evento',
        description: 'Cada proyecto agrupa candidatas, escaleta, auspicios y entradas relacionadas.',
      },
      {
        title: 'Estado y fechas clave',
        description: 'Sigue el avance del proyecto desde la planificación hasta el día del evento.',
      },
    ],
  },
  calendar: {
    title: 'Calendario & Google Sync',
    steps: [
      {
        title: 'Sincroniza con Google Calendar',
        description: 'Conecta tu cuenta para ver certámenes, galas y cumpleaños de candidatas directo en tu calendario.',
      },
      {
        title: 'Recordatorios automáticos',
        description: 'Recibe avisos periódicos antes de cada fecha importante, sin tener que revisar el sistema a diario.',
      },
    ],
  },
  'org-chart': {
    title: 'Organigrama',
    steps: [
      {
        title: 'Visualiza la jerarquía',
        description: 'Ve la estructura de cargos de tu equipo en forma de árbol.',
      },
      {
        title: 'Gestiona cargos',
        description: 'Si tienes permiso, edita cargos y jerarquía desde "Gestionar cargos y jerarquía".',
      },
    ],
  },
  candidates: {
    title: 'Candidatas & Staff',
    steps: [
      {
        title: 'Ficha de candidata',
        description: 'Datos personales, documentos, contrato de imagen y estado de cumplimiento en un solo lugar.',
      },
      {
        title: 'Firma electrónica del contrato',
        description: 'Envía el contrato de imagen a firmar por ZapSign y sigue su estado sin salir del sistema.',
      },
      {
        title: 'Asistencia',
        description: 'Registra la asistencia a ensayos y actividades desde la sección Asistencia.',
      },
      {
        title: 'Cumplimiento',
        description: 'El tablero de cumplimiento te muestra qué candidatas tienen documentos o pasos pendientes.',
      },
    ],
  },
  judging: {
    title: 'Votación & Escrutinio',
    steps: [
      {
        title: 'Rondas de votación',
        description: 'Define las rondas y criterios que el jurado calificará en vivo.',
      },
      {
        title: 'Panel del jurado',
        description: 'Cada jurado ingresa sus puntajes desde su propio dispositivo durante el evento.',
      },
      {
        title: 'Escrutinio en vivo',
        description: 'Los resultados se calculan y muestran en tiempo real a medida que el jurado vota.',
      },
    ],
  },
  production: {
    title: 'Acreditaciones',
    steps: [
      {
        title: 'Acredita a staff y proveedores',
        description: 'Registra a cada persona que necesita acceso al evento, con su rol.',
      },
      {
        title: 'Diseña la credencial',
        description: 'Si tienes permiso de diseño, personaliza la plantilla de la credencial (foto, colores, QR).',
      },
      {
        title: 'Impresión o envío',
        description: 'Genera las credenciales listas para imprimir o compartir digitalmente.',
      },
    ],
  },
  sponsorships: {
    title: 'Auspicios & Marcas',
    steps: [
      {
        title: 'Registra una marca auspiciadora',
        description: 'Guarda el acuerdo, el monto comprometido y los entregables pactados (logo en escenario, mención, etc.).',
      },
      {
        title: 'Carta de compromiso',
        description: 'Genera y envía la carta de compromiso con la plantilla configurada.',
      },
      {
        title: 'Cumplimiento de entregables',
        description: 'El tablero de cumplimiento muestra qué compromisos con cada marca ya se cumplieron y cuáles faltan.',
      },
    ],
  },
  ticketing: {
    title: 'Venta de Entradas',
    steps: [
      {
        title: 'Configura tus entradas',
        description: 'Define tipos de entrada, precios y cupos disponibles para tu evento.',
      },
      {
        title: 'Ventas y pagos',
        description: 'Sigue las entradas vendidas y el estado de pago de cada una en tiempo real.',
      },
    ],
  },
  'public-voting': {
    title: 'Votación Pagada',
    steps: [
      {
        title: 'Habilita la votación del público',
        description: 'Define las candidatas o participantes y el precio por voto.',
      },
      {
        title: 'Pagos y resultados',
        description: 'El público paga para votar y el conteo se actualiza automáticamente en el panel.',
      },
    ],
  },
  agents: {
    title: 'Agentes de Inteligencia de Negocio',
    steps: [
      {
        title: 'Tu equipo ejecutivo virtual',
        description: 'CEO, CFO, COO y Ventas analizan tus datos reales de ventas, compras, inventario y tesorería.',
      },
      {
        title: 'Solo texto informativo',
        description: 'Ningún agente envía correos, mensajes ni ejecuta acciones por ti — te dejan recomendaciones para que decidas.',
      },
    ],
  },
  messaging: {
    title: 'Mensajería',
    steps: [
      {
        title: 'Chat interno de tu equipo',
        description: 'Conversaciones cifradas, solo visibles para quienes participan en ellas.',
      },
      {
        title: 'Nueva conversación',
        description: 'Inicia un chat individual o grupal desde el botón correspondiente en la lista de conversaciones.',
      },
    ],
  },
  'settings-company': {
    title: 'Configuración de la Empresa',
    steps: [
      {
        title: 'Datos y parámetros tributarios',
        description: 'Giro, tipo de industria, tasa de PPM y de retención de honorarios.',
      },
      {
        title: 'IP permitidas y webhook n8n',
        description: 'Restringe el acceso por IP y configura el webhook entrante para conciliar pagos automáticamente.',
      },
      {
        title: 'Respaldo completo',
        description: 'Descarga todos los datos de tu empresa en JSON desde la tarjeta de respaldo — es portabilidad, no reemplaza tus propios backups.',
      },
    ],
  },
  'settings-users': {
    title: 'Usuarios del Equipo',
    steps: [
      {
        title: 'Invita colaboradores',
        description: 'Envía una invitación por correo con el rol que le corresponde.',
      },
      {
        title: 'Roles base o personalizados',
        description: 'Asigna uno de los roles predefinidos o uno de los roles a medida que hayas creado en Roles Personalizados.',
      },
    ],
  },
  roles: {
    title: 'Roles Personalizados',
    steps: [
      {
        title: 'Crea un rol a medida',
        description: 'Arma una lista de permisos específica en vez de usar los roles base predefinidos.',
      },
      {
        title: 'No aplica al Dueño',
        description: 'El rol Dueño nunca se limita, así que los roles personalizados están pensados para el resto del equipo.',
      },
    ],
  },
  dte: {
    title: 'Folios & Timbre Electrónico (CAF)',
    steps: [
      {
        title: 'Carga tu CAF',
        description: 'Sube el archivo que te entrega el SII con el rango de folios autorizado para cada tipo de documento.',
      },
      {
        title: 'Folios y timbre automáticos',
        description: 'Una vez cargado, cada boleta o factura toma su folio del rango y se timbra sola. Sin CAF, se sigue emitiendo con un contador interno, sin validez tributaria.',
      },
      {
        title: 'Disponibilidad de folios',
        description: 'Revisa cuántos folios te quedan por tipo de documento antes de que se agoten.',
      },
    ],
  },
  automation: {
    title: 'Automatizaciones',
    steps: [
      {
        title: 'Arma una regla',
        description: 'Elige un disparador (venta emitida, stock bajo mínimo, folios por agotarse, etc.), condiciones opcionales y una o más acciones.',
      },
      {
        title: 'Acciones disponibles',
        description: 'Correo, notificación interna o webhook saliente firmado — se envían solo después de que la operación que las dispara ya quedó guardada.',
      },
      {
        title: 'Salud de las reglas',
        description: 'La tabla de arriba te avisa si una regla programada lleva tiempo sin ejecutarse.',
      },
    ],
  },
  import: {
    title: 'Importador Masivo',
    steps: [
      {
        title: 'Sube tu Excel o CSV',
        description: 'Importa productos, contactos u otras entidades en bloque en vez de crearlos uno por uno.',
      },
      {
        title: 'Solo lo que puedes crear',
        description: 'El importador solo te muestra las entidades para las que tienes permiso de escritura.',
      },
      {
        title: 'Asistentes con IA',
        description: 'También puedes escanear una factura o describir en texto lo que quieres cargar, y la IA arma el importe por ti.',
      },
    ],
  },
  security: {
    title: 'Seguridad & Sesiones',
    steps: [
      {
        title: 'Verificación en dos pasos (2FA)',
        description: 'Actívala para proteger tu cuenta con un segundo factor además de la contraseña.',
      },
      {
        title: 'Dispositivos activos',
        description: 'Revisa cada sesión abierta con tu cuenta y cierra la que no reconozcas.',
      },
    ],
  },
  audit: {
    title: 'Auditoría',
    steps: [
      {
        title: 'Registro de trazabilidad',
        description: 'Cada acción sensible (crear, editar, eliminar) queda registrada con quién, cuándo y qué cambió.',
      },
      {
        title: 'Filtra por usuario o módulo',
        description: 'Encuentra rápidamente qué pasó con un documento o un registro específico.',
      },
    ],
  },
};
