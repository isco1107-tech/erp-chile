# 0011 · POS independiente y control de turnos multicaja

Fecha: 2026-10-23. Estado: aceptado.

Cada cajero usa su cuenta personal del ERP. `/pos` abre únicamente el Punto de Venta y `/pos/ingresar` conserva ese destino durante login, 2FA, cambio de contraseña y selección de empresa. La preferencia de navegación jamás otorga permisos; sesión, empresa, módulo y rol se revalidan en el servidor. `/dashboard/pos` comparte la misma implementación con el ERP.

Una caja física corresponde a una bodega. Los índices únicos parciales de PostgreSQL permiten un turno abierto por caja y por cajero. El cajero declara el fondo inicial, vende, registra ingresos/retiros y cierra su propio turno con `pos:operate`. `pos:close` habilita consultar y cerrar turnos ajenos; nunca permite registrar movimientos como si se fuera su cajero. Las listas de turnos y detalles respetan esta separación.

El efectivo esperado es fondo inicial + ventas en efectivo + ingresos − retiros. Tarjetas y transferencias se muestran separadas. El servidor recalcula el esperado al cerrar, guarda esperado, contado, diferencia y observación, y exige explicar un descuadre. Un retiro no puede superar el efectivo esperado. Cierre, venta, anulación y movimiento se serializan sobre el turno. El mismo cierre reenviado devuelve el resultado original; otro monto nunca sobrescribe un cierre.

Los ingresos/retiros manuales controlan el dinero físico del cajón. Un traslado caja/bóveda no constituye una venta ni un gasto nuevo; no se genera un `Payment` ni se duplica la contabilidad. Un gasto debe además registrarse con su comprobante en el módulo correspondiente. Las ventas POS sí generan documento, pago, inventario y asiento en una sola transacción. El cierre contabiliza solamente el descuadre.

Ventas y movimientos usan claves idempotentes por intención; las claves no pueden reutilizarse entre cajeros, turnos o contenidos diferentes. La venta toma precios y condición tributaria del catálogo, ignora descuentos enviados por el navegador y rechaza productos inactivos. El Kardex y los asientos identifican al cajero. Los productos se bloquean en orden estable para evitar cruces multicaja; el POS comparte el bloqueo de Stock del checkout y respeta las reservas activas de Ecommerce y los compromisos de notas de venta. No modifica la política global de otros canales.

La app Tauri Aether POS es una distribución independiente del escritorio ERP. Abre `/pos` en una ventana propia, conserva el WebView durante cortes y permite reintentar sin reconstruir el carrito. Necesita conexión para confirmar operaciones en el ERP; no existe una caja contable offline ni sincronización financiera diferida. Los instaladores solo se publican después de validar su procedencia en CI y sus sumas SHA-256.

Validación: pruebas de servicio y acciones, PostgreSQL local con varias cajas concurrentes y reservas online, Playwright para el recorrido de cajero/supervisor y compilación de los instaladores en hosts de cada sistema. La validación tributaria y el envío al SII mantienen el alcance documentado en CLAUDE.md; una compilación nativa no verifica impresoras físicas ni terminales de pago.
