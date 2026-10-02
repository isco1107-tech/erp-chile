import type { ManualSection } from '../types';

/** Comprar: del pedido interno a la factura del proveedor, importaciones y documentos recibidos. */
export const COMPRAS_SECTIONS: ManualSection[] = [
  {
    id: 'compras',
    key: 'hasPurchases',
    permission: 'purchases:read',
    chapter: 'Compras',
    title: 'Compras, órdenes de compra y recepción',
    summary:
      'Registra las facturas de tus proveedores y la mercadería que llega. Al registrar una compra con productos, el stock sube y el costo (PMP) se recalcula solo; el saldo queda en Cuentas por Pagar.',
    route: '/dashboard/purchases',
    topics: [
      {
        id: 'registrar-compra',
        title: 'Registrar una factura de proveedor',
        permission: 'purchases:write',
        route: '/dashboard/purchases/new',
        steps: [
          'Ve a Compras → Compras y haz clic en "Nueva Factura de Proveedor".',
          'Elige el tipo de documento, escribe el folio del proveedor y la fecha de emisión, y busca al proveedor por RUT o razón social (puedes crearlo ahí mismo).',
          'Agrega los productos con cantidad y costo unitario neto. Para un gasto que no es inventario (arriendo, servicios) usa "+ Agregar línea de gasto": no mueve stock.',
          'Revisa neto, exento, IVA y total, y presiona "Registrar Documento". También puedes guardarla como borrador.',
        ],
        tip: 'Registra todas las facturas de compra del mes: una factura sin registrar es crédito fiscal que pierdes en el F29.',
      },
      {
        id: 'orden-compra',
        title: 'Pedir con una orden de compra',
        permission: 'purchases:orders',
        route: '/dashboard/purchases/orders',
        steps: [
          'Ve a Compras → Órdenes de Compra y crea una nueva: proveedor, fecha esperada, ítems con cantidad y costo.',
          'Usa "Enviar" para mandarla al proveedor.',
          'Cuando llega la mercadería, abre la orden y usa "Registrar Recepción": elige la bodega e ingresa las cantidades que de verdad llegaron (con lote y vencimiento si el producto lo maneja). Puedes recibir en varias entregas.',
          'Cuando llega la factura, usa "Facturar" en la orden: la factura se precarga con lo recibido y no vuelve a mover stock.',
        ],
      },
      {
        id: 'aprobacion-compra',
        title: 'Aprobar compras sobre el umbral',
        permission: 'purchases:approve',
        steps: [
          'El Dueño puede fijar un "Umbral de aprobación de compras" en Configuración → Perfil de Empresa.',
          'Una compra que supera ese monto queda "Pendiente de aprobación" y no afecta el inventario hasta que se apruebe.',
          'Quien tiene permiso ve los botones "Aprobar" y "Rechazar" en el listado de Compras.',
          'Si la factura no coincide con su orden de compra, aparece "No coincide con OC" y queda bloqueada para pago hasta resolverlo.',
        ],
      },
      {
        id: 'nota-credito-proveedor',
        title: 'Registrar una nota de crédito del proveedor',
        permission: 'purchases:write',
        steps: [
          'En "Nueva Factura de Proveedor" elige el tipo nota de crédito y completa "Folio que corrige" con la factura original del mismo proveedor.',
          'Si es una devolución de mercadería, deja los productos vinculados para que el stock baje. Si solo corrige montos, desvincula los productos de las líneas.',
        ],
      },
      {
        id: 'anular-compra',
        title: 'Anular una compra registrada por error',
        permission: 'purchases:cancel',
        steps: [
          'Usa "Anular" en el listado de Compras. Se revierten el stock y el saldo por pagar; el documento queda anulado, no se borra.',
        ],
      },
    ],
  },
  {
    id: 'solicitudes-de-compra',
    key: 'hasPurchases',
    permission: 'purchases:request',
    chapter: 'Compras',
    title: 'Solicitudes de compra y cotizaciones',
    summary:
      'Cualquier persona del equipo pide lo que necesita; una jefatura aprueba; se comparan cotizaciones de varios proveedores y se generan las órdenes de compra al mejor precio, en un solo flujo.',
    route: '/dashboard/purchase-requests',
    topics: [
      {
        id: 'crear-solicitud',
        title: 'Pedir una compra',
        steps: [
          'Ve a Compras → Solicitudes de compra y haz clic en "Nueva solicitud".',
          'Escribe qué se necesita, para cuándo y la justificación, y agrega los ítems con cantidad y unidad.',
          'Guárdala como borrador o usa "Enviar a aprobación".',
        ],
      },
      {
        id: 'aprobar-solicitud',
        title: 'Aprobar o rechazar una solicitud',
        permission: 'purchases:approve',
        steps: [
          'Filtra por "Por aprobar", abre la solicitud y usa "Aprobar" o "Rechazar" (con el motivo).',
          'Una solicitud rechazada vuelve a su autor con el motivo; puede editarla y reenviarla.',
        ],
      },
      {
        id: 'comparar-cotizaciones',
        title: 'Comparar cotizaciones y generar las órdenes',
        permission: 'purchases:orders',
        steps: [
          'En la solicitud usa "Agregar cotización" por cada proveedor: N° de cotización, validez, plazo de entrega, condición de pago y precio por ítem.',
          'El "Comparativo de cotizaciones" marca el mejor precio de cada ítem. Adjudica con "Mejor precio por ítem" o "Todo a" un proveedor.',
          'Con la solicitud aprobada, presiona "Generar OC": se crea una orden de compra por cada proveedor adjudicado.',
        ],
      },
    ],
  },
  {
    id: 'importaciones',
    key: 'hasPurchases',
    permission: 'purchases:read',
    chapter: 'Compras',
    title: 'Importaciones con costeo',
    summary:
      'Una carpeta por embarque: el valor FOB, el tipo de cambio y todos los costos hasta la bodega (flete, seguro, derechos, agente, puerto) se reparten entre los productos para que entren al inventario a su costo real.',
    route: '/dashboard/purchases/imports',
    topics: [
      {
        id: 'abrir-carpeta',
        title: 'Abrir una carpeta de importación',
        permission: 'purchases:write',
        steps: [
          'Ve a Compras → Importaciones y crea una "Nueva carpeta de importación" con los datos del embarque.',
          'En "Productos" agrega cada producto con su cantidad y precio FOB unitario.',
          'En "Costos hasta la bodega" agrega cada costo neto en pesos (flete, seguro, agente, puerto…). Si ya registraste la factura de ese costo en Compras, asóciala.',
        ],
        tip: 'El IVA de importación es crédito fiscal (va al F29), no costo: no lo sumes como costo de la carpeta.',
      },
      {
        id: 'cerrar-carpeta',
        title: 'Cerrar la carpeta e ingresar la mercadería',
        permission: 'purchases:write',
        steps: [
          'Revisa la tabla de productos: muestra el costo unitario puesto en bodega de cada uno y lo compara con su PMP actual.',
          'Presiona "Cerrar e ingresar a bodega": la mercadería entra al inventario a ese costo real y el PMP se recalcula.',
        ],
      },
    ],
  },
  {
    id: 'dte-recibidos',
    key: 'hasPurchases',
    permission: 'purchases:read',
    chapter: 'Compras',
    title: 'DTE recibidos (bandeja de facturas de proveedores)',
    summary:
      'Las facturas, notas y guías electrónicas que te emiten tus proveedores. Cargas el XML, el sistema verifica el timbre, decides aceptar o reclamar dentro del plazo legal y las pasas a Compras sin volver a tipearlas.',
    route: '/dashboard/purchases/inbox',
    topics: [
      {
        id: 'cargar-xml',
        title: 'Cargar los documentos recibidos',
        steps: [
          'Ve a Compras → DTE recibidos y sube los archivos .xml (el EnvioDTE que llega a tu correo de intercambio). Puedes subir varios a la vez.',
          'Cada documento muestra su timbre: si la firma cuadra con los datos, no fue alterado después de emitirse.',
          'Los filtros destacan los que están "Por revisar", con "Plazo por vencer", "Plazo vencido" o "Timbre en problemas".',
        ],
      },
      {
        id: 'aceptar-reclamar',
        title: 'Aceptar o reclamar un documento',
        steps: [
          'Abre el documento y revisa el detalle, las referencias y el proveedor.',
          'Usa "Aceptar" si corresponde, o "Reclamar" indicando el motivo (precio, cantidades, mercadería no recibida…).',
          'La ley da 8 días desde la recepción para reclamar. El reclamo con efecto legal se ingresa además en sii.cl (Registro de Reclamos); aquí queda tu control interno.',
          'Si ya estaba registrado en Compras, se vincula solo; si no, usa "Registrar en Compras" y queda como borrador de compra sin volver a tipear las líneas.',
        ],
      },
    ],
  },
  {
    id: 'archivo-de-facturas',
    key: 'always',
    permission: 'invoicearchive:read',
    chapter: 'Compras',
    title: 'Archivo de facturas',
    summary: 'Guarda cada factura de proveedor con su total y la foto o PDF, y revisa el histórico de compras de cada proveedor. Funciona aunque no uses el módulo de Compras.',
    route: '/dashboard/invoice-archive',
    topics: [
      {
        id: 'archivar-factura',
        title: 'Archivar una factura con su foto',
        permission: 'invoicearchive:write',
        steps: [
          'Ve a Compras → Archivo de facturas y haz clic en "Ingresar factura".',
          'Escribe el proveedor, el total, la fecha y, si quieres, el N° de factura y una nota.',
          'Usa "Tomar foto" (desde el celular) o "Elegir archivo" para adjuntar la imagen o el PDF, y guarda.',
        ],
      },
      {
        id: 'historico-proveedor',
        title: 'Ver lo comprado a cada proveedor',
        steps: [
          'Busca el proveedor y haz clic en su fila: se despliegan sus facturas con la última fecha y el total comprado.',
          'Usa "Ver" para abrir la imagen o el PDF de cada factura.',
        ],
      },
    ],
  },
];
