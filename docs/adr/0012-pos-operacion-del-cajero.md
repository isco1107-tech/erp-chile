# 0012 · Operación del cajero: RUT primero, cobro por teclado y cajón/impresora

Fecha: 2026-10-25. Estado: aceptado. Complementa el 0011 (POS multicaja).

## Contexto

El mostrador pedía el RUT al final, en un campo opcional escondido bajo los medios de pago; el cobro era un formulario largo al lado del carrito, sin atajos; el vuelto era un aviso que desaparecía; y el POS no podía abrir el cajón de dinero ni imprimir sin el diálogo del navegador. Un cajero con fila necesita el flujo de un supermercado: escanear, RUT, seguir escaneando, cobrar con el teclado y ver el vuelto.

## Decisiones

1. **El RUT es lo primero tras escanear el primer producto.** `rutStepOpen = carrito no vacío && (RUT sin resolver || cambiando cliente)`. Enter sin escribir (o Esc, o «Consumidor final») resuelve a consumidor final: pedir el RUT nunca frena la fila y el servidor no cambia (`customerRut` sigue siendo opcional, receptor 66.666.666-6). No se puede abrir el cobro con el paso sin resolver. Mientras el paso está abierto el lector sigue entregando productos: lo que se teclea ahí se clasifica (`classifyRutEntry`): un RUT con guion y verificador válido es siempre RUT; un texto que coincide EXACTO con un código del catálogo es un producto (se agrega, no queda como RUT inválido); lo demás se prueba como RUT. El nombre del cliente se busca en segundo plano (`lookupPosCustomerAction`, solo `razonSocial` de un cliente de la empresa; nunca el consumidor final) y solo confirma al cajero que tecleó bien: la venta no depende de él.
2. **Cobro con el teclado** (`PaymentDialog`): F9 o Enter con el buscador vacío abren el cobro; E/D/C/T eligen el medio, X es «exacto», Enter cobra, Esc vuelve. El precio, el IVA, el stock y los descuentos siguen saliendo del servidor (`createPosSale` no cambió): la pantalla solo muestra. Con tarjeta o transferencia el POS **no** se conecta al terminal de pagos y lo dice.
3. **El vuelto queda a la vista** (`SaleDone`) hasta la próxima venta o hasta escanear el siguiente producto. No bloquea el lector.
4. **Ventas en espera** (`held-sales.ts`): hasta 5 por turno, solo en el equipo (`localStorage`, una clave por turno). No reservan stock ni tocan el ERP; al retomarlas se refrescan precios y stock.
5. **Cajón e impresora son de ESTE equipo** (`hardware/config.ts`, `localStorage`): el cajón está enchufado a un computador concreto. Tres modos: *impresora del sistema* (el cajón se abre cuando la impresora imprime, si el controlador lo tiene activado; con `--kiosk-printing` no aparece el diálogo), *puerto serie / USB-COM* (Web Serial) y *USB directo* (WebUSB). En los modos directos el POS manda ESC/POS: el pulso `ESC p` (`1B 70 00 19 FA` por defecto) y, si se pide, la boleta (`escpos.ts`, tabla PC858/PC850, corte parcial). Sin configurar, el POS vende igual (modo `none`).
6. **Un fallo de hardware nunca deshace ni frena una venta.** El cajón y la boleta se mandan DESPUÉS de que `createPosSale` confirma; si fallan se informa («La venta ya quedó cobrada y emitida, pero…») y se puede reintentar. Los trabajos al puerto se serializan (`HardwareManager`).
7. **Abrir el cajón sin venta está auditado.** `registerDrawerOpenAction` exige motivo, un turno ABIERTO del propio cajero y escribe en la bitácora (`CashShift`, `UPDATE`, `evento: APERTURA_CAJON_SIN_VENTA`, motivo y caja) **antes** del pulso; sin registro no hay pulso. El reintento tras una venta fallida pasa por el mismo camino (motivo «Reintento tras la boleta #N»), así que el botón no es una llave sin rastro. En modo «impresora del sistema» sale un comprobante de apertura. Los ingresos y retiros del arqueo (ya auditados) también abren el cajón si está activado.
8. **`Permissions-Policy`** es del *documento*: WebUSB necesita `usb=(self)`, que se abre SOLO para `/pos/:path*` (`next.config.js`, después de la global, repitiendo la política completa; `tests/pos-hardware.test.ts` lo fija y exige que nada más abra USB). Por eso el login entra a `/pos` con carga completa (`window.location.assign`), igual que `/bodega`. Web Serial no requiere cabecera. El POS dentro del panel (`/dashboard/pos`) usa puerto serie o la impresora del sistema, no USB directo.
9. **Sonidos** (pitido al agregar, aviso si el código no existe) y atajos (F2 buscar, F4 cliente, F6 espera, F7 lista de esperas, F8 cajón, F9 cobrar) solo funcionan con la pestaña «Vender» a la vista. Las teclas F1, F3, F5, F10, F11 y F12 se dejan al navegador.

## Lo que esto NO verifica

- **Ningún cajón ni impresora física.** Los bytes ESC/POS y los transportes se prueban con dispositivos simulados (`tests/pos-hardware.test.ts`, `e2e/pos-cashier.spec.ts`). Lo que sale de verdad depende del modelo (tabla de caracteres, ancho de papel, conector del cajón): la pantalla trae «Probar el cajón» e «Imprimir hoja de prueba» y hay que usarlas con el equipo real antes de la primera venta.
- **WebUSB en Windows** solo funciona si la impresora usa el controlador WinUSB; con el controlador del fabricante, usar «Impresora del sistema».
- **La app de escritorio (Tauri).** Su webview (WebView2/WKWebView) no ofrece Web Serial ni WebUSB de la misma forma que Chrome/Edge: allí se usa «Impresora del sistema». Un puente nativo para enviar bytes crudos a la impresora exige compilar y probar el instalador en Windows y queda como trabajo futuro.
- **Terminales de pago** (Transbank, etc.): no hay integración; el cajero confirma a mano.
- **Boleta con timbre (PDF417)** en el ticket ESC/POS: no se imprime; igual que el ticket del navegador, dice «Documento emitido por sistema ERP» (ver alcance DTE en CLAUDE.md).

## Todavía no

Descuentos por línea o por venta (exigen permiso propio, tope y auditoría), productos favoritos / teclas rápidas, segunda pantalla para el cliente, devoluciones desde el mostrador y balanzas con código de peso.
