# Auditoría de negocio e integridad de datos

Fecha: 14 de septiembre de 2026. Alcance: revisión estática de servicios, esquemas, reglas contables, migraciones y pruebas del repositorio. No se consultaron datos reales, no se ejecutaron servicios, migraciones ni scripts de verificación contra PostgreSQL. README.md y CLAUDE.md advierten que la base local es producción. No se encontraron AGENTS.md en el repositorio mediante búsqueda de archivos ocultos excluyendo dependencias y .git.

Los hallazgos siguientes están sustentados por el código. Los escenarios de concurrencia describen intercalaciones que el código permite; no son reproducciones ejecutadas sobre la base. No se certifica cumplimiento tributario ni contable legal. Las reglas de DTE/F29 requieren una revisión especializada adicional sobre documentación oficial vigente y pruebas de integración.

Prioridades: P1 = corregir antes de considerar confiables los saldos y cierres afectados; P2 = siguiente iteración de integridad/producto. No se afirma un incidente P0 ocurrido en producción sin consultar evidencia operativa.

## Hallazgos

### N-01 — P1: guardar una nota de crédito como borrador aumenta el inventario

- Evidencia: `src/modules/sales/services/sales.service.ts:98`, `:137`, `:185`, `:211`, `:316`, `:404`; el bloque de stock usa `affectsStock || isCreditNote`. El segundo término no exige `status === 'ISSUED'`. La acción admite DRAFT (`src/modules/sales/actions/sales.actions.ts:100`) y el formulario ofrece guardar borrador (`src/components/SalesDocumentForm.tsx:487`).
- Escenario: factura original de 10 unidades; guardar una NC de 3 unidades como DRAFT incrementa stock en 3, sin emitir folio ni asiento. Repetir con otro borrador vuelve a incrementar: el acumulado de NC solo consulta ISSUED.
- Impacto: inventario ficticio, PMP alterado y descuadre con contabilidad por una acción que se presenta como guardado preliminar.
- Corrección: condicionar todos los efectos a emisión, unificar transición de borrador a emitido y vincular cada movimiento al documento y línea que lo produjo.
- Aceptación: crear, editar, duplicar y descartar borradores de NC no cambia Stock, InventoryMovement, Payment ni JournalEntry; emitir una vez produce un único efecto.

### N-02 — P1: ciclo guía → factura sin costo contable y anulación con reposición indebida

- Evidencia: `src/modules/sales/services/sales.service.ts:121`, `:136`, `:137`, `:220`, `:374`, `:461`; `src/modules/accounting/posting-rules/sales-posting.ts:19`, `:96`, `:117`.
- Escenario: guía despacha 5 unidades. La factura que la referencia evita descontar stock, correctamente, pero también evita contabilizar su costo. La guía tampoco genera ese asiento. Al anular la factura, el código repone 5 unidades solo por su tipo DTE, aunque esa factura no las descontó.
- Impacto: costo de ventas omitido, existencias contables sobrevaloradas, stock físico incrementado indebidamente en la anulación.
- Brecha relacionada: basta referenciar cualquier guía ISSUED para omitir todo el stock de la factura; no se valida que cliente, productos y cantidades coincidan, ni qué parte de la guía ya fue facturada.
- Corrección: relación persistente guía/línea/factura con cantidades aplicadas; registrar el costo original del despacho y su reconocimiento posterior; revertir movimientos efectivamente vinculados, no inferirlos del tipo documental.
- Aceptación: guía de 5 y factura de 5 producen una salida y un costo contable; facturar artículos distintos o exceder el pendiente se rechaza; anular la factura no repone un despacho vigente.

### N-03 — P1: aplicación y anulación de notas de crédito pierde la distinción entre dinero y crédito

