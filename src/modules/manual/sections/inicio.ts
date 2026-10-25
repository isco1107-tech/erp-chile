import type { ManualSection } from '../types';

/**
 * Lo que cualquier usuario necesita antes de tocar un módulo: moverse por el
 * panel, pedir ayuda, sus propios datos de acceso y las herramientas
 * transversales (listados, mensajería, multiempresa).
 */
export const INICIO_SECTIONS: ManualSection[] = [
  { id: 'aplicaciones', screenshot: null, key: 'always', chapter: 'Primeros pasos', title: 'Centro de aplicaciones', summary: 'Instala las aplicaciones para dirección, mostrador, bodega y proveedores desde un solo lugar, con los mismos datos del ERP y los permisos de cada cuenta.', route: '/apps', topics: [{ id: 'instalar', title: 'Elegir e instalar una aplicación', steps: ['Abre Aplicaciones desde el menú o /apps. Elige la tarjeta para tu trabajo.', 'En POS usa Descargar app POS y elige Windows, Mac o Linux. Bodega, Control y Seller Center se instalan desde su propia página con Agregar a pantalla de inicio.', 'Control requiere la cuenta del dueño y consulta datos cada 15 segundos. Si falla la conexión muestra la última consulta como desactualizada. En Control puedes ir a Resumen, Cajas o Actividad y filtrar o buscar movimientos. Seller Center tiene accesos a ventas, mercadería y mermas, búsqueda de productos y liquidaciones adaptadas al teléfono. En Bodega usa Consultar, Mi lista y Envíos para retomar el trabajo sin perder lo pendiente. Los portales propuestos no tienen una descarga hasta resolver sus accesos personales.'] }] },
  {
    id: 'exportar-datos',
    key: 'always',
    anyOfFeatures: ['hasDteBilling', 'hasPos', 'hasInventory'],
    anyOfPermissions: ['sales:read', 'pos:close', 'products:read'],
    chapter: 'Primeros pasos',
    title: 'Exportar datos',
    summary:
      'Un solo lugar para ver y bajar a Excel todas las boletas y demás documentos de venta de la empresa, y todos los movimientos de inventario de todas las bodegas. Lo que ves en pantalla es lo mismo que trae el archivo.',
    route: '/dashboard/exports',
    screenshot: null,
    topics: [
      {
        id: 'boletas',
        title: 'Descargar las boletas y documentos de venta',
        permission: 'sales:read',
        steps: [
          'Abre Exportar datos desde el menú (grupo Principal) y elige la pestaña "Boletas y documentos de venta".',
          'Elige las fechas con los atajos (Hoy, Ayer, Últimos 7 días, Este mes, Mes anterior, Este año, Todo el historial) o escribe "Desde" y "Hasta" y presiona "Aplicar filtros".',
          'En "Documento" elige Boletas (lo habitual), Facturas, Notas de crédito y débito, Guías de despacho o Todos. En "Estado" elige Emitidos, Anulados o ambos. También puedes filtrar por bodega y buscar por folio, nombre o RUT del cliente.',
          'Arriba ves cuántos documentos hay, el total vendido (las notas de crédito restan), el neto con su IVA y cuántos están anulados. Abajo, la lista de a 50 documentos, con Anterior y Siguiente.',
          'Presiona "Descargar Excel". El archivo trae tres hojas: Documentos (una fila por documento), Detalle de productos (una fila por producto vendido) y Resumen por tipo de documento y medio de pago.',
        ],
        tip: 'Un archivo trae como máximo los 20.000 documentos más recientes del filtro. Si hay más, la pantalla lo avisa: baja por mes.',
      },
      {
        id: 'movimientos',
        title: 'Descargar los movimientos de inventario',
        permission: 'products:read',
        steps: [
          'En Exportar datos elige la pestaña "Movimientos de inventario".',
          'Elige el rango de fechas, el tipo de movimiento (llegadas, ajustes de entrada, salidas y mermas, ventas o traslados), la bodega (o "Todas las bodegas") y, si quieres, un producto por nombre, SKU o marca. Presiona "Aplicar filtros".',
          'Cada fila dice la bodega, el producto, el tipo de movimiento, la cantidad, el stock que quedó en esa bodega, el motivo y el operario. Quien puede ver costos también ve el costo.',
          'Presiona "Descargar Excel". El archivo trae una fila por movimiento (con la foto de respaldo como enlace) y una hoja de Resumen por tipo y por bodega.',
        ],
        tip: 'Para filtrar por operario, motivo o proveedor, o ver las fotos en grande, usa Movimientos de bodega en el grupo Inventario.',
      },
      {
        id: 'quien-descarga',
        title: 'Quién puede descargar y qué queda registrado',
        steps: [
          'La pestaña de boletas aparece con el permiso de ver ventas (o, en una empresa que solo tiene Punto de Venta, con el de consultar los turnos de caja). La de movimientos, con el de ver productos.',
          'Cada descarga queda en la bitácora de auditoría con quién la hizo y con qué filtros, porque trae nombres y RUT de clientes.',
          'Si tu empresa tiene Reportes Excel, el botón "Libro completo en Excel" lleva al libro con Panel, Productos, Inventario, Kardex, Ventas, Compras y el resto.',
        ],
      },
    ],
  },
  {
    id: 'primeros-pasos',
    key: 'always',
    chapter: 'Primeros pasos',
    title: 'Primeros pasos en el panel',
    summary:
      'Cómo está organizado el sistema, dónde pedir ayuda y por qué cada persona ve un menú distinto. Léelo primero: en diez minutos sabrás moverte por cualquier pantalla.',
    route: '/dashboard',
    topics: [
      {
        id: 'navegacion',
        title: 'Cómo moverme por el panel',
        steps: [
          'El menú de la izquierda agrupa los módulos que tu empresa tiene contratados (Ventas, Compras, Finanzas, etc.). Si no ves un módulo, no está en tu plan o tu rol no lo usa.',
          'Inicio (ícono de casa) es el resumen del negocio: ventas, compras, IVA, stock crítico y accesos rápidos a lo más usado.',
          'En la barra superior están el buscador, el botón "Cómo usar", el Asistente, las campanitas de mensajes y notificaciones, y tu perfil.',
          'En el celular el menú se abre con el ícono de tres líneas arriba a la izquierda.',
          'Abajo a la izquierda del menú aparece tu nombre y tu rol; desde ahí entras a tu perfil o cierras sesión.',
        ],
      },
      {
        id: 'buscador-global',
        title: 'Saltar a cualquier pantalla con el buscador (Ctrl+K)',
        steps: [
          'Presiona Ctrl+K (Cmd+K en Mac) en cualquier pantalla, o haz clic en el buscador de la barra superior.',
          'Escribe lo que buscas con tus palabras: "factura", "cobranza", "sueldos", "stock". El buscador entiende sinónimos, no solo el nombre exacto del menú.',
          'Presiona Enter para ir a la pantalla elegida.',
        ],
        tip: 'Es la forma más rápida de trabajar cuando ya conoces el sistema: no necesitas recordar en qué grupo del menú está cada cosa.',
      },
      {
        id: 'ayuda-tres-niveles',
        title: 'Las tres formas de pedir ayuda: tutorial, manual y asistente',
        steps: [
          'Tutorial guiado: la primera vez que entras a un módulo se abre solo un recorrido que resalta los botones importantes. Para volver a verlo, usa "Cómo usar" en la barra superior.',
          'Manual de Usuario (menú Ayuda): todos los pasos por módulo, con buscador, capturas y descarga en Word para imprimir. Muestra solo los módulos de tu empresa.',
          'Asistente (barra superior): le escribes con tus palabras lo que necesitas. Te explica paso a paso, te lleva a la pantalla correcta con un enlace, responde cifras de tu empresa y puede hacer tareas por ti (crear un cliente, un producto, una tarea, una cotización en borrador…), siempre pidiéndote confirmar con un botón.',
        ],
        tip: 'Si no sabes por dónde empezar, abre el Asistente y escribe "¿qué hago en esta pantalla?": responde según la pantalla en la que estás.',
      },
      {
        id: 'usar-manual',
        title: 'Usar este manual y descargarlo en Word',
        route: '/dashboard/manual',
        steps: [
          'Abre Ayuda → Manual de Usuario. Arriba eliges "Mi rol" (solo lo que tú puedes hacer) o "Toda la empresa" (todos los módulos contratados, útil para capacitar).',
          'Busca con tus palabras, sin preocuparte de las tildes, o salta a un capítulo desde el índice.',
          'En cada sección tienes "Ir a la pantalla", "Ver tutorial guiado" y "Preguntar al asistente".',
          '"Descargar Word" baja el manual con capturas de pantalla, listo para imprimir o compartir; "Imprimir / PDF" lo imprime directo.',
        ],
      },
      {
        id: 'roles-permisos',
        title: 'Por qué no veo cierta opción',
        steps: [
          'Lo que ves depende de dos cosas: el plan de tu empresa (qué módulos contrató) y tu rol (qué permisos te dieron dentro de esos módulos).',
          'El Dueño ve todo lo contratado. Los demás roles (Administrador, Ventas, Bodega, Contador o uno personalizado) ven solo lo suyo.',
          'Si nadie de tu empresa ve un módulo, es el plan. Si otros lo ven y tú no, es tu rol: pide al administrador que lo revise en Configuración → Equipo & Colaboradores.',
          'Un botón deshabilitado (gris) casi siempre significa que te falta un permiso para esa acción puntual, por ejemplo anular o aprobar.',
        ],
      },
      {
        id: 'notificaciones',
        title: 'Notificaciones y avisos',
        steps: [
          'La campanita de la barra superior muestra avisos del sistema: cobranzas, cuotas vencidas, compras por aprobar, encuestas con mala nota, mensajes de un sitio web, etc.',
          'Haz clic en un aviso para ir directo a la pantalla relacionada.',
          'Tu empresa puede crear avisos propios con Automatizaciones (Configuración → Automatizaciones).',
        ],
      },
      {
        id: 'guardado-seguro',
        title: 'Qué pasa si se corta internet o hago doble clic',
        steps: [
          'Al emitir una venta o un documento, el sistema protege contra duplicados: si reintentas por un corte de conexión, no se crea dos veces.',
          'Si aparece un error de conexión, tus datos siguen en el formulario: espera un momento y vuelve a presionar el botón.',
          'Las acciones importantes (anular, eliminar, contabilizar) piden confirmación antes de ejecutarse.',
        ],
      },
    ],
  },
  {
    id: 'listados',
    key: 'always',
    chapter: 'Primeros pasos',
    title: 'Listados, filtros, impresión y exportación',
    summary: 'Casi todas las pantallas comparten la misma forma de buscar, filtrar, ordenar, imprimir y exportar. Aprende una vez y te sirve en todo el sistema.',
    route: '/dashboard',
    screenshot: null,
    topics: [
      {
        id: 'usar-tablas',
        title: 'Buscar, filtrar y ordenar en cualquier listado',
        steps: [
          'Arriba de cada listado está el buscador (por RUT, nombre, folio o SKU, según la pantalla) y al lado los filtros: estado, fecha, bodega, etc.',
          'Las pestañas o "chips" (Abiertas, Por aprobar, Vencidos…) son filtros rápidos: el número entre paréntesis indica cuántos registros hay en cada una.',
          'Haz clic en el título de una columna con flecha para ordenar por ella.',
          'Si no encuentras un registro, revisa el filtro activo y la paginación antes de volver a crearlo: duplicar un cliente o producto ensucia el historial.',
        ],
      },
      {
        id: 'imprimir-pantalla',
        title: 'Imprimir o guardar como PDF',
        steps: [
          'Los documentos (ventas, liquidaciones, comprobantes) tienen su botón "Imprimir" o "Ver / Imprimir".',
          'En cualquier otra pantalla usa Ctrl+P (Cmd+P en Mac) y elige "Guardar como PDF": se imprime solo el contenido, sin menú ni botones.',
          'En el diálogo de impresión deja la escala en 100% para que tablas y etiquetas salgan del tamaño correcto.',
        ],
      },
      {
        id: 'exportar-excel',
        title: 'Exportar a Excel',
        steps: [
          'Las pantallas que lo permiten tienen un botón "Excel" o "Exportar" arriba a la derecha.',
          'Para los libros tributarios (ventas, compras) y el Kardex valorizado usa Finanzas → Reportes Excel.',
        ],
      },
    ],
  },
  {
    id: 'mi-cuenta',
    key: 'always',
    chapter: 'Primeros pasos',
    title: 'Mi cuenta: perfil, seguridad y dispositivos',
    summary: 'Tus datos personales, la verificación en dos pasos y las sesiones abiertas. Revísalo el primer día para proteger tu cuenta.',
    route: '/dashboard/settings/profile',
    topics: [
      {
        id: 'mi-perfil',
        title: 'Actualizar mis datos y ver mi actividad',
        steps: [
          'Haz clic en tu nombre (abajo a la izquierda del menú) o ve a Configuración → Mi Perfil.',
          'Actualiza tu teléfono de contacto y revisa tu actividad reciente en la plataforma.',
          'En "Mi foto" haz clic en "Subir foto" (PNG, JPG o WEBP, hasta 5 MB); con "Cambiar foto" la reemplazas y con "Quitar foto" vuelves a ver tus iniciales. Tu foto aparece en el menú lateral, la mensajería y el organigrama.',
        ],
      },
      {
        id: 'seguridad-2fa',
        title: 'Activar la verificación en dos pasos (2FA)',
        route: '/dashboard/settings/security',
        steps: [
          'Ve a Configuración → Seguridad.',
          'Escanea el código QR con una app de autenticación (Google Authenticator, Microsoft Authenticator, Authy) e ingresa el código de 6 dígitos que muestra.',
          'Guarda los códigos de respaldo en un lugar seguro: si pierdes el teléfono, son la única forma de entrar.',
          'Desde ese momento, cada inicio de sesión pide tu contraseña y el código de la app.',
        ],
        tip: 'Recomendado para todos los que manejan dinero, sueldos o documentos tributarios.',
      },
      {
        id: 'dispositivos-activos',
        title: 'Cerrar sesiones abiertas en otros dispositivos',
        route: '/dashboard/settings/sessions',
        steps: [
          'Ve a Configuración → Dispositivos Activos: cada fila es un inicio de sesión vigente, con su navegador y última actividad.',
          'Si no reconoces uno, ciérralo: ese dispositivo se desconecta de inmediato.',
          'Si sospechas que alguien entró a tu cuenta, cierra todas las sesiones, cambia tu contraseña y activa la verificación en dos pasos.',
        ],
      },
      {
        id: 'olvide-contrasena',
        title: 'Olvidé mi contraseña',
        steps: [
          'En la pantalla de inicio de sesión haz clic en "¿La olvidaste?", junto al campo de contraseña, y sigue el enlace que llega a tu correo.',
          'Si tu empresa no tiene correo configurado, pide al administrador que use "Restablecer contraseña" en Configuración → Equipo & Colaboradores: te entregará una clave temporal que deberás cambiar al entrar.',
        ],
      },
    ],
  },
  {
    id: 'mensajeria',
    key: 'hasMessaging',
    permission: 'messaging:use',
    chapter: 'Primeros pasos',
    title: 'Mensajería interna',
    summary: 'Chat cifrado entre las personas de tu empresa, dentro del mismo sistema. Ideal para coordinar sin salir del panel.',
    route: '/dashboard/messaging',
    topics: [
      {
        id: 'chat-interno',
        title: 'Conversar con tu equipo',
        steps: [
          'Entra a Mensajería (grupo Principal del menú).',
          'Crea una conversación y elige a la persona o personas de tu empresa.',
          'La campanita de mensajes de la barra superior avisa cuando tienes mensajes sin leer.',
          'Los mensajes se guardan cifrados y solo los ven los participantes. Es un canal interno: no sirve para escribirle a clientes.',
        ],
      },
    ],
  },
  {
    id: 'multiempresa',
    key: 'hasMultiCompany',
    chapter: 'Primeros pasos',
    title: 'Administrar varias empresas',
    summary: 'Si administras más de una empresa con el mismo usuario, cambias entre ellas sin cerrar sesión. Los datos de cada una están totalmente separados.',
    route: '/dashboard',
    screenshot: null,
    topics: [
      {
        id: 'cambiar-empresa',
        title: 'Cambiar de empresa activa',
        steps: [
          'Arriba del menú lateral, bajo el nombre de la empresa, está el selector de empresa.',
          'Elige la otra empresa: el menú, los datos y tus permisos cambian a los de esa empresa.',
          'Ventas, contactos, inventario y usuarios nunca se mezclan entre empresas, aunque las administre la misma persona.',
        ],
      },
    ],
  },
];
