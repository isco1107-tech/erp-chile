import type { ManualSection } from '../types';

/** Productos, existencias, conteos, lotes y etiquetas. */
export const INVENTARIO_SECTIONS: ManualSection[] = [
  {
    id: 'catalogo-inventario',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Catálogo de productos e inventario',
    summary:
      'El catálogo guarda cada producto con su precio y si paga IVA. Inventario muestra cuánto hay en cada bodega, su costo (PMP) y el Kardex: el historial de cada entrada y salida.',
    route: '/dashboard/products',
    topics: [
      {
        id: 'crear-producto',
        title: 'Agregar un producto al catálogo',
        permission: 'products:write',
        steps: [
          'Ve a Inventario → Catálogo de Productos y haz clic en "Nuevo producto".',
          'Completa SKU, nombre, código de barras (escanéalo), marca, categoría, unidad y precio neto.',
          'Marca si es exento de IVA: sus líneas irán al total exento, tanto en ventas como en el Punto de Venta.',
          'Opcional: stock mínimo (para alertas), foto y "Maneja lotes y vencimiento" si necesitas trazabilidad por lote.',
          'Guarda. El stock inicial no se escribe en la ficha: se carga con una compra, una importación masiva o un ajuste de inventario.',
        ],
        tip: 'Para cargar muchos productos de una vez usa Configuración → Importación Masiva con la plantilla Excel.',
      },
      {
        id: 'eliminar-archivar-producto',
        title: 'Eliminar o archivar un producto',
        permission: 'products:write',
        steps: [
          'Ve a Inventario → Catálogo de Productos y busca el producto.',
          'Haz clic en "Eliminar" si fue un error de carga: solo se puede si nunca tuvo movimientos, ventas, compras ni documentos y su stock es cero.',
          'Si ya tiene historial, haz clic en "Archivar": deja de aparecer en el Punto de Venta y en los selectores, pero conserva su historial.',
          'Para verlo de nuevo, marca "Mostrar archivados" y haz clic en "Restaurar".',
        ],
        tip: 'Si el sistema no te deja eliminar un producto, el mensaje te dice el motivo: archívalo en vez de borrarlo.',
      },
      {
        id: 'ver-kardex',
        title: 'Ver existencias y el Kardex de un producto',
        route: '/dashboard/inventory',
        steps: [
          'Ve a Inventario → Inventario: cada fila es un producto en una bodega con su cantidad, PMP y valor.',
          'Usa el selector de bodegas para ver solo una y el buscador por SKU o nombre.',
          'Haz clic en la fila: abajo se abre el Kardex con fecha, tipo de movimiento, cantidad, costo, stock y PMP antes y después, y el documento que lo originó.',
        ],
      },
      {
        id: 'ajustar-stock',
        title: 'Ajustar stock o transferir entre bodegas',
        permission: 'inventory:write',
        route: '/dashboard/inventory',
        steps: [
          'En Inventario haz clic en "Ajuste de Stock / Entrada Directa".',
          'Elige el tipo: "Entrada por ajuste (sobrante, stock inicial)", "Salida por ajuste (merma, vencido, pérdida)", "Traslado entre bodegas" (con Multibodega) o "Entrada de mercadería comprada (sin factura)". Debajo del tipo se explica qué hace cada uno.',
          'Elige producto, bodega, cantidad y costo unitario (en las entradas), y escribe la referencia. En una salida elige el "Motivo de la salida"; con "Otro motivo" cuenta en las notas qué pasó.',
          'Las ventas no se registran aquí: salen de Ventas o del Punto de Venta. Si tienes la factura del proveedor, regístrala en Compras para que quede la deuda y el IVA.',
          'Con Multibodega, "+ Bodega" crea una bodega nueva con nombre y código.',
        ],
        tip: 'Nunca edites el producto para "arreglar" el stock: corrige siempre con un ajuste, que queda en el Kardex y en Auditoría.',
      },
      {
        id: 'costo-pmp',
        title: 'Entender el costo (PMP)',
        steps: [
          'El costo de cada producto es el Precio Medio Ponderado: en cada compra se promedia lo que tenías a su costo con lo que entró al suyo, según las cantidades.',
          'No se actualiza a mano. Si un costo saltó a un valor raro, revisa en el Kardex la última compra: casi siempre es una cantidad o un precio mal ingresado.',
          'Las ventas descuentan al PMP vigente en ese momento: así se calcula el margen.',
        ],
      },
      {
        id: 'stock-negativo',
        title: 'Qué pasa si intento vender sin stock',
        steps: [
          'Por defecto el sistema bloquea vender más de lo que hay en la bodega, para que el Kardex no quede negativo.',
          'Si el stock del sistema está mal, corrígelo con un ajuste o una toma de inventario.',
          'Si tu negocio vende contra pedido, el Dueño puede activar "Permitir ventas con stock negativo" en Configuración → Perfil de Empresa.',
        ],
      },
      {
        id: 'empaques',
        title: 'Vender por caja o pack (empaques)',
        permission: 'products:write',
        steps: [
          'Edita el producto en el Catálogo: en la sección "Empaques" agrega cada caja o pack (ej. "Caja x12") con sus unidades y su código de barras propio.',
          'Al escanear el código del empaque en una venta, conteo o etiqueta, el sistema suma las unidades que contiene.',
        ],
      },
    ],
  },
  {
    id: 'toma-de-inventario',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Toma de inventario (conteo físico)',
    summary:
      'Cuenta lo que hay en bodega —a mano o con lector de códigos— y ajusta el stock a lo contado, con su asiento al costo PMP. Detecta mermas, robos y errores antes de que lleguen al balance.',
    route: '/dashboard/inventory/counts',
    topics: [
      {
        id: 'abrir-conteo',
        title: 'Abrir una toma de inventario',
        permission: 'inventory:write',
        steps: [
          'Ve a Inventario → Toma de inventario y haz clic en "Nueva toma de inventario".',
          'Elige la bodega, qué productos contar y una nota (ej. "Cierre de año, pasillo 3").',
          'El sistema toma una foto del stock en ese momento. Puedes seguir vendiendo mientras cuentas.',
        ],
      },
      {
        id: 'contar',
        title: 'Contar con lector o a mano',
        permission: 'inventory:write',
        steps: [
          'Usa "Hoja de conteo" para imprimir la planilla si cuentas en papel.',
          'Con lector: escanea cada código (o escribe el SKU y Enter) y suma una unidad, o las del empaque.',
          'A mano: escribe la cantidad contada de cada producto. Guarda seguido con el botón "Guardar".',
          'Los filtros "Sin contar" y "Con diferencia" te muestran lo que falta y lo que no calza; arriba ves el sobrante y faltante valorizados.',
        ],
      },
      {
        id: 'contabilizar-conteo',
        title: 'Contabilizar el conteo',
        permission: 'inventory:write',
        steps: [
          'Si recorriste toda la bodega, "No contados en cero" deja en 0 lo que no encontraste.',
          'Presiona "Contabilizar": el stock se ajusta a lo contado (los no contados no se tocan) y se genera el asiento. No se puede deshacer.',
          'Mientras no lo contabilices, "Anular" descarta el conteo sin cambiar el stock.',
        ],
      },
    ],
  },
  {
    id: 'lotes-vencimientos',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Lotes y vencimientos',
    summary: 'Saldo por lote de los productos que llevan trazabilidad. Las salidas consumen primero el lote que vence antes (FEFO).',
    route: '/dashboard/inventory/lots',
    topics: [
      {
        id: 'revisar-lotes',
        title: 'Revisar lotes por vencer',
        steps: [
          'Activa "Maneja lotes y vencimiento" en la ficha del producto: desde entonces cada entrada pide lote y fecha de vencimiento.',
          'En Inventario → Lotes y vencimientos filtra por Vencidos, Por vencer, Vigentes o Sin vencimiento, y por bodega.',
          'Busca por lote, producto o SKU para rastrear un lote puntual.',
          'Las ventas sacan primero el lote que vence antes; lo vencido conviene darlo de baja con un ajuste.',
        ],
      },
    ],
  },
  {
    id: 'trazabilidad',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Trazabilidad de productos',
    summary: 'El recorrido de un producto en un tablero (de la orden de compra a la venta o la pérdida), su línea de tiempo y el seguimiento de cada unidad por número de serie.',
    route: '/dashboard/inventory/trazabilidad',
    // Sin captura hasta correr scripts/capture-manual-screenshots.ts contra una base local.
    screenshot: null,
    topics: [
      {
        id: 'panel-trazabilidad',
        title: 'Revisar el estado de la trazabilidad',
        steps: [
          'Ve a Inventario → Trazabilidad. Antes de buscar un producto verás el estado de toda la empresa: productos con lotes y con series, lotes vencidos o por vencer, órdenes de compra en camino y el porcentaje de ventas y llegadas con documento enlazado.',
          '"Qué atender" lista lo que impide seguir bien el inventario (lotes vencidos, stock sin lote, series que no calzan con el stock, órdenes atrasadas). Cada fila lleva a la pantalla donde se resuelve.',
          '"Stock sin lote" muestra los productos con lotes que tienen unidades en SIN-LOTE: en un retiro no se sabría de qué proveedor vinieron.',
          'Presiona "Excel" para descargar el estado completo.',
        ],
      },
      {
        id: 'ver-recorrido',
        title: 'Ver el recorrido de un producto',
        steps: [
          'Ve a Inventario → Trazabilidad, escribe el nombre, SKU o código de barras y presiona "Buscar".',
          'Elige el producto de la lista. Se abre la vista "Flujo" con seis columnas: En camino, Recepcionado, En bodega, Trasladado, Vendido y Pérdidas y devoluciones.',
          'Cambia el período (7, 30 o 90 días). "En camino" (órdenes de compra enviadas sin recibir completas) y "En bodega" muestran siempre lo de hoy.',
          'En "En bodega" cada bodega indica sus lotes y si todas sus unidades tienen número de serie.',
          'Más abajo, la línea de tiempo muestra cada movimiento con quién lo hizo, el documento de origen y la foto de respaldo si la hay.',
        ],
        tip: 'Una columna vacía significa que no hay nada registrado: la pantalla nunca rellena con datos inventados.',
      },
      {
        id: 'series',
        title: 'Seguir cada unidad por número de serie',
        steps: [
          'En el producto elegido abre la vista "Series".',
          'Presiona "Registrar series", elige la bodega donde están y escribe una serie por línea (hasta 500 por vez). Opcionalmente indica lote, proveedor y una nota.',
          'Cada serie aparece en la columna "En bodega". Desde su tarjeta puedes "Marcar vendida" (y asociarla a la venta), "Dar de baja (pérdida)" explicando qué pasó, o "Devolver al proveedor".',
          'Una serie vendida, perdida o devuelta puede "Volver a bodega" (por ejemplo, una devolución de cliente).',
          'Para cambiar series de bodega marca sus casillas y presiona "Trasladar seleccionadas": mueve también el stock, igual que un traslado normal.',
        ],
        tip: 'Registrar o cambiar de estado una serie no mueve el stock: la entrada de mercadería, las ventas y las mermas siguen su propio camino. Solo el traslado de series mueve stock.',
      },
      {
        id: 'series-automaticas',
        title: 'Series y garantía en la recepción y la venta',
        steps: [
          'En la ficha del producto (Catálogo de Productos) marca "Se controla por número de serie" y, si corresponde, escribe los meses de garantía.',
          'Al confirmar una recepción de una orden de compra, los productos con serie piden las series: una por línea, tantas como unidades. Entran en la bodega de la recepción con su proveedor y su lote.',
          'Al emitir un documento en Ventas, los productos con serie muestran bajo su línea un campo "Series" (una por línea). Las series indicadas quedan vendidas a ese documento y su garantía empieza ese día. Si anulas el documento, vuelven a la bodega.',
          'Si anulas una recepción, sus series se retiran, siempre que sigan en bodega. Si alguna ya se vendió, la anulación se rechaza.',
          'Para ver el recorrido de una unidad escribe su número en "Buscar un número de serie": muestra su origen, ubicación, venta, cliente (si tienes acceso a Ventas), garantía y órdenes de servicio técnico.',
        ],
        tip: 'Un producto con serie vendido sin indicar sus series no se bloquea: aparece en "Qué atender" como unidad vendida sin serie, para asignarla con "Marcar vendida". El Punto de Venta aún no pide las series por unidad en pantalla.',
      },
    ],
  },
  {
    id: 'retiro-de-lote',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Retiro de lote',
    summary: 'La genealogía de un lote: de dónde vino, en qué se transformó, a qué clientes llegó y cuánto queda. Para un retiro del mercado o una auditoría.',
    route: '/dashboard/inventory/retiro-de-lote',
    // Sin captura hasta correr scripts/capture-manual-screenshots.ts contra una base local.
    screenshot: null,
    topics: [
      {
        id: 'rastrear-lote',
        title: 'Rastrear un lote',
        steps: [
          'Ve a Inventario → Retiro de lote, busca el producto y elígelo.',
          'Elige el lote de la lista (se ve su vencimiento y cuánto queda).',
          'Arriba ves lo recibido, lo despachado, lo que queda en bodega y los clientes alcanzados. "De dónde vino" muestra el proveedor y el documento de entrada; si se fabricó, la orden de producción con los lotes de insumo.',
          '"A quién llegó" lista los clientes con las unidades netas de devoluciones y sus documentos. Quien no tiene acceso a Ventas no ve esta parte.',
          'Presiona "Descargar Excel" para el libro del retiro (resumen, origen, ventas, clientes, existencias).',
        ],
        tip: 'Solo se enlazan al documento los movimientos hechos después de esta versión; los anteriores aparecen con su referencia en texto. Si el lote no cuadra, la pantalla lo avisa. Para seguir un producto fabricado hasta el cliente, informa su lote al terminar la producción.',
      },
    ],
  },
  {
    id: 'etiquetas',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Etiquetas con código de barras',
    summary: 'Imprime etiquetas de góndola o de producto en hojas A4 o en rollo para impresora de etiquetas, con el código de barras del producto o su SKU.',
    route: '/dashboard/inventory/labels',
    topics: [
      {
        id: 'imprimir-etiquetas',
        title: 'Imprimir etiquetas',
        steps: [
          'Ve a Inventario → Etiquetas y agrega productos buscándolos o pasando el lector por su código.',
          'Indica cuántas copias de cada uno.',
          'Elige el formato: hoja A4 de 24 o 40 etiquetas, o rollo de 50 × 25 mm.',
          'Presiona "Imprimir" y en el diálogo usa escala 100% sin encabezados ni pies de página.',
        ],
        tip: 'Si un código tiene tildes o Ñ, el lector no lo lee: asígnale un código de barras en la ficha del producto.',
      },
    ],
  },
  {
    id: 'bodega-movil',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Bodega móvil (app del bodeguero)',
    summary:
      'Una app para el celular del bodeguero: recibe mercadería, registra mermas y traslados, y consulta stock con la cámara o un lector de códigos. Funciona aunque se vaya la señal y todo llega al Kardex marcado como «App bodega».',
    route: '/dashboard/inventory/mobile',
    topics: [
      {
        id: 'instalar-app-bodega',
        title: 'Abrir e instalar la app en el celular',
        steps: [
          'Ve a Inventario → Bodega móvil y escanea el código QR con la cámara del celular (o escribe la dirección que aparece junto al código).',
          'Inicia sesión con tu usuario. La app abre directo en la pantalla de la bodega.',
          'Para tenerla como una app: en Android abre el menú del navegador y elige "Instalar app"; en iPhone toca Compartir y "Agregar a inicio". También está "Instalar la app en el teléfono" en el menú (los tres puntos) de la app.',
          'Cuando la cámara lo pida, acepta el permiso.',
        ],
        tip: 'Cada persona entra con su propio usuario. Si el celular se comparte, cierra sesión desde el menú de la app: lo que quedó sin enviar se conserva y se manda la próxima vez que entres con la misma cuenta.',
      },
      {
        id: 'recibir-mercaderia-celular',
        title: 'Recibir mercadería desde el celular',
        permission: 'inventory:write',
        steps: [
          'En la app toca "Llegada de mercadería". Si tienes varias bodegas, elige la bodega arriba.',
          'Elige el "Proveedor *": de quién llega la mercadería. Es obligatorio cuando la empresa tiene proveedores; queda anotado en cada ingreso y ese proveedor pasa a surtir los productos que recibas.',
          'Opcional: escribe el "N° de guía o factura (opcional)".',
          'Toca "Cámara" y apunta al código de barras: se lee solo y suma una unidad (aparta la cámara y vuelve a apuntar para sumar otra). Si el producto no tiene código, toca el botón redondo para sacarle una foto. Con un lector de mano, escanea en el campo "Escanea o escribe código o nombre".',
          'Ajusta la cantidad de cada producto con los botones + y − o escribiéndola. En "Más datos" puedes poner el costo unitario neto (si tu rol puede verlo), lote y vencimiento, o una nota.',
          'Toca "Enviar". Lo que aún se está reconociendo no impide seguir agregando, pero sí enviar: espera o elige el producto a mano.',
        ],
        tip: 'Una llegada con el mismo código de barras de un producto que ya existe se suma a ese producto: nunca se duplica. Si el proveedor no está en la lista, créalo en Clientes & Proveedores marcándolo como proveedor.',
      },
      {
        id: 'series-celular',
        title: 'Registrar series desde el celular',
        permission: 'inventory:write',
        steps: [
          'Los productos marcados "Se controla por número de serie" muestran en su línea un cuadro "Series: N de M". Escribe o lee con el lector la serie de cada unidad y toca "Agregar" (o Enter): cada serie sube la cantidad sola. Con la X de cada serie puedes quitarla.',
          'En "Llegada de mercadería" las series se dan de alta en la bodega, con el proveedor y el lote. En "Devolución de cliente" y "Sobrante", una serie que ya había salido (vendida, perdida o devuelta) vuelve a la bodega y pierde su garantía.',
          'En "Salida o merma" y "Faltante" las series dejan la bodega como perdidas; con el motivo "Devolución al proveedor" quedan como devueltas. En "Traslado entre bodegas" las series cambian de bodega junto con el stock.',
          'No se puede enviar si faltan o sobran series respecto de la cantidad. Si el servidor rechaza una serie (repetida, no registrada o de otra bodega), la operación entera se rechaza y no se mueve nada: corrige la serie y vuelve a enviar.',
        ],
        tip: 'Una operación guardada en el celular antes de que existieran las series se envía igual, sin ellas: el producto queda con "series parciales" en Trazabilidad para completarlas. El lector de la cámara de la app aún no lee series; usa un lector de mano o escríbelas.',
      },
      {
        id: 'merma-traslado-celular',
        title: 'Dar de baja una merma, un producto en mal estado o una degustación',
        permission: 'inventory:write',
        steps: [
          'En la app toca "Salida o merma". Si tienes varias bodegas, elige de cuál sale.',
          'Elige el motivo: Vencido, Mal estado o dañado, Merma de manipulación o proceso, Degustación o muestra, Consumo interno, Donación, Devolución al proveedor, Pérdida o robo u Otro motivo. Con "Otro motivo" debes contar qué pasó en "Cuenta qué pasó *".',
          'Agrega los productos con la cámara, el lector o el buscador. En cada producto toca "Sacar foto" para adjuntar una foto del producto en cuestión (si lo identificaste con una foto, esa misma sirve). Sin foto no se puede enviar.',
          'Toca "Enviar". Queda en el Kardex con el motivo, la foto y el nombre de quien hizo el ajuste.',
          'Para diferencias de conteo usa "Faltante" (menos de lo que dice el sistema) o "Sobrante" (más). Para mover productos a otra bodega toca "Traslado entre bodegas" (solo aparece con más de una bodega) y elige la bodega de destino en "Va a".',
          'Si en el celular aparece "Solo hay N", la cantidad supera lo que dice el sistema: el servidor rechazará el movimiento si de verdad no alcanza.',
        ],
        tip: 'Las salidas descuentan al costo promedio (PMP) vigente y respetan los lotes: sale primero lo que vence antes. Cada bodega descuenta de su propio stock; revisa lo registrado en Inventario → Movimientos de bodega.',
      },
      {
        id: 'identificar-foto-celular',
        title: 'Identificar un producto con una foto',
        permission: 'inventory:write',
        steps: [
          'En la lista de cualquier movimiento toca "Cámara" y saca la foto del envase con el botón redondo. La foto queda en la lista como "Identificando el producto…" y puedes seguir agregando otras.',
          'La IA lee primero el código impreso en la etiqueta (SKU, Cód., Art., Ref.) y el código de barras; si coincide con un producto, te lo propone. Si no hay código, usa el nombre, la marca y el contenido.',
          'Si el producto ya existe, aparece con "La IA cree que es este producto. ¿Es correcto?": toca "Sí, es este" para confirmarlo o "Cambiar" para elegir otro. No se puede enviar sin confirmar.',
          'Si hay varios parecidos, elige el correcto de la lista. Si no está en el catálogo, toca "Crear producto nuevo": se abre el formulario con los datos que la IA leyó. Revísalos y toca "Usar este producto".',
          'Si dice "Esperando turno de la IA…" no hagas nada: la foto se identifica sola cuando haya cupo. También puedes tocar "Buscar a mano".',
        ],
        tip: 'Una foto con el SKU legible se identifica más rápido y con más seguridad: acércate a la etiqueta del código. Guarda el código de barras en el producto nuevo (el botón con el ícono de código lo lee con la cámara): la próxima vez se reconoce al escanearlo, sin IA.',
      },
      {
        id: 'crear-producto-celular',
        title: 'Crear un producto nuevo desde el celular',
        permission: 'products:write',
        steps: [
          'Solo se puede en "Llegada de mercadería" o "Sobrante". Saca una foto del producto (o escanea su código) y toca "Crear producto nuevo".',
          'Completa al menos el nombre. Si la foto mostraba el SKU impreso, ya viene escrito en "SKU"; vacío = el sistema asigna uno automático (PRD-000001, PRD-000002…). Marca, unidad, categoría, descripción, precio de venta neto y costo son opcionales.',
          'Recuerda elegir el "Proveedor *" de la llegada: el producto nuevo queda ligado a ese proveedor.',
          'Toca "Usar este producto", pon la cantidad que llegó y "Enviar".',
          'El producto y su primera entrada se crean juntos: si algo falla, no queda un producto a medias. Después, en Inventario → Bodega móvil, ve los productos creados y completa precio y categoría en el Catálogo.',
        ],
        tip: 'Si el producto ya existe con el mismo código de barras, la app lo suma al existente. Si existe uno con el mismo nombre y marca, te lo muestra en "Pendientes y enviados" para que elijas "Sumar a…" o "Es otro producto: crearlo".',
      },
      {
        id: 'sin-senal-celular',
        title: 'Qué pasa si se va la señal o un movimiento se rechaza',
        steps: [
          'Sin señal puedes seguir trabajando: lo que toques en "Enviar" queda guardado en el celular y se manda solo cuando vuelve la conexión. Arriba verás "Sin conexión".',
          'Entra a "Pendientes y enviados" para ver cada movimiento: "En cola", "Enviando…", "Enviado" o "No se aplicó" con el motivo.',
          'Si un movimiento aparece con problema, léelo: por ejemplo "Stock insuficiente". Toca "Reintentar" cuando llegue la mercadería o "Descartar" si fue un error.',
          'Si la sesión venció, la app avisa y pide "Iniciar sesión": no se pierde nada, y lo pendiente se envía al volver a entrar.',
        ],
        tip: 'Enviar dos veces el mismo movimiento nunca lo duplica: cada uno lleva una clave única y el servidor reconoce lo ya aplicado.',
      },
      {
        id: 'ia-fotos-cuota',
        title: 'Cómo se cuida la IA de las fotos',
        steps: [
          'Ve a Inventario → Bodega móvil: la tarjeta "Identificar productos con una foto" muestra una etiqueta que dice si está Disponible, Desactivada o Sin configurar.',
          'La IA se usa solo cuando no hay código de barras: el código se resuelve en el catálogo, sin costo. Una misma foto no se lee dos veces. Cada lectura tarda un par de segundos, porque la IA solo transcribe la etiqueta.',
          'Hay topes por minuto por persona, por empresa y en toda la plataforma, y un tope diario por empresa (se ven en la misma tarjeta). Al llegar a uno, la foto queda en espera en el celular y se identifica sola.',
          'Si el proveedor de la IA responde que está saturado, se pausa la lectura unos segundos para todos y la app reintenta sola.',
        ],
        tip: 'Si "Sin configurar" aparece en tu servidor, la app sigue funcionando con código de barras y búsqueda a mano; avisa a quien administra la plataforma para activar la llave de la IA.',
      },
    ],
  },
  {
    id: 'movimientos-bodega',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Movimientos de bodega',
    summary:
      'El registro de lo que entró y salió de cada bodega, una por una: quién hizo cada ajuste, el motivo (vencido, mal estado, degustación…), el proveedor de las llegadas y la foto de respaldo. Se filtra y se descarga a Excel.',
    route: '/dashboard/inventory/movements',
    topics: [
      {
        id: 'ver-movimientos-bodega',
        title: 'Ver qué entró y salió de una bodega',
        steps: [
          'Ve a Inventario → Movimientos de bodega y elige la bodega en las pestañas de arriba. Cada bodega se ve por separado: nunca se mezclan.',
          'Cada fila muestra la fecha, el producto, el tipo de movimiento, la cantidad, el motivo, el operario que lo hizo, el proveedor (en las llegadas), la foto de respaldo y el stock que quedó.',
          'Toca la foto para verla en grande. Las salidas hechas desde la app del bodeguero traen su foto.',
          'Usa los filtros (Tipo, Motivo, Operario, Proveedor, Desde, Hasta y Producto) y presiona "Aplicar filtros". "Limpiar" los quita. Si hay más movimientos, "Ver más antiguos" carga los siguientes.',
        ],
        tip: 'Los movimientos que nacen de una venta o de un ajuste hecho antes de que existiera este registro no tienen operario: aparece "—".',
      },
      {
        id: 'mermas-por-motivo',
        title: 'Saber cuánto se pierde y por qué',
        steps: [
          'En Movimientos de bodega, elige la bodega y el período con "Desde" y "Hasta".',
          'La tarjeta "Salidas y mermas" resume las unidades por motivo (y el costo, si tu rol puede verlo).',
          'Filtra por "Operario" o por "Motivo" para revisar casos puntuales, por ejemplo todas las degustaciones del mes.',
        ],
      },
      {
        id: 'descargar-movimientos',
        title: 'Descargar los movimientos a Excel',
        steps: [
          'Aplica los filtros que necesites y presiona "Descargar Excel".',
          'El archivo trae una hoja con cada movimiento (con el enlace a la foto) y otra con las salidas por motivo. Cada descarga queda en la bitácora.',
        ],
        tip: 'Si hay más de 10.000 movimientos, el archivo se corta en los más recientes: acota las fechas.',
      },
    ],
  },
  {
    id: 'mermas-responsables',
    key: 'hasShrinkageLiability',
    // Vive dentro de Inventario: se documenta solo con los dos interruptores encendidos.
    anyOfFeatures: ['hasInventory'],
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Mermas y responsables',
    summary:
      'Cada pérdida de una bodega —merma, rotura, vencido, faltante de un conteo— con quién responde por ella: la tienda, el proveedor o el seller dueño de la mercadería en consignación. Sirve para la liquidación con cada productor, y avisa por la campanita de los lotes por vencer.',
    route: '/dashboard/inventory/mermas',
    screenshot: null,
    topics: [
      {
        id: 'ver-mermas-responsables',
        title: 'Ver las pérdidas y quién responde',
        steps: [
          'Ve a Inventario → Mermas y responsables y elige la bodega en las pestañas de arriba. Cada bodega se ve por separado.',
          'Por defecto ves los últimos 30 días. Cambia "Desde" y "Hasta", el "Motivo", el "Responsable" o el "Proveedor o seller que responde" y presiona "Aplicar filtros". "Limpiar" vuelve a lo de siempre.',
          'Arriba ves el total perdido, lo que está a cargo de la tienda, lo que está a cargo de proveedores o sellers y cuántas pérdidas siguen sin asignar (en pesos si tu rol puede ver costos; si no, en unidades).',
          'La tarjeta "Por proveedor o seller" suma lo asignado a cada productor en el período. Toca su nombre para ver solo sus pérdidas.',
        ],
        tip: 'Cuenta como pérdida toda salida con motivo (salvo la devolución al proveedor), los ajustes de salida hechos por una persona y los faltantes de las tomas de inventario. El consumo de producción y las devoluciones por nota de crédito no aparecen.',
      },
      {
        id: 'asignar-responsable',
        title: 'Asignar quién responde',
        permission: 'inventory:write',
        steps: [
          'En la columna "Quién responde", elige "La tienda" o el proveedor o seller en la lista. Se guarda al instante y queda registrado quién lo asignó.',
          'Si la pérdida tiene una sugerencia según los acuerdos de tu empresa, aparece "Sugerido: …" con el botón "Confirmar".',
          'Para aceptar de una vez todas las sugerencias de la bodega y el período, presiona "Confirmar sugerencias". Las que no tienen sugerencia siguen "Sin asignar".',
          'Elige "Sin asignar" para quitar un responsable puesto por error.',
        ],
        tip: 'En la lista aparecen el seller dueño del producto (si es mercadería en consignación) y los proveedores asociados al producto. Si falta uno, asócialo en la ficha del producto.',
      },
      {
        id: 'acuerdos-por-motivo',
        title: 'Definir los acuerdos y los avisos de vencimiento',
        permission: 'settings:company',
        steps: [
          'Abre "Acuerdos por motivo y avisos de vencimiento" (arriba de las pestañas de bodega). En "Quién responde según el motivo", elige para cada motivo si por defecto responde la tienda o el proveedor/seller, o déjalo en "Sin definir".',
          'Si responde el proveedor o seller, se sugiere el seller dueño de la mercadería en consignación; si no es de un seller, el proveedor de la llegada registrada o, si el producto tiene uno solo, ese. Con varios proveedores y sin llegada, decide una persona.',
          'Activa "Avisar de lotes por vencer", elige cuántos días antes en "Avisar con" y presiona "Guardar ajustes". La campanita avisa ese día y el día en que el lote vence.',
        ],
      },
      {
        id: 'descargar-mermas',
        title: 'Descargar para la liquidación',
        steps: [
          'Aplica los filtros (por ejemplo, un seller y el mes) y presiona "Descargar Excel".',
          'El archivo trae cada pérdida con su motivo, operario, quién responde, quién lo asignó y el enlace a la foto. Cada descarga queda en la bitácora.',
        ],
      },
    ],
  },
  {
    id: 'seller-center',
    key: 'hasSellerCenter',
    // Vive dentro de Inventario: se documenta solo con los dos interruptores encendidos.
    anyOfFeatures: ['hasInventory'],
    permission: 'settings:company',
    chapter: 'Inventario',
    title: 'Seller Center (cuentas de sellers)',
    summary:
      'Cuentas con correo o celular y contraseña para cada persona de un seller en consignación. Entran a /proveedor/cuenta y ven, mes a mes, lo vendido de su mercadería con tu comisión y lo que les corresponde, su mercadería en bodega, lo pendiente de liquidar, sus liquidaciones y sus mermas. Nunca ven costos, clientes, documentos ni a otros sellers.',
    route: '/dashboard/contacts',
    screenshot: null,
    topics: [
      {
        id: 'invitar-seller',
        title: 'Invitar a una persona del seller',
        steps: [
          'Al crear un contacto marcado como "Seller (consignación)", completa su correo o teléfono y deja marcada la opción "Crear su invitación al guardar el seller". Necesitas administrar la empresa y tener Seller Center habilitado.',
          'En "Enviar invitación por" elige "Correo del seller" o "WhatsApp al teléfono del seller". Con "Crear contacto" se guardan juntos el seller y su invitación. Por correo se envía su usuario y un enlace provisional; por teléfono aparece "Compartir invitación por WhatsApp" para confirmar el envío desde WhatsApp.',
          'Para un seller existente, abre su ficha y busca la tarjeta "Seller Center: cuentas del seller".',
          'Elige el canal de invitación y escribe su nombre y su correo o celular. Presiona "Invitar". Por correo se envía el enlace; por WhatsApp debes compartirlo con el botón. El enlace permite crear su contraseña, vence en 7 días y sirve una sola vez.',
          'Si la persona ya tiene cuenta porque otra empresa la invitó, entra con su misma contraseña: no se crea una nueva.',
          'Mientras no la acepte aparece "Pendiente de activación". "Reenviar" genera un enlace nuevo y deja sin efecto el anterior; si es por WhatsApp debes volver a compartirlo. "Anular" cancela la invitación.',
        ],
        tip: 'Cada persona tiene su propia cuenta: si alguien deja de trabajar con el seller, desactivas solo a esa persona. El código del "Portal del seller" sigue funcionando aparte.',
      },
      {
        id: 'quitar-acceso-seller',
        title: 'Quitar o devolver el acceso',
        steps: [
          'En la misma tarjeta, presiona "Desactivar" junto a la persona. Deja de entrar de inmediato, aunque tenga la sesión abierta.',
          'Para devolverle el acceso, presiona "Reactivar".',
        ],
      },
      {
        id: 'que-ve-el-seller',
        title: 'Qué ve el seller',
        steps: [
          'Entra en /proveedor/cuenta con su correo o celular y la contraseña que eligió. Puede instalar la app independiente con "Instalar Seller Center". Para recuperar por correo usa "¿Olvidaste tu contraseña?"; si su cuenta es por teléfono, debe contactar a la empresa para verificar su identidad.',
          'Elige el mes y ve lo vendido neto de su mercadería (sin IVA, después de descuentos), tu comisión y lo que le corresponde, por producto: boletas y facturas emitidas menos notas de crédito, con la misma cuenta de sus liquidaciones.',
          'Ve su mercadería en bodega, lo vendido que falta liquidar y sus liquidaciones (por pagar y pagadas).',
          'Ve sus mermas del mes con el motivo y la foto: las de su mercadería desde que la recibiste y las que le asignaste. Si usas "Mermas y responsables", también ve quién respondió por cada una.',
          'Puede descargar todo con "Descargar Excel". Si trabaja con más de una empresa, cambia de una a otra en "Empresa".',
        ],
        tip: 'Es información de tu empresa que ve un tercero: invita solo a personas de sellers de confianza.',
      },
    ],
  },
  {
    id: 'consignacion',
    key: 'hasInventory',
    permission: 'products:read',
    chapter: 'Inventario',
    title: 'Consignación (sellers)',
    summary:
      'Un seller pone productos a la venta sin dejar de ser dueño de la mercadería hasta que se vende. Su stock no entra a tu inventario valorizado ni a tus compras: al vender se le liquida lo vendido menos tu comisión.',
    route: '/dashboard/inventory/consignment',
    // Pendiente: la captura se genera con `scripts/capture-manual-screenshots.ts` contra una base LOCAL
    // con datos de demostración, y esta pantalla se escribió sin una. Al generarla, quitar esta línea.
    screenshot: null,
    topics: [
      {
        id: 'crear-seller',
        title: 'Dar de alta a un seller',
        permission: 'contacts:write',
        route: '/dashboard/contacts',
        steps: [
          'Ve a Clientes & Proveedores y haz clic en "Nuevo contacto".',
          'Completa RUT y razón social, y marca "Seller (consignación)". No lo marques como "Proveedor": a un proveedor se le compra, a un seller no.',
          'Escribe su comisión en "Comisión para tu empresa (%)": es lo que se queda tu empresa de cada venta (ej. 20). Es obligatoria.',
          'Guarda. Un seller puede ser también cliente o proveedor.',
        ],
        tip: 'Marcar a un contacto como seller o cambiar su comisión requiere el permiso de consignación (Dueño, Administrador o Contador), y queda en la bitácora. No puedes quitarle la condición de seller mientras tenga productos, ventas sin liquidar o liquidaciones sin pagar, ni eliminarlo si tiene ventas de su mercadería o liquidaciones.',
      },
      {
        id: 'productos-del-seller',
        title: 'Asignar productos a un seller',
        permission: 'products:write',
        route: '/dashboard/products',
        steps: [
          'Ve a Inventario → Catálogo de Productos y crea o edita el producto.',
          'En "Dueño del producto" elige "Seller: …" en vez de "Propio (lo compras tú)". Este campo aparece cuando ya tienes al menos un seller.',
          'Si este producto tiene una comisión distinta a la del seller, escríbela en "Comisión de este producto (%)". Vacío significa que vale la del seller.',
          'Guarda. En la lista, el producto aparece con la etiqueta "Consignación" y el nombre del seller.',
        ],
        tip: 'Cambiar el dueño o la comisión de un producto requiere el permiso de consignación. El dueño solo se puede cambiar con el stock en 0 en todas las bodegas, para no mezclar lo tuyo con lo del seller; un producto de seller queda con costo 0 y no se compra desde Compras ni se usa en producción. Si cambias de dueño un producto ya vendido, las notas de crédito y anulaciones de esas ventas ya no podrán reponer su stock: usa un ajuste.',
      },
      {
        id: 'recibir-devolver-seller',
        title: 'Recibir y devolver mercadería del seller',
        permission: 'inventory:write',
        steps: [
          'Ve a Inventario → Consignación. En "Existencias por seller" ves, por seller, cada producto suyo con lo que hay en bodega y su comisión.',
          'Para que entre mercadería, haz clic en "Recibir" en la fila del producto, elige la Bodega, escribe la Cantidad y guarda con "Recibir". Si el producto lleva lotes, también se piden Lote y Vencimiento.',
          'Para devolverle mercadería sin venderla, haz clic en "Devolver", elige la Bodega y la Cantidad, y guarda con "Devolver".',
          'Ambos movimientos quedan en el Kardex a nombre del seller, sin compra, sin costo y sin asiento.',
        ],
        tip: 'Si intentas registrar como compra (o desde Compras) la mercadería de un seller, el sistema lo rechaza y te manda a esta pantalla. La devolución al seller no emite guía de despacho: no la documentes además con una Guía de Despacho desde Ventas, porque el stock se descontaría dos veces. No se puede devolver más de lo que hay en la bodega.',
      },
      {
        id: 'liquidar-seller',
        title: 'Liquidar a un seller',
        permission: 'consignment:write',
        steps: [
          'Ve a Inventario → Consignación → pestaña "Liquidaciones". En "Lo que hay por liquidar" ves, por seller, lo vendido y lo que se le debe.',
          'Haz clic en "Liquidar" en la fila del seller: se abre el detalle de cada venta con su neto, tu comisión y lo que se le paga.',
          'Si corresponde, escribe un "Ajuste manual (CLP, opcional)" con su "Motivo del ajuste": negativo descuenta al seller (ej. una nota de crédito por precio), positivo se suma.',
          'Revisa el total "Le pagas al seller" y presiona "Generar liquidación". Queda numerada y congelada. Si las ventas cambian mientras tienes la vista abierta, el sistema no liquida otro monto: vuelve a calcular y te pide confirmar de nuevo.',
        ],
        tip: 'Los montos son netos, sin IVA, y el ajuste manual se escribe en pesos enteros (el punto separa miles: 3.000 son tres mil). La liquidación es el estado de cuenta del seller: no registra el pago ni genera asientos ni documentos tributarios. Una devolución revierte lo que se le acreditó por esas unidades en la venta original, aunque la nota de crédito se emita a otro precio. Si las devoluciones superan lo vendido, el saldo queda pendiente para la próxima.',
      },
      {
        id: 'portal-del-seller',
        title: 'Darle al seller acceso a su portal',
        permission: 'settings:company',
        route: '/dashboard/contacts',
        steps: [
          'Ve a Clientes & Proveedores, haz clic en "Ver ficha" del seller y busca la sección "Portal del seller".',
          'Presiona "Generar código" y entrégaselo (hay botones para "Copiar código", "Copiar enlace" y WhatsApp). El código completo se muestra solo esa vez.',
          'Con su código, en la página /proveedor ve cuánto le queda de su mercadería, lo vendido sin liquidar y sus liquidaciones, y puede descargar un Excel. Solo ve sus propios montos, nunca clientes, documentos, costos ni a otros sellers.',
          'Si no quieres que vea lo que sale (ventas y bajas de 30 días), desmarca "Mostrar también lo que sale". "Desactivar" deja sin efecto su código al instante, y "Generar código nuevo" reemplaza al anterior.',
        ],
        tip: 'Sus liquidaciones las ve siempre, aunque apagues lo que sale.',
      },
      {
        id: 'pagar-anular-liquidacion',
        title: 'Marcar una liquidación como pagada o anularla',
        permission: 'consignment:write',
        steps: [
          'En la pestaña "Liquidaciones", baja a "Liquidaciones generadas". Usa los filtros de seller y estado, y "Ver detalle" para ver cada línea.',
          'Cuando le pagues al seller (transferencia, efectivo…), haz clic en "Marcar pagada", elige la "Fecha de pago", anota la referencia y presiona "Marcar como pagada". Esto solo deja constancia: el pago y su contabilización los haces fuera de esta pantalla.',
          'Si te equivocaste, haz clic en "Anular", escribe el "Motivo" y presiona "Anular liquidación": sus ventas vuelven a quedar pendientes para liquidarlas de nuevo.',
        ],
        tip: 'Una liquidación pagada no se anula. Si después anulas una venta o emites una nota de crédito, el ajuste aparece en la liquidación siguiente.',
      },
    ],
  },
];
