import type { ManualSection } from '../types';

/** Inteligencia de negocio, CRM comercial, personas y sitios web. */
export const GESTION_SECTIONS: ManualSection[] = [
  {
    id: 'inteligencia-360',
    key: 'hasIntelligence',
    permission: 'intelligence:view',
    chapter: 'Inteligencia de Negocio',
    title: 'Centro de Inteligencia 360',
    summary:
      'Una lectura completa de tu empresa calculada con tus documentos reales: puntaje de salud, señales de alerta, clientes y productos que más importan, caja proyectada a 13 semanas y dónde se atasca tu operación. No se registra nada extra.',
    route: '/dashboard/intelligence',
    topics: [
      {
        id: 'radiografia',
        title: 'Leer la Radiografía 360',
        steps: [
          'Ve a Inteligencia de Negocio → Radiografía 360.',
          'Arriba ves el puntaje de salud (0 a 100) y su diagnóstico por dimensión: liquidez, rentabilidad, crecimiento, cobranza, inventario y diversificación de clientes. Cada una dice qué hacer.',
          'Las "Señales de hoy" son alertas automáticas sobre tus datos (ventas bajo el ritmo del mes anterior, cartera vencida, clientes de alto valor que dejaron de comprar, productos bajo costo…), ordenadas por urgencia.',
          'Una dimensión sin datos no se inventa: aparece sola cuando existan (por ejemplo, inventario o cuentas por cobrar).',
        ],
      },
      {
        id: 'clientes-productos',
        title: 'Segmentación de clientes y productos',
        steps: [
          'Clientes: la segmentación RFM los agrupa por recencia, frecuencia y monto (Campeones, Leales, En riesgo, No se pueden perder…), cada grupo con una acción sugerida.',
          'Productos: la matriz venta × margen separa Estrellas, Motores de volumen, Joyas de nicho y productos A revisar, y lista el inventario sin rotación en 90 días.',
          'Las boletas a consumidor final (sin RUT) no cuentan como cliente: se muestran aparte.',
        ],
      },
      {
        id: 'simulador',
        title: 'Simular decisiones antes de tomarlas',
        steps: [
          'En "Simulador" mueve precio, volumen, costo de compra y días de cobro, inventario o pago.',
          'Ves al instante el efecto anual en utilidad bruta y la caja que liberas o inmovilizas. Si bajas el precio, te dice cuánto más tendrías que vender para empatar.',
          'No guarda nada: es para explorar escenarios.',
        ],
      },
      {
        id: 'caja-13-semanas',
        title: 'Anticipar un problema de caja (13 semanas)',
        route: '/dashboard/intelligence/cash-forecast',
        steps: [
          'Ve a Inteligencia de Negocio → Caja a 13 semanas e ingresa tu saldo actual en bancos.',
          'Verás semana a semana lo que entra (facturas por cobrar, cuotas, pagarés) y lo que sale (proveedores, sueldos, cotizaciones, IVA estimado).',
          'Si en alguna semana el saldo proyectado queda negativo, la pantalla te avisa con anticipación.',
          'Con "recuperación de lo vencido" decides cuánto de la cartera morosa esperas cobrar.',
        ],
      },
      {
        id: 'flujos',
        title: 'Encontrar cuellos de botella en tus procesos',
        route: '/dashboard/intelligence/flows',
        steps: [
          'Ve a Inteligencia de Negocio → Flujos del negocio: reconstruye de cotización a cobro, de compra a pago y (con CRM) de prospecto a negocio, con tus documentos reales.',
          'Cada etapa muestra volumen, monto y conversión; cada tramo, su tiempo mediano contra una referencia sana.',
          'La etapa más lenta queda marcada como cuello de botella. Desde ahí puedes crear una automatización para atacarla.',
        ],
      },
    ],
  },
  {
    id: 'agentes',
    key: 'hasCrm',
    permission: 'agents:view',
    chapter: 'Inteligencia de Negocio',
    title: 'Agentes ejecutivos (CEO, CFO, COO, Ventas)',
    summary:
      'Un equipo ejecutivo virtual que analiza tus ventas, compras, inventario y tesorería reales y te deja recomendaciones para revisar. Nunca cambian nada por su cuenta.',
    route: '/dashboard/agents',
    topics: [
      {
        id: 'agentes-ejecutivos',
        title: 'Revisar las recomendaciones',
        steps: [
          'Ve a Inteligencia de Negocio → Agentes: cada rol corre automáticamente y deja sus recomendaciones en "Recomendaciones pendientes de revisar".',
          'Lee cada una y decide: "Marcar como revisada" si la tomaste en cuenta o "Descartar" si no aplica.',
          'Con "Analizar ahora" pides un análisis fresco de un rol sin esperar a la próxima corrida.',
        ],
      },
    ],
  },
  {
    id: 'crm',
    key: 'hasSalesPipeline',
    permission: 'crm:read',
    chapter: 'CRM Comercial',
    title: 'CRM comercial (embudo de negocios)',
    summary:
      'Cada negocio (auspicio, producción de evento, entradas corporativas, presentaciones…) con su etapa, probabilidad y próximo paso. Arrastras las tarjetas para avanzarlas y el sistema te avisa qué negocio se está enfriando.',
    route: '/dashboard/crm',
    topics: [
      {
        id: 'crear-oportunidad',
        title: 'Registrar una oportunidad',
        permission: 'crm:write',
        steps: [
          'Ve a CRM Comercial → Embudo de negocios y haz clic en "Nueva oportunidad" (o búscalo con Ctrl+K).',
          'Elige el tipo de negocio: auspicio, producción de evento, entradas corporativas, presentación de reinas, franquicia o medios.',
          'Asocia la marca (con ficha o como prospecto), la persona de contacto y el certamen. En un auspicio elige el plan del tarifario: el nivel y el precio de lista se completan solos.',
          'Si la marca aporta productos o servicios, activa "Incluye canje" y valorízalo: el canje se reporta aparte del efectivo.',
        ],
        tip: 'El Asistente puede registrarla por ti: "crea una oportunidad de auspicio con Café Andino por $2.000.000".',
      },
      {
        id: 'mover-etapa',
        title: 'Avanzar un negocio en el embudo',
        permission: 'crm:write',
        steps: [
          'Arrastra la tarjeta a la siguiente columna, o ábrela y elige la etapa en el selector.',
          'Al marcarla como Ganada puedes disparar una automatización (por ejemplo, avisar al equipo o enviar un correo de bienvenida).',
          'Al marcarla como Perdida debes indicar el motivo: así el CRM te muestra por qué pierdes negocios.',
        ],
      },
      {
        id: 'seguimiento',
        title: 'Agendar el próximo paso',
        route: '/dashboard/crm/tasks',
        steps: [
          'Dentro de cada oportunidad registra llamadas, reuniones o tareas, hechas o agendadas con fecha.',
          'Las tarjetas sin próximo paso y las actividades vencidas se destacan para que ningún negocio se enfríe.',
          'La Agenda comercial junta los seguimientos del equipo agrupados en vencidos, hoy, mañana y próximos días, con reprogramación en un clic.',
        ],
      },
      {
        id: 'contactos-comerciales',
        title: 'Contactos comerciales (las personas detrás de cada marca)',
        route: '/dashboard/crm/people',
        steps: [
          'En CRM Comercial → Contactos comerciales registra gerentes de marketing, agencias y productores con su cargo, correo y teléfono.',
          'Cada persona muestra sus negocios asociados, para saber con quién hablar en cada marca.',
        ],
      },
      {
        id: 'convertir-auspicio',
        title: 'Convertir un auspicio ganado en contrato',
        permission: 'crm:write',
        steps: [
          'Abre un negocio de tipo Auspicio marcado como Ganado y haz clic en "Convertir en contrato de auspicio".',
          'Si era un prospecto sin ficha, elige o crea ahí mismo la ficha de la marca con su RUT.',
          'El contrato queda Confirmado en Auspicios & Marcas, con los beneficios del plan como checklist de entregables, y enlazado al negocio.',
        ],
      },
      {
        id: 'prospectos-web',
        title: 'Recibir marcas desde el sitio del certamen',
        steps: [
          'Con el formulario "Quiero auspiciar" activo en el sitio público, cada solicitud entra como oportunidad de Auspicio en etapa Prospecto, con su persona de contacto y una tarea para responder al día siguiente.',
          'El formulario pide el "Instagram de tu empresa" (obligatorio): queda en la ficha de la persona de contacto y en las notas del negocio.',
          'Además llega un aviso a la campanita y se dispara la automatización "Prospecto de auspicio desde el sitio del certamen".',
        ],
      },
      {
        id: 'reportes-crm',
        title: 'Analizar el embudo',
        route: '/dashboard/crm/reports',
        steps: [
          'En Reportes comerciales ves el pronóstico ponderado por mes de cierre y el rendimiento por tipo de negocio, certamen, origen y responsable, más los motivos de pérdida.',
          'En la vista Lista (/dashboard/crm/list) ordenas, filtras y exportas todas las oportunidades a Excel, con alertas de riesgo.',
        ],
      },
    ],
  },
  {
    id: 'remuneraciones',
    key: 'hasPayroll',
    permission: 'payroll:read',
    chapter: 'Personas & Equipo',
    title: 'Personas y remuneraciones',
    summary:
      'Ficha de cada trabajador, liquidaciones mensuales con AFP, salud, cesantía e impuesto único, libro de remuneraciones, préstamos y anticipos, vacaciones con aprobación, finiquitos y un portal personal para cada trabajador.',
    route: '/dashboard/hr',
    topics: [
      {
        id: 'ficha-trabajador',
        title: 'Crear la ficha de un trabajador',
        permission: 'payroll:write',
        steps: [
          'Ve a Personas & Equipo → Trabajadores y haz clic en "Nuevo trabajador".',
          'Completa contrato (tipo, jornada, fecha de ingreso), sueldo base, gratificación, colación y movilización, AFP y salud (Fonasa o Isapre con su plan en UF).',
          'Desde la ficha descargas el contrato, el certificado de antigüedad y el de remuneraciones.',
        ],
      },
      {
        id: 'liquidaciones',
        title: 'Calcular las liquidaciones del mes',
        permission: 'payroll:write',
        route: '/dashboard/hr/payroll',
        steps: [
          'Ve a Personas & Equipo → Remuneraciones y haz clic en "Abrir período".',
          'Confirma UF, UTM, ingreso mínimo, topes y tasas contra los indicadores de previred.com: quedan guardados con el período (botón "Parámetros" para revisarlos).',
          'En la "Planilla del mes" ajusta días trabajados, horas extra, bonos, anticipos y otros descuentos, y presiona "Calcular liquidaciones". Puedes recalcular cuantas veces quieras.',
          'Revisa cada liquidación (imprimible), descarga el "Libro de remuneraciones" y la "Planilla de cotizaciones" para cuadrar con Previred.',
          'Al terminar, "Cerrar período" congela las liquidaciones: ya no se podrán recalcular.',
        ],
        tip: 'Los indicadores previsionales nunca vienen fijos en el sistema: confírmalos cada mes en previred.com antes de calcular.',
      },
      {
        id: 'prestamos-anticipos',
        title: 'Préstamos y anticipos de sueldo',
        permission: 'payroll:write',
        steps: [
          'En la ficha del trabajador, pestaña "Préstamos y anticipos", usa "Préstamo" (monto, cuotas y primer descuento) o "Anticipo" (fecha de pago y mes en que se descuenta).',
          'Se descuentan solos en las liquidaciones: una cuota del préstamo en cada liquidación cerrada.',
        ],
      },
      {
        id: 'vacaciones',
        title: 'Registrar y aprobar vacaciones',
        route: '/dashboard/hr/leave',
        steps: [
          'Ve a Vacaciones & Permisos y haz clic en "Nueva solicitud": el sistema cuenta los días hábiles (ajústalos si hay feriados).',
          'Una jefatura la aprueba o rechaza. Solo las vacaciones aprobadas descuentan del saldo.',
          'A la derecha ves el saldo de cada trabajador: 15 días hábiles por año (1,25 por mes trabajado).',
        ],
      },
      {
        id: 'finiquito',
        title: 'Calcular un finiquito',
        permission: 'payroll:write',
        steps: [
          'En la ficha del trabajador, pestaña "Finiquito", completa fecha de término, causal, última remuneración, valor de la UF, feriado pendiente y otros haberes o descuentos (se precargan desde la ficha).',
          'Revisa el resultado (incluye el saldo de préstamos) y guarda el borrador; descarga el documento.',
          'Cuando esté firmado, déjalo como definitivo: se registra el término, los préstamos quedan saldados y los anticipos pendientes se anulan.',
        ],
      },
      {
        id: 'portal-trabajador',
        title: 'Portal del trabajador',
        permission: 'payroll:write',
        steps: [
          'En la ficha, pestaña "Portal del trabajador", genera el enlace personal y compártelo solo con esa persona.',
          'Sin usuario ni contraseña, el trabajador ve y descarga sus liquidaciones cerradas, revisa su saldo de vacaciones y pide días.',
          'Usa "Revocar" si el enlace llegó a otra persona.',
        ],
      },
    ],
  },
  {
    id: 'organigrama',
    key: 'hasOrgChart',
    permission: 'orgchart:read',
    chapter: 'Personas & Equipo',
    title: 'Organigrama',
    summary: 'La estructura de tu equipo: qué cargo tiene cada colaborador y a quién reporta, dibujada como árbol.',
    route: '/dashboard/org-chart',
    topics: [
      {
        id: 'cargos-jerarquia',
        title: 'Definir cargos y quién reporta a quién',
        permission: 'orgchart:write',
        route: '/dashboard/org-chart/manage',
        steps: [
          'Ve a Personas & Equipo → Organigrama y haz clic en "Gestionar cargos y jerarquía".',
          'En "Catálogo de cargos" agrega cada cargo (ej. "Jefe de Ventas") con su nivel opcional y presiona "+ Agregar cargo".',
          'En la tabla de colaboradores asigna a cada persona su cargo y a quién reporta. Las personas son los usuarios de tu equipo (Configuración → Equipo & Colaboradores).',
          '"Sugerir con IA" propone una estructura a partir de los datos actuales; revísala antes de aplicarla.',
        ],
      },
    ],
  },
  {
    id: 'sitios-web',
    key: 'hasWebSites',
    permission: 'websites:read',
    chapter: 'Sitios web',
    title: 'Sitios web',
    summary:
      'Arma el sitio de tu empresa sin escribir código (o pega tu propio HTML), publícalo en una dirección de la plataforma o en tu dominio, y recibe los mensajes de su formulario de contacto. También sirve como servicio de diseño web para tus clientes.',
    route: '/dashboard/web-sites',
    topics: [
      {
        id: 'crear-sitio-asistente',
        title: 'Crear un sitio con el asistente',
        permission: 'websites:write',
        route: '/dashboard/web-sites/new',
        steps: [
          'Haz clic en "Nuevo sitio" dentro de Sitios web.',
          'Paso 1: elige el tipo (Página de captación, Sitio de empresa, Portafolio, Catálogo, Evento, Profesional independiente o En blanco) y revisa las secciones esenciales que sugiere.',
          'Paso 2: elige "Guiado" (recomendado, por secciones con ejemplos) u "HTML propio" (tu HTML y CSS; sin JavaScript ni formularios).',
          'Paso 3: escribe el nombre, la dirección pública (/web/tu-direccion, se autogenera) y, si corresponde, asocia un cliente.',
        ],
      },
      {
        id: 'armar-contenido-que-le-falta',
        title: 'Armar el contenido y usar la lista "Qué le falta"',
        permission: 'websites:write',
        steps: [
          'En la pestaña Contenido (modo Guiado) agrega secciones: Portada, Texto, Imagen, Galería, Servicios o beneficios, Llamado a la acción, Preguntas frecuentes, Testimonios, Contacto.',
          'Sube, baja, oculta, duplica o elimina secciones con los controles de cada una, y reemplaza los textos de ejemplo por los tuyos.',
          'Abre "Qué le falta": resuelve los ítems obligatorios que bloquean la publicación (portada con título, forma de contacto, enlaces válidos, textos de ejemplo reemplazados) y revisa las recomendaciones.',
        ],
      },
      {
        id: 'subir-imagenes-describirlas',
        title: 'Subir imágenes y describirlas',
        permission: 'websites:write',
        steps: [
          'En la pestaña Imágenes, o al editar una sección, sube JPG, PNG o WEBP (máx. 4 MB, hasta 60 por sitio).',
          'Escribe una descripción (alt) para cada imagen: la usan lectores de pantalla y buscadores.',
          'Una imagen en uso no se puede eliminar: primero quítala de las secciones.',
        ],
      },
      {
        id: 'cambiar-colores-tipografia',
        title: 'Cambiar colores y tipografía',
        permission: 'websites:write',
        steps: [
          'En la pestaña Diseño define color principal, acento, fondo y texto; el sistema avisa si el texto no se lee bien sobre el fondo.',
          'Elige tipografía (Moderna, Clásica o Editorial), esquinas, barra superior y texto del pie.',
        ],
      },
      {
        id: 'publicar-despublicar',
        title: 'Publicar y despublicar',
        permission: 'websites:publish',
        steps: [
          'Haz clic en "Publicar", revisa el resumen de "Qué le falta" y confirma.',
          'Lo publicado es una copia: seguir editando no cambia el sitio en internet hasta que pulses "Publicar cambios".',
          '"Despublicar" lo saca de internet. Un sitio publicado hay que despublicarlo antes de eliminarlo; también puedes archivarlo o duplicarlo.',
        ],
      },
      {
        id: 'recibir-mensajes-formulario',
        title: 'Recibir mensajes del formulario',
        steps: [
          'Los mensajes del formulario de contacto llegan a la pestaña "Mensajes" del sitio, con aviso en la campanita.',
          'Márcalos como leídos o elimínalos. Para recibirlos también por correo, crea una automatización con el disparador "Mensaje desde un sitio web".',
        ],
      },
      {
        id: 'usar-dominio-propio',
        title: 'Usar tu propio dominio',
        permission: 'websites:publish',
        steps: [
          'En Ajustes escribe tu dominio (ej. minegocio.cl).',
          'Crea en tu proveedor de DNS los registros que te muestra el sistema y pulsa "Revisar estado"; puede tardar hasta 24 horas.',
          'Un dominio solo puede usarlo un sitio o certamen a la vez.',
        ],
      },
      {
        id: 'armar-sitio-cliente',
        title: 'Armar el sitio para un cliente',
        permission: 'websites:write',
        steps: [
          'Al crear el sitio (paso 3) o en Ajustes, asócialo a un cliente: así sabes para quién es cada sitio.',
          'Con un sitio listo, usa "Duplicar" en la lista para reutilizar el armado con otro cliente.',
          'Ven y editan dueño, administradores y ventas; publicar, archivar, eliminar y dominio solo dueño y administradores.',
        ],
      },
    ],
  },
];
