# Aether para supermercados, minimarkets y almacenes

Diagnóstico de los módulos que sirven para operar un supermercado, las brechas que hoy impiden operarlo solo con Aether, las aplicaciones que conviene crear y la hoja de ruta. Fecha: 2026-11-17.

> Regla de este documento: lo que está en «Hoy» existe en el código; lo que está en «Brechas» y «Apps recomendadas» **no existe todavía** y por eso no aparece en el manual ni lo ofrece el asistente.

---

## 1. Resumen

Aether ya cubre la mayor parte de la operación de una tienda de autoservicio: varias cajas con cajeros identificados, catálogo con códigos de barras y empaques, inventario por bodega con lotes y vencimientos (FEFO), mermas con responsable, bodega móvil en el celular, reposición predictiva, métricas de retail, compras, tesorería, remuneraciones y contabilidad.

Lo que **bloquea** operar un supermercado solo con Aether es tributario y de hardware: la boleta electrónica todavía no se firma ni se envía al SII, la caja no se integra con el terminal de pagos y no puede vender sin conexión. Con eso resuelto, lo de mayor impacto comercial son las **promociones en caja** y la **fidelización por RUT**.

En esta entrega se agregó la pieza que faltaba en la caja de un supermercado: **leer las etiquetas de la balanza** (fiambrería, carnicería, verdulería) — ver §6.

---

## 2. Qué sirve hoy, por área de operación

| Área | Pantallas / módulos | Para qué en un supermercado | Límites a tener presentes |
|---|---|---|---|
| **Cajas** | Punto de Venta (`hasPos`), app Aether POS, Exportar datos | Varias cajas a la vez, cada cajero con su turno y fondo; RUT al primer producto (Enter = consumidor final); cobro por teclado; vuelto a la vista; ventas en espera; cajón e impresora ESC/POS; arqueo y supervisión de turnos; **etiquetas de balanza (nuevo)**; boletas del período a Excel | Requiere conexión para cada venta; no se conecta al terminal de pagos; ningún cajón o impresora física fue probado (ADR 0012) |
| **Catálogo y góndola** | Catálogo de Productos, Empaques, Etiquetas, Importación Masiva | Miles de productos con EAN, packs (six-pack, caja x12) que suman sus unidades, etiquetas de góndola con precio con IVA y **«por kilo» en lo que se vende a granel (nuevo)**, importación con **código de barras y PLU (nuevo)** | Sin cambios de precio programados ni historial de precios de lista; la lista de precios por cliente no se aplica en la caja |
| **Bodega y sala** | Inventario (Multibodega), Traslados, Toma de inventario, Movimientos de bodega, Bodega móvil | Sala de ventas y bodega de reserva como bodegas distintas; traslados; conteos con lector por sección; registro por bodega con operario, motivo y foto; el bodeguero registra llegadas, mermas y traslados desde el celular | Máximo 5 bodegas por empresa (`MAX_WAREHOUSES`) |
| **Perecibles** | Lotes y vencimientos, Trazabilidad, Retiro de lote, Mermas y responsables | FEFO automático, aviso de lotes por vencer en la campanita, mermas con motivo y foto, quién responde por cada pérdida (tienda, proveedor o seller), genealogía de un lote para un retiro del mercado | — |
| **Abastecimiento** | Solicitudes y Órdenes de compra, DTE recibidos, Archivo de facturas, Portal del proveedor, Reposición predictiva | Pedir con aprobación, recibir por entregas, cargar el XML del proveedor, que el distribuidor vea su stock y ventas (sin costos ni clientes), cuánto pedir y cuándo según ritmo, día de la semana, días de pago y tiempo de entrega | La llegada por Bodega móvil no se ata a la orden de compra |
| **Análisis comercial** | Retail en vivo, Stock muerto, Mapa de calor, Canasta cruzada, Radiografía 360, Data Analytics / Data Science, Agentes | Sell-through y días de inventario por bodega cada minuto, lo que no rota y su plata detenida, reacción de la venta a cada cambio de precio, pares que se compran juntos (lift) | Sin motor de combos: la canasta sugiere, la promoción se arma a mano. Las boletas a consumidor final no cuentan como cliente en RFM |
| **Clientes** | Fidelización, Tienda en línea, Conexión con Hermes | Canal de origen, encuestas CSAT/NPS, clientes inactivos por RUT; venta por internet con retiro en tienda o despacho, con stock reservado y la venta emitida por el mismo camino que la caja | Sin puntos, cupones ni club de clientes |
| **Concesiones** | Consignación, Seller Center | Panadería, flores o productos de terceros que son del concesionario hasta venderse, con liquidación de lo vendido menos la comisión y su portal | La liquidación no genera asientos ni documento tributario (ADR 0009) |
| **Personas y calidad** | Remuneraciones, Vacaciones & Permisos, Tareas y delegación, Calidad y procedimientos | Liquidaciones con parámetros de Previred confirmados, tareas recurrentes (revisar vencimientos, limpieza de cámaras), procedimientos con acuse de lectura e inspecciones de recepción (p. ej. temperatura de la cadena de frío con los mínimos que fije la empresa) | Sin programación de turnos ni reloj control |
| **Finanzas** | Tesorería, Bancos y conciliación, Cheques, Nóminas de pago, F29, RCV, Contabilidad, Activo fijo, Rendición de gastos | Conciliar los abonos de ventas con tarjeta, pagar a proveedores en lote, F29 sobre documentos reales, mantención de refrigeradores y balanzas como activo fijo | Ver brecha 1 (envío al SII) |
| **Dueño** | App Aether Control, Data Analytics | Ventas, cobros y operación casi en vivo desde el celular | — |

