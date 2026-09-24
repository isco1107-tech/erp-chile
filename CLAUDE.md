# CLAUDE.md - Directrices del Proyecto: ERP chileno + Producción de Eventos (Aether)

Este archivo contiene las reglas arquitectónicas, estándares de seguridad y lógica tributaria chilena obligatorias para cualquier modelo o agente de desarrollo (Cline, Claude Code, Gemini).

---

## 1. Stack Tecnológico & Arquitectura

- **Framework:** Next.js 16 (App Router, Server Actions, React Server Components, Route Handlers). Next.js 16 renombró `middleware.ts` a `proxy.ts` — ver Sección 2.2.
- **Lenguaje:** TypeScript en modo estricto (`strict: true`). Prohibido terminantemente el uso de `any` o `@ts-ignore`.
- **Base de Datos & ORM:** PostgreSQL (Neon) gestionado con Prisma 7, con driver adapters (`@prisma/adapter-pg`). Bajo adapters, `error.meta.target` no existe; usar `src/lib/prisma-errors.ts` (`getUniqueConstraintInfo`, `constraintInvolves`) para traducir violaciones de constraint.
- **Estilos & UI:** Tailwind CSS v4, shadcn/ui, Lucide Icons, Recharts (gráficos), TanStack Table (tablas interactivas).
- **Validación:** Zod para esquemas y validación simétrica (cliente, servidor y webhooks).
- **Excel:** `exceljs` + `papaparse`. El paquete `xlsx` de npm está vetado por vulnerabilidades sin parche (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9).
- **Alcance real del producto:** no es solo un ERP. Sobre el núcleo ERP/tributario chileno hay una plataforma de **producción de certámenes y eventos** (candidatas, jurado, escaleta en vivo, auspicios, entradas, votación del público). Ambas mitades comparten empresa, permisos y contabilidad. Todo módulo se vende por separado vía `CompanyFeatures` (ver Sección 2.4).
- **Estructura de Carpetas:** Enfoque modular por dominio en `src/modules/`. **46 módulos existen hoy**; la lista completa se obtiene con `ls src/modules/`. Los principales, por área:
  - **Núcleo ERP:** `auth/` (sesiones, guards, invitaciones), `contacts/`, `inventory/` (catálogo, multibodega, kardex PMP), `sales/` (documentos de venta, cotizaciones, emitir/eliminar borradores — el POS vive aparte), `purchases/`, `pos/`, `treasury/` (CxC, CxP, flujo de caja, cajas y bancos `TreasuryAccount`, conciliación bancaria en `treasury/reconciliation/` con flag `hasBankReconciliation`, links de pago Khipu de facturas en `treasury/online/`), `accounting/` (asientos, plan de cuentas, cierre mensual, "Cuentas del sistema" = pantalla de `AccountMapping`), `reports/`, `import/`, `budgets/`, `crm/` (embudo de oportunidades, flag `hasSalesPipeline`), `fixed-assets/` (depreciación lineal/acelerada, asiento mensual 6105/1202), `expenses/` (rendición de gastos con flujo de aprobación), `inbox/` (bandeja "Pendientes" y guía de primeros pasos; solo lee).
  - **Servicios:** `contracts/` (contratos con facturación recurrente, flag `hasServiceContracts`, cron diario `/api/contracts/billing/cron`; la idempotencia es `contract:<id>:<periodKey>` en el documento + `@@unique([contractId, periodKey])`), `timesheets/` (control de horas y facturación de horas, flag `hasTimesheets`). Fechas y períodos de facturación son puros en `src/lib/services/recurring-billing.ts`.
  - **Integraciones:** `api-keys/` + `src/lib/api/` + rutas `src/app/api/v1/*` (API REST pública, flag `hasPublicApi`: llave `aek_…` guardada solo como SHA-256, alcances por llave, TODO filtra por el `companyId` de la llave; emitir por API exige `Idempotency-Key`), `integrations/` (centro de integraciones, solo lectura de estado).
  - **Personas:** `hr/` (trabajadores, liquidaciones de sueldo, vacaciones; flag `hasPayroll`). El cálculo de remuneraciones es puro en `src/lib/chile/payroll.ts`: UF, UTM, topes y tasas NUNCA se escriben en código como verdad — entran como parámetros guardados en `PayrollPeriod`, y la pantalla obliga a confirmarlos contra Previred.
  - **Inteligencia:** `intelligence/` (Radiografía 360, caja a 13 semanas, flujos del negocio; flag `hasIntelligence`). No persiste nada: todo sale de funciones puras en `src/lib/intelligence/` sobre documentos reales. Regla: una métrica sin datos se omite, nunca se rellena con un valor inventado. Las boletas a consumidor final (RUT 66.666.666-6) no cuentan como cliente.
  - **Tributario:** `dte/` (CAF, folios autorizados y timbre electrónico — ver Sección 3 para su alcance exacto). La lógica transversal (RUT, IVA, F29) vive en `src/lib/chile/`, y el núcleo DTE puro en `src/lib/chile/dte/`.
  - **Producción de eventos:** `candidates/`, `judging/`, `production/` (escaleta con modo show, vestuario, acreditación), `sponsorships/` (incluye tarifario `SponsorshipPackage`), `ticketing/`, `public-voting/`, `projects/`, `org-chart/`. Cada `Project` tiene centro de mando (`projects/services/hub.service.ts` + checklist puro en `src/lib/events/readiness.ts`) y micrositio público `/certamen/[slug]` (`projects/services/public-site.service.ts`). Regla del micrositio: se arma campo por campo, nunca con `include` completo — de una candidata solo sale nombre artístico, número, `representing`, foto y `publicBio`; jamás RUT, edad, contacto ni la ficha de postulación. Los campos de presentación pública de `Candidate` tienen esquema y acción propios (`candidatePresentationSchema`) para que el formulario público de postulación nunca pueda escribirlos.
  - **Cobranza y documentos:** `fees/` (boletas de honorarios), `promissory-notes/` (pagarés), `payment-plans/` (cuotas), `documents/`.
  - **Pago en línea de cuotas** (`payment-plans/services/online-payment.service.ts` + `src/lib/payments/`): portal público `/pagar/[token]` (token por empresa en `CompanySettings.installmentPortalToken`) donde se ingresa el RUT de la candidata y se pagan cuotas por **Khipu** (transferencia). La API key de Khipu es por empresa, cifrada en `khipuApiCredential` y editable solo con `settings:company`. Regla: una orden (`InstallmentPaymentOrder`) SOLO pasa a `PAID` en `syncOrderWithProvider`, que consulta el cobro a Khipu y exige monto/moneda/`transaction_id` exactos; ni la notificación ni el retorno del navegador se creen. Al pagarse: se aplica a las cuotas, se numera el comprobante (`InternalDocumentSequence` `INSTALLMENT_RECEIPT`, PDF no tributario) y se envía por correo.
  - **Plataforma y transversales:** `platform/` (panel superadmin), `roles/`, `backup/` (exportación completa por empresa), `messaging/` (mensajería interna cifrada), `alerts/`, `automation/` (motor de flujos de trabajo propios de cada empresa — ver más abajo), `webhooks/` (n8n entrante), `calendar/`, `manual/`, `agents/` + `agent-actions/` (equipo ejecutivo virtual con Gemini), `workspace/` (qué ítems del menú lateral apagó cada empresa).
  - **Módulos PLANIFICADOS, aún NO construidos** (no asumir que existen): `marketing/`, `ecommerce/`.
