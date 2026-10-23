# 0004 — Bodega móvil: app instalable, envío idempotente y cuota de la IA

Estado: aceptada (2026-10-22)

## Contexto

Los bodegueros necesitan registrar llegadas, mermas y traslados desde el celular, a veces sin señal, e identificar productos con una foto. Aether ya tenía el Kardex (`applyStockIn/Out`, PMP, asiento contable), la matriz de permisos y los guards por empresa. Faltaba una superficie móvil y, sobre todo, tres garantías: que reenviar no duplique, que no se pierda lo hecho sin señal, y que la IA no se sature (la cuota de Gemini es **una sola para toda la plataforma**: la comparten los agentes, el asistente y el escaneo de facturas).

## Decisión

1. **PWA en `/bodega`, no una app nativa.** Reutiliza la sesión por cookie, el RBAC y el aislamiento por empresa sin inventar una segunda forma de autenticar (tokens en un teléfono). Se instala desde el navegador (manifest propio, `scope: /bodega`). Si algún día se necesita tienda de aplicaciones, se puede envolver (TWA/Capacitor) sin tocar el servidor.
2. **Todo el servidor es API JSON bajo `/api/bodega/*`** (`bootstrap`, `lookup`, `identify`, `sync`, `photo`, `recent`), con `withBodegaAuth`: sesión, permiso (`products:read`, `inventory:write`, `products:write`) y tope por usuario, siempre con respuesta JSON. No hay Server Actions: la foto supera su límite de cuerpo y la cola del celular reintenta.
3. **Idempotencia por operación.** Cada operación lleva una `clientOpId` generada en el teléfono. `WarehouseMobileOp` (único por empresa y clave) se "reclama" con un `INSERT … ON CONFLICT DO NOTHING` **dentro de la misma transacción** que mueve el stock: o quedan las dos cosas o ninguna. Un reenvío devuelve lo guardado (`replayed`). Solo se guarda lo que se aplicó: un rechazo de negocio (stock insuficiente) no deja fila, para que el reintento funcione cuando la causa se corrija. El stock lo mueve el mismo código del escritorio (`registerStockInTx/OutTx/TransferTx`, extraídos de `stock.service.ts`).
4. **Cola local, offline primero.** Lo confirmado vive en IndexedDB (una base por persona y empresa) hasta que el servidor responde. El service worker (`/bodega-sw.js`, scope `/bodega`) guarda solo los estáticos y la página; **nunca** `/api/*`. La página `/bodega` no imprime datos de nadie (el layout no los renderiza): lo que se guarda en la caché del navegador no es privado.
5. **La IA es el último recurso y se cuida en cuatro capas:**
   - *Primero el código de barras* (cámara, sin IA) y la búsqueda en el catálogo.
   - *Caché por foto* (`ProductPhotoScan`, SHA-256 por empresa): la misma foto no se lee dos veces.
   - *Cupo contado en la base de datos* (no en memoria: cada instancia serverless tiene la suya) bajo un candado `pg_advisory_xact_lock`: tope por persona, por empresa, por plataforma y diario por empresa (`budget.ts`, ajustables con `WAREHOUSE_VISION_*`). Si se llega al tope, la respuesta es `busy` + `retryAfterMs` (no se duerme dentro de la solicitud).
   - *Enfriamiento*: un 429 **o 503** de Gemini frena a todos unos segundos.
   En el teléfono, una sola consulta a la vez y todas las fotos esperan lo que pidió el servidor; la persona sigue trabajando mientras tanto.
6. **La IA propone, la persona decide.** Lo que lee la IA solo prellena un formulario; un producto sugerido por texto debe confirmarse antes de enviar; un código de barras leído por la IA solo cuenta si su dígito verificador es válido. Nunca se inventan datos (regla del proyecto): lo que la etiqueta no muestra queda vacío.
7. **Producto nuevo desde el celular.** Se crea junto con su primera entrada en una transacción. Mismo código de barras → se suma al existente; mismo nombre y marca → se devuelve para que la persona decida (`DUPLICATE_PRODUCT`); SKU vacío → `PRD-000123` con candado por empresa. La foto es un adorno: si el almacenamiento falla repetidamente, el producto se crea sin ella.
8. **Cámara solo en `/bodega`.** `Permissions-Policy: camera=()` es global (el ERP no usa cámara en otro lugar); `next.config.js` la abre a `camera=(self)` solo para `/bodega/:path*`, después de la global (gana la última). La cabecera es del *documento*: por eso el login entra a `/bodega` con una carga completa y no con navegación interna (con navegación interna conservaría la política del login y la cámara quedaría bloqueada).

## Consecuencias

- Nueva tabla `WarehouseMobileOp` y `ProductPhotoScan` (migración aditiva e idempotente). Las lecturas de IA se guardan 30 días (limpieza oportunista).
- Una operación de llegada (`PURCHASE_IN`) del celular **no** crea ni abona una factura de proveedor (igual que el formulario manual del escritorio: contra `DIFERENCIA_INVENTARIO`). Si la empresa usa Compras con recepción de mercadería, la llegada debe registrarse por ahí para no contar dos veces; el celular sirve para el resto (devoluciones, sobrantes, mermas, traslados, inventario sin documento).
- Los productos creados desde el celular nacen con precio de venta $0 y costo $0 si la persona no los informa; la pantalla *Inventario → Bodega móvil* los lista para completarlos. Un costo en $0 en un producto con stock baja el PMP al comprar después (limitación conocida del PMP).
- No se vende como módulo aparte (no hay precio en el tarifario): se incluye en *Inventario y Catálogo*. Si se quisiera venderlo, agregarlo a `src/lib/pricing/catalog.ts`.
- La integración con Gemini se verificó con la llave real: etiqueta conocida → producto del catálogo; etiqueta nueva → `new` con datos; y un 503 real («alta demanda») que activó el enfriamiento.

## Alternativas descartadas

- *App nativa (React Native/Expo)*: requiere tokens de API para teléfonos, tiendas y otro ciclo de publicación; no aporta nada que la PWA no cubra para este caso.
- *Cupo en memoria por instancia*: no sirve en serverless; una bodega con varias personas lo superaría sin enterarse.
- *Reintentar dentro de la solicitud cuando Gemini responde 429*: duerme una función de pago y sigue gastando cuota.