---

## 3. Brechas, por prioridad

### P0 — Bloquean operar un supermercado solo con Aether

1. **Boleta electrónica válida ante el SII.** Hoy el sistema carga el CAF, asigna el folio y timbra (TED), pero **no firma (XML-DSig) ni envía al SII** ni consulta el estado (CLAUDE.md §3). Un supermercado emite cientos de boletas al día y necesita que sean válidas. Opciones: completar firma + envío + consulta de estado, o integrar un emisor certificado como paso intermedio. Es la condición para ofrecer Aether a un supermercado sin otro sistema de boletas.
2. **Integración con el terminal de pagos.** Hoy el cajero cobra en el terminal y confirma a mano. Integrarlo evita el error de monto, deja el código de autorización en la venta y facilita conciliar los abonos.
3. **Caja en contingencia sin conexión.** Hoy cada venta se confirma en el servidor (ADR 0011). Un corte de internet detiene todas las cajas. Un modo de contingencia necesita folios reservados por caja, stock que se concilia después y un tope de tiempo: es un diseño propio, no una opción de configuración.

### P1 — Alto impacto comercial

4. **Promociones en caja.** 2x1, segunda unidad a X%, % por categoría o marca, precio por horario o medio de pago, combos (los que ya sugiere Canasta cruzada). Deben calcularse en el servidor como descuento de línea, con el IVA repartido por `src/modules/sales/calc.ts`, nunca enviados por la caja.
5. **Cambios de precio programados.** Fecha de inicio y fin, cola de etiquetas por imprimir de lo que cambió y el historial de precios de lista (hoy el Mapa de calor usa el precio cobrado).
6. **Fidelización por RUT.** Puntos por compra y canje, cupones y club. La caja ya pide el RUT al primer producto: es la base.
7. **Recepción contra orden de compra desde Bodega móvil**, con diferencias de cantidad y precio contra la orden (hoy la llegada por celular es una entrada sin orden).
8. **Exportar el maestro de PLU y precios a la balanza** (hoy se carga a mano y debe coincidir con el catálogo; ADR 0016).
9. **Más de 5 bodegas** para cadenas con varias sucursales (cada sucursal suele tener sala y reserva).
10. **Listas de precios en la caja** (precio mayorista para almaceneros con RUT).

### P2 — Mejoras de operación

11. Arqueo por denominación de billetes y monedas, y retiros a bóveda con sobre numerado.
12. Programación de turnos del personal. El reloj control debe ser un sistema certificado por la Dirección del Trabajo: integrarlo, no construirlo.
13. Envases retornables (depósito y devolución de botellas).
14. Lectura de etiquetas de balanza también en la toma de inventario y en Bodega móvil.

---

## 4. Aplicaciones recomendadas

Cada app instalable es independiente (`src/lib/apps/registry.ts`): alcance propio que no se anida con otro, ícono propio y su tarjeta de instalación. Las de personal usan la sesión del panel y sus permisos; ninguna cachea HTML privado ni `/api/*`.

