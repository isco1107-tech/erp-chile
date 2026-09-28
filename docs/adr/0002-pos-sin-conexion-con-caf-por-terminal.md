# POS sin conexión: cada caja timbra con su propio CAF; sin CAF, documento interno

Una boleta se entrega en el momento de la venta (art. 55 DL 825). Un comprobante provisorio que se timbre al reconectar deja al cliente sin boleta. Timbrar no necesita internet: el folio y el TED salen del CAF, así que **vender sin conexión con validez tributaria exige que el equipo tenga un CAF y su llave**. Definición del especialista tributario, 2026-09-28. Lo marcado *(confirmar)* debe revisarlo el contador contra la Res. Ex. SII 74/2020 vigente.

## Decisión

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

## Lo que ya existe (paso 1, commit `85d1fd8`)

- La pantalla del POS abre sin conexión: el service worker la guarda y borra la copia al cerrar sesión o al cambiar de empresa.
- La app de escritorio no tapa el POS al cortarse la red.
- El POS ya carga el catálogo completo al inicio, y la venta ya lleva `idempotencyKey` (`createIdempotencyTracker`): reintentar no duplica.

## Pendiente de decidir antes de construir el resto

1. **Operación:** ¿el dueño acepta pedir un CAF por caja en el portal del SII (sin API oficial *(confirmar)*) y renovarlo cada pocos días?
2. **Contabilidad e inventario:** el costo PMP de una venta sin conexión, ¿es el del momento de sincronizar (el único que se puede leer con lock) o se guarda `costDeterminedAt`? CLAUDE.md prohíbe recalcularlo después.
3. **Límites:** máximo de horas sin conexión, y bloquear la venta si se cruza fin de mes sin sincronizar (una boleta que entra después del F29 obliga a rectificar).
4. **Contador:**
   - Plazo de envío de boletas al SII y si el RCOF sigue vigente.
   - Si el voucher de tarjeta reemplaza a la boleta (Ley 21.210).
   - Cómo valida el SII una boleta con fecha FE anterior a la hora de timbrado TSTED.
5. **Conflicto previo:** una empresa sin CAF que después carga uno que parte en 1 choca con sus propios folios internos (misma unicidad). Hoy no hay nada que lo maneje.