- Evidencia: `src/modules/sales/services/sales.service.ts:404` aplica `min(totalNC, saldoOriginal)` sobre `paidAmount`, marca toda la NC PAID en `:419`; al anular, `:500` resta el total de la NC, no el crédito efectivamente aplicado. Compras replica la aplicación en `src/modules/purchases/services/purchases.service.ts:361` y `:786`. El asiento de NC siempre reduce CLIENTES en `src/modules/accounting/posting-rules/sales-posting.ts:152`.
- Escenario determinista: factura total 100, ya cobrada 90; NC de 30 aplica solo 10 y deja paidAmount=100. Anularla resta 30 y deja paidAmount=70 aunque siguen existiendo cobros por 90.
- Escenario adicional: NC contra factura ya pagada se marca PAID sin devolver dinero ni crear un saldo a favor operativo; contabilidad sí genera saldo acreedor en CLIENTES. La instrucción de anular una boleta de turno cerrado mediante NC no produce por sí misma devolución en el turno actual.
- Impacto: deuda, cobros efectivos, devoluciones y saldo a favor discrepan.
- Corrección: libro de aplicaciones de crédito y pagos separados; persistir cuánto de cada NC se aplicó a qué documento, saldo disponible y reembolso; revertir la aplicación exacta.
- Aceptación: factura 100/cobro90/NC30 conserva cobro90, aplicación10 y crédito20; anular NC vuelve a saldo10 sin alterar cobros; reembolso queda en tesorería y contabilidad una sola vez.

### N-04 — P1: notas de crédito admiten referencia de otro cliente y exceso monetario

- Evidencia: `src/modules/sales/services/sales.service.ts:123` busca referencia sin `contactId`; `:127` solo exige existencia/estado; `:185`–`:208` limita unidades únicamente de productos trackeables. `src/modules/sales/schema.ts:82` exige referencia, pero no limita tipo ni valor. Compras limita unidades también solo dentro del movimiento de productos (`purchases.service.ts:193`, `:213`).
- Escenario: elegir cliente B y folio de factura de cliente A produce una NC a B que reduce el paidAmount/saldo operativo de A. Una NC de servicio libre por un monto superior a la factura pasa los límites de unidades. También se pueden seleccionar tipos de referencia que no representan una venta a corregir.
- Impacto: reducción de deuda del cliente incorrecto y correcciones monetarias sin límite respecto del documento origen.
- Corrección: FK explícita a documento referenciado, mismo cliente y tipos permitidos; control acumulado de neto/IVA/total por documento y línea bajo lock del original; separar corrección de texto, precio y devolución.
- Aceptación: referencias cruzadas entre clientes se rechazan; varias NC y pagos concurrentes mantienen aplicaciones coherentes; no se acredita más de la base corregible salvo flujo explícito de excepción.

### N-05 — P1: líneas repetidas permiten recibir o acreditar más unidades que las originales

- Evidencia: `src/modules/purchases/services/goods-receipt.service.ts:34`–`:43` compara cada línea con el mismo saldo leído y `:96`–`:100` incrementa por todas; `src/modules/purchases/schema.ts:114` no prohíbe `orderItemId` repetidos. En NC, `sales.service.ts:196` y `purchases.service.ts:214` usan `find(productId)` y no descuentan las cantidades de las líneas anteriores de la misma solicitud.
- Escenario: OC con 10 pendientes, solicitud con dos líneas del mismo orderItemId por 6 cada una: ambas pasan y se reciben 12. NC contra venta de 10 con dos líneas de 6 del mismo producto también supera el total permitido. A la inversa, dos líneas legítimas del producto en el original se reducen a la primera por `find`.
- Impacto: recepción y devolución excesivas, y rechazos de devoluciones válidas.
- Corrección: trabajar con identidad de línea original; normalizar/agregar las cantidades solicitadas antes de validar; imponer unicidad donde proceda.
- Aceptación: 6+6 contra 10 se rechaza atómicamente; 4+6 se acepta una vez; dos líneas legítimas del original se aplican contra su saldo propio.

### N-06 — P1: matching de compras con OC se puede omitir

- Evidencia: `src/modules/purchases/services/purchases.service.ts:149`–`:159` excluye compras con OC de aprobación; `:193` excluye su movimiento de stock; `:245` establece MATCHED y `:250` salta las líneas sin purchaseOrderItemId. `:262` compara cada línea repetida con el mismo disponible; `:345`–`:352` acumula todas. El esquema permite omitir el vínculo de línea.
- Escenario: adjuntar una OC del proveedor a una factura con líneas sin purchaseOrderItemId: termina MATCHED aunque no se contrastó ninguna línea y no se exige aprobación por monto. Una factura con dos líneas de 6 contra 10 disponibles puede quedar MATCHED y acumular 12 facturadas.
- Impacto: el control que habilita pagos no prueba recepción, producto, cantidad ni precio del documento completo.
- Corrección: matching exhaustivo de todas las líneas; cargos sin OC explícitos y aprobables; validación agregada; no sustituir aprobación de gasto por simple presencia de un ID de OC; guardar vínculos de línea para revalidación.
- Aceptación: factura sin vínculos completos no queda MATCHED; diferencias o conceptos adicionales bloquean pago hasta resolución trazada; duplicados se agregan; borradores con OC se pueden completar y emitir conservando las asociaciones.

