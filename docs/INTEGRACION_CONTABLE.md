# Integración contable — matriz de documento a asiento

Fase C de `PROMPT_ERP_V2.md`. Regla de oro: **cada hecho económico tiene
exactamente un punto de emisión.** Esta tabla es la referencia para no
duplicar ni omitir un asiento; revisarla contra el código antes de tocar
cualquiera de las funciones listadas.

## Ventas (`src/modules/accounting/posting-rules/sales-posting.ts`)

| Evento | Función que dispara | Regla | Cuentas |
|---|---|---|---|
| `createSalesDocument` emite `FACTURA_33`/`FACTURA_EXENTA_34`/`BOLETA_39`/`NOTA_DEBITO_56` | `sales.service.ts::createSalesDocument` | `postSalesDocumentIssued` | `D CLIENTES-o-CAJA / H VENTAS_AFECTAS+VENTAS_EXENTAS+IVA_DEBITO` |
| ídem, si afecta stock | mismo | `postSalesDocumentIssued` (segundo asiento) | `D COSTO_VENTAS / H EXISTENCIAS`, usando `unitCostPMP` de las líneas que **efectivamente** llamaron `applyStockOut` (nunca todas las líneas del documento — una línea de servicio o producto no trackeable no tiene existencia que descontar) |
| `createSalesDocument` emite `NOTA_CREDITO_61` | mismo | `postCreditNoteIssued` | Espejo invertido de lo anterior: `D VENTAS.../IVA_DEBITO / H CLIENTES`, más `D EXISTENCIAS / H COSTO_VENTAS` por lo restockeado. Nunca contra `CAJA` — una NC se aplica contra la cuenta por cobrar del documento original, nunca es un reembolso en efectivo desde este asiento |
| `createPosSale` (venta de mostrador) | `pos.service.ts::createPosSale` | `postSalesDocumentIssued` con `isImmediatePayment: true` | Mismo que arriba — el POS tiene su propio camino de creación de `SalesDocument` (no reusa `sales.service.ts`), así que necesita su propio enganche |
| `cancelSalesDocument` sobre cualquier `SalesDocument` | `sales.service.ts::cancelSalesDocument` | `reverseSalesDocumentPosting` | Reversa TODOS los asientos `POSTED` con `sourceType: SALES_DOCUMENT, sourceId: <doc>` (puede ser venta + costo, o el propio asiento de una NC) |
| `COTIZACION`, `GUIA_DESPACHO_52` (sin factura que la referencie todavía) | — | sin asiento | No son hechos de venta formalizados. La Factura que referencia la guía es la que postea (`referencesIssuedGuide` en `sales.service.ts` ya evita el doble descuento de stock con el mismo criterio) |

## Compras (`src/modules/accounting/posting-rules/purchases-posting.ts`)

| Evento | Función que dispara | Regla | Cuentas |
|---|---|---|---|
| `createPurchaseDocument` con `finalStatus === 'ISSUED'`, sin OC | `purchases.service.ts::createPurchaseDocument` | `postPurchaseDocumentIssued` | `D EXISTENCIAS-o-GASTOS_OPERACIONALES / D IVA_CREDITO / H PROVEEDORES` |
| ídem, Nota de Crédito de proveedor | mismo | `postPurchaseCreditNoteIssued` | Espejo invertido |
| `enrichPurchaseDocumentWithItems` (importador histórico agrega detalle a una fila que ya se creó ISSUED con línea sintética) | `purchases.service.ts::enrichPurchaseDocumentWithItems` | `reversePurchaseDocumentPosting` + `postPurchaseDocumentIssued` | El documento ya posteó al crearse (sin producto → contra `GASTOS_OPERACIONALES`); acá se reversa ESE asiento y se postea de nuevo con el detalle real (puede pasar a `EXISTENCIAS`) — nunca se dejan ambos asientos vivos |
| `issuePurchaseDocument` (borrador que se emite) | `purchases.service.ts::issuePurchaseDocument` | `postPurchaseDocumentIssued` / `postPurchaseCreditNoteIssued` | Igual que la creación directa |
| `approvePurchaseDocument` (compra que superó el umbral de aprobación) | `purchases.service.ts::approvePurchaseDocument` | `postPurchaseDocumentIssued` | Solo maneja el caso normal — una NC nunca queda pendiente de aprobación |
| `cancelPurchaseDocument` | `purchases.service.ts::cancelPurchaseDocument` | `reversePurchaseDocumentPosting` | Solo alcanzable si el documento no movió stock (bloqueado si sí) — reversa el asiento si existía |
| `createGoodsReceipt` / `cancelGoodsReceipt` | `goods-receipt.service.ts` | **sin asiento** | Mueven stock/PMP, pero no son el hecho contable de la compra — eso lo dispara la Factura que la formaliza. Documentado deliberadamente: postear acá Y en la factura duplicaría `PROVEEDORES` |

