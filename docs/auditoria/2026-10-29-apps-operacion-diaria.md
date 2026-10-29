# Las apps de Aether en la operación diaria — 29-10-2026

**Pregunta:** ¿está todo listo para que una empresa opere el día a día con Aether, y cómo lo vive cada persona que lo usa?
**Cómo se hizo:**
1. Lectura del código de las cinco apps (ERP, POS, Bodega, Control, Seller Center), de cómo se conectan y de los flujos del día.
2. **Todas las pruebas, con base de datos real** (Postgres 16 local, nunca la de producción): unitarias, las 20 suites contra Postgres y los 223 recorridos de punta a punta (Playwright, app compilada).
3. **Recorrido «en los zapatos» de cada persona** con un navegador real, en celular, tablet y escritorio (capturas en `.vercel/walkthrough-2026-10-29/`, no versionadas).

Continúa la auditoría del 27-10 (`2026-10-27-experiencia-de-uso.md`), que se centró en el escritorio del ERP.

---

## 1. Qué apps hay y cómo se comunican

```
                         ┌──────────────── Postgres (una base, filas por companyId) ───────────────┐
                         │  stock.service (kardex PMP, reservas)  ·  sales (createSalesDocument)   │
                         │  pos (turnos, ventas)  ·  treasury  ·  consignment  ·  auditoría         │
                         └──────────────▲───────────────▲──────────────▲───────────────▲───────────┘
                                        │               │              │               │
   Aether ERP  /dashboard ──── Server Actions ──────────┘              │               │
   (escritorio, PWA, app Tauri)                                        │               │
   Aether POS  /pos ────────── Server Actions (pos.actions) ───────────┘               │
   (cajero; PWA o instalador; cajón/impresora por Web Serial/WebUSB)                   │
   Bodega      /bodega ─────── API JSON /api/bodega/* (+ cola en IndexedDB) ──────────┘
   (bodeguero; PWA con cámara; funciona sin señal)                                    │
   Control     /control ────── GET /api/control cada 15 s (solo con la app visible) ───┘
   (dueño; solo lectura)
   Seller Center /proveedor/cuenta ── páginas del servidor + /api/supplier-portal/* (cookie propia)
   (seller en consignación; solo lectura de SUS datos)
```

- **Una sola verdad.** Todas las apps escriben y leen la misma base con los mismos servicios: una venta del POS descuenta el mismo stock que ve la Bodega, que respeta las reservas de la tienda en línea y que Control suma en «Ventas de hoy». No hay sincronización entre copias: no hay copias.
- **Misma sesión, distinta puerta.** ERP, POS, Bodega y Control usan la cookie `session` (8 horas) y los mismos permisos. Cada app tiene su ingreso (`/pos/ingresar`, `/bodega/ingresar`, `/control/ingresar`) y la cookie `aether-entry` recuerda por cuál entró la persona para devolverla ahí después de elegir empresa o cambiar la contraseña. Seller Center tiene cuentas y cookie propias (`supplier_session`), separadas del panel.
- **Sin señal.** Solo la Bodega guarda trabajo sin conexión (cola con reintentos e idempotencia por `clientOpId`). El POS conserva la venta en pantalla y reintenta con la misma clave sin duplicar, pero no cobra sin conexión. Control muestra la última consulta y lo dice.
- **Hardware.** La cámara (Bodega) y el USB (POS) los habilita la cabecera `Permissions-Policy` *del documento*: por eso a esas apps se entra con una carga completa de página.

## 2. Estado de las pruebas