### N-07 — P1: cierre de caja no sincroniza ventas, movimientos y anulaciones

- Evidencia: `src/modules/pos/services/cash.service.ts:269` calcula resumen antes de la transacción; `:274` cambia OPEN a CLOSED después. `src/modules/pos/services/pos.service.ts:113` solo lee OPEN, sin lock del turno. `cash.service.ts:230`–`:234` lee y crea movimiento fuera de transacción; anulación de ventas también lee el estado del turno sin bloquearlo (`sales.service.ts:440`).
- Escenario permitido: cierre calcula 100; una venta de 30 confirma entre el resumen y el UPDATE; se cierra con esperado 100 aunque las ventas suman 130. Una venta que leyó OPEN también puede terminar después de que el turno se cerró.
- Impacto: arqueos y diferencias contabilizadas incorrectas; actividad posterior sobre un turno cerrado.
- Corrección: todas las operaciones del turno adquieren el mismo lock de CashShift; resumen y cierre dentro de la misma transacción; política explícita de devoluciones en turno actual.
- Aceptación: pruebas de PostgreSQL aislado con barreras simultáneas venta/cierre, ingreso/cierre y anulación/cierre: cada movimiento queda incluido en un cierre o se rechaza antes de mutar datos.

### N-08 — P1: aprobación de compras puede revivir anulados y aprobar otra versión/tipo

- Evidencia: `src/modules/purchases/services/purchases.service.ts:924`–`:955` permite anular DRAFT y no limpia approvalStatus PENDING; `:857`–`:865` comprueba PENDING pero no DRAFT y finalmente fuerza ISSUED en `:888`. `updatePurchaseDocument` solo exige DRAFT (`:544`–`:546`) y modifica tipo, contacto, montos e ítems (`:600`), manteniendo aprobación PENDING.
- Escenarios deterministas: crear compra que excede umbral → DRAFT/PENDING → anular → aprobar: vuelve a ISSUED y recibe stock. Editar una compra PENDING a NOTA_CREDITO mantiene PENDING; aprobación asume que nunca recibe ese tipo, no hace salida ni aplicación del crédito y usa el asiento ordinario de compra.
- Impacto: aprobación de un documento anulado o de contenido distinto del revisado; saldos contables y de stock equivocados.
- Corrección: máquina de estados central; aprobar solo DRAFT/PENDING con versión esperada; cambiar contenido invalida aprobación; transiciones terminales no reversibles implícitamente; no duplicar reglas de emisión por ruta.
- Aceptación: CANCELLED/PENDING no aprobable ni listable como pendiente; editar lo enviado a aprobación invalida su versión; todos los caminos de emisión producen las mismas reglas para cada tipo.

### N-09 — P1: exclusión mutua incompleta en anulaciones y cambios de documentos

- Evidencia: `sales.service.ts:439` y `:543` leen estado y actualizan sin lock/condición de estado; `goods-receipt.service.ts:122`–`:155` anula sin lock de recepción/OC, mientras crear factura/recepción sí bloquea OC. `purchases.service.ts:543` edita borrador sin el lock que emisor/aprobador sí toma (`:661`, `:855`). `LOCKING_TX_OPTIONS` solo establece timeout/maxWait, no aislamiento serializable.
- Escenarios permitidos: dos anulaciones de la misma venta pueden superar la lectura ISSUED y duplicar reposición; una factura puede aprobar matching mientras otra transacción anula recepción que leyó invoicedQuantity=0; editar un borrador mientras se emite puede cambiar documento/ítems después de generar stock o asiento con la versión anterior.
- Impacto: efectos duplicados o documento final diferente de sus asientos/movimientos.
- Corrección: protocolo de locks uniforme por entidad raíz y orden de adquisición; actualizaciones condicionadas por estado/versión; idempotencia de cada transición, vínculos únicos de efectos y reintento controlado de conflictos.
- Aceptación: pruebas simultáneas de cada par y revisión de invariantes finales: un único reverso, cantidades recibidas no negativas, matching compatible con recepción, líneas contabilizadas iguales a versión emitida.

