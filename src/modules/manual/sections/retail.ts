import type { ManualSection } from '../types';

/** Métricas de retail: lectura en vivo de ventas y stock por bodega. */
export const RETAIL_SECTIONS: ManualSection[] = [
  {
    id: 'retail-en-vivo',
    key: 'hasRetailMetrics',
    permission: 'retail:read',
    chapter: 'Métricas de retail',
    title: 'Retail en vivo',
    summary:
      'Muestra, producto por producto y en cada bodega, cuánto del stock disponible ya se vendió (sell-through) y para cuántos días alcanza lo que queda según la venta reciente. Se calcula con el kardex y se actualiza sola cada minuto.',
    route: '/dashboard/retail',
    screenshot: null,
    topics: [
      {
        id: 'leer-retail-en-vivo',
        title: 'Leer el panel',
        steps: [
          'Ve a Métricas de retail → Retail en vivo y elige la bodega en las pestañas de arriba. Cada bodega se mide por separado.',
          'Arriba ves lo vendido hoy, el sell-through del período, cuántos productos se agotan pronto y cuántos están agotados aunque se seguían vendiendo.',
          'En la tabla, cada producto muestra su stock, lo vendido hoy y en el período, lo que entró, el sell-through, la venta diaria, los días restantes y su estado.',
          'Toca el título de una columna para ordenar por ella; por defecto aparece primero lo que se acaba antes. Busca por nombre, SKU, marca o categoría y filtra por estado con los botones.',
        ],
        tip: 'La pantalla se vuelve a pedir sola cada minuto mientras la tienes abierta. "Pausar" la detiene y "Actualizar ahora" trae los datos al instante.',
      },
      {
        id: 'como-se-calcula-retail',
        title: 'Cómo se calcula cada cifra',
        steps: [
          'Sell-through = lo vendido ÷ (el stock al empezar el período + lo que entró). 100% es que se vendió todo lo que hubo.',
          'Lo vendido descuenta notas de crédito y anulaciones. Mermas, degustaciones y traslados no cuentan como venta.',
          'La venta diaria se mide solo con los días completos en que el producto tuvo stock: los días agotados no cuentan, y hoy tampoco porque todavía va a medias.',
          'Días restantes = stock ÷ venta diaria. Un producto sin ventas en el período no tiene ritmo y queda con "—": no se inventa un número.',
        ],
      },
      {
        id: 'filtros-retail',
        title: 'Filtrar y descargar',
        steps: [
          'Elige el "Período" (7, 14, 30 o 90 días), desde cuántos días un producto "Se agota pronto", la "Categoría" o el "Proveedor" y presiona "Aplicar". "Limpiar" vuelve a lo de siempre.',
          'Presiona "Descargar Excel" para llevarte la tabla con los mismos filtros. Cada descarga queda en la bitácora.',
        ],
      },
    ],
  },
  {
    id: 'stock-muerto',
    key: 'hasDeadStock',
    // Vive dentro de Métricas de retail: se documenta solo con los dos interruptores encendidos.
    anyOfFeatures: ['hasRetailMetrics'],
    permission: 'retail:read',
    chapter: 'Métricas de retail',
    title: 'Stock muerto',
    summary:
      'Lista, bodega por bodega, los productos con stock que llevan muchos días sin venderse ni trasladarse, con la plata que tienen inmovilizada y una sugerencia para moverlos. Avisa por la campanita cuando un producto cumple el umbral.',
    route: '/dashboard/retail/stock-muerto',
    screenshot: null,
    topics: [
      {
        id: 'ver-stock-muerto',
        title: 'Ver qué no se está vendiendo',
        steps: [
          'Ve a Métricas de retail → Stock muerto y elige la bodega en las pestañas de arriba.',
          'Arriba ves cuántos productos están detenidos, el valor detenido (si tu rol puede ver costos), cuántos nunca se han vendido y cuántos vencen pronto.',
          'Cada producto muestra su stock, cuántos días lleva sin rotar, su última venta, el vencimiento de su lote más próximo y una sugerencia: degustación, mejor ubicación, ajuste de precio, liquidar o devolver al proveedor.',
          'Filtra por "Categoría" o "Proveedor" y presiona "Aplicar". "Descargar Excel" baja la lista con los mismos filtros.',
        ],
        tip: 'Lo recién llegado no aparece: el reloj corre desde la última venta o traslado, o desde que el producto volvió a tener stock después de agotarse.',
      },
      {
        id: 'ajustar-stock-muerto',
        title: 'Cambiar el umbral y los avisos',
        permission: 'retail:manage',
        steps: [
          'En Stock muerto, elige en "Detenido desde" a los cuántos días sin rotar un producto se considera detenido (15, 30, 45, 60 o 90).',
          'Activa o desactiva "Avisar al cumplirlo" y presiona "Guardar ajustes".',
          'Con los avisos activos, la campanita avisa una vez al día con los productos que cumplieron el umbral (y luego el doble, el triple…), no todos los días. También puedes armar una automatización con el disparador "Stock muerto detectado".',
        ],
      },
    ],
  },
  {
    id: 'mapa-de-calor',
    key: 'hasRetailHeatmap',
    anyOfFeatures: ['hasRetailMetrics'],
    permission: 'retail:read',
    chapter: 'Métricas de retail',
    title: 'Mapa de calor de rotación',
    summary:
      'Muestra en una grilla de colores cuánto vendió cada producto semana a semana (o día a día) en una bodega, con los períodos sin stock marcados aparte, y qué pasó con la venta diaria cada vez que cambió el precio cobrado.',
    route: '/dashboard/retail/mapa-de-calor',
    screenshot: null,
    topics: [
      {
        id: 'leer-mapa-de-calor',
        title: 'Leer el mapa de calor',
        steps: [
          'Ve a Métricas de retail → Mapa de calor y elige la bodega en las pestañas de arriba.',
          'Cada fila es un producto y cada celda una semana (de lunes a domingo) o un día: mientras más oscura, más se vendió. La cifra de la celda son las unidades vendidas, descontadas las devoluciones.',
          'Una celda rayada significa que el producto estuvo sin stock todo ese período; un asterisco, que le faltó stock algún día. Pasa el cursor sobre una celda para ver el detalle.',
          'En "Vista" elige las últimas 12 semanas o los últimos 28 días; en "Mostrar", los más vendidos o los menos vendidos que tienen stock. Filtra por "Categoría" o "Proveedor" y presiona "Aplicar".',
        ],
      },
      {
        id: 'reaccion-al-precio',
        title: 'Ver cómo reaccionó la venta a un cambio de precio',
        steps: [
          'En la misma pantalla, la tarjeta "Cómo reaccionó la venta a los cambios de precio" lista los cambios del precio cobrado de los últimos 90 días.',
          'Cada fila compara la venta diaria de hasta 14 días con stock antes del cambio con la de los días siguientes, y lo resume en una frase.',
          'Si todavía no hay 5 días con stock a cada lado, dice "Faltan días para comparar" en vez de inventar una cifra.',
        ],
        tip: 'Es una comparación simple: la temporada, una promoción o la ubicación del producto también mueven la venta.',
      },
    ],
  },
  {
    id: 'canasta-cruzada',
    key: 'hasBasketAnalysis',
    anyOfFeatures: ['hasRetailMetrics'],
    permission: 'retail:read',
    chapter: 'Métricas de retail',
    title: 'Canasta cruzada',
    summary:
      'Muestra qué productos se compran juntos en la misma boleta, cuántas veces más de lo normal, y sugiere los pares que valen como combo o promoción conjunta, también entre productores distintos.',
    route: '/dashboard/retail/canasta',
    screenshot: null,
    topics: [
      {
        id: 'leer-canasta',
        title: 'Ver qué se compra junto',
        steps: [
          'Ve a Métricas de retail → Canasta cruzada y elige la bodega en las pestañas de arriba.',
          'Arriba ves cuántas boletas se analizaron, cuántos productos lleva una boleta en promedio y cuántos pares van juntos más de lo normal.',
          'La tarjeta "Combos sugeridos" resume los pares más fuertes en una frase; la tabla muestra todos: cuántas boletas los traen juntos, qué parte de las boletas son, qué tan seguido uno lleva al otro y cuántas veces más que lo normal.',
          'Ajusta el "Período", el mínimo en "Juntos en al menos" y, si buscas promociones entre productores, marca "Solo productos de proveedores distintos". Presiona "Aplicar".',
        ],
        tip: 'Con pocas boletas cualquier coincidencia parece relación: por eso se pide un mínimo de boletas juntos. Las compras de más de 40 productos distintos no entran.',
      },
    ],
  },
];
