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
];
