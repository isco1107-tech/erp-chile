# Auditoría de procesos internos y experiencia de uso — 27-10-2026

**Objetivo:** que una persona sin experiencia en ERP pueda usar Aether sin equivocarse ni quedar atascada.
**Cómo se hizo:** lectura del código real de los flujos del día a día (guía de configuración, Inicio, Ventas, POS, Productos, Movimientos de stock, Compras, Folios/CAF, F29, sesión y mensajes de error). Cada hallazgo cita el archivo y la línea donde se comprobó.
**Qué NO se hizo:** no se levantó la aplicación ni se probó en un navegador (el contenedor no tiene dependencias instaladas) y no se corrieron las pruebas. Los módulos de eventos, academia, sitios web y tienda en línea no se revisaron a fondo; tienen reglas propias muy documentadas en `CLAUDE.md`.

---

## Resumen

La base es sólida: el servidor recalcula precios, IVA y stock y no confía en el navegador; las emisiones no se duplican si se reintenta (idempotencia); casi todas las acciones destructivas piden confirmación; los errores de base de datos se traducen a español; el POS avisa cuando no hay conexión y conserva la venta; el F29 y los folios (CAF) explican bien lo que son.

Los problemas que más pueden perjudicar a un usuario sin experiencia son:

1. **Papeles que parecen documentos tributarios válidos sin serlo** (boleta del POS y factura timbrada que nunca se envía al SII).
2. **Valores por defecto que generan errores silenciosos** (toda venta sale «pagada en efectivo» si no se cambia la forma de pago; el movimiento manual de stock parte como «Entrada por Compra»).
3. **Flujos que terminan en un callejón sin salida** (un borrador de venta no se puede emitir; una nota de crédito hay que armarla a mano).

| Gravedad | Cantidad | Qué significa |
|---|---|---|
| 🔴 Crítico | 3 | Riesgo tributario o de plata mal registrada |
| 🟠 Alto | 6 | El usuario queda atascado o se equivoca con facilidad |
| 🟡 Medio | 8 | Confunde, usa jerga o informa mal |
| ⚪ Bajo | 3 | Detalles de consistencia |

---

## 🔴 Crítico

### C1. La factura timbrada dice «Verifique documento: www.sii.cl», pero nunca se envió al SII
- `src/components/sales/SalesDocumentPaper.tsx:161-163` imprime el timbre con «Timbre Electrónico SII · Verifique documento: www.sii.cl».
- El envío al SII no está implementado (`CLAUDE.md` §3) y **ninguna pantalla muestra `siiStatus`** (no aparece en `src/components` ni en `src/app`).
- **Consecuencia:** el dueño cree que emitió una factura válida; su cliente la busca en el SII y no la encuentra.
- **Arreglo:** mientras no exista el envío, mostrar en el documento y en el historial una etiqueta «Timbrado — aún no enviado al SII» y quitar «Verifique documento: www.sii.cl». Cuando exista el envío, mostrar el estado real (pendiente / aceptado / rechazado).

### C2. El ticket del POS siempre dice «BOLETA ELECTRÓNICA», aunque no tenga timbre
- `src/components/pos/PosTicket.tsx:28` y `src/lib/pos/hardware/escpos.ts:197` escriben «BOLETA ELECTRÓNICA» siempre. Sin CAF el folio es interno (`cafId: null`) y no hay timbre.
- **Consecuencia:** se entrega al cliente un papel que parece una boleta legal y no lo es. Es un riesgo ante una fiscalización.
- **Arreglo:** con `cafId: null`, imprimir «COMPROBANTE DE VENTA — sin validez tributaria»; con CAF, imprimir el timbre (PDF417) igual que el documento del escritorio.

### C3. Toda venta queda «pagada en efectivo» si nadie cambia la forma de pago
- `src/components/SalesDocumentForm.tsx:81` parte con `'EFECTIVO'`.
- Al emitir, cualquier forma de pago distinta de `CREDITO_30` registra el cobro de inmediato (`src/modules/sales/services/sales.service.ts:401` y `:563`).
- **Consecuencia:** una factura a crédito emitida a la rápida aparece pagada, sale de Cuentas por Cobrar y nadie la cobra nunca.
- **Arreglo:** no poner forma de pago por defecto (obligar a elegirla) o proponer «Crédito» cuando el cliente tiene días de crédito (`selectedContact.creditDays > 0`). La confirmación de emisión debe decir en palabras simples «Quedará registrada como PAGADA en efectivo».

---

## 🟠 Alto

