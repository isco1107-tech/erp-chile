# Creador completo de Ecommerce

La separación inicial de ADR 0007 dejaba la tienda con un editor de identidad reducido. ADR 0008 amplía Ecommerce con su propio creador visual, reutilizando las capacidades del constructor informativo bajo permisos y recursos propios.

## Experiencia entregada

- **Sitios web:** páginas informativas, sin mezclar tiendas independientes en sus listas o bandejas.
- **Ecommerce:** plantillas de marca y editor completo de páginas, secciones, lienzos, navegación, encabezado/pie, estilos, imágenes, formularios al ERP, SEO, vista previa, historial y propuestas de IA.
- **Catálogos comprables:** colección elegible desde los productos publicados, destacados, cantidad, columnas y diseños. Las tarjetas usan los precios y disponibilidad reales y el mismo carrito del catálogo.
- **Operación accesible:** productos/colecciones, pedidos, envíos y pagos tienen acceso directo desde el creador. El panel conserva el dominio y una entrada clara al editor.
- **Dos pasos de publicación:** publicar las páginas de marca no abre las compras. Guardar un borrador no sustituye el contenido publicado. Ocultar la portada vuelve al catálogo sin detener ventas ni modificar pedidos o cobros. Las páginas internas y los formularios ocultos dejan de servirse.

## Revisión de integración

El servidor comprueba empresa, módulo y permiso en cada acción. Un permiso de Sitios web no permite editar, publicar, ocultar ni subir imágenes a una tienda independiente. Las bandejas y exportaciones respetan su módulo. Se evita borrar imágenes usadas por productos. Una tienda con pedidos conserva su dirección para no romper enlaces de seguimiento y pago.

La vista previa consulta productos mediante una ruta autenticada sin caché; sus enlaces y botones de compra están desactivados. Los destinos comerciales de botones se resuelven para la ruta pública o dominio real de esa tienda. El asistente conserva la selección de productos y los destinos de formularios; no escribe precios ni publica.

Se mantiene el motor existente de cotización, reservas, pago, emisión de venta, kardex, tesorería y contabilidad. La migración añade únicamente `homepageEnabled`, falso para publicaciones anteriores. Tiendas adjuntas a sitios existentes conservan compatibilidad. No se habilitan pasarelas reales ni se amplía el alcance de variantes, reembolsos o courier descrito en la revisión anterior.

## Uso

En **Ecommerce → Tienda en línea**, crea una tienda o pulsa **Diseñar mi tienda**. También puedes entrar desde **Diseño y dominio → Abrir creador de mi tienda**. Edita la marca, guarda su borrador y publica sus páginas; prepara productos, pago y entrega en el panel para abrir las compras.

## Verificación

- `npm run ci` aprobado: Prisma válido, TypeScript y ESLint sin errores; 185 suites y 3.574 pruebas aprobadas. Las 8 suites condicionadas a una base de integración se cuentan aparte.
- PostgreSQL local aislado: 136 pruebas aprobadas en cinco suites de acciones, servicios, rutas, publicación y permisos de Ecommerce. La migración se aplica sin pendientes al repetirla durante la compilación.
- Compilación de producción aprobada, incluida la corrección de enlaces desde pantallas comerciales hacia las páginas de marca.
- Constructor completo: `npm run verify:responsive:web-sites -- --workers=3`, 195 combinaciones (15 casos × 13 pantallas), sin desbordes ni textos cortados. La opción de workers solo distribuye contextos de navegador independientes; mantiene los mismos casos y comprobaciones.
- Navegador contra la compilación de producción: 41 recorridos generales aprobados, más los cuatro casos de Khipu/Webpay con pasarelas simuladas y tres comprobaciones finales de capturas de marca aprobadas. Incluyen creación sin Sitios web, publicación, aislamiento del borrador, carrito, venta en el ERP, despacho, recuperación de conexión e idempotencia.
- Catálogo, ficha, carrito, checkout y pedido: 13 anchos de 280 a 2560 px. Portada de marca, página interna y carrito con precios ya cargados: 280, 390 y 1440 px. Capturas revisadas en `.vercel/responsive-check-store/`, `-store-builder/` y `-web-sites/`.