### N-10 — P1: Ventas conserva PMP previo al lock y diferente del Kardex

- Evidencia: `src/modules/sales/services/sales.service.ts:69`–`:79` captura costPricePMP antes de mover stock; `:220` lo usa para contabilidad y `:350` lo persiste. `applyStockOut` relee PMP bajo lock (`src/modules/inventory/services/stock.service.ts:105`, `:140`). El POS ya usa correctamente movement.unitCost (`src/modules/pos/services/pos.service.ts:168`–`:185`).
- Escenario: venta lee PMP=100; compra confirma nuevo PMP=150 antes de que la venta tome lock del producto. Kardex sale a 150, documento y costo contable a 100.
- Impacto: margen, reversos y costo contable difieren del inventario.
- Corrección: usar costo del InventoryMovement devuelto, como POS; preservar snapshot por línea/movimiento, incluyendo importador histórico que también descarta el resultado (`historical-import.service.ts:249`).
- Aceptación: prueba concurrente compra/venta fuerza ambas intercalaciones y compara costo documento, movimiento y asiento.

### N-11 — P1: anular ventas con cobros posteriores no reversa sus asientos de pago

- Evidencia: `src/modules/treasury/services/treasury.service.ts:88` crea asiento para pago; `src/modules/accounting/posting-rules/treasury-posting.ts:45` usa sourceType PAYMENT/sourceId pago. Anular venta crea Payment EXPENSE (`sales.service.ts:521`–`:534`) y reversa solo SALES_DOCUMENT (`:541`; `sales-posting.ts`, reverseSalesDocumentPosting).
- Escenario: factura a crédito 119, cobro posterior 119, anulación con devolución: el flujo de tesorería queda neto cero, pero el asiento del cobro D CAJA/BANCO / H CLIENTES sigue vivo. Reversar la factura no revierte ese asiento.
- Impacto: efectivo contable retenido sin dinero y saldo acreedor de cliente ficticio.
- Corrección: compensación contable explícita por cada devolución; vincular y revertir cobros aplicados, distinguir venta al contado de cobro posterior y medio de devolución.
- Aceptación: factura+cobro+anulación deja ingreso/IVA/costo/cuentas por cobrar y dinero según el resultado económico; comprobar pago parcial y pago por transferencia.

### N-12 — P1: clasificación contable demasiado amplia para servir como saldo de existencias/caja

- Evidencia: `src/modules/accounting/posting-rules/purchases-posting.ts:70` determina inventario por existencia de cualquier productId, sin isTrackable y asigna todo neto a una cuenta (`:88`–`:110`). Su comentario reconoce simplificación de documentos mixtos. `src/modules/accounting/posting-rules/sales-posting.ts:98` envía todo pago inmediato a CAJA; los cobros posteriores sí distinguen BANCO según medio (`treasury-posting.ts:21`).
- Escenarios: factura de productos 100 + servicio 50 contabiliza 150 como existencias aunque Kardex recibió 100; producto no trackeable con productId también se capitaliza. Venta inmediata por transferencia aumenta CAJA en lugar de BANCO.
- Impacto: balance por cuenta incorrecto aun con asientos que cuadran aritméticamente.
- Corrección: desglose contable por línea/tipo y condición real de stock; cuentas de efectivo/banco/medios de pago consistentes. Evaluar existencias recibidas no facturadas y diferencias de costo entre recepción/factura: hoy recepción no contabiliza y factura no reconcilia valoración.
- Aceptación: compra mixta y no trackeable concilian inventario/gasto; cada medio de cobro aplica a cuenta correcta; recepción a un costo y factura diferente deja diferencia explicada.

### N-13 — P1: F29 depende del orden de consulta y de snapshots anteriores obsoletos

- Evidencia: `src/lib/chile/f29.ts:34` lee TaxPeriod anterior; `:71` usa cero si falta; `:105` sobrescribe solo el mes solicitado. Las fuentes se leen en consultas paralelas sin snapshot transaccional (`:32`). `prisma/schema.prisma:479` no guarda estado presentado/cerrado, versión de reglas ni tasa histórica aplicada.
- Escenario: consultar septiembre sin haber calculado agosto omite el remanente aunque los documentos de agosto estén cargados. Modificar/importar agosto y recalcularlo no invalida ni recalcula septiembre. Recalcular un año previo usa la tasa PPM actual de CompanySettings.
- Impacto: resultados dependen de navegación y orden de ejecución, no solo de hechos y parámetros del período.
- Corrección: cadena determinista desde saldo inicial validado; invalidación/recalculo de meses dependientes; snapshot consistente de fuentes y parámetros por vigencia; distinguir borrador calculado de declaración/versionado.
- Aceptación: calcular meses en cualquier orden devuelve la misma serie; cambio de agosto propaga; modificación de tasa actual no reescribe historia; lecturas concurrentes no mezclan versiones.