- **Tesorería es el libro único del dinero:** `Payment` registra TODO lo que entra y sale, no solo cobros/pagos de ventas y compras. Cualquier módulo que mueva dinero fuera de un documento de venta/compra (sueldos, cotizaciones, honorarios, rendiciones, cuotas, entradas, votos, auspicios, pagarés, cartola) llama a `recordTreasuryMovement` (o `recordPaidAmountChange` para montos "pagado acumulado") de `src/modules/treasury/services/movements.service.ts` DENTRO de su propia transacción, con `source`/`sourceId` y la clave contable de la contrapartida. Eso crea el `Payment` y, con Contabilidad activa, su asiento en la misma transacción. Nunca crear un `Payment` suelto con `prisma.payment.create` desde otro módulo. El evento `PAYMENT_RECEIVED`/`PAYMENT_MADE` se emite con `emitPaymentEvent` DESPUÉS del commit.
- **Asientos automáticos por clave, no por código:** las reglas de asiento usan claves semánticas de `AccountMapping` (`HONORARIOS_POR_PAGAR`, `COBROS_POR_DOCUMENTAR`, …). Si una empresa sembró su plan antes de que existiera una clave, `resolveOrCreateMappedAccountId` (`chart-of-accounts.ts`) crea la cuenta y el mapeo sin pisar nada existente. Toda clave nueva va en `CHART_OF_ACCOUNTS` y en `MAPPING_DEFINITIONS` (`accounting/mapping-definitions.ts`); un test verifica que ambas listas calcen. Los cobros sin documento tributario (cuotas, entradas, votos, auspicios, pagarés) van contra `COBROS_POR_DOCUMENTAR`, un pasivo transitorio: el motor no sabe si ese ingreso es afecto o exento, así que no lo reconoce como venta.
- **Superficies públicas de candidatas:** el nombre que sale al público es SIEMPRE `publicCandidateName` de `src/lib/events/public-candidate.ts` (nombre artístico o "Candidata N° X"), y solo aparecen candidatas en `PUBLIC_CANDIDATE_STATUSES` con `showOnPublicSite`. Nunca leer `fullName` en un servicio que alimenta el micrositio, la votación del público o un correo a compradores.
- **Menú configurable por empresa:** cada enlace de `workspace-nav.ts` tiene un `id` estable que se guarda en `CompanySettings.disabledNavItems` cuando la empresa lo apaga (Configuración → Módulos y menú). No cambiar un `id` existente: reactivaría en silencio el ítem para quien lo tenía apagado. `home` y `settings` no se pueden apagar. Apagar es configuración del espacio de trabajo (menú, paleta ⌘K y `DisabledSectionGate`), no un control de acceso: los permisos siguen en los guards.
- **Observabilidad:** todo error de producción se reporta con `captureException` / `captureMessage` desde `src/lib/observability/`, **nunca** con `console.error` suelto. Emite JSON estructurado siempre y, si hay `SENTRY_DSN`, además envía a Sentry (cliente propio sobre la API de envelopes, sin el SDK). `src/instrumentation.ts` captura toda excepción no controlada del servidor vía `onRequestError`. El contexto que se adjunta se sanea solo: nunca incluir manualmente contraseñas o tokens, pero tampoco preocuparse si vienen dentro del objeto — `redact.ts` los censura por patrón de nombre de clave.
- **Motor de automatizaciones** (`src/lib/workflows/` + `src/modules/automation/`): cada empresa arma sus propias reglas — disparador de negocio (venta emitida, stock bajo mínimo, folios del SII por agotarse, entrada/voto pagado, etc. — catálogo completo en `WORKFLOW_TRIGGER_DEFINITIONS` de `types.ts`) + condiciones opcionales + una o más acciones (correo, notificación interna, webhook saliente firmado con HMAC). `emitWorkflowEvent(companyId, trigger, payload)` es el único punto de entrada: **nunca lanza** y siempre se llama DESPUÉS de que la transacción de negocio que lo dispara ya confirmó, nunca desde dentro de un `prisma.$transaction` — un correo o webhook es I/O externo y no debe poder influir en si una venta se guarda o no. El webhook saliente pasa por `src/lib/security/outbound-url.ts` (bloquea IP privadas/localhost/metadata de nube, exige `https://`, sin seguir redirecciones) antes de cada envío, no solo al guardar la regla.

