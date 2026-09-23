# Aether — ERP chileno + Producción de Eventos

SaaS multi-tenant que combina dos cosas que normalmente son productos separados:

- **Un ERP con tributación chilena real**: inventario con kardex PMP, ventas y compras, tesorería, contabilidad con asientos automáticos, F29 sobre documentos reales y facturación electrónica con folios autorizados por el SII.
- **Una plataforma de producción de certámenes y eventos**: candidatas, jurado y escrutinio en vivo, escaleta, vestuario, acreditación, auspicios, venta de entradas y votación del público.

Ambas mitades comparten empresa, usuarios, permisos y contabilidad. Cada módulo se activa por separado por empresa, así que un cliente puede contratar solo el ERP, solo la producción de eventos, o ambos.

> Para reglas de arquitectura, convenciones de código y lógica tributaria obligatoria, ver **[CLAUDE.md](CLAUDE.md)**. Este README cubre cómo levantar y operar el proyecto.

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, RSC) |
| Lenguaje | TypeScript estricto — sin `any`, sin `@ts-ignore` |
| Base de datos | PostgreSQL (Neon) + Prisma 7 con driver adapters |
| UI | Tailwind CSS v4, shadcn/ui, Lucide, Recharts, TanStack Table |
| Validación | Zod (cliente, servidor y webhooks) |
| Archivos | Vercel Blob |
| Correo | Resend / SMTP vía `src/lib/email/` |
| IA | Google Gemini (`@google/genai`) para los agentes de negocio |
| Tests | Jest + ts-jest |

---

## Puesta en marcha

```bash
npm install            # postinstall corre `prisma generate`
cp .env.example .env   # y completa las variables (ver abajo)
npx prisma migrate dev # ⚠️ lee la advertencia de base compartida
npm run seed           # datos de demostración (opcional)
npm run dev
```

La app queda en `http://localhost:3000`.

### Variables de entorno

`.env.example` documenta cada variable con qué hace y dónde conseguirla. Las mínimas para levantar:

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Conexión a PostgreSQL (Neon) |
| `JWT_SECRET` | Firma de las cookies de sesión |
| `TOTP_ENCRYPTION_KEY` | Cifrado de secretos 2FA; sirve de respaldo para mensajería y CAF |
| `CRON_SECRET` | Autoriza las rutas de cron. **Falla cerrado**: sin esta variable los crons responden 401 |

Opcionales pero recomendadas en producción: `BLOB_READ_WRITE_TOKEN` (subida de archivos), `SENTRY_DSN` (errores), `DTE_ENCRYPTION_KEY` (CAF), `GEMINI_API_KEY` (agentes), `APP_URL` (enlaces en correos).

---

## ⚠️ La base de datos local es la de producción

El `DATABASE_URL` del `.env` apunta a la **misma** instancia Neon que usa producción. Antes de tocar el esquema:

1. **Toda migración es aditiva** salvo que haya un plan explícito: tablas nuevas, columnas nullable o con default. Un `DROP COLUMN` o un `NOT NULL` sobre una tabla con datos rompe producción de inmediato.
2. **Aplicar una migración obliga a desplegar enseguida.** Si no, producción corre código viejo contra un esquema nuevo.
3. Para revisar el SQL **sin aplicarlo**:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   ```
4. Los scripts destructivos y los seeds no se corren contra este `.env` sin confirmarlo antes.

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma generate` + build de producción |
| `npm run ci` | `prisma validate` + `typecheck` + `lint` + `test` — **lo que debe pasar antes de dar algo por terminado** |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest |
| `npm run seed` | Puebla la base con datos de demostración |

---

## Arquitectura

```
src/
├── app/
│   ├── (dashboard)/       Panel privado (81+ pantallas)
│   ├── (superadmin)/      Panel del operador del SaaS
│   ├── api/               Route Handlers: subidas, webhooks, crons, respaldo
│   └── …                  Rutas públicas: login, portales por token, votación
├── modules/               35 módulos por dominio (services + actions + schema)
├── lib/
│   ├── auth/              Sesiones, permisos, guards, auditoría
│   ├── chile/             RUT, IVA, F29 y el núcleo DTE (`chile/dte/`)
│   └── observability/     Logs estructurados y reporte de errores
├── components/            UI compartida y por módulo
└── instrumentation.ts     Captura de errores del servidor (Next.js)
```

### Control de acceso

Tres capas que se combinan, todas resueltas en `src/lib/auth/`:

1. **Rol base** (`OWNER`, `ADMIN`, `SALES`, `WAREHOUSE`, `ACCOUNTANT`) con una matriz de permisos en `permissions.ts`.
2. **Roles personalizados** por empresa: listas de permisos a medida que reemplazan la matriz del rol base.
3. **Módulos contratados** (`CompanyFeatures`): un permiso que pertenece a un módulo no contratado no se otorga, aunque el rol lo tenga.

