# POS sin conexión: cada caja timbra con su propio CAF; sin CAF, documento interno

Una boleta se entrega en el momento de la venta (art. 55 DL 825). Un comprobante provisorio que se timbre al reconectar deja al cliente sin boleta. Timbrar no necesita internet: el folio y el TED salen del CAF, así que **vender sin conexión con validez tributaria exige que el equipo tenga un CAF y su llave**. Definición del especialista tributario, 2026-09-28. Lo marcado *(confirmar)* debe revisarlo el contador contra la Res. Ex. SII 74/2020 vigente.

## Decisión del dueño del producto (2026-09-28): comprobante provisorio y boleta al volver

El dueño eligió, para **todas** las empresas (con o sin CAF), vender sin conexión entregando un **comprobante provisorio** y emitir la boleta al sincronizar. Es la opción A extendida a las empresas con CAF, y **va contra la recomendación tributaria de arriba**: mientras dure el corte, el cliente se va sin boleta.

> ⚠️ **Validar con el contador antes de usarlo en una empresa con CAF.** Hasta entonces, el límite de 2 horas acota la exposición, y el camino que cumple sigue siendo el CAF por caja (opción C), que queda documentado abajo para cuando se decida construirlo.

Alcance acordado: ventas del POS, entradas y salidas de stock, registro de compras y recepción de órdenes de compra, **como máximo 2 horas** sin conexión.

## Decisión del especialista tributario (recomendada, no construida)

- **Empresas con CAF: un CAF propio por caja** (opción C). El dueño lo pide en el portal del SII, con un rango chico (1 a 3 días de venta), y el ERP lo asigna a UNA terminal. Un equipo robado solo compromete ese rango.
- **Descartado: un sub-rango de un CAF compartido** (opción B). El TED solo prueba que el folio está dentro del rango del CAF, no del sub-rango. Un equipo robado podría timbrar folios del servidor y de otras cajas, y perder uno obligaría a anular el CAF entero.
- **Empresas sin CAF (contador interno): cola de ventas** (opción A). La caja numera en local (`T03-000123`) y el folio de `FolioSequence` se asigna al sincronizar. El impreso dice **"Documento interno, no válido como boleta"**.
- **Facturas, notas de crédito y débito, y guías (33, 34, 56, 61, 52): bloqueadas sin conexión.** Necesitan un receptor validado o referencias en línea. La venta queda "pendiente de facturar" sin entregar la mercadería, o se emite boleta.

## Reglas que el diseño no puede romper

- **Falla cerrado.** Si la caja no puede timbrar, no imprime. Implementado para el servidor en `stampDocument` (commit `85d1fd8`).
- **La llave del CAF nunca sale del mecanismo de firma.**
  - En la PWA, es una `CryptoKey` no extraíble en IndexedDB (el servidor la entrega en PKCS8 una sola vez, al asignar el CAF).
  - En Tauri, va al almacén del sistema operativo (DPAPI, Keychain o Secret Service).
  - El comando expuesto es solo "timbrar el siguiente folio", nunca "dame la llave". Ojo: Tauri carga el ERP remoto, así que un XSS podría pedir timbres, pero no copiar la llave.
- **Los folios no vuelven al pool.** Los folios de una caja siguen siendo suyos mientras tenga la llave: podría tener boletas sin sincronizar, y un folio duplicado es peor que un hueco. `assignFolioFromCaf` debe **excluir los CAF asignados a una terminal** (hoy toma el más antiguo con folios libres). La unicidad `(companyId, dteType, folio)` queda como última defensa.
- **El servidor no vuelve a timbrar.** El TED se guarda tal como lo generó la caja; el servidor lo verifica y rechaza lo inválido.
- **Una caja revocada o perdida** no puede sincronizar lo que firmó después de la revocación. Lo que quedaba de su CAF se anula en el SII *(confirmar el trámite)* y se registra con su motivo.

## Datos nuevos (migración aditiva, cuando se construya)

- `PosTerminal`:
  - `companyId`, `cashRegisterId` (1:1), plataforma y versión, llave pública del dispositivo.
  - Estado `ACTIVE` / `REVOKED` / `LOST`, quién y cuándo lo enroló o revocó, y por qué.
  - `lastSyncAt`.
