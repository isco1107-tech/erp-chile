# Escalar el ERP hasta 50 empresas: qué pagar y qué sigue gratis

Fecha: 2026-10-03. Alcance: Vercel + Neon + Prisma (se mantienen), objetivo de ~50 empresas con "hartos" usuarios.

> **Precios:** las cifras en dólares son órdenes de magnitud, no cotizaciones. Los planes cambian: confirmar en las páginas de precios de cada proveedor antes de decidir.
> **Sin medir:** los límites de este documento se estiman leyendo el código, no con una prueba de carga. La sección 5 explica cómo medirlos.

---

## 1. Resumen en una tabla

| Pieza | ¿Hay que pagar? | Cuándo | Por qué |
|---|---|---|---|
| **Vercel Pro** | **Sí, antes del primer cliente** | Ya | El plan gratuito (Hobby) no permite uso comercial. Pro da más tiempo por función, más cuota y WAF. |
| **Neon plan pagado (Launch)** | **Sí, antes del primer cliente** | Ya | Hoy la restauración llega solo a 6 h atrás (`history_retention_seconds: 21600`). Con datos tributarios es insuficiente. |
| **Subir cómputo de Neon** (máx. CU) | Sí, de forma gradual | Desde ~10–20 empresas activas | Hoy el máximo es 2 CU. Subirlo es cambiar un número. |
| **Gemini de pago** | **Sí, antes de vender** | Antes del primer cliente | El tier gratuito puede usar el contenido enviado para entrenar, y el límite por minuto frena los agentes con varias empresas. |
| **Correo (Brevo/Resend)** | Sí | Primer mes | 300 correos/día se agotan con cobranza y resúmenes de varias empresas. |
| **Cloudflare R2** | No (casi) | Revisar al pasar ~10 GB | Sin cobro de salida; barato por almacenamiento. |
| **Rate limit distribuido** (WAF de Vercel o Upstash) | Probablemente incluido en Pro; Upstash tiene capa gratuita | Primer mes | El limitador actual es en memoria por instancia. |
| **Sentry** | No | — | Cliente propio sobre la API de envelopes; la capa gratuita alcanza. |
| **Prisma 7** | No | — | Es una librería, no un servicio. |
| **Khipu, Turnstile** | No (Khipu cobra comisión por pago, Turnstile es gratis) | — | — |
| **Más servidores / Kubernetes** | **No** | — | No hacen falta para 50 empresas. |

Costo mensual base orientativo para operar comercialmente: **US$60–150** (Vercel Pro + Neon Launch + Gemini de pago + correo). Crece con el uso.

---

## 2. Lo que sigue funcionando sin cambios hasta ~50 empresas

- **Arquitectura multi-tenant en una sola base.** Todas las consultas filtran por `companyId` y las tablas grandes ya tienen índices que parten por `companyId`: `SalesDocument` (10 índices), `JournalEntry`, `JournalLine`, `AuditLog`, `InventoryMovement` (`companyId, productId, createdAt`), `Contact`, `Product`.
- **Conexiones a la base.** App en el endpoint *pooled* de Neon, migraciones por el directo, y `max: 5` conexiones por instancia (`src/lib/prisma.ts`). Es el punto que más rompe sistemas serverless y ya está resuelto.
- **Archivos fuera de la base** (R2): la base no se infla con PDFs ni fotos. Hoy la base pesa ~89 MB.
- **Idempotencia en emisión** (`idempotencyKey` único por empresa): un reintento no duplica documentos.
- **Migraciones idempotentes y build que migra.**
- **Observabilidad, auditoría y respaldo por empresa.**

---

## 3. Lo que hay que corregir en el código (no cuesta plata, sí trabajo)

Ordenado por qué se rompería primero con datos y empresas.

### 3.1 Los cron recorren las empresas de una en una, sin límite de tiempo declarado

Hay siete servicios que hacen `company.findMany` y recorren todas las empresas (agentes, alertas, cobranza, cierre mensual, reporte semanal, recordatorios de calendario, recordatorio de cuotas). El de agentes (`src/app/api/agents/run/route.ts`) además:

- corre **en secuencia**, y cada empresa llama a Gemini (con tope de 40 s por llamada);
- se ejecuta **6 veces al día** (CFO, COO, SALES, EVENT_FINANCE, EVENT_COLLECTIONS, CEO);
- no declara `maxDuration`, así que depende del tope por defecto de la plataforma.

Con pocas empresas termina a tiempo. Con 50 empresas y varias llamadas de IA por empresa, **es probable que una corrida no termine antes del corte** y las últimas empresas queden sin procesar, sin que nadie se entere.

Qué hacer:
1. Medir cuánto demora una corrida por empresa y multiplicar.
2. Procesar por lotes (por ejemplo, 5 empresas por invocación) y que el cron encole el siguiente lote, o usar varias rutas cron escalonadas.
3. Registrar cuántas empresas no alcanzaron a procesarse y avisar (hoy solo se cuenta `failed`).
4. Declarar `maxDuration` explícito en cada ruta de cron.