### A1. Un borrador de venta no se puede emitir nunca
- El formulario tiene «Guardar borrador» (`SalesDocumentForm.tsx:686`) y el detalle avisa «Borrador: no es un documento tributario válido hasta que se emita» (`src/app/(dashboard)/dashboard/sales/[id]/page.tsx:73`).
- No existe pantalla para editar ni emitir un borrador: `SalesDocumentForm` no recibe un documento existente, y en el historial solo hay «Ver / Imprimir» y «Duplicar» (`src/components/SalesHistoryClient.tsx:229-233`). «Duplicar» crea otro borrador (`sales.service.ts:847`).
- **Arreglo:** botón «Continuar y emitir» en el borrador, que abra el formulario con sus líneas cargadas y lo emita sobre el mismo documento.

### A2. La nota de crédito hay que armarla a mano
- Cuando no se puede anular, el sistema dice «emite una Nota de Crédito» (`sales.service.ts:657-659`, `SalesHistoryClient.tsx:241`), pero no hay botón para hacerlo desde el documento original.
- La persona tiene que abrir «Nueva venta», elegir «Nota de crédito», escribir el folio a mano, elegir el tipo de documento referenciado y volver a cargar los productos (`SalesDocumentForm.tsx:503-519`).
- El servidor sí impide acreditar de más (`sales.service.ts:294`); el problema es lo difícil que resulta llegar ahí.
- **Arreglo:** botón «Emitir nota de crédito» en el detalle y en el historial, que precargue el folio, el tipo y las líneas, y ofrezca «Devolver todo» o «Devolver una parte».

### A3. El movimiento manual de stock permite registrar «ventas» y «compras» sin documento
- `src/components/StockMovementForm.tsx:25` parte en «Entrada por Compra» y ofrece «Salida por Venta» (`:17`).
- Una «entrada por compra» manual no crea la factura del proveedor (no hay deuda en Cuentas por Pagar ni IVA crédito). Una «salida por venta» manual no tiene boleta ni ingreso y además infla «Retail en vivo», que cuenta todo `SALE_OUT` como vendido.
- La salida por ajuste desde el escritorio no pide motivo; la bodega móvil sí lo exige (`WASTE_REASONS`).
- **Arreglo:** quitar «Salida por Venta» del formulario manual; partir en «Entrada por ajuste»; explicar al lado que las compras se registran en Compras; exigir motivo (la misma lista cerrada de la bodega móvil) en las salidas por ajuste.

### A4. La confirmación antes de emitir no dice qué se va a emitir
- `SalesDocumentForm.tsx:343-345` muestra un texto genérico sobre folio y stock.
- **Arreglo:** que la confirmación resuma lo que importa: tipo («Factura» o «Boleta»), cliente, total, forma de pago y bodega. Es el último momento para detectar que se eligió factura en vez de boleta.

### A5. Los errores del formulario de venta aparecen de a uno y en un aviso que desaparece
- `SalesDocumentForm.tsx:339` muestra solo el primer error en un aviso flotante (toast).
- El formulario de producto sí marca cada campo en rojo con su mensaje (`ProductForm.tsx:222-231`); conviene usar el mismo patrón en ventas, compras y contactos.

### A6. La sesión se corta a las 8 horas sin aviso
- La sesión dura 8 horas fijas (`src/lib/auth/session.ts:43`). Al vencer, la siguiente acción responde «Sesión inválida o expirada» en un aviso flotante (`src/lib/auth/guards.ts:102`). No hay aviso previo ni se lleva al usuario al login.
- Solo 4 pantallas avisan antes de salir con trabajo sin guardar (`beforeunload`).
- **Arreglo:** avisar 10 minutos antes («Tu sesión se cerrará pronto. Guarda tu trabajo»); al recibir un 401, llevar al login con la dirección de vuelta y conservar el formulario en curso.

---

## 🟡 Medio

### M1. El precio del producto se ingresa sin IVA
- `ProductForm.tsx:297` pide «Precio Neto» y muestra el precio con IVA solo como lectura. En el comercio chileno la gente piensa en el precio final con IVA.
- **Arreglo:** permitir escribir cualquiera de los dos y calcular el otro.

