import type { FeatureKey, CompanyFeatureFlags } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';

export interface ManualTopic {
  id: string;
  title: string;
  steps: string[];
}

export interface ManualSection {
  /** `'always'` = visible sin importar el plan contratado (navegación, contactos, configuración). */
  key: FeatureKey | 'always';
  /**
   * Capacidad transversal que no es un módulo comercializable (mensajería,
   * importación masiva): la sección solo se muestra si el usuario tiene ese
   * permiso. Sin este campo la sección depende únicamente de `key`.
   */
  permission?: Permission;
  title: string;
  route: string;
  /** Ruta pública (`/manual/screenshots/<archivo>.png`) de una captura representativa del módulo. Generada una vez con `scripts/capture-manual-screenshots.ts`, no en cada build. */
  screenshot?: string;
  topics: ManualTopic[];
}

/**
 * Contenido del manual de usuario, uno por módulo. Se filtra por
 * `features.hasX` con el mismo criterio que el menú lateral
 * (`src/app/(dashboard)/layout.tsx`) — ver `getVisibleManualSections`.
 *
 * Alcance deliberado: los pasos principales de cada módulo, no un inventario
 * de cada botón de cada pantalla. Todas las rutas y flujos citados existen de
 * verdad en el código (no es contenido genérico) — si cambia una ruta o un
 * flujo, este archivo se desactualiza y hay que corregirlo acá.
 */
