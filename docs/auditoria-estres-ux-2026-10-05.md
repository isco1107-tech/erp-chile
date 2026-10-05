# Auditoría de estrés y de experiencia de usuario

Fecha: 2026-10-05. Dos preguntas: **¿el sistema falla bajo carga?** y **¿un usuario sin experiencia sabe qué hacer en cada pantalla, sin manual?**

Todo lo medido aquí se corrió contra una base **local** (Postgres 16) con las 88 migraciones del repositorio, nunca contra la base de producción (CLAUDE.md §5). Para que los números se parezcan a producción, se agregó un proxy que mete la latencia real entre las funciones de Vercel (iad1, Virginia) y la base Neon (us-east-2, Ohio): unos 11 ms de ida y vuelta por consulta. Los scripts quedan en `scripts/stress/` para repetir la auditoría (ver §5).

---

## 1. Resumen

| | Antes | Después |
|---|---|---|
| Compras simultáneas con los mismos productos en otro orden | **196 de 200 fallan por deadlock** | 0 fallas |
| Factura y boleta simultáneas con los mismos productos | deadlocks | 0 fallas |
| Boletas/s de productos distintos (latencia real) | 3,8/s, p95 15,3 s (al borde del corte de 20 s) | 5,9/s, p95 10,1 s |
| Radiografía 360 (150.000 ventas, 50.000 clientes) | **47 s** (se corta en Vercel) | 1,9 s |
| Inicio (12 meses de ventas) | 73.000 documentos y sus líneas traídos a Node en cada carga | 25 filas agregadas en SQL (mismo resultado exacto) |
| Fidelización (clientes inactivos) | 2,2 s | 0,23 s |
| Inventario con 20.000 productos | 20.450 filas dibujadas, 123.000 nodos, la pestaña casi se cuelga | 50 por página |
| Excel de 12 meses | 15 s y **1,4 GB de memoria** (se cae en Vercel) | tope con mensaje claro |
| Respaldo completo (390 MB) | 140 s, crecimiento cuadrático | 70 s, crecimiento lineal |
| Detalle de una venta (`include` de líneas) | 20 ms (recorre toda la tabla) | 0,14 ms (índice) |

**Lo que ya estaba bien y se comprobó bajo carga:** nunca hubo stock negativo, folios repetidos o con huecos, doble cobro, documentos duplicados por reintento (idempotencia) ni PMP mal calculado. Se probó con hasta 20 procesos simultáneos (como 20 instancias serverless) y 400 operaciones por escenario. La integridad de los datos resistió en todos los casos. Lo que fallaba era la disponibilidad (deadlocks, timeouts y pantallas que no cargan).

---

## 2. Pruebas de estrés: hallazgos y correcciones

### 2.1 Concurrencia (`scripts/stress/concurrency.ts`)

Cada escenario lanza N procesos con su propio pool de 5 conexiones (igual que una instancia de Vercel) que llaman a los **mismos servicios** que usan las pantallas, y al final revisa los invariantes:

| Escenario | Qué verifica | Resultado |
|---|---|---|
| `hot-product` | Muchas boletas del mismo producto con stock justo | Se vende exactamente el stock, nunca negativo, folios únicos y correlativos, un movimiento de Kardex por venta |
| `lock-order` | Facturas con líneas [A,B] y [B,A] | Sin deadlocks |
| `mixed-lock-order` | Factura [A,B] contra boleta [B,A] (correlativos distintos) | **Deadlocks → corregido** |
| `purchase-lock-order` | Compras [A,B] contra [B,A] | **196/200 deadlocks → corregido** |
| `idempotency` | El mismo `idempotencyKey` 200 veces a la vez | Un solo documento |
| `payments` | 200 cobros simultáneos que suman 20 veces la factura | Lo pagado nunca supera el total |
| `purchases-pmp` | 200 compras simultáneas con costos distintos | Stock = suma de entradas y PMP = promedio ponderado (±0,03) |
| `pos` | 200 ventas de mostrador en el mismo turno | El turno cuadra |
| `distinct-products` | Boletas de productos distintos (solo comparten folio) | Mide cuánto tiempo retiene el folio cada venta |