### M2. Jerga que un usuario nuevo no entiende
| Dónde | Qué dice | Propuesta |
|---|---|---|
| `ProductForm.tsx:335` | «Producto trackeable (gestiona stock)» | «¿Controlar el stock de este producto?» |
| `src/modules/inventory/schema.ts:13` | Unidades `UN, KG, MT, LTS, CJA, PAR` | «Unidad», «Kilo», «Metro», «Litro», «Caja», «Par» |
| `schema.ts:16` | «El SKU es obligatorio» | Generar `PRD-000123` si queda vacío, como ya hace la bodega móvil |
| `ProductForm.tsx` | «Exento de IVA» sin explicación | Ayuda: «Solo si el SII lo declara exento (ej. libros, ciertos servicios). Si lo marcas por error, cobrarás menos IVA del que corresponde» |
| `PurchaseDocumentForm.tsx:283` | «se recalculará el costo PMP» | «se actualizará el costo promedio de los productos» |
| `OnboardingWizard.tsx:185` | «Código Actividad Económica (SII)», texto libre | Buscador por nombre de la actividad o enlace a dónde encontrarlo |

### M3. La guía de configuración se pierde fácil y no cubre lo esencial
- Un clic fuera de la ventana o la tecla Escape la descartan para siempre en ese navegador (`OnboardingWizard.tsx:104`).
- Dice que la ayuda es un «botón flotante abajo a la izquierda» (`:360`); hoy está en la barra superior («Asistente»).
- En el paso 2, una bodega escrita pero sin presionar «Crear bodega adicional» se pierde al presionar «Continuar».
- No cubre lo que de verdad hace falta para operar: el primer producto, la primera venta, los folios (CAF) y los medios de pago.
- **Arreglo:** reemplazarla por una lista de «Primeros pasos» fija en Inicio, calculada con datos reales (✔ datos de la empresa, ✔ primer producto, ✔ primera venta, ✔ folios cargados, ✔ equipo invitado), que desaparezca sola cuando todo esté hecho.

### M4. Inicio informa mal en dos casos
- Con 0 productos dice «Todo el catálogo está sobre su stock mínimo de bodega» (`src/app/(dashboard)/dashboard/page.tsx:790`). Debería decir «Todavía no tienes productos» y ofrecer el botón para crear uno.
- Las ventas del mes, el margen y el gráfico solo aparecen con Facturación electrónica (`page.tsx:129` y `:388`), un módulo que hoy no se vende. Una empresa que vende solo por POS no ve su venta mensual en Inicio, solo «POS hoy».

### M5. «Crédito 30 días» es la única opción de crédito
- `src/modules/sales/schema.ts:56`. Un cliente con 60 días de crédito igual queda bajo «Crédito 30 días» (el vencimiento sí usa sus días reales, `SalesDocumentForm.tsx:201-203`). Debería llamarse «Crédito (según días del cliente)».

### M6. «No autorizado para esta acción» no dice qué falta
- `guards.ts:236`. Debería decir qué permiso falta y a quién pedirlo («Pídele al dueño o a un administrador el permiso “Emitir ventas”»).

### M7. Un error inesperado puede mostrarse en inglés técnico
- `src/lib/prisma-errors.ts:146` devuelve el `message` de cualquier `Error`. Un fallo de programación («Cannot read properties of undefined») llegaría tal cual a la pantalla y no quedaría registrado en observabilidad.
- **Arreglo:** una clase `UserFacingError` para los mensajes de negocio que se lanzan en los servicios (hay 675 `throw new Error(` en `src/modules`); todo lo demás se reporta con `captureException` y se muestra «Ocurrió un error inesperado. Ya fue informado».

### M8. Un dueño con todos los módulos ve hasta 93 entradas en el menú
- `src/lib/navigation/workspace-nav.ts`. Los grupos se pliegan y la empresa puede apagar ítems, pero no hay «favoritos» ni «recientes». Para alguien nuevo es demasiado. Proponer menús iniciales por rol (cajero, bodeguero, contador).

---

## ⚪ Bajo

- **B1.** 58 componentes de cliente formatean fechas con `toLocaleString` (por ejemplo `PosTicket.tsx:34`). `CLAUDE.md` ya registra que eso rompió la hidratación en Retail («p. m.»); conviene usar `clockLabel` / `dayTimeLabel` en todos.
- **B2.** Encabezados inconsistentes: alrededor de 40 de las 169 páginas del panel no usan `PageHeader` (por ejemplo «Nueva Venta / Facturador» en `sales/new/page.tsx`). Además se mezclan `<select>` nativo y el `Select` del sistema de diseño.
- **B3.** El botón «Anular» deshabilitado explica el motivo solo con `title` (`SalesHistoryClient.tsx:241`), que no se ve en celulares ni tablets. Mostrar el motivo como texto, junto al botón «Emitir nota de crédito» de A2.

---