export const MANUAL_SECTIONS: ManualSection[] = [
  {
    key: 'always',
    title: 'Primeros pasos',
    route: '/dashboard',
    screenshot: '/manual/screenshots/dashboard.png',
    topics: [
      {
        id: 'navegacion',
        title: 'Cómo moverme por el panel',
        steps: [
          'El menú de la izquierda agrupa los módulos que tu empresa tiene contratados — si no ves un módulo, probablemente no está incluido en tu plan (pregúntale al dueño de la cuenta o a soporte).',
          'El Dashboard (ícono de casa) muestra un resumen general al entrar.',
          'Arriba a la derecha están tu perfil, el selector de empresa (si administras más de una) y el botón para cerrar sesión.',
          'En el celular, el menú se abre con el ícono de hamburguesa arriba a la izquierda.',
        ],
      },
      {
        id: 'roles-permisos',
        title: 'Por qué no veo cierta opción',
        steps: [
          'Lo que ves depende de dos cosas: el plan de tu empresa (qué módulos contrató) y tu rol (qué permisos te dieron dentro de esos módulos).',
          'Un OWNER/ADMIN ve todo lo contratado; otros roles (Ventas, Bodega, Contador) ven solo lo suyo.',
          'Si te falta acceso a algo que sí deberías ver, pide al administrador de tu empresa que revise tus permisos en Configuración → Equipo.',
        ],
      },
      {
        id: 'buscador-global',
        title: 'Buscar rápido con el buscador (Ctrl+K)',
        steps: [
          'Presiona Ctrl+K (Cmd+K en Mac) en cualquier pantalla para abrir el buscador rápido.',
          'Escribe el nombre de un módulo, una pantalla, o un atajo para saltar directo sin usar el menú.',
        ],
      },
      {
        id: 'notificaciones',
        title: 'Ver notificaciones del sistema',
        steps: [
          'La campanita arriba a la derecha muestra avisos relevantes (recordatorios de cobranza, cuotas vencidas, etc.).',
          'Hacer clic en una notificación te lleva directo a la pantalla relacionada.',
        ],
      },
      {
        id: 'asistente-ia',
        title: 'Pedir ayuda al Asistente',
        steps: [
          'El botón flotante con el ícono de interrogación (abajo a la izquierda) abre el Asistente, disponible para cualquier usuario.',
          'Puedes preguntarle "¿cómo hago X?" y te explica paso a paso, o pedirle directamente que haga algo por ti (ej. "créame un contacto para..." o "regístrame la asistencia de...") — te va a pedir confirmar con un botón antes de guardar nada de verdad.',
          'El Asistente solo puede hacer lo que tu propio usuario tiene permiso de hacer — si te falta un permiso, te lo va a decir en vez de intentarlo igual.',
        ],
      },
    ],
  },
  {
    key: 'always',
    title: 'Contactos (Clientes y Proveedores)',
    route: '/dashboard/contacts',
    screenshot: '/manual/screenshots/contacts.png',
    topics: [
      {
        id: 'crear-contacto',
        title: 'Registrar un cliente o proveedor',
        steps: [
          'Ve a Clientes & Proveedores en el menú.',
          'Haz clic en "Nuevo contacto".',
          'Ingresa el RUT — el sistema valida el dígito verificador automáticamente.',
          'Completa Razón Social, giro, dirección, y marca si es Cliente, Proveedor, o ambos.',
          'Opcional: define un límite de crédito y días de crédito si le vas a vender a plazo.',
          'Guarda — ya queda disponible para usarlo en ventas, compras o planes de pago.',
        ],
      },
      {
        id: 'buscar-contacto',
        title: 'Buscar un contacto existente',
        steps: [
          'Usa el buscador de la lista de Clientes & Proveedores — busca por RUT o por Razón Social.',
          'Este mismo buscador lo vas a ver replicado dentro de los formularios de venta, compra y plan de pago, para no tener que salir de ahí a crear el contacto primero.',
        ],
      },
      {
        id: 'limite-credito',
        title: 'Cómo funciona el límite de crédito',
        steps: [
          'Si le defines un límite de crédito a un cliente, el sistema bloquea emitir una nueva venta a crédito (30 días) si la deuda vigente más el nuevo documento superan ese límite.',
          'Los días de crédito son informativos: sugieren la fecha de vencimiento al vender, pero no son un límite duro por sí solos.',
        ],
      },
    ],
  },
  {
    key: 'always',
    title: 'Configuración y Equipo',
    route: '/dashboard/settings',
    screenshot: '/manual/screenshots/settings.png',
    topics: [
      {
        id: 'invitar-usuario',
        title: 'Invitar a alguien de tu equipo',
        steps: [
          'Ve a Configuración → Equipo.',
          'Haz clic en "Invitar usuario", ingresa su correo y elige su rol.',
          'Le llega un correo de invitación (o, si el correo no está configurado, el enlace queda disponible para copiar y enviárselo tú directamente).',
          'La persona abre el enlace, crea su contraseña, y ya puede entrar con los permisos del rol que le asignaste.',
        ],
      },
      {
        id: 'roles-personalizados',
        title: 'Crear un rol a medida',
        steps: [
          'Ve a Configuración → Roles (si tu plan lo permite).',
          'Crea un rol nuevo y marca exactamente los permisos que necesita — solo aparecen los permisos de los módulos que tu empresa tiene contratados.',
          'Asigna ese rol al usuario desde Equipo.',
        ],
      },
      {
        id: 'datos-empresa',
        title: 'Actualizar los datos de mi empresa',
        steps: [
          'Ve a Configuración → Empresa.',
          'Ahí editas razón social, RUT, logo, y los parámetros tributarios (tasa de PPM, retención de honorarios, si permites stock negativo, etc.).',
        ],
      },
      {
        id: 'desactivar-usuario',
        title: 'Desactivar a alguien que ya no trabaja contigo',
        steps: [
          'Ve a Configuración → Equipo, busca a la persona y usa la opción de desactivar su cuenta.',
          'Una cuenta desactivada pierde el acceso de inmediato, sin esperar a que expire su sesión — no borres al usuario si tiene historial (ventas, documentos) asociado, solo desactívalo.',
        ],
      },
      {
        id: 'auditoria',
        title: 'Revisar quién hizo qué (auditoría)',
        steps: [
          'Si tu rol tiene acceso a auditoría, en Configuración vas a encontrar el registro de acciones importantes (quién creó, editó o eliminó qué, y cuándo).',
        ],
      },
      {
        id: 'dos-factores',
        title: 'Activar verificación en dos pasos (2FA)',
        steps: [
          'Desde tu perfil (arriba a la derecha) puedes activar la verificación en dos pasos con una app de autenticación (Google Authenticator, Authy, etc.).',
          'Una vez activada, cada inicio de sesión va a pedir además el código de 6 dígitos de la app.',
        ],
      },
    ],
  },
  {
    key: 'hasMultiCompany',
    title: 'Administración Multiempresa',
    route: '/dashboard',
    topics: [
      {
        id: 'cambiar-empresa',
        title: 'Cambiar entre empresas',
        steps: [
          'Si administras más de una empresa con el mismo usuario, arriba (junto a tu perfil) aparece un selector de empresa.',
          'Al cambiar de empresa activa, todo el panel (menú, datos, permisos) se actualiza a esa empresa — no hace falta cerrar sesión.',
        ],
      },
      {
        id: 'datos-separados',
        title: 'Los datos de cada empresa están totalmente separados',
        steps: [
          'Ventas, contactos, inventario, usuarios y todo lo demás son independientes por empresa — nada se mezcla entre ellas aunque las administre la misma persona.',
        ],
      },
    ],
  },
  {
    key: 'hasPos',
    title: 'Punto de Venta (POS)',
    route: '/dashboard/pos',
    screenshot: '/manual/screenshots/pos.png',
    topics: [
      {
        id: 'abrir-turno',
        title: 'Abrir la caja al empezar el turno',
        steps: [
          'Entra a Punto de Venta.',
          'Si no hay un turno abierto, te va a pedir el monto inicial de efectivo en caja antes de dejarte vender.',
          'Confirma para abrir el turno.',
        ],
      },
      {
        id: 'vender-pos',
        title: 'Registrar una venta',
        steps: [
          'Busca el producto por nombre o código de barras.',
          'Agrégalo al carrito, ajusta cantidades si hace falta.',
          'Elige el medio de pago (efectivo, tarjeta, etc.) y confirma.',
          'El ticket queda listo para imprimir (formato térmico 80mm).',
        ],
      },
      {
        id: 'cerrar-turno',
        title: 'Cerrar caja (arqueo)',
        steps: [
          'Al terminar el turno, usa la opción de cerrar caja.',
          'Cuenta el efectivo real y anótalo — el sistema te muestra la diferencia contra lo esperado según las ventas del turno.',
        ],
      },
      {
        id: 'anular-venta-pos',
        title: 'Anular una venta hecha por error',
        steps: [
          'Una venta del POS no se borra: se anula igual que cualquier documento de venta, generando una Nota de Crédito.',
          'Solo un usuario con permiso de anular ventas puede hacerlo.',
        ],
      },
    ],
  },
  {
    key: 'hasInventory',
    title: 'Inventario y Catálogo',
    route: '/dashboard/products',
    screenshot: '/manual/screenshots/inventory.png',
    topics: [
      {
        id: 'crear-producto',
        title: 'Agregar un producto al catálogo',
        steps: [
          'Ve a Catálogo de Productos → "Nuevo producto".',
          'Completa nombre, código, precio de venta, y si es exento de IVA.',
          'Guarda — el stock inicial se carga registrando una compra o un ajuste manual desde Inventario, no desde la ficha del producto.',
        ],
      },
      {
        id: 'costo-pmp',
        title: 'Entender el costo (PMP)',
        steps: [
          'Cada vez que registras una compra, el costo del producto se recalcula automáticamente como Precio Medio Ponderado (promedio entre el stock que tenías y lo que compraste, ponderado por cantidad).',
          'No necesitas actualizar el costo a mano — se recalcula solo al recepcionar cada compra.',
        ],
      },
      {
        id: 'ajustar-stock',
        title: 'Ajustar stock (mermas, conteos)',
        steps: [
          'Ve a Inventario → Movimientos/Ajustes.',
          'Elige el producto y la bodega, indica la cantidad y el motivo del ajuste.',
          'Si tu plan tiene Multibodega, puedes transferir stock entre bodegas desde la misma sección.',
        ],
      },
      {
        id: 'stock-negativo',
        title: 'Qué pasa si intento vender sin stock',
        steps: [
          'Por defecto, el sistema bloquea vender un producto sin stock suficiente.',
          'Si tu empresa necesita permitirlo igual (venta contra pedido), el dueño de la cuenta puede activar "permitir stock negativo" en Configuración → Empresa.',
        ],
      },
      {
        id: 'ver-kardex',
        title: 'Revisar el Kardex de un producto (qué entró y qué salió)',
        steps: [
          'Ve a Inventario (/dashboard/inventory) — es la pantalla de existencias y Kardex, distinta del Catálogo de Productos.',
          'Busca el producto por SKU o nombre y haz clic en su fila: abajo se abre el Kardex con fecha, tipo de movimiento, cantidad, costo y el documento de referencia que lo originó.',
          'Cada compra, venta, ajuste y transferencia deja una línea ahí — si el stock no cuadra, esta es la pantalla donde se ve en qué movimiento se descuadró.',
          'La columna Valorizado muestra el stock a costo PMP vigente, que es el valor de inventario que después aparece en los reportes.',
        ],
      },
      {
        id: 'filtrar-por-bodega',
        title: 'Ver el stock de una bodega en particular',
        steps: [
          'En Inventario usa el selector "Todas las bodegas" para dejar solo la bodega que te interesa.',
          'Si tu plan incluye Multibodega, desde ahí mismo puedes crear una bodega nueva indicando nombre y código.',
          'Sin Multibodega trabajas con una sola bodega y el selector no te sirve de mucho.',
        ],
      },
      {
        id: 'categorias-producto',
        title: 'Organizar productos por categoría',
        steps: [
          'Al crear o editar un producto, asígnale una categoría — te sirve después para filtrar el catálogo y para los reportes de márgenes por categoría.',
        ],
      },
    ],
  },
  {
    key: 'hasDteBilling',
    title: 'Ventas y Facturación',
    route: '/dashboard/sales',
    screenshot: '/manual/screenshots/sales.png',
    topics: [
      {
        id: 'emitir-documento',
        title: 'Emitir una boleta o factura',
        steps: [
          'Ve a Ventas & Facturación → "Nuevo documento".',
          'Elige el tipo (Boleta, Factura, Guía de Despacho, etc.) — una factura exige un cliente con RUT de empresa.',
          'Agrega los productos/servicios; el IVA (19%) se calcula solo sobre las líneas afectas.',
          'Emite el documento — queda con folio interno correlativo.',
        ],
      },
      {
        id: 'nota-credito',
        title: 'Anular o corregir un documento',
        steps: [
          'Un documento emitido no se edita ni se borra: se anula generando una Nota de Crédito que lo referencia.',
          'Desde el detalle del documento original, usa la opción de generar Nota de Crédito.',
        ],
      },
      {
        id: 'cotizacion',
        title: 'Crear una cotización antes de vender',
        steps: [
          'Si el cliente todavía no confirma la compra, genera una Cotización en vez de un documento definitivo.',
          'Cuando el cliente confirma, conviertes esa cotización en una boleta/factura sin tener que volver a cargar los productos.',
        ],
      },
      {
        id: 'venta-credito',
        title: 'Vender a crédito (30 días)',
        steps: [
          'Al emitir el documento, elige "Crédito 30 días" como forma de pago.',
          'El documento queda pendiente de cobro en Tesorería → Cuentas por Cobrar hasta que se registre el pago.',
        ],
      },
    ],
  },
  {
    key: 'hasPurchases',
    title: 'Compras y Proveedores',
    route: '/dashboard/purchases',
    screenshot: '/manual/screenshots/purchases.png',
    topics: [
      {
        id: 'registrar-compra',
        title: 'Registrar una factura de proveedor',
        steps: [
          'Ve a Compras → "Nueva compra".',
          'Elige el proveedor, agrega los productos y las cantidades recibidas.',
          'Al guardar, el stock de esos productos sube y el costo (PMP) se recalcula automáticamente.',
        ],
      },
      {
        id: 'orden-compra',
        title: 'Crear una orden de compra antes de recibir mercadería',
        steps: [
          'Si necesitas aprobar la compra antes de que llegue la mercadería, usa primero "Orden de Compra".',
          'Cuando llega la mercadería, conviértela en una recepción/factura de compra vinculada a esa orden.',
        ],
      },
      {
        id: 'aprobacion-compra',
        title: 'Aprobar una compra antes de pagarla',
        steps: [
          'Si tu empresa exige aprobación, la compra queda en estado pendiente hasta que alguien con el permiso correspondiente la apruebe.',
          'Una vez aprobada, ya puede pagarse desde Tesorería → Cuentas por Pagar.',
        ],
      },
    ],
  },
  {
    key: 'hasTreasury',
    title: 'Tesorería y Cobranzas',
    route: '/dashboard/treasury/cxc',
    screenshot: '/manual/screenshots/treasury.png',
    topics: [
      {
        id: 'cxc',
        title: 'Ver y cobrar cuentas por cobrar',
        steps: [
          'Ve a Cuentas por Cobrar — lista los documentos de venta a crédito con saldo pendiente.',
          'Haz clic en un documento y registra el pago (monto, medio de pago, fecha) cuando el cliente pague.',
        ],
      },
      {
        id: 'cxp',
        title: 'Pagar a proveedores',
        steps: [
          'Ve a Cuentas por Pagar — lista tus facturas de compra pendientes de pago.',
          'Registra el pago igual que en CxC.',
        ],
      },
      {
        id: 'flujo-caja',
        title: 'Revisar el flujo de caja proyectado',
        steps: [
          'Ve a Flujo de Caja para ver entradas y salidas esperadas según los vencimientos de CxC y CxP.',
        ],
      },
      {
        id: 'pago-parcial',
        title: 'Registrar un pago parcial',
        steps: [
          'Un cliente/proveedor no tiene que pagar el total de una vez — registra el monto que efectivamente pagó y el documento queda "parcialmente pagado" con el saldo restante visible.',
        ],
      },
    ],
  },
  {
    key: 'hasAdvancedReports',
    title: 'Reportes Avanzados',
    route: '/dashboard/reports',
    topics: [
      {
        id: 'libro-excel',
        title: 'Descargar el libro de ventas/compras y el F29 estimado',
        steps: [
          'Ve a Reportes Excel.',
          'Elige el período (mes/año) y descarga el Excel — incluye libro de ventas, compras, Kardex valorizado y una estimación de F29 calculada sobre tus documentos reales del período.',
        ],
      },
      {
        id: 'pantalla-f29',
        title: 'Ver el F29 del mes en pantalla (sin descargar Excel)',
        steps: [
          'Ve a Formulario 29 (F29) en el menú de Finanzas (/dashboard/reports/f29).',
          'Elige el período y verás el IVA débito, el IVA crédito, el remanente que viene del mes anterior, el PPM y el impuesto determinado.',
          'El cálculo corre sobre tus documentos reales emitidos y recibidos del período, no sobre estimaciones.',
          'Si un número te parece raro, revisa primero que todos los documentos del mes estén emitidos (no en borrador) y que las compras del mes estén registradas.',
        ],
      },
      {
        id: 'f29-estimado',
        title: 'Qué tan confiable es el F29 estimado',
        steps: [
          'Se calcula sobre tus documentos ya emitidos/recibidos en el sistema (débito fiscal, crédito fiscal, PPM), no es un número inventado.',
          'Sirve como estimación de apoyo — la declaración formal ante el SII la sigue haciendo tu contador con su propio sistema.',
        ],
      },
    ],
  },
  {
    key: 'hasAccounting',
    title: 'Contabilidad',
    route: '/dashboard/financial-statements',
    topics: [
      {
        id: 'estados-financieros',
        title: 'Ver los estados financieros',
        steps: [
          'Ve a Estados Financieros para ver Balance y Estado de Resultados generados a partir de los asientos contables del período.',
        ],
      },
      {
        id: 'asiento-manual',
        title: 'Hacer un asiento contable manual',
        steps: [
          'Desde el módulo de Contabilidad, usa la opción de asiento manual cuando necesites registrar algo que no viene de una venta/compra/pago automático (ej. depreciación).',
          'Elige las cuentas del plan de cuentas, el debe y el haber deben cuadrar para poder guardarlo.',
        ],
      },
      {
        id: 'cerrar-periodo',
        title: 'Cerrar un período contable',
        steps: [
          'Solo un usuario con el permiso de cierre puede cerrar un período — una vez cerrado, no se pueden agregar ni modificar asientos de ese mes.',
        ],
      },
    ],
  },
  {
    key: 'hasCrm',
    title: 'Inteligencia de Negocio (Agentes)',
    route: '/dashboard/agents',
    screenshot: '/manual/screenshots/agents.png',
    topics: [
      {
        id: 'agentes-ejecutivos',
        title: 'Revisar las recomendaciones de los agentes',
        steps: [
          'Ve a Agentes — cada rol (CEO, CFO, COO, Ventas) corre automáticamente todos los días y deja recomendaciones basadas en tus datos reales.',
          'Revisa cada recomendación y decide si aplicarla — el agente nunca ejecuta cambios solo, solo sugiere.',
        ],
      },
      {
        id: 'copiloto',
        title: 'Preguntarle al Copiloto Financiero',
        steps: [
          'Usa el botón flotante con el ícono de chispa (abajo a la derecha) para abrir el Copiloto.',
          'Pregúntale cosas puntuales como "¿cuál fue el margen de ventas este mes?" o "¿qué clientes están morosos?" — responde con datos reales de tu empresa, no información inventada.',
        ],
      },
    ],
  },
  {
    key: 'hasEventProjects',
    title: 'Eventos y Proyectos',
    route: '/dashboard/projects',
    screenshot: '/manual/screenshots/projects.png',
    topics: [
      {
        id: 'crear-proyecto',
        title: 'Crear un proyecto/certamen',
        steps: [
          'Ve a Eventos & Proyectos → "Nuevo proyecto".',
          'Define nombre, código, presupuesto de ingresos/gastos y las fechas del certamen.',
          'Desde ahí puedes vincular ventas, compras y pagos a ese proyecto para ver su rentabilidad por separado.',
        ],
      },
      {
        id: 'calendario',
        title: 'Ver el calendario del proyecto',
        steps: [
          'Ve a Calendario & Google Sync para ver las etapas del proyecto y los cumpleaños de candidatas en una vista de calendario, y sincronizarlo con Google Calendar si lo necesitas.',
        ],
      },
      {
        id: 'rentabilidad-proyecto',
        title: 'Ver cuánto está ganando o perdiendo un proyecto',
        steps: [
          'Entra al detalle del proyecto para ver el presupuesto vs. lo real: ingresos (ventas, auspicios) menos gastos (compras, honorarios) vinculados a ese proyecto específico.',
        ],
      },
    ],
  },
  {
    key: 'hasSponsorships',
    title: 'Auspicios y Marcas',
    route: '/dashboard/sponsorships',
    screenshot: '/manual/screenshots/sponsorships.png',
    topics: [
      {
        id: 'crear-auspicio',
        title: 'Registrar un contrato de auspicio',
        steps: [
          'Ve a Auspicios & Marcas → "Nuevo contrato".',
          'Elige la marca (contacto), el proyecto, el tier de auspicio y si es en efectivo o canje.',
          'Agrega los entregables comprometidos (menciones, backstage, pauta, etc.) como un checklist.',
        ],
      },
      {
        id: 'cumplimiento-auspicios',
        title: 'Revisar qué entregables faltan',
        steps: [
          'Ve a Cumplimiento de Auspicios para ver, por marca, qué porcentaje de entregables ya se completó.',
        ],
      },
      {
        id: 'plantilla-carta',
        title: 'Editar la plantilla de la carta de compromiso',
        steps: [
          'Ve a Plantilla: Carta de Compromiso para ajustar el texto que se usa al generar el documento de cada nuevo contrato de auspicio.',
        ],
      },
    ],
  },
  {
    key: 'hasFeeDocuments',
    title: 'Boletas de Honorarios',
    route: '/dashboard/fees',
    topics: [
      {
        id: 'registrar-boleta',
        title: 'Registrar una boleta de honorarios',
        steps: [
          'Ve a Boletas de Honorarios → "Nueva boleta".',
          'Ingresa el prestador de servicios, el monto bruto — el sistema calcula la retención de 2ª categoría automáticamente según la tasa configurada en tu empresa.',
        ],
      },
    ],
  },
  {
    key: 'hasCandidates',
    title: 'Candidatas y Staff',
    route: '/dashboard/candidates',
    screenshot: '/manual/screenshots/candidates.png',
    topics: [
      {
        id: 'ficha-candidata',
        title: 'Crear la ficha de una candidata',
        steps: [
          'Ve a Candidatas & Staff → "Nueva candidata", o comparte el link público de postulación (Configuración de convocatoria) para que ella misma cargue sus datos.',
          'Desde la ficha puedes cambiar su estado (postulante, preseleccionada, finalista, etc.), subir documentos y generar el contrato de imagen.',
        ],
      },
      {
        id: 'firma-contrato',
        title: 'Enviar el contrato a firmar por correo',
        steps: [
          'Desde la ficha de la candidata, genera el contrato de imagen y usa "Solicitar firma por correo".',
          'A la candidata le llega un correo con un link para firmar electrónicamente — cuando firma, el contrato queda marcado como firmado automáticamente, sin que tengas que hacer nada más.',
        ],
      },
      {
        id: 'pasar-asistencia',
        title: 'Pasar asistencia a talleres, ensayos o eventos (por sesión, no una por una)',
        steps: [
          'Ve a Asistencia (dentro de Candidatas & Staff).',
          'Elige el proyecto y haz clic en "Crear sesiones": puedes crear un evento puntual (una fecha) o una serie recurrente (ej. "todos los martes y jueves entre dos fechas").',
          'Entra a una sesión ya creada y pasa lista: por defecto todas quedan "presentes", solo desmarcas a las ausentes y guardas — mucho más rápido que entrar candidata por candidata.',
          'La ficha individual de cada candidata sigue mostrando su historial completo de asistencia, incluyendo lo cargado por sesión.',
        ],
      },
      {
        id: 'cumplimiento-candidatas',
        title: 'Ver el cumplimiento general',
        steps: [
          'Ve a Cumplimiento de Candidatas para ver, por candidata, su % de asistencia y el estado de sus documentos/contrato.',
        ],
      },
      {
        id: 'convocatoria',
        title: 'Abrir/cerrar la convocatoria de postulaciones',
        steps: [
          'Desde el proyecto, configura la convocatoria: fecha de apertura/cierre, edad mínima y cupo máximo.',
          'Mientras esté "Abierta", el link público de postulación permite que nuevas candidatas se registren solas.',
        ],
      },
      {
        id: 'descartar-candidata',
        title: 'Descartar una postulación',
        steps: [
          'Al cambiar el estado de una candidata a "Descartada", el sistema exige indicar el motivo — queda registrado para trazabilidad.',
          'Las candidatas descartadas se purgan automáticamente después de un tiempo configurado (retención de datos), no quedan guardadas para siempre.',
        ],
      },
    ],
  },
  {
    key: 'hasOrgChart',
    title: 'Organigrama',
    route: '/dashboard/org-chart',
    topics: [
      {
        id: 'ficha-staff',
        title: 'Agregar a alguien al organigrama',
        steps: [
          'Ve a Organigrama → "Nueva persona".',
          'Completa nombre, foto, cargo, y quién es su jefatura directa para que quede ubicada en el árbol.',
        ],
      },
    ],
  },
  {
    key: 'hasLiveProduction',
    title: 'Acreditaciones',
    route: '/dashboard/production/accreditation',
    topics: [
      {
        id: 'acreditar',
        title: 'Acreditar a staff o proveedores para el día del evento',
        steps: [
          'Ve a Acreditaciones → agrega a la persona (staff o proveedor) con su foto.',
          'Se genera una credencial con código QR que el control de acceso puede escanear el día del evento.',
        ],
      },
    ],
  },
  {
    key: 'hasJudging',
    title: 'Votación y Escrutinio (Jurado)',
    route: '/dashboard/judging',
    topics: [
      {
        id: 'categorias-jurado',
        title: 'Configurar las categorías de evaluación',
        steps: [
          'Ve a Votación & Escrutinio → crea las categorías que va a calificar el jurado (ej. Oratoria, Pasarela).',
          'Genera un link único por jurado — cada jurado califica desde su celular sin necesidad de cuenta ni contraseña.',
          'Una vez que un jurado envía su planilla, queda bloqueada — no se puede editar después, para que el escrutinio sea confiable.',
        ],
      },
    ],
  },
  {
    key: 'hasBudgets',
    title: 'Presupuestos',
    route: '/dashboard/budgets',
    topics: [
      {
        id: 'crear-presupuesto',
        title: 'Armar el presupuesto del período',
        steps: [
          'Ve a Presupuestos → "Nuevo presupuesto".',
          'Define las categorías (arriendo, sueldos, insumos, etc.) con el monto planificado para cada una.',
          'El sistema va comparando automáticamente lo planificado contra el gasto real registrado en compras/pagos.',
        ],
      },
    ],
  },
  {
    key: 'hasPromissoryNotes',
    title: 'Pagarés',
    route: '/dashboard/promissory-notes',
    topics: [
      {
        id: 'registrar-pagare',
        title: 'Registrar un pagaré firmado',
        steps: [
          'Ve a Pagarés → "Nuevo pagaré".',
          'Elige a quién corresponde (un cliente o una candidata), el monto y la fecha de vencimiento.',
          'Marca el pagaré como pagado cuando corresponda para llevar el seguimiento de mora.',
        ],
      },
    ],
  },
  {
    key: 'hasInstallmentPlans',
    title: 'Cuotas y Mensualidades',
    route: '/dashboard/payment-plans',
    screenshot: '/manual/screenshots/payment-plans.png',
    topics: [
      {
        id: 'crear-plan-pago',
        title: 'Crear un plan de pago en cuotas',
        steps: [
          'Ve a Cuotas & Mensualidades → "Nuevo plan de pago".',
          'Primero elige el Tipo de cliente: Sponsor o Candidata. Según cuál elijas, el buscador de abajo cambia — escribe el nombre/RUT y selecciona de las coincidencias.',
          'Define el monto total, número de cuotas, frecuencia (semanal/quincenal/mensual) y la fecha de la primera cuota — el sistema arma la vista previa de cada cuota antes de guardar.',
          'Opcional: define una multa por atraso (en % sobre la cuota vencida).',
        ],
      },
      {
        id: 'cobrar-cuota',
        title: 'Registrar el pago de una cuota',
        steps: [
          'Entra al plan de pago y, en la cuota correspondiente, registra el monto pagado y el medio de pago.',
          'Si pasan todas las cuotas del plan a pagadas, el plan se marca automáticamente como Completado.',
        ],
      },
      {
        id: 'recordatorio-mora',
        title: 'Recordatorios automáticos de cuotas vencidas',
        steps: [
          'El sistema envía un recordatorio por correo automáticamente cuando una cuota vence y sigue impaga — no tienes que estar revisando manualmente todos los días.',
          'Si definiste una multa por atraso, se aplica automáticamente sobre las cuotas vencidas.',
        ],
      },
      {
        id: 'cancelar-plan',
        title: 'Cancelar un plan de pago',
        steps: [
          'Si el cliente/candidata deja de pagar o se cancela el acuerdo, puedes marcar el plan como Cancelado desde su detalle — las cuotas ya pagadas quedan en el historial igual.',
        ],
      },
    ],
  },
  {
    key: 'hasTicketing',
    title: 'Venta de Entradas',
    route: '/dashboard/ticketing',
    topics: [
      {
        id: 'crear-tipo-entrada',
        title: 'Configurar los tipos de entrada',
        steps: [
          'Ve a Venta de Entradas → crea los tipos de entrada (ej. General, VIP) con su precio y cupo disponible.',
          'Comparte el link público de venta — el pago se confirma manualmente por tu equipo, y cada entrada vendida genera un código QR de control de acceso.',
        ],
      },
    ],
  },
  {
    key: 'hasPublicVoting',
    title: 'Votación Pagada del Público',
    route: '/dashboard/voting',
    topics: [
      {
        id: 'votacion-publica',
        title: 'Activar la votación pagada',
        steps: [
          'Ve a Votación Pagada — desde ahí administras el link público donde el público paga por votar a su candidata favorita.',
          'Los pagos se confirman manualmente y el ranking se actualiza en vivo a medida que se confirman los votos.',
        ],
      },
    ],
  },
  {
    key: 'always',
    title: 'Trabajar con listados, filtros y exportaciones',
    route: '/dashboard',
    topics: [
      {
        id: 'usar-tablas',
        title: 'Buscar, filtrar y ordenar en cualquier listado',
        steps: [
          'Casi todas las pantallas de listado (contactos, productos, ventas, compras, cuotas) usan la misma tabla: arriba a la izquierda está el buscador y al lado los filtros de esa pantalla (estado, fecha, bodega, etc.).',
          'El buscador filtra sobre lo que ya está cargado en la pantalla; si buscas algo antiguo, primero amplía el filtro de fecha o estado y después busca.',
          'Abajo está la paginación: si no encuentras un registro, revisa que no esté en otra página antes de volver a crearlo (duplicar un cliente o un producto ensucia el histórico).',
          'Cuando la pantalla permite exportar, el botón está arriba a la derecha de la tabla y baja exactamente las filas que estás viendo con los filtros aplicados.',
        ],
      },
      {
        id: 'imprimir-pantalla',
        title: 'Imprimir o guardar como PDF lo que estoy viendo',
        steps: [
          'Usa Ctrl+P (Cmd+P en Mac) y elige "Guardar como PDF" en el destino de impresión.',
          'Las pantallas están preparadas para imprimirse sin el menú lateral ni los botones — sale solo el contenido.',
          'El Manual de Usuario tiene además su propio botón "Descargar / Imprimir Manual", que imprime todas las secciones expandidas.',
        ],
      },
    ],
  },
  {
    key: 'always',
    title: 'Mi cuenta: perfil, contraseña y dispositivos',
    route: '/dashboard/settings/profile',
    topics: [
      {
        id: 'mi-perfil',
        title: 'Actualizar mis datos y ver mi actividad',
        steps: [
          'Ve a Configuración → Mi Perfil (/dashboard/settings/profile).',
          'Ahí actualizas tus datos de contacto y ves tu actividad reciente en la plataforma.',
        ],
      },
      {
        id: 'dispositivos-activos',
        title: 'Cerrar sesiones abiertas en otros dispositivos',
        steps: [
          'Ve a Configuración → Dispositivos Activos (/dashboard/settings/sessions).',
          'Cada fila es un inicio de sesión vigente. Si no reconoces uno, ciérralo desde ahí.',
          'Cerrar una sesión desconecta ese dispositivo de inmediato, no cuando expire el token.',
          'Si sospechas que alguien entró a tu cuenta: cierra todas las sesiones, cambia tu contraseña y activa la verificación en dos pasos.',
        ],
      },
      {
        id: 'seguridad-2fa',
        title: 'Activar la verificación en dos pasos (2FA)',
        steps: [
          'Ve a Configuración → Seguridad (/dashboard/settings/security).',
          'Sigue el asistente para vincular tu app de autenticación (Google Authenticator, Authy o similar).',
          'Guarda los códigos de respaldo en un lugar seguro: sin ellos y sin el teléfono, quedas fuera de tu cuenta.',
        ],
      },
    ],
  },
  {
    key: 'always',
    permission: 'import:data',
    title: 'Importación Masiva (Excel y fotos)',
    route: '/dashboard/settings/import',
    topics: [
      {
        id: 'importar-excel',
        title: 'Cargar catálogo, clientes o stock inicial desde Excel',
        steps: [
          'Ve a Configuración → Importación Masiva (/dashboard/settings/import).',
          'Elige qué vas a importar: productos, contactos, stock inicial, ventas históricas o compras históricas. Solo aparecen los tipos que tienes permiso de crear.',
          'Descarga la plantilla que te ofrece el asistente y llena tus datos ahí — así las columnas calzan y no tienes que mapearlas a mano.',
          'Sube el archivo y revisa la vista previa: te marca fila por fila lo que está bien, lo que se corrigió solo y lo que tiene error.',
          'Nada se guarda hasta que confirmas la vista previa. Si hay filas con error, corrígelas en el archivo y vuelve a subirlo.',
          'Máximo 2.000 filas por importación: si tienes más, divide el archivo en partes.',
        ],
      },
      {
        id: 'importar-fotos',
        title: 'Cargar facturas desde fotos (escaneo con IA)',
        steps: [
          'En la misma pantalla de Importación Masiva está la opción de escanear facturas por foto, disponible si puedes registrar tanto ventas como compras históricas.',
          'Sube las imágenes (hasta 8 por tanda) y la IA extrae los datos de cada documento.',
          'Revisa fila por fila lo que extrajo antes de confirmar: la IA se equivoca con fotos borrosas, cortadas o con reflejos.',
          'Igual que con Excel, no se guarda nada hasta que confirmas.',
        ],
      },
    ],
  },
  {
    key: 'always',
    permission: 'messaging:use',
    title: 'Mensajería Interna',
    route: '/dashboard/messaging',
    topics: [
      {
        id: 'chat-interno',
        title: 'Conversar con tu equipo dentro del sistema',
        steps: [
          'Entra a Mensajería en el menú lateral (/dashboard/messaging).',
          'Crea una conversación nueva y elige a la persona o personas de tu empresa con las que quieres hablar.',
          'Los mensajes se guardan cifrados: nadie fuera de la conversación puede leerlos.',
          'La campanita de mensajes, arriba a la derecha, te avisa cuando tienes mensajes sin leer.',
          'Solo puedes escribirle a gente de tu misma empresa — no es un canal para clientes.',
        ],
      },
    ],
  },
  {
    key: 'hasEventProjects',
    title: 'Calendario y Google Calendar',
    route: '/dashboard/calendar',
    topics: [
      {
        id: 'sincronizar-google',
        title: 'Sincronizar certámenes y cumpleaños con Google Calendar',
        steps: [
          'Ve a Calendario & Google Sync (/dashboard/calendar).',
          'Conecta tu cuenta de Google desde esa pantalla; se sincroniza con el correo con el que iniciaste sesión.',
          'Se envían al calendario los certámenes y galas, y los cumpleaños de las candidatas, con recordatorios automáticos.',
          'Necesitas permiso de escritura sobre proyectos para modificar la sincronización; con solo lectura la ves pero no la cambias.',
        ],
      },
    ],
  },
];

/**
 * Solo las secciones de módulos que la empresa tiene contratados (+ las
 * siempre visibles), y — si se pasan `permissions` — sin las secciones de
 * capacidades transversales que este usuario no tiene habilitadas. Omitir
 * `permissions` devuelve todo lo contratado, sin filtrar por permiso.
 */
export function getVisibleManualSections(features: CompanyFeatureFlags, permissions?: Permission[]): ManualSection[] {
  return MANUAL_SECTIONS.filter((section) => {
    if (section.key !== 'always' && !features[section.key]) return false;
    if (section.permission && permissions && !permissions.includes(section.permission)) return false;
    return true;
  });
}