| Conjunto | Antes de los cambios | Después |
|---|---|---|
| Unitarias (`npm test`, sin base) | ✅ 4.075 pasan, 0 fallan | ✅ 4.094 pasan, 0 fallan |
| Contra Postgres real (las 20 `*-db.test.ts`) | ✅ 346 pasan, 0 fallan | ✅ 347 pasan, 0 fallan |
| Recorridos de punta a punta (Playwright, app compilada) | ✅ 223 pasan | ✅ 223 pasan (con un turno de caja abierto: ver el error #418 en §3) |
| Tipos (`tsc`), lint, `prisma validate` | ✅ | ✅ (lint: 0 errores; las advertencias ya existían) |
| **Segunda pasada** (pendientes, sección 5) | — | ✅ 4.105 unitarias · 349 contra Postgres · 223 e2e, 0 fallas |

**Ojo:** que todo pase no significaba que la operación estuviera lista. Las pruebas no tenían escritos los casos que una persona real produce el primer día: escribir «50.000» con punto, vender un producto que llegó sin precio por la bodega, abrir el POS con un turno ya abierto o una empresa que vende solo por caja. El recorrido «como persona» encontró todos los problemas de la sección 3. En la segunda pasada, los e2e encontraron uno más: con Mensajería apagada, su pantalla respondía «página no encontrada» (y un error de React #419); ahora explica qué falta, como el resto.

---

## 3. En los zapatos de cada persona

Cada fila es una persona real en su día de trabajo. ✅ = funciona bien; ⚠️ = fricción encontrada (y si se corrigió).

### La cajera (POS, `/pos`)
- ✅ El flujo de venta es el de un supermercado: escanear → RUT (Enter = consumidor final) → F9 → efectivo → vuelto en grande. Ventas en espera, sonidos, cajón e impresora: bien pensados y probados con dispositivos simulados.
- ✅ Sin conexión no cobra, lo dice y conserva la venta; el reintento usa la misma clave y no duplica la boleta.
- ⚠️ **Escribe el fondo de caja como «50.000» y quedaba en $50.** El campo era numérico del navegador, que lee el punto como decimal. Lo mismo en ingresos/retiros y en el efectivo contado al cerrar: un arqueo de $150.000 se declaraba como $150 y aparecía un «faltante» enorme. **Corregido** (campo de monto chileno, ver §4).
- ⚠️ **Escanea un producto creado por el bodeguero y lo vende a $0.** Los productos nacidos en la Bodega móvil quedan sin precio y el POS los cobraba a $0 sin avisar: la mercadería salía regalada (lo reprodujo el recorrido: «Boleta #5 · $0»). **Corregido**: el POS lo marca «Sin precio», no lo agrega y el servidor lo rechaza; Inicio avisa qué productos no tienen precio y abre la ficha para ponérselo.
- ⚠️ Su turno dura más que la sesión (8 h) y la sesión se cortaba sin aviso a media tarde. **Corregido**: aviso 10 min antes, con instrucciones para el cajero (dejar la venta en espera; el turno sigue abierto) y «Volver a ingresar» al ingreso del POS.
- ⚠️ Si trabaja en dos empresas, después de elegir empresa (o de cambiar una contraseña temporal) llegaba al POS **sin cajón ni impresora USB** hasta recargar la página, y no tenía cómo cambiar de empresa desde el POS. **Corregido**: carga completa al entrar y «Cambiar de empresa» en la cabecera.
- ⚠️ La insignia «Turno cerrado» se veía verde, como si estuviera bien. **Corregido** (aviso en amarillo).
- ⚠️ **Con un turno abierto, la pantalla del POS daba un error de React** (#418, hidratación): la hora de apertura se escribía con `toLocaleString`, y Node y Chromium escriben «a. m.» distinto. Ninguna prueba lo veía porque la empresa de pruebas no tenía un turno abierto al recorrer `/dashboard/pos`; lo destapó este recorrido. **Corregido**: todas las fechas del POS (cabecera, arqueo, historial, comprobante de cierre y ticket) con `santiagoDateTimeLabel`/`santiagoTimeLabel` (24 h, dígitos). El ticket del navegador además usaba la zona horaria del computador, no la de Chile.
- ⚠️ Primera vez del dueño: sin cajas, el POS le decía «solicita al administrador»; el formulario para crear la caja estaba plegado más abajo. **Corregido**: se abre solo y explica qué poner.

### El bodeguero (Bodega, `/bodega`)
- ✅ La mejor app del conjunto para su usuario: botones grandes, «¿Qué vas a hacer?» en sus palabras («Llegó un pedido o un camión»), funciona sin señal, la cola explica qué está pendiente y por qué se rechazó algo.
- ⚠️ «Descartar» un movimiento rechazado (por ejemplo, una merma con su foto) se hacía con un solo toque, sin confirmar. **Corregido**: pide confirmación y explica que no quedó registrado.
- ⚠️ Con su IP bloqueada lo mandaba al login del ERP (fuera de su app). **Corregido**: vuelve al ingreso de Bodega con el motivo a la vista.

### El dueño en el celular (Control, `/control`)
- ⚠️ **No veía sus ventas.** «Ventas de hoy / del mes» exigían el permiso de Facturación, módulo que hoy no se vende: una empresa que vende por el POS veía solo «actividad». **Corregido**: misma regla que «Exportar datos» (Facturación o POS); con prueba contra Postgres.
- ⚠️ Con un corte de red aparecía «Revisar mi sesión» (que lleva al login): un dueño con mala señal terminaba cerrando sesión. **Corregido**: el botón «Volver a ingresar» solo aparece si la sesión venció.
- ⚠️ Con IP bloqueada caía en el login sin explicación y volvía a rebotar. **Corregido**.
- ⚠️ Un administrador (no dueño) veía «Acceso del dueño» sin salida. **Corregido**: botón «Ir al ERP».

### El dueño o la administración en el ERP (`/dashboard`)
- ⚠️ Inicio no mostraba la venta del mes ni el IVA débito a quien vende solo por el POS (pendiente M4 de la auditoría anterior). **Corregido** con la misma regla de Control; la tabla de «ventas recientes» sigue exigiendo Facturación porque enlaza a la ficha del documento.
- ⚠️ En una pantalla de un módulo no contratado, la guía «Cómo usar» se abría sola **encima** del aviso «Módulo no incluido» y explicaba botones que no existen. **Corregido**: la guía no se abre sobre una pantalla cerrada y tampoco se da por vista.
- ⚠️ Ese aviso le decía al dueño «Contacta al administrador» (él es quien contrata). **Corregido**: al dueño le ofrece «Ver planes y módulos»; a los demás, «avísale al dueño». Lo mismo en POS y Bodega (`AppAccessNotice`).
- ⚠️ «No autorizado para esta acción» no decía qué faltaba (M6 anterior). **Corregido**: «Tu usuario no tiene el permiso «Supervisar y cerrar turnos de otros cajeros». Pídeselo al dueño o a un administrador…».
- ⚠️ Un error de programación podía llegar en inglés técnico (M7 anterior). **Corregido** para `TypeError`/`ReferenceError`/`RangeError`/`SyntaxError`: mensaje en español y reporte a observabilidad; los mensajes de negocio siguen llegando tal cual.
- ⚠️ El precio del producto solo se podía escribir neto (M1 anterior). **Corregido**: se escribe neto o «precio al público» y el otro se calcula; si el precio con IVA no calza exacto (≈16 % de los montos, porque el IVA se calcula sobre el neto), dice en cuánto quedó.
- ⚠️ «Crédito 30 días» aunque el cliente tenga 60 (M5 anterior). **Corregido**: «Crédito (a plazo)»; el vencimiento ya usaba los días reales. El código que va al SII (`FmaPago`) no cambia.
- ⚠️ Inventario en el celular: la tabla mostraba el nombre y obligaba a deslizar para ver **cuánto hay**. **Corregido**: en pantallas chicas, producto + bodega + cantidad a la vista; PMP y valorizado desde tablet. Las filas se abren también con el teclado.
- ⚠️ Cobros y pagos (Tesorería) y mensualidades (Academia) tenían el mismo problema de «150.000 = $150». **Corregido**.

### El seller en consignación (Seller Center, `/proveedor/cuenta`)
- ✅ Ingreso claro, recuperación de contraseña, instalable, solo ve lo suyo.
- ⚠️ En el centro de apps se presentaba como «para proveedores»: un proveedor normal intentaría entrar y no podría. **Corregido**: «Sellers en consignación · se entra con la invitación que envía la tienda».

### Cualquier visitante del centro de apps (`/apps`, página pública)
- ⚠️ Mostraba «Siguientes apps recomendadas» con notas internas del equipo («Crear ingreso personal persistente antes de reemplazar los enlaces privados…»). **Quitado**: esa evaluación es interna.

---

## 4. Lo que se corrigió en esta pasada

| Qué | Dónde |
|---|---|
| Campo de monto chileno («50.000» = 50.000; ignora `$`, puntos y espacios; corta en la coma) | `src/components/ui/AmountInput.tsx`, `src/lib/chile/amount-input.ts`; usado en `pos/OpenShiftPanel`, `pos/CashPanel`, `treasury/RegisterPaymentDialog`, `academy/PaymentsPanel` |
| POS no vende productos sin precio (cliente y servidor) + aviso en Inicio con enlace a la ficha | `pos/PosTerminal.tsx`, `modules/pos/services/pos.service.ts`, `dashboard/page.tsx` |
| Ventas del POS en Control e Inicio (regla `exportAccess`) | `modules/control/service.ts`, `dashboard/page.tsx` |
| Entrada a POS/Bodega con carga completa tras elegir empresa o cambiar contraseña (`needsFullPageLoad`) | `lib/auth/entry-preference.ts`, `auth/CompanyPicker.tsx`, `ChangePasswordForm.tsx`, `auth/LoginPage.tsx`, `seleccionar-empresa/page.tsx` |
| «Cambiar de empresa» y aviso de cierre de sesión en el POS | `pos/(app)/layout.tsx`, `shared/SessionExpiryNotice.tsx`, `lib/auth/session-expires-at.ts` |
| IP bloqueada: cada app vuelve a su propio ingreso con el motivo | `control/(app)/page.tsx`, `bodega/(app)/layout.tsx` |
| Avisos de acceso que distinguen módulo no contratado / permiso faltante / dueño | `apps/AppAccessNotice.tsx`, `ModuleGate.tsx`, `lib/auth/permissions.ts` (`missingPermissionMessage`) |
| La guía «Cómo usar» no se abre sobre una pantalla cerrada | `tutorial/ModuleTutorial.tsx` (`data-access-locked`) |
| Errores de programación sin inglés técnico | `lib/prisma-errors.ts` |
| Precio al público editable | `lib/chile/tax.ts` (`netPriceForGross`), `ProductForm.tsx` |
| Control: «Volver a ingresar» solo con sesión vencida; salida al ERP para no dueños | `apps/ControlDashboard.tsx`, `control/(app)/page.tsx` |
| Bodega: confirmar antes de descartar un movimiento rechazado | `bodega/OutboxScreen.tsx` |
| POS: primera caja, insignia de turno cerrado, texto del fondo de cambio | `pos/OpenShiftPanel.tsx`, `pos/PosWorkspace.tsx` |
| Inventario legible en el celular | `InventoryClient.tsx` |
| Centro de apps sin notas internas; Seller Center bien descrito | `app/apps/page.tsx`, `lib/apps/catalog.ts` |
| Fechas del POS sin error de hidratación y siempre en hora de Chile | `lib/chile/timezone.ts` (`santiagoDateTimeLabel`, `santiagoTimeLabel`); `pos/PosWorkspace`, `ShiftHistoryPanel`, `CashPanel`, `CashShiftReceipt`, `PosTicket`, `PosTerminal` |
| «Crédito (a plazo)» | `modules/sales/schema.ts`, `modules/pos/services/cash.service.ts`, manual y tutorial |

**Pruebas nuevas:** `tests/apps-daily-operation.test.ts` (17: montos, entrada a las apps, IP, mensajes, precio con IVA) y dos casos en `tests/pos-db.test.ts` contra Postgres (producto sin precio rechazado; Control muestra las ventas de una empresa solo-POS).
**Revisión tributaria** (`chile-tax-dte-specialist`): sin hallazgos bloqueantes. Verificó `netPriceForGross` en todos los precios de 1 a 14.000.000 (cero discrepancias; error máximo $1 cuando no hay neto exacto), que el monto no puede ser negativo y que nada cambia lo que se envía al SII. Su único detalle (aviso de precio desactualizado al marcar «exento») quedó corregido.

---

## 5. Pendientes: estado al cierre de la segunda pasada (29-10)

| # | Pendiente | Estado | Qué se hizo |
|---|---|---|---|
| 1 | Productos sin precio | ✅ | Filtro «Solo sin precio» en el Catálogo (`?sinPrecio=1`, el aviso de Inicio lleva ahí). La tienda en línea no deja **publicar** un producto sin precio y el pago rechaza uno que lo perdió después («no está disponible por ahora»), con prueba contra Postgres. Manual: «Poner precio a los productos que llegaron sin precio». |
| 2 | La guía «Cómo usar» se abre sola en todas partes | ✅ | En el celular ya no se abre sola. En el computador, quien la omite en el primer paso de 3 pantallas deja de verla sola (aviso «No volveremos a abrir guías solas»). Sigue en «Cómo usar». |
| 3 | USB dentro del POS del ERP | ✅ | Si se elige «USB directo» en `/dashboard/pos`, el diálogo lo explica y ofrece «Abrir el POS independiente» (el mismo turno; las ventas en espera se conservan). |
| 4 | Bodega con varias empresas | ✅ | «Cambiar de empresa» en el menú (avisa si hay movimientos sin enviar, que quedan para cuando se vuelva). La cookie de «a qué app vuelvo» ahora también se marca al abrir `/bodega` con la sesión iniciada, y vuelve a «ERP» al navegar por `/dashboard`: antes, cambiar de empresa desde la barra lateral podía mandar al dueño a Control o al POS si los había abierto en ese navegador. |
| 5 | Control solo para el dueño | ⏸️ Decisión de producto | Sin cambios: abrirlo a administradores expone cifras de dirección. Si se decide, basta cambiar la condición `role === 'OWNER'` en `control/(app)/page.tsx` y `api/control/route.ts`. |
| 6 | A5 errores por campo en Ventas | ✅ | Cada campo con problema queda marcado en rojo con su mensaje (cliente, bodega, forma de pago, referencia y cada línea), además de la lista de arriba. |
| 6 | A6 formulario al vencer la sesión | ✅ | «Volver a ingresar» abre el ingreso en **otra pestaña**: la pantalla con el formulario a medio llenar queda intacta; se vuelve y se guarda. Si el navegador bloquea la pestaña, se ingresa en la misma. |
| 6 | M3 «Primeros pasos» | ✅ | Tarjeta en Inicio para quien configura la empresa: datos de la empresa, primer producto **con precio**, primera venta, folios del SII (con Facturación) y equipo. Cada paso se marca solo con datos reales; desaparece al completar y se puede «Ocultar». La guía de configuración sigue para empresas recién creadas. |
| 6 | M8 menús por rol | ⏸️ Decisión de producto | La empresa ya puede apagar ítems del menú (Configuración → Módulos y menú) y cada rol solo ve lo que su permiso permite. Menús por rol (cajero, bodeguero, contador) requieren definir qué ve cada uno. |
| 6 | B1 fechas con `toLocaleString` | ✅ | Las horas de los componentes de cliente (auditoría, sesiones, mensajería, acreditación, automatizaciones, Control, Bodega, sitios web, calidad, protección de datos y más) pasan a `santiagoDateTimeLabel`/`santiagoTimeLabel`/`santiagoClockLabel` (hora de Chile, 24 h). Una prueba recorre todos los componentes de cliente y falla si vuelve a aparecer una hora con «a. m./p. m.». |
| 6 | B2 encabezados | 🟡 Parcial | `PageHeader` en Ventas, Nueva venta, Compras, Registrar factura de proveedor, Clientes & Proveedores, Catálogo de Productos, Perfil de Empresa y Equipo. Quedan ~45 pantallas de eventos, RR. HH. y configuración. |
| 6 | B3 motivo de «Anular» | ✅ | Ya estaba resuelto (texto visible en vez de `title`). |
| — | M2 jerga | ✅ | SKU vacío = automático (`PRD-000123`, la MISMA numeración y candado de la bodega móvil, prueba contra Postgres); «costo PMP» → «costo promedio» en Compras; precio unitario de Ventas y costo de Compras aceptan «12.990». |
| 7 | Hardware real | ⏳ | Requiere el equipo físico. |
| 8 | Webpay Plus | ⏳ | Requiere credenciales de integración de Transbank. |