**Corrección 1, orden global de los locks de producto (`lockProductRows` en `stock.service.ts`).** Cada línea bloqueaba su producto en el orden del documento, y dos documentos con las mismas líneas en orden inverso se bloqueaban en círculo. Ahora cada documento bloquea **todos** sus productos de una vez y ordenados por id, antes de mover stock. Se aplicó en Ventas (emitir y anular), POS, Compras (crear, emitir, aprobar, agregar detalle), recepciones, importaciones, producción, carga histórica y toma de inventario. Además, la transacción recuerda qué productos ya bloqueó y no repite el `FOR UPDATE` en cada línea, lo que ahorra un viaje a la base por línea.

**Corrección 2, el folio se toma al final.** El correlativo de folio (o el CAF) se bloqueaba al principio de la emisión y quedaba tomado mientras se movía el stock, así que todas las boletas de la empresa hacían fila detrás del Kardex de las demás. Ahora el folio se asigna después de mover el stock, lo más cerca posible del `create`, y sigue dentro de la misma transacción: si la emisión falla, no queda hueco en la numeración. Las referencias del Kardex («DTE … Folio #N») se completan al conocer el folio. El especialista tributario revisó el cambio: TED, CAF, IVA y PMP no cambian y el orden de los locks es el mismo en todas las rutas (productos → folio → asiento).

**Corrección 3, tope de 300 líneas por documento** (`src/lib/document-limits.ts`). Un documento con miles de líneas mantenía tomados los locks del folio y de los productos hasta vencer la transacción y frenaba a toda la empresa. Las importaciones y los DTE recibidos no pasan por este tope.

**Corrección 4, confirmar el pago de una entrada o de un voto.** Dos confirmaciones simultáneas leían "no pagada" y el comprador recibía dos correos con el QR. Ahora un `UPDATE` condicionado decide quién notifica.

### 2.2 Volumen (`scripts/stress/volume-seed.sql` + `volume-read.ts`)

La empresa de prueba se llenó con 150.000 ventas (300.000 líneas), 50.000 clientes, 20.000 productos, 300.000 movimientos de Kardex y 100.000 pagos.

- **Índices** (migración `20261026120000_hot_path_indexes`, aditiva e idempotente). Prisma carga las relaciones (`include: { items }`, pagos, stock) con `WHERE "documentId" IN (…)`, sin `companyId`, y los índices compuestos `(companyId, …)` no sirven para eso: cada detalle de venta recorría la tabla de **todas las empresas**. También faltaban índices de fecha para los listados y reportes. Resultados:

  | Consulta | Antes | Después |
  |---|---|---|
  | Detalle de venta | 20 ms | 0,14 ms |
  | Listado de ventas | 22 ms | 0,17 ms |
  | Pagos de un documento | 11,7 ms | 0,12 ms |
  | Kardex del mes | 30 ms | 0,3 ms |
  | KPI del mes | 18 ms | 2,5 ms |

- **Inicio:** los KPIs y el gráfico de 12 meses ahora se agregan en SQL (`sales-summary.service.ts`). Se verificó que el resultado es idéntico al cálculo anterior, incluso con costos que terminan en ,5: el redondeo usa `FLOOR(x+0,5)` para coincidir con `Math.round`.
- **Radiografía 360:** de 47 s a 1,9 s. `rankScores` (RFM) era O(n²): con 50.000 clientes hacía 2.500 millones de comparaciones por eje. Además, `santiagoDateParts` creaba un `Intl.DateTimeFormat` en cada llamada (~12 s). Ese segundo arreglo acelera todo lo que usa fechas de Chile.
- **Fidelización:** los clientes inactivos se agrupan en SQL (una fila por cliente) y la regla sigue en la función pura.
- **Excel:** como máximo 30.000 filas por archivo. Si el rango tiene más, se pide uno más corto con un mensaje claro, en vez de agotar la memoria. Se agregó `maxDuration`.
- **Respaldo:** paginación por clave (`id > último`) en vez de OFFSET.
- **Campanita de mensajes:** una consulta para todas las conversaciones, en vez de una por conversación, cada 20 s por usuario.
- **Inventario:** el listado de stock ahora es paginado. El formulario de movimientos tiene un buscador de productos, porque antes solo ofrecía los primeros 300 por orden alfabético y con catálogos grandes no había forma de elegir el resto.
- **CxC/CxP:** se muestran los 200 documentos más antiguos y ahora la pantalla avisa cuando hay más («Se muestran 200 de 21.940 pendientes»). Antes parecía la lista completa.

### 2.3 Carga HTTP de extremo a extremo (`scripts/stress/http-load.mjs`)

Usuarios con sesión iniciada piden en bucle las 6 pantallas más usadas de la empresa grande, contra una instancia de `next start` con latencia de producción:

| Usuarios simultáneos | Peticiones/s | p95 | Errores |
|---|---|---|---|
| 5 | 5,8 | 0,9–2,1 s | 0 |
| 20 | 5,5 | 3,8–5,2 s | 0 |
| 50 | 5,5 | 8,5–11,7 s | 0 |

Con 50 usuarios nada falla, pero cada instancia llega a su techo en ~5,5 páginas/s. El cuello es la **CPU del renderizado** (~180 ms por página, el proceso al 88 %), no la base. En Vercel la carga se reparte entre instancias, pero conviene perfilar el layout del panel (ver §4).

---

## 3. Experiencia de usuario: un ERP que se enseña solo

Se partió de la auditoría de ayuda del 2026-10-02 (manual, tutoriales y asistente ya cubiertos). Esta vez el foco fue que cada pantalla diga **qué hacer ahora**, sin abrir el manual. Todo se revisó en el navegador con una empresa recién creada y con la empresa grande (`scripts/stress/ux-smoke.mjs`: 22 pantallas, sin errores de consola ni 5xx). Las capturas se miraron una por una.

### Hallazgos principales

1. **No había una guía de puesta en marcha basada en datos reales.** El asistente inicial era un modal que solo veía el Dueño. Al cerrarlo no quedaba ningún rastro de avance, y su paso 1 **nunca podía guardar** porque no enviaba RUT ni razón social.
2. **Los borradores de venta eran un callejón sin salida.** "Guardar borrador" y "Duplicar" creaban borradores, pero ninguna pantalla permitía editarlos ni emitirlos, y el manual decía "edítalo y emítelo".
3. **El Inicio de una empresa nueva no guiaba.** Mostraba "Todo el catálogo está sobre su stock mínimo" con 0 productos, gráficos vacíos sin explicación y ninguna acción sugerida en los planes Comercio, Gestión y Total.
4. **Casi no había ayuda en los campos con jerga** (11 tooltips para 630 campos) y existían dos glosarios que no coincidían.
5. **Errores en inglés:** Zod no tenía configurado el español, y llegaban mensajes como "Too small: expected number to be >0".
6. **Mensajes de permiso genéricos.** "No autorizado para esta acción" no decía qué permiso faltaba ni a quién pedirlo.
7. **Sin siguiente paso** después de crear un producto o un contacto, y 51 estados vacíos sin acción.

### Qué se hizo

- **Tarjeta "Primeros pasos" en el Inicio** (`src/lib/setup/readiness.ts`, pura y probada). Va de 0 a 12 pasos según los módulos contratados y los permisos de cada persona: datos tributarios, folios del SII, productos, stock inicial, clientes, caja, primera venta, banco, plan de cuentas, trabajadores, certamen y equipo. Cada paso se marca solo al cumplirse con datos reales, explica **por qué** importa y lleva a la pantalla exacta. Se puede ocultar y volver a mostrar.
- **Asistente inicial corregido.** El paso 1 ahora guarda. La bodega adicional solo aparece con Multibodega. El tour de bienvenida espera a que se cierre el asistente. Las referencias al botón de ayuda apuntan al botón **Asistente** de la barra superior.
- **Borradores:** se agregaron «Editar y emitir» (el formulario se abre precargado y el borrador se reemplaza al emitir), «Eliminar borrador» y la acción «Abrir borrador» tras duplicar.
- **Avisos de requisitos:**
  - "Se emitirá con numeración interna, sin validez ante el SII", con enlace a Folios del SII, en Ventas y POS.
  - POS sin caja: el administrador ve el formulario abierto; el cajero ve a quién pedirle la caja.
  - POS sin productos o sin stock: un enlace para resolverlo.
  - Permiso faltante: «Tu rol no tiene permiso para «Crear ventas y cotizaciones». Pídeselo al dueño…».
  - Módulo no contratado: el aviso nombra el módulo y enlaza a Planes.
- **Ayuda en los campos:** glosario único con 59 términos (`src/lib/chile/glossary.ts`), del que también deriva el manual. El nuevo `FieldLabel` pone un tooltip junto a RUT, giro, código de actividad, SKU, precio neto, stock mínimo, exento, PPM, retención, stock negativo (con su consecuencia), AFP, isapre, gratificación, colación, UF/UTM, etc. Previred es ahora un enlace.
- **Movimientos de stock con nombres claros:** «Stock inicial / ajuste positivo» y «Merma / ajuste negativo». Las compras y ventas reales se mandan a sus pantallas, porque allí quedan con documento e IVA.
- **Zod en español** en cliente y servidor (`src/lib/zod-setup.ts`). Los mensajes propios de cada esquema siguen mandando.
- **Siguiente paso tras crear algo:**
  - Producto → «Cargar stock inicial»: abre el formulario con ese producto ya elegido.
  - Cliente → «Venderle»: abre la venta con ese cliente.
  - Proveedor → «Registrar compra».
- **"Para qué sirve" visible:** cada ítem del menú y cada resultado de ⌘K muestra su propósito. Productos, Contactos, CxC, CxP e Inventario llevan encabezado con una descripción.
- **Estados vacíos con acción y requisito**, por ejemplo:
  - Remuneraciones sin trabajadores: «Primero crea a tus trabajadores».
  - Contabilidad: explica que los asientos son automáticos.
  - Entradas y Votación: «Crear certamen».
  - Calidad, CRM, Gastos, Kardex y otros: cada uno con su acción.
- **Confirmaciones que explican la consecuencia real** al anular una compra, eliminar un producto (sugiere archivarlo), eliminar un contacto o suspender un usuario. El texto se escribió según lo que hace el código, no según lo que se suponía.
- **CxC/CxP:** la columna de acciones ya no se corta a 1366 px (era el pendiente V3 de la auditoría anterior). «Registrar pago» queda visible y el resto pasa a un menú «⋯». "Sin correo" se convirtió en «Agregar correo».

---

## 4. Pendiente: recomendaciones que no se aplicaron (requieren decisión o infraestructura)

| Prioridad | Recomendación | Por qué |
|---|---|---|
| **Aplicada** | **Funciones de Vercel en `cle1` (Cleveland)**, la misma región que Neon (us-east-2): `"regions": ["cle1"]` en `vercel.json` | Medido: con ~1 ms por consulta en vez de ~11 ms, todo rinde unas **4 veces más** (producto muy vendido: de 2,5 a 11,4 ventas/s; p95 bajo 4 s). Es el cambio de mayor impacto y no toca código |
| Alta | Limitador de peticiones compartido (Upstash Redis o reglas del WAF de Vercel) para `/api/public/*` y `/api/auth/*` | El limitador actual vive en memoria de cada instancia (`rate-limiter.ts`): no frena a un atacante repartido entre instancias |
| Alta | Entradas: que las órdenes impagas venzan y liberen su cupo, y Turnstile en la compra | Hoy una orden impaga ocupa cupo para siempre: un bot puede agotar un evento |
| Media | `bcrypt` fuera de la transacción del login | Cada login retiene 1 de las 5 conexiones de la instancia mientras calcula el hash (~300 ms) |
| Media | `idempotencyKey` en pagos (columna única en `Payment`) | Un doble clic en "Registrar pago" con dos montos que caben registra dos pagos |
| Media | Caché de los micrositios públicos (`'use cache'` con revalidación por etiqueta) | Una final en vivo con miles de visitas por minuto pega directo a la base de todas las empresas |
| Media | Cron de alertas operativas y de agentes: una invocación por empresa, `maxDuration`, reglas cacheadas | Recorren todas las empresas en serie: con muchas empresas, las últimas nunca se procesan |
| Media | `getAuthContext` memoizado por request | Cada página valida la sesión dos veces (2 SELECT y 2 UPDATE de `UserSession`). No se cambió porque toca autenticación y requiere su propia revisión |
| Media | Perfilar el render del layout del panel (~180 ms de CPU por página) | Es el techo de ~5,5 páginas/s por instancia |
| Baja | Ocultar los KPIs en $0 hasta el primer movimiento | Una empresa nueva con todos los módulos ve un muro de ceros bajo "Primeros pasos" |
| Baja | Revisar `canViewDeletedMessages` (`messaging.service.ts`): permite ver mensajes borrados a un id de usuario escrito en el código | No es de rendimiento, pero salió en la revisión y conviene confirmarlo |
| Baja | Confirmar contra el esquema oficial del SII el máximo de líneas de detalle por tipo de DTE | El tope de 300 es una protección de rendimiento; si el SII exige menos para algún tipo, ajustarlo antes del envío al SII |

---

## 5. Cómo repetir la auditoría

Todo corre contra una base **local**. Los scripts se niegan a correr si `DATABASE_URL` no es localhost, y el SQL de volumen solo corre en `erp_stress`.

```bash
# Base local con datos de demo
DATABASE_URL=postgresql://postgres@localhost:5433/erp_stress npx prisma migrate deploy
DATABASE_URL=… npx tsx prisma/seed.ts
DATABASE_URL=… npx tsx scripts/seed-manual-demo.ts
DATABASE_URL=… npx tsx --conditions=react-server scripts/seed-manual-demo-data.ts

# Latencia de producción (~11 ms ida y vuelta) en el puerto 5434
node scripts/stress/latency-proxy.mjs --listen=5434 --target=5433 --one-way-ms=6

# Concurrencia (falla si se rompe un invariante)
DATABASE_URL=postgresql://postgres@localhost:5434/erp_stress \
  npx tsx --conditions=react-server scripts/stress/concurrency.ts --workers=8 --ops=25

# Volumen
psql postgresql://postgres@localhost:5433/erp_stress -f scripts/stress/volume-seed.sql
DATABASE_URL=… npx tsx --conditions=react-server scripts/stress/volume-read.ts
DATABASE_URL=… npx tsx --conditions=react-server scripts/stress/backup-time.ts

# App real: humo de UX (capturas en .stress-out/ux/) y carga HTTP
npx next build && npx next start -p 3100
BASE_URL=http://localhost:3100 node scripts/stress/ux-smoke.mjs
BASE_URL=http://localhost:3100 USERS=20 DURATION=60 node scripts/stress/http-load.mjs
```

Los informes quedan en `.stress-out/`, que no se versiona.

## 6. Pruebas nuevas

- `tests/stock-lock-order.test.ts`: orden global y sin repetición de los locks de producto.
- `tests/intelligence-core.test.ts`: el RFM rápido da exactamente lo mismo que el cuadrático y puntúa 50.000 clientes en menos de 1 s.
- `tests/ticketing-voting.test.ts`: dos confirmaciones simultáneas mandan un solo correo.
- `tests/setup-readiness.test.ts`: Primeros pasos según módulos, permisos y orden.
- `tests/sales-drafts-and-guard-messages.test.tsx`: borradores, mensajes de permiso y aviso de folios.
- `tests/zod-spanish.test.ts` y `tests/glossary.test.tsx`.

`npm run ci` completo: 164 suites y 2.892 pruebas en verde.