Toda Server Action empieza con `await requireAuthWithPermission('permiso')`. Nunca `requireAuth(roles)`: ignora los roles personalizados.

### Aislamiento multi-tenant

Toda consulta filtra por `companyId`. Se prefieren `updateMany`/`deleteMany` con ese filtro sobre `update`/`delete` por id, para que omitir el tenant sea imposible por accidente. `getAuthContext()` relee la base en cada request, así que suspender una empresa corta el acceso al instante en vez de esperar a que expire el token.

---

## Facturación electrónica (DTE)

Implementado hoy:

- Carga y validación de **CAF** (rangos de folios autorizados por el SII), guardados cifrados.
- Asignación de folios desde el rango autorizado, con lock de fila y dentro de la transacción de emisión.
- **TED** (timbre electrónico) firmado con la llave del CAF, verificable sin conexión.
- Generación del **XML del DTE** según el esquema del SII.

Pendiente: firma XML-DSig con el certificado digital de la empresa, envío al SII y consulta de estado por Track ID. Una empresa sin CAF cargado sigue emitiendo con numeración interna, sin validez tributaria — es deliberado, para no cortarle la operación a quienes ya usan el sistema así.

Los folios se administran en **Configuración → Folios del SII**.

---

## Observabilidad

Sin configurar nada, cada error queda como una línea JSON en stdout con `companyId`, `module` y `level`, lista para cualquier drenaje de logs. Con `SENTRY_DSN` definido, además se envía a Sentry (cliente propio sobre su API de envelopes, sin el SDK).

En el código: `captureException(error, { module, companyId })`, nunca `console.error` suelto. El contexto se sanea solo — contraseñas, tokens y llaves se censuran por patrón de nombre de clave.

---

## Automatizaciones

**Configuración → Automatizaciones** deja que cada empresa arme sus propios flujos: *cuando pase X, si se cumple Y, hacer Z* — sin escribir código.

- **Disparadores**: eventos de negocio que ya ocurren en el sistema — venta emitida o anulada, compra pendiente de aprobación, stock bajo el mínimo, cuenta por cobrar vencida, folios del SII por agotarse, candidata inscrita, entrada o voto pagado, auspicio firmado.
- **Condiciones**: filtros simples sobre los datos del evento (`monto > 100000`, `tipo de documento es Factura`), todas en AND. Sin condiciones, la regla corre siempre.
- **Acciones**, en el orden que se configuren: enviar un correo, crear una notificación en la campanita interna, o llamar un webhook externo (Zapier, Make, n8n, un servidor propio) — firmado con HMAC-SHA256 para que el receptor verifique el origen.

Todo texto acepta `{{campo}}` para insertar un dato del evento. Cada regla guarda su historial de ejecuciones (qué acción corrió, si tuvo éxito, con qué datos), visible desde la propia pantalla.

El webhook saliente pasa por un guardia SSRF (`src/lib/security/outbound-url.ts`) antes de cada llamada: exige `https://`, bloquea IPs privadas y la de metadata de la nube, y no sigue redirecciones. Emitir un evento nunca falla la operación que lo disparó — un correo o webhook caído no revierte una venta.

---

## Respaldo y portabilidad

**Configuración → Empresa → Respaldo** descarga todos los datos de la empresa en JSON. Las tablas se derivan del modelo de datos de Prisma, así que un modelo nuevo entra automáticamente; las credenciales nunca salen. Es portabilidad y archivo (la ley chilena exige conservar respaldo tributario por 6 años), no una herramienta de restauración.

---

## Tareas programadas

Definidas en `vercel.json`, todas autenticadas con `CRON_SECRET`:

| Ruta | Frecuencia | Qué hace |
| --- | --- | --- |
| `/api/agents/run?role=…` | Diario (CFO, COO, SALES, luego CEO) | Recomendaciones de los agentes de negocio |
| `/api/alerts/operational/cron` | Diario | Stock bajo, cobros vencidos y otras alertas |
| `/api/calendar/reminders/cron` | Diario | Recordatorios de eventos y cumpleaños |
| `/api/payment-plans/overdue-reminder/cron` | Diario | Aviso de cuotas vencidas |
| `/api/reports/weekly/cron` | Semanal (lunes) | Libro Excel por correo |
| `/api/accounting/monthly-closing/cron` | Mensual (día 5) | Cierre mensual y F29 |
| `/api/candidates/purge-retention/cron` | Mensual (día 1) | Purga de postulaciones descartadas (Ley 19.628/21.719) |