| # | App | Para quién | Qué hace | Reutiliza | Prioridad |
|---|---|---|---|---|---|
| 1 | **Reponedor (góndola)** | Reponedor y jefe de sala | Escanear en la góndola → precio, stock en sala y en bodega, días restantes; marcar quiebre; pedir traslado bodega → sala; reimprimir etiqueta; marcar lotes por vencer | Bodega móvil (`withBodegaAuth`, cola con `clientOpId`, idempotencia), Retail en vivo, Etiquetas, Lotes | **Alta**: el quiebre de góndola es la venta perdida más común |
| 2 | **Verificador de precios (kiosko)** | Clientes en la sala | Pantalla fija con lector: nombre, precio con IVA y «por kilo»; sin datos personales ni stock exacto | Catálogo (solo lectura), un token por kiosko como el portal del proveedor (SHA-256 en la base, límite por IP) | **Alta** y simple |
| 3 | **Picking de pedidos en línea** | Preparador de pedidos | Pedidos de la Tienda en línea por preparar, escanear lo que se saca, avisar faltantes, marcar listo para retiro o despacho | Tienda en línea (`store:fulfill`), reservas de stock | Media |
| 4 | **Club de clientes** | Clientes | Ver sus puntos, cupones y boletas por RUT | Requiere la brecha 6 | Media |
| 5 | **Autoservicio (self-checkout)** | Clientes | Escanear y pagar solos | Requiere brechas 1, 2 y 4, y control anti-fraude | Baja (después) |

Mejoras a apps que ya existen:

- **Aether Control (dueño):** ventas por caja y por hora, cajas abiertas, quiebres de la sala y mermas del día.
- **Bodega móvil:** recepción contra orden de compra (brecha 7) y lectura de etiquetas de balanza (brecha 14).
- **Aether POS:** integración con el terminal de pagos (brecha 2) y puente nativo de impresión (ADR 0012).

---

## 5. Mejoras a módulos existentes (sin módulo nuevo)

- **Reposición predictiva:** sugerir primero el traslado desde la bodega de reserva cuando hay stock allí, y recién después la compra.
- **Retail en vivo:** recordar la bodega de la sala como pestaña por defecto.
- **Toma de inventario:** conteo cíclico sugerido (qué sección contar esta semana según mermas y diferencias anteriores).
- **Etiquetas:** formato grande de góndola y cola de etiquetas pendientes al cambiar un precio (ver brecha 5).
- **Fidelización:** segmentar clientes inactivos por categoría comprada para campañas.

---

## 6. Lo que se hizo en esta entrega

1. **Etiquetas de balanza en la caja** (ADR 0016, `src/lib/pos/scale-label.ts`): EAN-13 de peso o precio variable (prefijos 20–29), largo de PLU configurable, dígito verificador obligatorio, `N*etiqueta` para paquetes iguales, también en el paso del RUT. El precio sigue saliendo del catálogo en el servidor.
2. **PLU de balanza en la ficha del producto** (`Product.scaleCode`, único por empresa) y tarjeta **«Etiquetas de balanza»** en Configuración → Perfil de Empresa, con «Probar una etiqueta».
3. **Importación masiva de productos** con las columnas «Código de barras» y «PLU balanza» (duplicados en el archivo y contra el catálogo se marcan en la vista previa).
4. **Etiqueta de góndola con «por kilo / por litro / por metro»** para lo que se vende a granel.
5. **Manual y asistente:** guía «Supermercados, minimarkets y almacenes» (Referencia del manual y bloque propio en el asistente, filtrada por módulos contratados), temas de balanza en Punto de Venta y Catálogo, problemas frecuentes (etiqueta no reconocida, total distinto de la etiqueta, stock en bodega y no en la caja) y glosario (PLU, etiqueta de balanza, sell-through, días de inventario, merma, quiebre, stock muerto, lift).

La migración `20261125120000_scale_labels` es aditiva e idempotente (dos columnas nullable y un índice único sobre una columna nueva). Se aplica con el build de producción.

---

## 7. Orden sugerido

1. Probar las etiquetas de balanza con la balanza real del primer cliente («Probar una etiqueta»).
2. Boleta electrónica al SII (P0-1).
3. Terminal de pagos (P0-2) y Reponedor (app 1).
4. Promociones en caja (P1-4) y cambios de precio programados (P1-5).
5. Verificador de precios (app 2) y fidelización por RUT (P1-6).
6. Contingencia sin conexión (P0-3), con su propio ADR.
