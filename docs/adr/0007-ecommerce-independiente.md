# 0007 — Ecommerce independiente con publicación compartida

- Fecha: 2026-10-23
- Estado: aceptado; sustituye la dependencia comercial de Sitios web de ADR 0006.

## Contexto

La tienda tenía lógica y permisos propios, pero exigía activar Sitios web y publicar primero un sitio. El usuario necesita administrar y abrir su tienda desde Ecommerce, con una experiencia de compra especializada y el ERP como fuente de verdad.

## Decisión

1. `hasEcommerce` basta para administrar y vender. La navegación tiene su grupo Ecommerce. Los permisos `store:read|write|fulfill|manage` conservan su alcance; crear tiendas, editar identidad y conectar dominios requieren `store:manage`.
2. Se reutilizan `WebSite`, su infraestructura de dominios y la cuota de publicaciones `maxWebSites`. No se duplican publicación, almacenamiento ni resolución de dominios. La independencia es funcional y comercial, sin copiar servicios de plataforma.
3. Crear una tienda produce una publicación guiada de catálogo y un `WebSiteStore` **cerrado**, con `standalone=true`. La raíz de esa publicación o dominio abre directamente `/tienda`. Apertura, pagos y venta mantienen las comprobaciones del servidor.
4. La migración solo añade `standalone`, con valor falso para tiendas existentes. Las tiendas adjuntas a un sitio conservan las rutas y la identidad del constructor. Con Ecommerce activo se sirven sus rutas comerciales aunque Sitios web esté desactivado; esto no habilita páginas genéricas sin su módulo.
5. Las tiendas independientes editan nombre, presentación, logo y colores desde su panel. Las imágenes pasan por una ruta fija para permisos de tienda y el mismo validador binario de plataforma. Un gestor de tienda no obtiene permisos de edición de contenidos arbitrarios del constructor.
6. El comprador usa un shell de comercio propio, accesible y adaptable. Búsqueda, colecciones, orden, carrito rápido, galería y checkout reutilizan los precios, disponibilidad y pedidos de los servicios existentes. El navegador solo persiste producto y cantidad. Ante un fallo de cotización se bloquea continuar y se ofrece reintentar.
7. Las ordenaciones por precio calculan el precio final desde `netPrice` e `isExempt`; todas las consultas conservan filtros por empresa y tienda. Las notificaciones críticas de cobro o emisión de venta se esperan antes de responder.

## Consecuencias

- La cuota se comparte con las publicaciones de Sitios web; crear tiendas concurrentes bloquea la fila de empresa antes de comprobarla.
- La migración aditiva debe aplicarse antes de servir el nuevo código. El build de producción conserva el despliegue de migraciones existente.
- Se mantienen `createSalesDocument`, kardex, contabilidad, tesorería, reservas, claves de idempotencia y validación de pasarelas. No se introducen precios comerciales ni nuevas promesas de integración.
- Continúan los límites de ADR 0006: sin variantes, cupones, reembolsos automáticos, cuentas de comprador, recuperación de carritos ni courier por API. Webpay requiere una prueba real con credenciales de integración antes de ofrecerlo en vivo.
