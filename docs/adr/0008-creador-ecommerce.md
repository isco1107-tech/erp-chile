# 0008 — Creador completo de páginas de marca en Ecommerce

- Fecha: 2026-10-23
- Estado: aceptado; amplía ADR 0007.

## Problema

La independencia comercial del catálogo no bastaba: Ecommerce solo editaba identidad y colores. Una marca necesita las herramientas de composición de Sitios web y, además, productos comprables, carrito y operación de ventas.

## Decisión

- Dos módulos y dos entradas: Sitios web conserva publicaciones informativas; Ecommerce crea y diseña tiendas independientes en `/dashboard/store/[id]/editor`. Sus listas y bandejas se separan. El creador de tienda exige `hasEcommerce`, `store:read` para leer y `store:manage` para editar/publicar; los permisos de Sitios web no conceden acceso a tiendas independientes.
- Se comparte el motor visual mediante un contexto de acciones. Cada módulo tiene su controlador y validación de pertenencia. Ecommerce obtiene páginas, secciones, lienzo, encabezado/pie, temas, navegación, imágenes, formularios al ERP, SEO, vista previa, autosave, historial y asistente IA. No duplica editores ni admite HTML arbitrario para sustituir el checkout.
- Las plantillas de marca tienen contenido neutro, el nombre real del comercio y un catálogo conectado. No inventan precios, reseñas ni promesas de envío. Los bloques `catalog.store` eligen colección, destacados y cantidad; las fichas, precios, exención y disponibilidad se resuelven desde los servicios reales. Un sitio informativo no puede guardar estos bloques comerciales.
- Los botones pueden apuntar al catálogo, carrito o checkout mediante destinos semánticos `store:*`, resueltos bajo la ruta real o dominio de la tienda. En la vista previa las compras están desactivadas; la lectura de productos requiere sesión y pertenencia, con `private, no-store`.
- `homepageEnabled`, falso por defecto, controla la publicación de las páginas de marca. Publicar copia el documento y tema a sus versiones públicas y activa esa portada. Los borradores posteriores no aparecen en público. Ocultar las páginas vuelve la entrada al catálogo y no cambia `enabled`, el estado publicado del recurso comercial, los pedidos ni sus pagos. Las páginas internas y formularios ocultos dejan de estar disponibles.
- Abrir compras conserva los requisitos del servidor: bodega, productos publicados, pagos y entrega. Una portada puede publicarse antes de abrir la tienda. Las pantallas de catálogo, ficha, carrito, checkout y pedido reutilizan el encabezado y pie publicados de la marca.
- El asistente IA tiene un objetivo Ecommerce con autorización propia. Solo propone presentación; conserva destinos de formularios y selección de productos, elimina precios manuales de los catálogos comerciales y nunca publica.

## Compatibilidad

La migración es aditiva e idempotente. Tiendas existentes adjuntas a un sitio conservan su comportamiento. Las tiendas independientes anteriores reciben un punto de partida al abrir su editor y solo cambian su portada cuando una persona la publica. Se conserva la cuota de publicaciones de ADR 0007. No se modifica el motor de cobro, reservas, venta, kardex ni contabilidad.

Se conservan los límites de pasarelas, variantes y despacho documentados en ADR 0006/0007.