### N-14 — P2: el cierre mensual disponible no cierra períodos contables

- Evidencia: `src/modules/accounting/services/monthly-closing-cron.service.ts:25` ejecuta conciliación/F29, correos y auditoría; no cambia AccountingPeriod. Búsqueda en src de mutaciones de accountingPeriod solo encontró apertura automática en `journal.service.ts:73` y eliminación de tenant. Existe permiso `accounting:close_period`, sin flujo operativo de cierre/reapertura encontrado.
- Impacto: nombres/documentación pueden transmitir cierre definitivo cuando solo se emitió un informe; operación ordinaria sigue admitiendo retroactividad en períodos OPEN. El motor rechaza períodos CLOSED si fueron establecidos por otra vía, lo cual es una base positiva.
- Corrección: cierre/reapertura explícitos con responsable, verificaciones, versión y bloqueo; controlar período también al postear un asiento previamente DRAFT y coordinarlo con el cierre. Separar cierre contable y tributario.
- Aceptación: usuario autorizado cierra período después de resolver pendientes; escrituras retroactivas y emisión de borradores fechados allí se rechazan; reapertura queda auditada y versiona reportes.

### N-15 — P1: cobros y pagos de módulos de eventos no alimentan un libro financiero común

- Evidencia: `src/modules/payment-plans/services/payment-plans.service.ts:177`–`:190` suma paidAmount, registra paidAt solo al completar y descarta method. `src/modules/promissory-notes/services/promissory-notes.service.ts:138` y `src/modules/sponsorships/services/sponsorships.service.ts:164` reemplazan acumulado absoluto; `src/modules/fees/services/fees.service.ts:63` marca pagada sin Payment/asiento. `src/modules/treasury/services/treasury.service.ts:313` obtiene flujo de caja únicamente desde Payment.
- Escenario: cobrar parcialmente cuotas en dos fechas, recibir auspicio y pagar honorarios cambia esos módulos, pero no aparece como tal en tesorería/contabilidad. La cuota no conserva fecha individual de abonos ni medio; pagaré/auspicio no conservan un detalle de cada cobro en su modelo operativo.
- Impacto: flujo de caja incompleto y conciliación manual entre módulos. Los comentarios describen deliberadamente libros separados; se reporta como limitación material de integración, no como función que prometieron implementar y no existe.
- Corrección: registro financiero común con movimientos inmutables, aplicaciones, fecha, medio, referencia, proyecto y origen; decidir si se trata de cobro o simple actualización informativa; evitar doble contabilización al consolidar.
- Aceptación: pago de cada módulo aparece una vez en detalle y consolidado; abonos en días distintos conservan trazabilidad; correcciones usan contrapartida; total de aplicaciones concilia contra documento.
- Riesgo de diseño a revisar: `deletePaymentPlan` borra incluso planes pagados y sus cuotas (`payment-plans.service.ts:267`–`:296`), explícitamente documentado como decisión de negocio. Reconsiderar conservación de un libro financiero independiente antes de eliminar la ficha operativa; no revertir esa decisión silenciosamente.

### N-16 — P1: UI de ventas/POS no usa la idempotencia que admiten sus servicios

- Evidencia: esquema ventas `src/modules/sales/schema.ts:80`; POS `src/modules/pos/schema.ts:68`; deduplicación opcional en `sales.service.ts:47` y `pos.service.ts:99`. No hay idempotencyKey en el payload de `src/components/pos/PosTerminal.tsx:210`–`:215` ni en el de `src/components/SalesDocumentForm.tsx:179`–`:210`.
- Escenario: el servidor confirma venta y la respuesta se pierde; el usuario reintenta y se generan segundo documento, cobro y salida. Deshabilitar un botón durante la petición no cubre respuesta perdida/reintento.
- Corrección: clave obligatoria por intención de venta, conservada hasta resolución; servidor vincula clave a huella del contenido, devuelve resultado previo y resuelve también conflicto concurrente de unicidad. Extender a cobros y transiciones sensibles.
- Aceptación: dos envíos, simultáneos o tras timeout, producen un documento/folio/cobro/movimiento; clave reutilizada con payload distinto se rechaza.