## Lo que ya está bien (no tocar)
- Emisiones con clave de idempotencia: reintentar no duplica folios ni descuenta stock dos veces.
- Precios, IVA, exención y stock siempre desde el catálogo en el servidor.
- Mensajes de negocio claros y con cifras: límite de crédito (`sales.service.ts:168`), tope de la nota de crédito (`:294`), turno de caja cerrado (`:657`).
- POS: conserva la venta sin conexión, avisa en pantalla y un fallo de impresora o cajón nunca deshace la venta.
- Folios (CAF) y F29 explican qué son y dejan claro que la declaración la presenta el contador.
- Confirmaciones con el diálogo propio (`useConfirm` / `ConfirmDialog`), no con `window.confirm`.
- Manual, tutorial y «para qué sirve» exigidos por prueba para cada pantalla del menú.

---

## Orden de trabajo sugerido

| Etapa | Hallazgos | Por qué primero |
|---|---|---|
| 1 | C1, C2, C3 | Riesgo tributario y cuentas por cobrar mal registradas |
| 2 | A1, A2, A3, A4 | Callejones sin salida y errores fáciles en el uso diario |
| 3 | A5, A6, M1, M2, M3, M4 | Claridad para el usuario nuevo |
| 4 | M5–M8, B1–B3 | Pulido y consistencia |

Cada cambio de las etapas 1 y 2 toca ventas, POS o inventario: deben pasar `npm run ci` y la revisión de `chile-tax-dte-specialist` antes de publicarse.

---

## Estado al 28-10-2026

| Hallazgo | Estado | Qué se hizo |
|---|---|---|
| C1 | ✅ Corregido | El papel timbrado dice «Pendiente de envío al SII» mientras no haya envío (`SalesDocumentPaper.tsx`), y el detalle muestra un aviso para el equipo. |
| C2 | ✅ Corregido | Sin timbre, el ticket del POS se titula «COMPROBANTE DE VENTA — Sin validez tributaria: no es boleta»; timbrado, «BOLETA ELECTRÓNICA — Timbrada. Pendiente de envío al SII» (`src/lib/pos/ticket.ts`, `ticketHeading`). |
| C3 | ✅ Corregido | La forma de pago no viene elegida; si el cliente tiene días de crédito se propone «Crédito»; debajo se explica si quedará pagada o pendiente. |
| A1 | ✅ Corregido | «Continuar y emitir» en el historial y en el detalle. El documento nuevo reemplaza al borrador en la misma transacción (`replacesDraftId`); dos emisiones del mismo borrador no pasan. |
| A2 | ✅ Corregido | «Nota de crédito» en el historial y «Emitir nota de crédito» en el detalle: precarga cliente (fijo), folio, tipo de referencia y líneas. |
| A3 | ✅ Corregido | Sin «Salida por venta» (también rechazada en el servidor), parte en «Entrada por ajuste», cada tipo explica qué hace y la salida por ajuste exige motivo (lista de la bodega móvil). |
| A4 | ✅ Corregido | La confirmación muestra documento, cliente, total, forma de pago y bodega, y si quedará pagada o pendiente. |
| A5 | 🟡 Parcial | El formulario de venta lista todos los problemas juntos arriba (no solo el primero). Falta marcar cada campo. |
| A6 | 🟡 Parcial | Aviso 10 minutos antes del cierre y otro al cerrar, con «Volver a ingresar». No conserva el formulario a medio llenar. |
| M2 | 🟡 Parcial | «Controlar el stock de este producto», unidades con nombre, explicación de «Exento de IVA». Queda: SKU automático y «PMP» en Compras. |
| M3 | 🟡 Parcial | Un clic fuera ya no la descarta para siempre, el texto apunta al «Asistente» de la barra superior y no se pierde una bodega escrita. Queda: la lista de «Primeros pasos». |
| M4 | 🟡 Parcial | Con 0 productos, Inicio dice «Todavía no tienes productos». Queda: la venta mensual de empresas que solo usan el POS. |
| M1, M5–M8, B1–B3 | ⏳ Pendiente | — |

Pruebas nuevas: `tests/sales-draft-and-manual-stock.test.ts` (borradores, forma de pago obligatoria, movimiento manual, aviso de sesión) y casos nuevos en `tests/pos-hardware.test.ts` (título del ticket).

## Estado al 29-10-2026

Cerrados en la segunda pasada de `2026-10-29-apps-operacion-diaria.md` (detalle ahí, sección 5):
A5, A6, M1, M2 (lo que quedaba), M3, M4, M5, M6, M7, B1 y B3 ✅ · B2 🟡 (pantallas de uso diario) · M8 ⏸️ (decisión de producto).