**Simplificación deliberada**: un documento de compra postea contra UNA sola
cuenta de destino (`EXISTENCIAS` si alguna línea tiene producto, si no
`GASTOS_OPERACIONALES`), no por línea. Documentado en
`purchases-posting.ts`.

## Tesorería (`src/modules/accounting/posting-rules/treasury-posting.ts`)

| Evento | Función que dispara | Regla | Cuentas |
|---|---|---|---|
| `registerSalesPayment` (cobro manual de un documento a crédito) | `treasury.service.ts::registerSalesPayment` | `postSalesPaymentEntry` | `D CAJA-o-BANCO / H CLIENTES` |
| `registerPurchasePayment` (pago manual de una compra a crédito) | `treasury.service.ts::registerPurchasePayment` | `postPurchasePaymentEntry` | `D PROVEEDORES / H CAJA-o-BANCO` |
| `Payment` automático de una venta al contado (`createSalesDocument`/`createPosSale`) | — | **sin asiento propio** | Ya quedó cubierto: el asiento de venta cargó `CAJA` directamente (no `CLIENTES`), así que no hay saldo que este `Payment` deba limpiar. Postear también acá duplicaría el ingreso de caja |
| `Payment` compensatorio (`EXPENSE`) que `cancelSalesDocument` inserta al anular una venta cobrada | — | **sin asiento propio** | El reverso de `reverseSalesDocumentPosting` ya revirtió el cargo a `CAJA` original |

Medio de pago → cuenta: `EFECTIVO` → `CAJA`; cualquier otro (`TRANSFERENCIA`,
`TARJETA_DEBITO`, `TARJETA_CREDITO`, `CHEQUE`, `OTRO`) → `BANCO`.

## Inventario (`src/modules/accounting/posting-rules/inventory-posting.ts`)

| Evento | Función que dispara | Regla | Cuentas |
|---|---|---|---|
| `registerStockIn` / `registerStockOut` (ajuste manual desde el formulario de Inventario) | `stock.service.ts` | `postInventoryAdjustmentEntry` | `D EXISTENCIAS / H DIFERENCIA_INVENTARIO` (o al revés) — se postea SIEMPRE, sin mirar `movement.type`: aunque el operador etiquete la entrada como `PURCHASE_IN`, este camino nunca tiene una Factura de proveedor detrás (esas mueven stock invocando `applyStockIn` directo desde `purchases.service.ts`, no a través de este wrapper) |
| `applyStockIn`/`applyStockOut` invocados directamente desde `sales.service.ts`/`purchases.service.ts`/`pos.service.ts` | — | **sin asiento propio en `inventory-posting.ts`** | Ya postean vía `sales-posting.ts`/`purchases-posting.ts` — postear otra vez desde el nivel de movimiento de stock duplicaría `EXISTENCIAS` |
| `registerTransfer` (traslado entre bodegas) | `stock.service.ts::registerTransfer` | **sin asiento, deliberado** | Mueve el mismo valor entre bodegas sin cambiar el total de existencias de la empresa. Llama `applyStockIn`/`applyStockOut` directamente, nunca los wrappers `registerStockIn`/`registerStockOut`, así que ni siquiera necesita un chequeo explícito para excluirlo |
| Cierre de turno POS (`closeShift`) | `cash.service.ts::closeShift` | `postCashShiftDifference` | Cada boleta del turno YA posteó su propio asiento al emitirse — el cierre solo contabiliza el descuadre (`D`/`H DIFERENCIA_CAJA` contra `CAJA`), nunca el total vendido de nuevo |

## Cuentas nuevas agregadas al plan sembrado

`chart-of-accounts.ts` ya tenía todas las cuentas necesarias salvo dos, agregadas en esta fase:

- `GASTOS_OPERACIONALES` → mapeada a la cuenta existente `6106 Otros gastos operacionales` (antes sin mapeo semántico).
- `DIFERENCIA_CAJA` → cuenta nueva `6107 Diferencias de caja`.

**Pendiente operativo**: empresas que ya sembraron su plan de cuentas antes
de este cambio (con `hasAccounting` activo) no tienen estas dos filas de
`AccountMapping` — hay que re-ejecutar `seedChartOfAccounts` para esas
empresas (es idempotente, no duplica lo existente) antes de que sus compras
sin inventario o sus turnos de POS puedan postear.

## Qué queda fuera de esta fase

- UI del panel de cuadraturas (`reconciliation.service.ts` existe, sin pantalla — Fase D).
- Ejecución en firme de `scripts/backfill-accounting.ts` (solo simulación en esta pasada).
- Cierre de período/ejercicio, estados financieros, libros SII (Fase D).
