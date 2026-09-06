import type { FeatureKey, CompanyFeatureFlags } from '@/lib/auth/modules';

export interface ManualTopic {
  id: string;
  title: string;
  steps: string[];
}

export interface ManualSection {
  /** `'always'` = visible sin importar el plan contratado (navegación, contactos, configuración). */
  key: FeatureKey | 'always';
  title: string;
  route: string;
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
    ],
  },
  {
    key: 'always',
    title: 'Contactos (Clientes y Proveedores)',
    route: '/dashboard/contacts',
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
    ],
  },
  {
    key: 'always',
    title: 'Configuración y Equipo',
    route: '/dashboard/settings',
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
    ],
  },
  {
    key: 'hasPos',
    title: 'Punto de Venta (POS)',
    route: '/dashboard/pos',
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
    ],
  },
  {
    key: 'hasInventory',
    title: 'Inventario y Catálogo',
    route: '/dashboard/products',
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
    ],
  },
  {
    key: 'hasDteBilling',
    title: 'Ventas y Facturación',
    route: '/dashboard/sales',
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
    ],
  },
  {
    key: 'hasPurchases',
    title: 'Compras y Proveedores',
    route: '/dashboard/purchases',
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
    ],
  },
  {
    key: 'hasTreasury',
    title: 'Tesorería y Cobranzas',
    route: '/dashboard/treasury/cxc',
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
    ],
  },
  {
    key: 'hasCrm',
    title: 'Inteligencia de Negocio (Agentes)',
    route: '/dashboard/agents',
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
    ],
  },
  {
    key: 'hasSponsorships',
    title: 'Auspicios y Marcas',
    route: '/dashboard/sponsorships',
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
];

/** Solo las secciones de módulos que la empresa tiene contratados (+ las siempre visibles). */
export function getVisibleManualSections(features: CompanyFeatureFlags): ManualSection[] {
  return MANUAL_SECTIONS.filter((section) => section.key === 'always' || features[section.key]);
}