### N-17 — P2: identidad del documento de proveedor omite tipo documental

- Evidencia: `prisma/schema.prisma:913` impone unique companyId/contactId/folio; `src/modules/purchases/services/purchases.service.ts:120` resuelve NC solo por proveedor/folio; no existe referenceType en el esquema de compras.
- Escenario: mismo proveedor entrega una factura con folio 100 y otro tipo documental con folio 100; el modelo rechaza el segundo, aunque sea documento distinto. La referencia no puede distinguir ambos tipos.
- Impacto: carga de documentos válidos bloqueada y referencias insuficientes para correcciones.
- Corrección: identidad por emisor/tipo/folio, FK al documento corregido y migración revisada de referencias existentes; normalizar folio conforme al modelo de origen.
- Aceptación: mismo emisor y folio en tipos diferentes se conserva; mismo tipo/emisor/folio duplicado se rechaza; toda NC apunta inequívocamente al documento.

### N-18 — P1: enriquecimiento histórico admite paidAmount mayor que total y no armoniza ventas con contabilidad

- Evidencia: `src/modules/sales/services/historical-import.service.ts:167` permite diferencia hasta max(50, 2%); `:203`–`:205` cambia total conservando paidAmount/paymentStatus si input.paid es falso. Compras usa tolerancia análoga (`purchases.service.ts:460`) y actualiza total sin recalcular pago (`:476`). El servicio histórico de ventas crea/actualiza documentos y stock, finaliza en `:278` sin asiento, mientras importación de compras sí postea.
- Escenario: documento total1000, paidAmount1000; detalle corregido total990 dentro de tolerancia y sin paid=true deja paidAmount1000 > total990. Ventas históricas ISSUED aparecen en F29/CxC/Kardex, sin asiento operativo correspondiente.
- Impacto: saldos negativos/estado pagado falso, reportes y mayor inconsistentes. No debe inventarse un pago histórico cuya fecha/medio se desconoce.
- Corrección: invariantes absolutas independientes de tolerancia; mantener total fiscal o ajuste/reclasificación explícita, gestionar exceso como crédito; definir importación contable versus saldos iniciales/corte y registrar proveniencia, fecha económica y fecha de carga.
- Aceptación: ningún enriquecimiento deja paidAmount > total; importaciones con/sin pagos concilian documentos, saldos iniciales y mayor; rerun no duplica efectos.

### N-19 — P2: conciliación de caja usa suma de arqueos históricos como si fuera saldo disponible

- Evidencia: `src/modules/accounting/services/reconciliation.service.ts:78`–`:83` suma actualAmount de todos los turnos CLOSED, y `:122` lo compara con saldo contable global CAJA.
- Escenario: se cuentan los mismos 100 de fondo al cerrar dos turnos sucesivos; suma arqueos=200 aunque no entró dinero adicional. Movimientos de caja fuera de POS tampoco tienen por qué corresponder a esta suma.
- Impacto: alertas contables falsas y pérdida de confianza en conciliaciones; no identifica adecuadamente el saldo que requiere ajuste.
- Corrección: libro de movimientos de efectivo, fondos iniciales/traspasos/retiros y saldo por caja/cuenta; usar último arqueo por caja y movimientos posteriores, no sumar fotos históricas.
- Aceptación: dos cierres sucesivos con el mismo efectivo no duplican saldo; depósitos bancarios, traspasos y caja fuera de POS se explican sin ajustes ficticios.

## Controles positivos comprobados

- Transacciones en emisión de ventas/compras, pago de documentos, stock y asientos: base útil para corregir los casos anteriores sin rediseñar todo el ERP.
- `stock.service.ts` bloquea producto y controla stock con decremento condicionado. POS ya captura el costo del movimiento efectivo.
- `treasury.service.ts` bloquea documentos antes de registrar pagos para evitar sobrepago simultáneo entre llamadas a ese servicio.
- Secuencias e índices únicos protegen varios correlativos y claves idempotentes. CashShift tiene índices parciales para un turno abierto por caja/usuario en migración `20260818012009_add_pos_cash_management`.
- `computeDocument` centraliza totales y reparte IVA por resto mayor, manteniendo suma de líneas coherente con total del documento.
- Migración `20260819051703_add_accounting_core` implementa restricciones/trigger de signos, cuadratura diferida, inmutabilidad de asientos contabilizados y cuentas posteables; no conviene sustituirlos por validaciones solo de UI.
- Validaciones de pertenencia de productos/bodegas/contactos en numerosos servicios, y validación de cuenta contable de la misma empresa. Esto no equivale a FK compuesta por tenant en todo el esquema.

