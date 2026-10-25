# 0013 · Exportar datos y reseteo de los datos de una empresa

Fecha: 2026-10-25. Estado: aceptado.

## Contexto

Dos pedidos del dueño de la plataforma, el mismo día:

1. Ver y bajar a Excel **todas** las boletas y **todos** los movimientos de inventario. Ya existían exportaciones, pero repartidas y escondidas: el libro de Reportes Excel (Finanzas, exige `hasAdvancedReports`), el registro de movimientos de UNA bodega a la vez (Inventario) y ninguna exportación de boletas en Ventas. Una empresa que solo tiene Punto de Venta no tenía dónde bajar sus boletas.
2. Dejar a «Chakra» sin los datos de prueba (todo era ficticio) para empezar a operar sin que estorben: conservar la empresa, sus usuarios y roles y sus módulos contratados.

## Decisiones — Exportar datos (`/dashboard/exports`)

1. **Una pantalla propia en el menú** (grupo Principal, id `exports`), no otro botón escondido: dos pestañas, «Boletas y documentos de venta» y «Movimientos de inventario», cada una con lista, resumen y el botón «Descargar Excel». Aparece solo si el plan y el rol dan algo que bajar (`src/lib/exports/access.ts`, una regla única para menú, pantalla y rutas): boletas con `sales:read` + Facturación **o** `pos:close` + POS (una empresa con solo POS también tiene boletas; operar la caja propia no basta porque el archivo trae los clientes de todas las cajas); movimientos con `products:read` + Inventario, y el costo solo con `products:costs`.
2. **La pantalla y el archivo usan exactamente el mismo filtro**, que viaja por la dirección (formulario GET, compartible): `src/lib/exports/filters.ts` lo lee igual en la página y en la ruta de descarga, y lo desconocido cae al valor por defecto. El rango por defecto es el mes en curso (un archivo de todo el historial puede pasar el tope); «Todo el historial» queda a un clic (`rango=todo`; las fechas vacías de un formulario enviado significan «sin límite», no «este mes»).
3. **Los días son los de Chile**: `dateRange` convierte `YYYY-MM-DD` a la medianoche de Santiago, así que una boleta de las 23:30 del 30 de septiembre no cae en octubre aunque en UTC ya sea día 1. En el Excel la fecha es una fecha real (se ordena y filtra) escrita con la hora de Santiago (`santiagoWallClock`).
4. **Qué entra**: boletas (por defecto), facturas, notas de crédito/débito y guías, emitidas y/o anuladas. Los borradores y las cotizaciones **nunca** (no son una venta). El total vendido suma lo emitido y **resta las notas de crédito** (`signForSalesDteType`, igual que el F29); lo anulado se cuenta aparte y no suma. Los movimientos traen su bodega y el saldo de ESE producto en ESA bodega, así que mezclar bodegas no confunde el stock.
5. **Excel**: tres hojas para ventas (Documentos, Detalle de productos —una fila por línea, para cruzar con inventario— y Resumen por tipo y medio de pago) y dos para movimientos (Movimientos y Resumen). Valores como datos, nunca fórmulas (`safeCell`). Tope de 20.000 documentos / 50.000 movimientos por archivo: pasado el tope, el archivo trae los más recientes y lo dice en la pantalla, en la hoja Resumen y en `X-Export-Truncated`. No es streaming: se arma en memoria por lotes de 500 / 1.000 filas.
6. **Cada descarga queda en la bitácora** (`EXPORT`, entidades `SalesDocument` / `InventoryMovement`, con los filtros y la cantidad de filas), porque trae nombres y RUT de clientes y nombres de personas.
7. Lo que ya existía **no cambia**: el libro de Reportes Excel, el registro por bodega con fotos de respaldo y filtros por operario/motivo/proveedor, y su Excel. La pantalla nueva enlaza a ambos.

## Decisiones — Reseteo de los datos de una empresa (`scripts/reset-company-data.ts`)