### 3.2 Listados sin paginación comprobada

De ~406 usos de `findMany` en `src/`, solo ~115 usan `take:` en la misma sentencia y solo 14 archivos usan `skip`/`pageSize`. Esto es un conteo textual, no una auditoría: puede haber paginación en otra línea o en otra capa. Pero un listado que trae **todos** los documentos, movimientos o asientos de una empresa funciona con cientos de filas y se cae con cientos de miles.

Qué hacer: auditar las pantallas de ventas, kardex, contabilidad, tesorería, reportes y exportaciones, y poner paginación en servidor (cursor) y tope en toda consulta que pueda crecer.

### 3.3 Reportes e inteligencia calculados al vuelo

`intelligence/` (Radiografía 360, caja a 13 semanas), el F29 y los reportes leen documentos reales cada vez que se abren. Con mucho historial, abrirlos en horario laboral compite con las ventas del mismo cliente y de los demás (misma base).

Qué hacer: limitar el rango por defecto, cachear resultados por período cerrado, y correr lo pesado fuera de horario o contra una **réplica de lectura** de Neon (pago) si hace falta.

### 3.4 Índices que conviene revisar

- `SalesDocumentLine`, `Notification` y `Message` (solo por `companyId` y `conversationId`+fecha) no mostraron índices propios en la revisión rápida. Verificar con `EXPLAIN` contra la base real cuando haya volumen.
- Las búsquedas de texto (`razonSocial`, `name`) con `contains` no usan índices B-tree normales: con mucho catálogo, evaluar índices `pg_trgm`.
- Revisar `list_slow_queries` de Neon cada semana una vez que haya clientes: es la forma más barata de saber qué indexar.

### 3.5 Polling

Intervalos actuales: mensajería 4 s, escaleta 5 s (3 s en vivo), jurado 8 s, campanita 20 s. Cada consulta es una invocación y una consulta a la base.

Aproximación: 200 usuarios con la mensajería abierta ≈ 50 consultas por segundo solo por eso.

Qué hacer: subir los intervalos cuando la pestaña está oculta (`document.visibilityState`), usar *backoff* cuando no hay cambios, y reservar el intervalo corto para el modo show y el jurado. Más adelante, un servicio de tiempo real (Pusher/Ably) solo para esos dos casos.

### 3.6 Picos públicos

Votación del público, venta de entradas y postulaciones son tráfico anónimo y en ráfagas.

- Mantener el limitador actual, pero **reforzarlo con el WAF de Vercel o Upstash**, porque el de memoria no se comparte entre instancias.
- Probar un pico simulado (ver sección 5) en la ruta de votos y de entradas antes de un certamen real.

---

## 4. Plan por etapas

**Antes del primer cliente pagando**
1. Vercel Pro.
2. Neon plan pagado (restauración de varios días).
3. Gemini con facturación activada; actualizar política de privacidad.
4. Plan de correo con cupo suficiente.
5. Declarar `maxDuration` en las rutas cron.

**Primer mes**
6. Rate limit distribuido (WAF/Upstash).
7. Lotes en los cron de agentes y alertas.
8. Polling con pestaña oculta.
9. Alertas de Neon (conexiones, CPU) y de Vercel (errores, duración).

**Entre 10 y 30 empresas activas**
10. Subir el máximo de CU de Neon según lo que muestren las métricas.
11. Revisar consultas lentas cada semana e indexar.
12. Auditar paginación en pantallas de listado y exportación.

**Entre 30 y 50 empresas**
13. Prueba de carga completa (sección 5) y ajustar con sus resultados.
14. Evaluar réplica de lectura de Neon para reportes.
15. Revisar la factura de funciones de Vercel y el costo del polling.

**Después de 50 empresas** (no hace falta ahora)
16. Evaluar mover Neon y Vercel a São Paulo para bajar latencia.
17. Aislar en base propia a un cliente que domine el volumen.

---

## 5. Cómo medir de verdad (en vez de estimar)

1. Crear una **rama de Neon** (copia barata de la base), nunca probar contra producción.
2. Cargar datos sintéticos: por ejemplo 50 empresas × 20.000 documentos × 5 líneas, más movimientos de inventario y asientos.
3. Medir con una herramienta de carga (k6, Artillery) los flujos críticos: emitir venta, abrir listados, abrir Radiografía 360, cerrar el mes, votar, comprar entrada.
4. Observar en Neon: `list_slow_queries`, CPU y conexiones. Observar en Vercel: duración de funciones y errores.
5. Medir una corrida completa de cada cron con 50 empresas y comparar con su tope de duración.

Criterio de aprobado sugerido: emisión de venta bajo 1 s al percentil 95, listados bajo 1,5 s, ningún cron cerca del 70 % de su tope de duración, y cero errores de conexión agotada.

---

## 6. Lo que NO hace falta cambiar

- No migrar de Neon, Vercel ni Prisma.
- No montar servidores propios ni Kubernetes.
- No separar una base por empresa (salvo un cliente excepcionalmente grande, más adelante).
- No reescribir la arquitectura: los cambios de este documento son acotados.