- `DteCaf.terminalId`, opcional: CAF asignado a una caja.
- En cada documento hecho sin conexión:
  - `terminalId`, `emissionMode` (`ONLINE` / `OFFLINE`), secuencia local monotónica, hora del equipo, `syncedAt` y desfase de reloj.
  - Hash encadenado con el documento anterior de la misma caja, para detectar boletas omitidas.
  - Firma del dispositivo.
  - `idempotencyKey` = terminal + secuencia.

## Sincronización

- Documento, kardex, asiento y pago se registran en una sola transacción, igual que una venta en línea.
- Sin stock al sincronizar, **la venta ya ocurrió**: se registra el stock negativo marcado, aunque `allowNegativeStock` esté apagado.
- Lo rechazado (folio fuera de rango, duplicado, TED inválido, cadena rota) vuelve a la caja con el motivo. Nunca se descarta en silencio.

## Lo construido (modo contingencia)

1. **Pantallas que abren sin red** (commit `85d1fd8`): el service worker guarda la del POS y la de contingencia (`/dashboard/contingencia`), y borra esas copias al cerrar sesión o al cambiar de empresa. La app de escritorio no las tapa con su pantalla local y ofrece abrirlas.
2. **Servidor exactamente-una-vez** (`OfflineOperation`, `src/modules/offline/`): cada operación se reclama por `(companyId, idempotencyKey)` y se aplica con **la misma Server Action** que usa el formulario en línea, con sus permisos y validaciones. Solo la sincroniza quien la hizo, en la empresa donde la hizo. Si quedó a medias, pasa a "revisar" y no se repite sola. Se rechaza la hora del equipo adelantada más de 5 minutos y lo capturado hace más de 24 horas.
3. **Cola en el equipo** (`src/lib/offline/`, IndexedDB): se envía en el orden en que se hizo, una pestaña a la vez (Web Locks), y se detiene al primer corte. Pasadas **2 horas** desde la operación pendiente más antigua, no se aceptan nuevas. La barra superior muestra lo pendiente y lo rechazado, con reintentar y descartar.
4. **POS**: catálogo guardado en el equipo; sin red la venta va a la cola **con la misma clave del intento en línea** (si ese intento alcanzó a registrarse, no se duplica), se imprime el comprobante provisorio ("No válido como boleta") y el arqueo no deja cerrar la caja con ventas del turno sin sincronizar.
5. **Contingencia de bodega y compras**: entradas, salidas y traslados; compras que ingresan mercadería (factura, boleta, guía); recepción de OC, descontando lo ya encolado. Cada formulario valida con el mismo esquema Zod del servidor antes de encolar. Notas de crédito/débito y facturas de una OC siguen siendo solo en línea.

**Cómo queda cada documento al sincronizar:**
- La boleta recibe su folio (del CAF si la empresa lo tiene, o del contador interno) y su fecha es la de **sincronización**, no la de la venta. La hora real queda en `OfflineOperation.capturedAt`, y en las notas de movimientos, compras y recepciones como "[Registrado sin conexión el …]".
- El costo PMP es el del momento de sincronizar, leído con lock, y las operaciones se aplican en el orden en que se hicieron.

**Diferencia con lo que pide este ADR:** con stock insuficiente al sincronizar, hoy la venta **se rechaza** (queda "rechazada" en la cola, con el motivo) si `allowNegativeStock` está apagado. No se registra como stock negativo marcado. La persona registra la entrada que faltaba y la reintenta. Registrar el negativo marcado exige un cambio en `createPosSale` y queda pendiente.

## Pendiente

1. **Contador:** validar el comprobante provisorio para empresas con CAF (ver la advertencia de arriba).
2. **Stock insuficiente al sincronizar:** registrar la venta con stock negativo marcado en vez de rechazarla (ver "Diferencia").
3. **Fin de mes:** bloquear la venta sin conexión si se cruza fin de mes sin sincronizar (una boleta que entra después del F29 obliga a rectificar).

Para la opción C (CAF por caja), si se decide construirla:

1. **Operación:** ¿el dueño acepta pedir un CAF por caja en el portal del SII (sin API oficial *(confirmar)*) y renovarlo cada pocos días?
2. **Contador:**
   - Plazo de envío de boletas al SII y si el RCOF sigue vigente.
   - Si el voucher de tarjeta reemplaza a la boleta (Ley 21.210).
   - Cómo valida el SII una boleta con fecha FE anterior a la hora de timbrado TSTED.
3. **Conflicto previo:** una empresa sin CAF que después carga uno que parte en 1 choca con sus propios folios internos (misma unicidad). Hoy no hay nada que lo maneje.