## Plan de implementación del dominio

### Etapa 1: invariantes y transiciones, antes de ampliar funcionalidad

1. Acordar matriz de tipos/estados/efectos: borrador, emisión, cobro, crédito, anulación, recepción, aprobación y cierre.
2. Corregir N-01, N-02, N-04, N-05, N-06 y N-08 con un servicio canónico por transición; documentar relación guía/factura/NC y OC/recepción/factura por línea.
3. Aplicar protocolo uniforme de locks y versiones a N-07/N-09; asegurar orden de adquisición para evitar deadlocks y definir reintentos acotados.
4. Activar idempotencia completa N-16 y costo efectivo N-10.
5. Añadir pruebas de integración sobre PostgreSQL aislado, con barreras controladas y verificaciones de invariantes; los tests puros de cálculo no cubren estas transacciones.

### Etapa 2: conciliación de documentos, dinero y mayor

1. Libro de aplicaciones/reembolsos para N-03/N-11; movimientos trazables e inmutables.
2. Clasificación por línea y medio N-12; diseño de diferencias recepción/factura y cuentas de transición.
3. Integrar o delimitar con claridad los libros auxiliares N-15; reconstrucción de historia solo con fuentes acreditables.
4. Identidad documental N-17, corte de importación e invariantes N-18 y conciliación de efectivo N-19.
5. Elaborar consultas de reconciliación de solo lectura para identificar datos afectados: borradores con Kardex, múltiples movimientos por efecto, paidAmount > total, créditos sin aplicación, facturas de guía sin costo y diferencias entre mayor/submódulos. Ejecutarlas posteriormente con autorización y entorno adecuados; no ejecutadas en esta auditoría.

### Etapa 3: cierre y trazabilidad del período

1. F29 determinista/versionado N-13; tasas por vigencia y parámetros históricos.
2. Cierre/reapertura N-14 coordinado con todos los flujos, importaciones incluidas.
3. Pruebas de fin de mes, cambio de año, operaciones cercanas a medianoche de America/Santiago y correcciones de períodos anteriores.
4. Validación tributaria especializada y circuito DTE completo: el README reconoce pendientes XML-DSig, envío SII, Track ID y consumo de folios. Debe existir una distinción operativa visible entre documento interno, timbrado pendiente y documento con estado tributario confirmado.

## Mejoras adicionales y límites de esta revisión

- Stock negativo: `stock.service.ts:127` requiere que exista fila Stock incluso cuando allowNegativeStock=true. Un producto/bodega sin fila inicial queda bloqueado. Cubrirlo en la matriz de aceptación; no asumir que flag habilita cualquier salida.
- Datos monetarios: el esquema usa Int en montos finales y Float en cantidades/PMP. Definir límites CLP y precisión por unidad; una entrada aceptada por Zod puede superar la capacidad del entero PostgreSQL. La migración a mayor rango debe ser aditiva y preservar compatibilidad.
- Muchas listas de dominio usan take:200 sin total/paginación; verificar que selección de OC, cobranza y reportes operativos no oculten pendientes a medida que crece cada tenant.
- Integridad referencial: agregar restricciones compuestas por tenant donde corresponda y checks monetarios/de estado tras sanear datos existentes. No se recomienda intentar desplegarlos sobre datos productivos sin diagnóstico.
- Pruebas existentes revisadas: hay buenos casos puros de IVA/PMP/posting y mocks; no prueban todas las intercalaciones reales. `tests/resilience-stress.test.ts` contiene simulaciones de concurrencia y cálculos, no debe tratarse como prueba de carga de PostgreSQL.
- No se inspeccionaron exhaustivamente las reglas de jurado, candidatas, entradas/votos, documentos legales ni todas las pantallas; este informe cubre el núcleo económico y una revisión de integración de libros auxiliares. No se verificó si los casos descritos ya afectaron datos reales.