---

## 2. Seguridad en la Nube (Zero-Trust) & Multi-Tenant

1. **Autenticación & Sesiones:**
   - Cifrado de contraseñas con `bcryptjs` (cost factor 12).
   - Generación y verificación de tokens JWT cifrados mediante `jose`.
   - Almacenamiento exclusivo de sesión en Cookies seguras con flags: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'strict'`, expiración máxima de 8 horas.
2. **Control de Acceso Basado en Roles (RBAC):**
   - Roles disponibles (enum `Role` en `prisma/schema.prisma`): `OWNER`, `ADMIN`, `SALES`, `WAREHOUSE`, `ACCOUNTANT`.
   - Además existen `CustomRole` por empresa: listas de permisos a medida que reemplazan la matriz del rol base (salvo para `OWNER`, que nunca se limita). Ver `src/lib/auth/permissions.ts` (matriz `PERMISSIONS`) y `src/lib/auth/modules.ts` (qué permisos habilita cada módulo contratado).
   - `src/proxy.ts` (NO `middleware.ts` — Next.js 16 lo renombró) intercepta todas las rutas privadas y redirige a `/login` si no existe sesión válida.
   - Toda Server Action debe comenzar llamando al helper `await requireAuthWithPermission(permission)` (`src/lib/auth/guards.ts`). **Nunca** `requireAuth(roles)`: existe por compatibilidad pero ignora los roles personalizados que cree el cliente, así que un permiso otorgado vía `CustomRole` quedaría bloqueado igual.
3. **Aislamiento Multi-Tenant:**
   - Toda consulta a la base de datos (SELECT, INSERT, UPDATE, DELETE) debe incluir obligatoriamente la cláusula `where: { companyId: session.companyId }`. Usar `updateMany`/`deleteMany` con ese filtro en vez de `update`/`delete` por id solo, para que el filtro de tenant sea imposible de omitir por accidente.
   - `getAuthContext()` (`src/lib/auth/guards.ts`) relee la base de datos en cada request (memoizado con `cache()`), no confía solo en el JWT: una empresa suspendida o un usuario desactivado pierde el acceso de inmediato, no al expirar el token de 8h.

---

## 3. Localización Chilena & Reglas Tributarias (SII)

- **Moneda:** CLP en enteros (sin decimales). Formato estándar: `$1.250.000` (sin espacio tras el `$` — así lo produce `formatCurrency` en `src/lib/chile/tax.ts`, usado consistentemente en toda la app).
- **RUT Chileno:** Validación estricta mediante algoritmo Módulo 11 en `src/lib/chile/rut.ts`. Formato canónico: `12.345.678-K`.
- **Impuestos (IVA 19%):**
  - IVA General: 19% aplicado sobre líneas afectas. Helpers simples en `src/lib/chile/tax.ts` (`calculateIva`, `calculateTotal`); redondeo con `Math.round` (aritmético estándar, no bancario) de forma consistente en todo el código.
  - El mecanismo canónico de reparto de IVA por documento es `src/modules/sales/calc.ts`: redondea el IVA una sola vez sobre el neto agregado y reparte ese entero entre líneas afectas por el método del resto mayor, de modo que la suma de IVA por línea siempre cuadra exactamente con el total del documento.
  - Soporte para productos y servicios exentos de IVA vía `Product.isExempt`. Este flag se lee SIEMPRE del catálogo, nunca del formulario del cliente — tomarlo del cliente ya fue un bug real (sobrecobro de 19% a productos exentos).
  - `CompanySettings` (1:1 con `Company`) guarda parámetros tributarios editables por empresa: `industryType`, `allowNegativeStock`, `ppmRateBasisPoints` (tasa de PPM), `honorariumRetentionBps` (retención de honorarios), `fiscalYear`.
  - Motor F29 real en `src/lib/chile/f29.ts` (tabla `TaxPeriod`): calcula débito fiscal, crédito fiscal, arrastra remanente de crédito del mes anterior, PPM sobre ventas netas según `ppmRateBasisPoints`, e impuesto determinado. No es un "estimador" simbólico: corre sobre documentos reales `ISSUED` del período.
- **Documentos Tributarios Electrónicos (DTEs):** enum `DteType` en `prisma/schema.prisma`. Códigos del SII en `src/lib/chile/dte/codes.ts` — usar SIEMPRE ese mapa, nunca literales sueltos.
  - Tipo 33: Factura Electrónica Afecta · 34: Factura Exenta · 39: Boleta · 41: Boleta Exenta · 52: Guía de Despacho · 56: Nota de Débito · 61: Nota de Crédito.
  - `COTIZACION` **no es un DTE**: no tiene código SII, ni folio autorizado, ni timbre. `isDte()` es el chequeo canónico.
  - **Qué SÍ está implementado hoy** (`src/modules/dte/` + `src/lib/chile/dte/`):
    - Carga y validación de **CAF** (rango de folios autorizado por el SII), guardado cifrado con AES-256-GCM en `DteCaf.encryptedXml`.
    - Asignación de folios **desde el rango autorizado**, con lock explícito `SELECT ... FOR UPDATE` sobre la fila del CAF y dentro de la transacción que crea el documento (si la emisión falla, el folio vuelve atrás y no queda hueco).
    - **TED** (timbre electrónico) firmado con RSA-SHA1 usando la llave del CAF, verificable sin conexión.
    - Generación del **XML del DTE** conforme al esquema del SII (orden de bloques, ISO-8859-1, `IndExe`, referencias en notas).
  - **Qué NO está implementado todavía:** firma XML-DSig con el certificado digital de la empresa, envío al SII (semilla/token, `EnvioDTE`), consulta de estado por Track ID, y Consumo de Folios de boletas. Los campos `signedXml`, `siiTrackId` y `siiStatus` en `SalesDocument` existen para ese paso; `siiStatus: 'PENDING'` significa "timbrado, aún no despachado".
  - **Regla de compatibilidad:** una empresa sin CAF cargado sigue emitiendo con el contador interno (`FolioSequence`), sin timbre y sin validez tributaria. Es deliberado — hay clientes operando así — y se distingue en el dato por `cafId: null` / `tedXml: null`. No cambiar esto a "falla si no hay CAF" sin migrar a esos clientes primero.
  - **Nunca reserializar un XML firmado.** El bloque `<DA>` del CAF viaja dentro del TED byte a byte porque la firma del propio SII se calculó sobre esos bytes; parsear a un árbol y volver a serializar invalida la firma. Por eso `caf.ts` extrae texto en vez de usar un parser XML.
- **Control de Inventario (Kardex PMP):**
  - El costo se actualiza exclusivamente por Precio Medio Ponderado al registrar compras:
    $$\text{Nuevo PMP} = \frac{(\text{Stock Actual} \times \text{Costo Actual}) + (\text{Cantidad Entrante} \times \text{Costo Entrante})}{\text{Stock Actual} + \text{Cantidad Entrante}}$$
  - Implementado en `src/lib/inventory/pmp.ts` + `src/modules/inventory/services/stock.service.ts`, con lock explícito (`SELECT ... FOR UPDATE`) sobre la fila del producto para evitar condiciones de carrera, dentro de `prisma.$transaction`.
  - **Excepción deliberada a "CLP en enteros":** el PMP se redondea a 2 decimales, no a entero — es un costo unitario intermedio, y redondear a entero en cada compra sucesiva arrastraría error de redondeo. Los montos finales (totales de documento, pagos) sí son siempre enteros.
  - Salidas y ventas descuentan inventario al PMP vigente en el momento de la salida (leído dentro de la misma transacción, nunca recalculado después) dentro de transacciones atómicas `prisma.$transaction`.
  - Venta con stock insuficiente: bloqueada por defecto; permitida solo si `CompanySettings.allowNegativeStock` está activo para esa empresa.

---

## 4. Estándares de Código y Respuestas del Servidor

- Todas las Server Actions deben retornar una estructura de tipo `ActionResult<T>`:
  ```typescript
  type ActionResult<T> = 
    | { success: true; data: T; message?: string }
    | { success: false; error: string };
  ```
- **Manejo de errores:** el mensaje que llega al usuario debe ser accionable y en español; el detalle técnico va a observabilidad, no a la pantalla. Patrón estándar en un `catch`:
  ```typescript
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  captureException(error, { module: 'ventas', companyId, extra: { folio } });
  return { success: false, error: 'No se pudo emitir el documento' };
  ```
- **Verificación antes de dar algo por terminado:** `npm run ci` corre `prisma validate` + `typecheck` + `lint` + `test`. Los cuatro deben pasar.

### Interfaz del panel (convenciones)

- **Identidad:** tinta `#12161f` + dorado `#dbc076` (los del logo). Los colores salen de los tokens de `globals.css` (`bg-primary`, `text-muted-foreground`, `bg-success-soft`/`text-success`, etc.), nunca de hex sueltos ni de `emerald-600`/`cyan-300`. `:root` es el tema oscuro (login, accesos públicos); `.theme-saas-light` es el panel. Las clases `hud-*` del tema antiguo ya no se usan.
- **Navegación:** `src/lib/navigation/workspace-nav.ts` es el ÚNICO registro de módulos; lo consumen la barra lateral y la paleta ⌘K. Una pantalla nueva se agrega ahí, no en el layout.
- **Confirmaciones:** `const confirm = useConfirm()` (`src/components/ui/confirm-provider.tsx`), nunca `window.confirm()`.
- **Ventas y POS:** toda emisión manda `idempotencyKey` con `createIdempotencyTracker()` (`src/lib/idempotency.ts`): el reintento de la misma operación no debe duplicar documentos.
- **Encabezados:** `PageHeader` (`src/components/ui/PageHeader.tsx`); indicadores con `KpiCard`, estados con `StatusBadge`, vacíos con `EmptyState`.
- **Nada flotante sobre el contenido:** los asistentes se abren desde la barra superior (`HeaderAssistantButtons`).