1. **Es un script, no una pantalla ni una orden de la Supersuite.** Borrar los datos de una empresa es irreversible y la `DATABASE_URL` local es la misma base que producción (CLAUDE.md §5); el borrado permanente de una empresa tampoco tiene hoy una vía definida con el dueño. El script lo corre una persona, a mano, sabiendo contra qué base apunta: lo imprime al empezar.
2. **Simula por defecto.** Sin `--commit` solo cuenta lo que se borraría, por tabla. Para ejecutar hay que repetir la razón social a mano (`--confirmar`). Si aparecen cosas que no parecen de prueba —CAF cargados (folios autorizados por el SII), documentos ya enviados al SII, cuotas pagadas por Khipu, pedidos de la tienda con pago confirmado— exige además `--acepto-perder-datos-reales`.
3. **El plan sale de la base, no de una lista escrita a mano** (`scripts/lib/company-reset.ts`): toda tabla con columna `companyId` y las llaves foráneas de `pg_constraint`. Un modelo nuevo entra solo; la única lista escrita a mano es la de lo que SE CONSERVA (`KEPT_TENANT_TABLES`: `CompanyFeatures`, `CompanySettings`, `CustomRole`, `User`, `UserSession`, `PushSubscription`, `Invitation`, `CompanyMembership`, `McpPersonalToken`, `PlatformAuditLog`) — lo desconocido se trata como dato. Solo las llaves RESTRICT/NO ACTION imponen orden (SET NULL y CASCADE no bloquean); las autorreferencias obligatorias (`Account.parentId`, `JournalEntry.reversalOfId`) se anulan primero. Si el plan no se puede armar con seguridad (un ciclo, una tabla conservada que bloquearía o que perdería filas por cascada) **falla antes de borrar nada**. `tests/company-reset-db.test.ts` exige que cada tabla con `companyId` esté en el plan o en la lista de conservadas y que el orden respete cada llave.
4. **Una sola transacción**: borra, verifica que no quedó ninguna fila en las tablas a vaciar y que las conservadas no cambiaron de tamaño, reprovisiona lo mínimo y recién entonces confirma; cualquier falla hace rollback completo. Los triggers de inmutabilidad contable se suspenden solo si la empresa tiene asientos y se reactivan dentro de la misma transacción (suspenderlos toma un candado breve sobre `JournalEntry`/`JournalLine` de todas las empresas: correr fuera de horario).
5. **Qué queda y qué se repone.** Se conservan la empresa, sus usuarios, roles, invitaciones, sesiones, módulos y la configuración (`CompanySettings`: giro, año fiscal, credenciales de correo y Khipu, lista de IPs). Se borran las bodegas, cajas, plan de cuentas, contactos, productos, documentos, contabilidad, sitios, certámenes, mensajería, bitácora de auditoría y folios. Al final se repone lo que tiene una empresa recién creada: la «Bodega Principal» y, si tiene Contabilidad, el plan de cuentas base. Queda una fila en `PlatformAuditLog` (`company.data_reset`) con las tablas y filas borradas.
6. Las personas del Seller Center que se quedan sin acceso a ninguna empresa se borran (son de la plataforma; las que trabajan con otra empresa se quedan).

## Lo que esto NO hace

- **No toca el almacenamiento de archivos** (fotos de productos, adjuntos, evidencias): quedan sin uso en Vercel Blob.
- **No es un respaldo ni se puede deshacer.** Antes de correrlo en firme: `GET /api/backup/company` (permiso `company:export`) o un punto de restauración de Neon.
- **No cambia usuarios ni módulos**, ni reinicia contraseñas. La numeración de folios de documentos vuelve a empezar (se borran las secuencias y los CAF).
- La exportación **no** es un respaldo: para eso sigue `backup/`.

## Todavía no

Exportar compras, pagos y asientos desde la misma pantalla (hoy: Reportes Excel); archivos de más de 20.000 documentos (hoy: por partes, acotando fechas); descarga en CSV; un reseteo que conserve bodegas, cajas y plan de cuentas (el script borra todo menos usuarios y módulos, que fue lo pedido).
