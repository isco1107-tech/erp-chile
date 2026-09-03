# CLAUDE.md - Directrices del Proyecto: ERP & CRM All-in-One Chile

Este archivo contiene las reglas arquitectónicas, estándares de seguridad y lógica tributaria chilena obligatorias para cualquier modelo o agente de desarrollo (Cline, Claude Code, Gemini).

---

## 1. Stack Tecnológico & Arquitectura

- **Framework:** Next.js 16 (App Router, Server Actions, React Server Components, Route Handlers). Next.js 16 renombró `middleware.ts` a `proxy.ts` — ver Sección 2.2.
- **Lenguaje:** TypeScript en modo estricto (`strict: true`). Prohibido terminantemente el uso de `any` o `@ts-ignore`.
- **Base de Datos & ORM:** PostgreSQL (Neon) gestionado con Prisma 7, con driver adapters (`@prisma/adapter-pg`). Bajo adapters, `error.meta.target` no existe; usar `src/lib/prisma-errors.ts` (`getUniqueConstraintInfo`, `constraintInvolves`) para traducir violaciones de constraint.
- **Estilos & UI:** Tailwind CSS v4, shadcn/ui, Lucide Icons, Recharts (gráficos), TanStack Table (tablas interactivas).
- **Validación:** Zod para esquemas y validación simétrica (cliente, servidor y webhooks).
- **Excel:** `exceljs` + `papaparse`. El paquete `xlsx` de npm está vetado por vulnerabilidades sin parche (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9).
- **Estructura de Carpetas:** Enfoque modular por dominio en `src/modules/`. Módulos que YA EXISTEN:
  - `src/modules/auth/` (Sesiones, roles, guards, invitaciones)
  - `src/modules/contacts/` (Clientes y proveedores)
  - `src/modules/inventory/` (Catálogo, multibodega, kardex PMP)
  - `src/modules/sales/` (Documentos de venta/DTE, folios, cotizaciones — el POS vive aparte, ver abajo)
  - `src/modules/purchases/` (Facturas proveedor, recepción, costeo)
  - `src/modules/pos/` (Punto de Venta, caja y turnos/arqueo)
  - `src/modules/treasury/` (CxC, CxP, flujo de caja, pagos)
  - `src/modules/roles/` (Roles personalizados por empresa)
  - `src/modules/platform/` (Panel superadmin: empresas, feature flags)
  - `src/modules/import/` (Asistente de importación masiva Excel)
  - `src/modules/reports/` (Generación de libros Excel)
  - Lógica tributaria transversal (RUT, IVA, F29) vive en `src/lib/chile/`, no en un módulo propio.
  - **Módulos PLANIFICADOS, aún NO construidos** (no asumir que existen): `src/modules/dte/` (emisión real ante el SII: XML, CAF, firma digital — hoy los "DTE" son solo folio + documento interno, sin integración SII), `crm/`, `marketing/`, `ecommerce/`, `projects/`, `hr/`.

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

- **Moneda:** CLP en enteros (sin decimales). Formato estándar: `$ 1.250.000`.
- **RUT Chileno:** Validación estricta mediante algoritmo Módulo 11 en `src/lib/chile/rut.ts`. Formato canónico: `12.345.678-K`.
- **Impuestos (IVA 19%):**
  - IVA General: 19% aplicado sobre líneas afectas. Helpers simples en `src/lib/chile/tax.ts` (`calculateIva`, `calculateTotal`); redondeo con `Math.round` (aritmético estándar, no bancario) de forma consistente en todo el código.
  - El mecanismo canónico de reparto de IVA por documento es `src/modules/sales/calc.ts`: redondea el IVA una sola vez sobre el neto agregado y reparte ese entero entre líneas afectas por el método del resto mayor, de modo que la suma de IVA por línea siempre cuadra exactamente con el total del documento.
  - Soporte para productos y servicios exentos de IVA vía `Product.isExempt`. Este flag se lee SIEMPRE del catálogo, nunca del formulario del cliente — tomarlo del cliente ya fue un bug real (sobrecobro de 19% a productos exentos).
  - `CompanySettings` (1:1 con `Company`) guarda parámetros tributarios editables por empresa: `industryType`, `allowNegativeStock`, `ppmRateBasisPoints` (tasa de PPM), `honorariumRetentionBps` (retención de honorarios), `fiscalYear`.
  - Motor F29 real en `src/lib/chile/f29.ts` (tabla `TaxPeriod`): calcula débito fiscal, crédito fiscal, arrastra remanente de crédito del mes anterior, PPM sobre ventas netas según `ppmRateBasisPoints`, e impuesto determinado. No es un "estimador" simbólico: corre sobre documentos reales `ISSUED` del período.
- **Documentos Tributarios Electrónicos (DTEs):** enum `DteType` en `prisma/schema.prisma`. Hoy son folio interno + documento persistido (`FolioSequence`, `SalesDocument`), **sin integración real con el SII** (sin XML, sin CAF, sin firma digital, sin envío). Ver módulos planificados en Sección 1.
  - Tipo 33: Factura Electrónica Afecta
  - Tipo 34: Factura No Afecta o Exenta
  - Tipo 39: Boleta Electrónica
  - Tipo 52: Guía de Despacho
  - Tipo 56: Nota de Débito
  - Tipo 61: Nota de Crédito
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