---

## 5. Base de Datos Compartida con Producción ⚠️

**La `DATABASE_URL` del `.env` local apunta a la MISMA base Neon que produccion.** Consecuencias que no son negociables:

1. Una migración aplicada en local **ya está en producción**. Desplegar el código inmediatamente después, o producción queda corriendo código viejo contra un esquema nuevo.
2. Preferir siempre migraciones **aditivas** (tablas nuevas, columnas nullable o con default). Un `DROP COLUMN` o un `NOT NULL` sobre tabla con datos rompe producción al instante.
3. Para generar el SQL **sin aplicarlo** y revisarlo primero:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
   ```
   (En Prisma 7 los flags `--from-schema-datasource` fueron reemplazados por `--from-config-datasource`.)
4. Los seeds y scripts destructivos **no** se corren contra este `.env` sin confirmarlo antes con el dueño del proyecto.

---

## 6. Respaldo y Portabilidad

- `src/modules/backup/` exporta **todos** los datos de una empresa a JSON, en streaming, vía `GET /api/backup/company` (permiso `company:export`).
- Las tablas a exportar se derivan del **DMMF de Prisma** (toda tabla con `companyId`), no de una lista escrita a mano: un modelo nuevo entra solo. No reemplazar por una lista manual — un respaldo incompleto no se nota hasta que se necesita.
- Los campos que matcheen `/password|secret|token|hash|salt|credential|privatekey/i` nunca salen. Al agregar un modelo con credenciales, verificar que el patrón lo cubra o excluir el modelo entero en `EXCLUDED_MODELS`.
- **No es una herramienta de restauración**: reimportar exigiría resolver orden de claves foráneas y colisiones de id. Es portabilidad y archivo, no *disaster recovery*.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
