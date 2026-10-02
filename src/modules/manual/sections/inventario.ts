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
          'Elige el tipo: Entrada por Ajuste, Salida por Ajuste o Transferencia entre Bodegas (con Multibodega).',
          'Elige producto, bodega, cantidad y costo unitario (en las entradas), y escribe la referencia y el motivo real (merma, error de conteo, etc.).',
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
];
