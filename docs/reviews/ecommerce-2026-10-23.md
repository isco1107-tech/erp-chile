# Revisión y mejora del Ecommerce integrado

Base revisada: `f683639`, tras las PR #85 y #86. La revisión cubre administración, publicación, permisos, catálogo, carrito, checkout, reservas, confirmación de pagos y emisión de la venta en el ERP.

## Cambios entregados

- **Módulo independiente.** Grupo Ecommerce propio, sin dependencia de `hasWebSites`. Crear una tienda ya no exige construir antes un sitio. Las nuevas tiendas tienen publicación y dominio propios, empiezan cerradas y abren el catálogo desde su raíz.
- **Administración guiada.** Identidad, logo, colores y dominio en el mismo panel; progreso de configuración y accesos al paso pendiente. Se conservan permisos separados de lectura, productos, preparación y administración. Las tiendas anteriores mantienen compatibilidad con su sitio.
- **Experiencia del comprador.** Encabezado con marca y búsqueda, portada editorial, colecciones, orden por precio/novedad/nombre, catálogo adaptable, galería ampliable, recomendaciones de productos reales y disponibles, carrito rápido y pasos de compra. La firma de plataforma pasa al pie para evitar superponerse a controles.
- **Funciones corregidas.** «Comprar ahora» suma la cantidad elegida aunque el producto ya exista en el carrito. Un corte de conexión bloquea continuar/pagar con una cotización antigua y permite reintentar sin borrar la selección. Los diálogos conservan navegación con teclado, Escape y devolución del foco.
- **Precios consistentes.** La ordenación usa el precio final calculado con neto y exención del ERP, incluido cuando el campo bruto almacenado está desactualizado. El orden por nombre usa el título visible. Búsqueda y conteo tratan `%` y `_` como caracteres literales.
- **Protección de datos y operación.** Consultas por empresa y tienda, subidas autorizadas con permisos de Ecommerce, verificación binaria de imágenes y limpieza de archivos huérfanos. Se espera la notificación crítica antes de finalizar los casos de pago incongruente o venta fallida. La creación concurrente de tiendas respeta la cuota de publicaciones.

## Integración que se conserva

El carrito del navegador guarda solo producto y cantidad. El servidor vuelve a calcular precios, disponibilidad, entrega e impuestos. El cobro se confirma consultando a la pasarela y verificando monto, moneda y referencia. El pedido pagado emite mediante `createSalesDocument`: se conserva el mismo camino de kardex, contabilidad y tesorería, con idempotencia para evitar duplicados.

La migración es aditiva e idempotente: `WebSiteStore.standalone`, falso para publicaciones existentes. La infraestructura y la cuota de publicaciones se comparten con Sitios web; véase ADR 0007.

## Verificación

- `npm run ci`: esquema válido, TypeScript y ESLint sin errores; 184 suites aprobadas, 3.564 pruebas aprobadas. Otras 7 suites de integración están condicionadas a una base de pruebas y se contabilizan aparte.
- PostgreSQL local aislado: 139 comprobaciones aprobadas entre servicios, rutas, acciones, creación independiente y subidas de imágenes. Incluyen aislamiento entre empresas, reserva concurrente de últimas unidades, venta pagada sin duplicados y recuperación tras falla de emisión.
- Base construida mediante migraciones; repetición sin pendientes y comparación con el esquema sin diferencias.
- Compilación de producción aprobada; 41 pruebas Playwright aprobadas contra esa compilación, sin omitir los recorridos de Khipu y Webpay simulados.
- Catálogo, ficha, carrito, checkout y pedido se verifican en 13 anchos de 280 a 2560 px. Capturas en `.vercel/responsive-check-store/`; se revisan visualmente, además de auditar desbordes, legibilidad y montos sin cortes.

## Límites pendientes de la base revisada

1. **Webpay Plus:** las pruebas usan una pasarela simulada. Sigue siendo necesaria una compra completa con credenciales reales del ambiente de integración de Transbank antes de habilitarlo a clientes en vivo. Esta revisión no habilita medios de pago ni crea credenciales en producción.
2. **Reserva entre canales:** Ecommerce descuenta reservas vigentes y notas de venta, pero una venta por POS/mostrador puede consumir stock reservado por una tienda. Si ocurre antes de emitir una venta ya cobrada, el pago queda registrado, el pedido requiere atención y se puede reintentar tras reponer. Resolver la prioridad global de reservas requiere un cambio transversal del motor de inventario.
3. No se implementaron variantes talla/color, cupones, reembolsos automáticos por pasarela, cuentas de comprador, recuperación de carritos abandonados ni cotización por API de courier. Un reembolso marcado en el panel registra una devolución efectuada por el operador; no envía dinero.
4. Las tiendas adjuntas a sitios existentes conservan la identidad del constructor. La identidad propia y la entrada directa desde la raíz corresponden a las nuevas tiendas independientes.

No se afirma paridad total con Shopify ni validación real de pasarelas a partir de simulaciones.
