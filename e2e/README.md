# Recorridos E2E (Playwright)

Corren contra la app compilada y una base PostgreSQL **propia**, nunca contra
la `DATABASE_URL` del `.env` (es la de producción, ver CLAUDE.md §5).

En CI (`.github/workflows/ci.yml`, job `e2e`) todo esto es automático. En local:

```bash
# 1. Base vacía propia (ejemplo con un Postgres local)
createdb erp_e2e
export DATABASE_URL=postgresql://usuario:clave@localhost:5432/erp_e2e
export JWT_SECRET=cualquier-valor-largo-de-prueba
export SEED_ADMIN_PASSWORD=una-clave-de-prueba

# 2. Migraciones desde cero + datos mínimos
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 3. Compilar y correr
npm run build
npm run test:e2e
```

- `E2E_BASE_URL`: probar contra una app ya levantada (no arranca `next start`).
- Tienda en línea (pasarelas simuladas): levanta la app con
  `PAYMENTS_ENCRYPTION_KEY=cualquier-valor APP_URL=http://localhost:3100 KHIPU_API_BASE_URL=http://localhost:4010 WEBPAY_API_BASE_URL=http://localhost:4010`
  y corre las pruebas con las MISMAS variables (la llave de cifrado debe coincidir: la prueba guarda con ella las
  credenciales de la pasarela de la empresa). Sin ellas, los recorridos de pago en línea se saltan con un aviso.
- `E2E_CHROMIUM_PATH`: usar un Chromium ya instalado en vez de `npx playwright install`.

Qué cubren:
- `public.spec.ts`: ingreso, redirección sin sesión, contraseña incorrecta, rutas públicas.
- `dashboard-routes.spec.ts`: cada pantalla del menú (leída de `workspace-nav.ts`)
  carga sin 5xx, sin la pantalla "Algo salió mal" y sin errores de JavaScript,
  con la empresa de prueba recién creada. Una pantalla nueva en el menú entra sola.
- `bodega-api.spec.ts`, `bodega-barcode.spec.ts`, `bodega-photo.spec.ts`: la app del
  bodeguero (`/bodega`) en un celular emulado. La API (sin sesión → 401 en JSON,
  idempotencia, rechazos), la lectura de un EAN-13 con una **cámara falsa**
  (`fake-camera.ts` dibuja el código en un video Y4M que Chromium reproduce en
  bucle) y los flujos con foto con la IA **simulada** (`page.route`): una prueba
  de punta a punta no debe depender de una llave de Gemini. Crean sus productos
  por la propia API con claves fijas, así que se pueden repetir contra la misma base.
- `bodega-barcode.spec.ts` además comprueba que cada llegada exige proveedor y queda
  atribuida (proveedor, operario y bodega), y que una salida (merma, mal estado,
  degustación…) exige su foto: la subida de la foto se simula con una dirección válida
  de nuestro almacenamiento (no hay almacenamiento real en las pruebas).
- `retail.spec.ts`: Métricas de retail → Retail en vivo con su interruptor encendido (panel de la bodega, búsqueda,
  Excel) y apagado (fuera del menú, ruta y descarga cerradas); Stock muerto con su propio interruptor (se ve y se
  ajusta el umbral solo con los dos encendidos; apagado él o el padre, menú, ruta y descarga cerradas); Mapa de calor
  con su propio interruptor.
- `movements.spec.ts`: el registro de movimientos por bodega (cada bodega ve solo lo suyo,
  con operario, motivo y foto) y el kardex por bodega.
- `supplier-portal.spec.ts`: el portal del proveedor (`/proveedor`): entra con su código, ve solo
  sus productos y sin costos, descarga el Excel, no se desborda en un celular pequeño, y la
  administración desde su ficha (generar y desactivar el código).

`db.ts` arma lo que no tiene pantalla (un proveedor, el código de su portal, una segunda bodega)
y lee el resultado directo de la base, así que estas pruebas necesitan `DATABASE_URL` apuntando
a la base de pruebas (la misma de los pasos 1–2). Nunca contra la de producción.

Tienda en línea (`/web/tienda-e2e`, panel en Ecommerce → Tienda en línea):
- `store-public.spec.ts`: el comprador, sin sesión: catálogo (precio con IVA, descuento, agotado, búsqueda y
  colecciones), ficha con datos estructurados, carrito (cantidades, ajuste por stock, un precio escrito a mano
  en el navegador no vale, celular emulado), finalizar compra con transferencia, retiro y despacho por región,
  validación en español, reintento sin duplicar, y el pago en línea con **pasarelas simuladas**
  (`fake-gateways.ts`, un servidor HTTP dentro de la prueba): Khipu (la app CONSULTA el cobro y un monto distinto
  no paga), Webpay (puente con su CSP propia hacia Transbank, regreso, confirmación y anulación).
- `store-admin.spec.ts`: el equipo: confirma una transferencia (se emite la venta y baja la bodega), prepara,
  despacha con seguimiento (solo https) y entrega; cancela y libera el stock; descarga el Excel auditado;
  publica y edita fichas; cambia ajustes, cierra y abre la tienda; «Qué le falta» bloquea una tienda incompleta.
- `store-workspace.spec.ts`: crea y personaliza una tienda propia con Sitios web desactivado; comprueba apertura directa del catálogo y funcionamiento de la API pública.
- `store-experience.spec.ts`: orden por precio, filtros persistentes, carrito rápido con teclado y límites, ampliación de fotos, cantidades de «Comprar ahora» y recuperación de cotizaciones ante cortes de conexión.
- `store-responsive.spec.ts`: las cinco pantallas de la tienda en 13 anchos (280 a 2560 px): nada desborda,
  se sale de la pantalla, parte una palabra letra por letra ni queda bajo 11 px. Deja capturas en
  `.vercel/responsive-check-store/`: **mirarlas**, el «pasó» no basta.
- `store-support.ts` arma la tienda de demostración (idempotente) con casos incómodos y sirve las fotos de
  prueba con `page.route`.
