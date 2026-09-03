# Prompt maestro v2 — Núcleo contable e inteligencia financiera

> **Uso.** Guardar en la raíz del repo. En Claude Code:
> `Lee PROMPT_ERP_V2.md completo. Ejecuta únicamente la FASE A y detente en el GATE A.`
> Avanzar con: `Continúa con la FASE X de PROMPT_ERP_V2.md`.
>
> Este documento asume el ERP ya existente (Next.js 16 / Prisma 7 / Neon / multi-tenant por `companyId`). No es un proyecto nuevo: **es una ampliación sobre código que ya funciona y que no se debe romper.**

---

## Contexto

El sistema hoy registra operaciones correctamente: ventas, compras, inventario con PMP y kardex, tesorería con pagos parciales, POS con turnos, F29. Lo que **no** tiene es contabilidad. No hay plan de cuentas, ni asientos, ni libro mayor. Por eso el sistema no puede producir un balance, y sin balance no existen los ratios financieros de estructura (liquidez, endeudamiento, rentabilidad sobre activos o patrimonio).

El objetivo de este trabajo es cerrar esa brecha: **cada hecho económico que hoy se registra operativamente debe además generar su asiento contable, dentro de la misma transacción**, de forma que los estados financieros y los ratios se deriven del libro mayor y no de aproximaciones sobre tablas operativas.

## Principio rector

> **Un hecho económico se registra una vez. El asiento y el documento nacen juntos o no nace ninguno.**

Corolarios innegociables:

- Ningún saldo contable es un campo que se actualiza. Todo saldo es una agregación sobre líneas de asiento.
- Si el asiento falla, el documento no se emite. Misma `$transaction`, sin excepción.
- Un asiento contabilizado no se edita ni se borra jamás. Se corrige con reverso.

## Reglas del proyecto (heredadas de CLAUDE.md, vigentes)

- TypeScript estricto. Cero `any`, cero `@ts-ignore`.
- Toda Server Action retorna `ActionResult<T>`.
- Toda query Prisma lleva `where: { companyId }`.
- Toda Server Action abre con `requireAuthWithPermission(...)`. Nunca `requireAuth(roles)`.
- CLP como enteros. Formato `$ 1.250.000`.
- Bajo driver adapters, `error.meta.target` no existe: usar `src/lib/prisma-errors.ts`.
- Excel con `exceljs`. El paquete `xlsx` de npm está vetado por vulnerabilidades sin parche.
- No crear abstracciones ni archivos que no se pidan explícitamente.

## Reglas de esta ampliación

1. **No romper lo que funciona.** `scripts/verify-erp.ts` debe seguir pasando 22/22 en cada fase, más las verificaciones nuevas que se agreguen.
2. **Nada de números aproximados.** Si un ratio no se puede calcular con los datos disponibles, la interfaz muestra "sin datos". Jamás un cero, jamás una estimación silenciosa.
3. **Cada fase cierra con `npx tsc --noEmit` en 0 errores** y las suites de Jest en verde.
4. **Respetar los GATE.** Detenerse y esperar aprobación explícita.
5. Si una instrucción de este documento choca con el código real, **decirlo antes de forzarla**.

---

# FASE A — Deuda crítica previa

Trabajo corto. Nada de esto es opcional y todo bloquea lo demás.

## A.1 Rotación de secretos

`JWT_SECRET` estuvo expuesto. Con ese valor, cualquiera firma un token para cualquier `userId`. `getAuthContext()` relee la base, pero relee **el usuario que el token afirma ser**: el aislamiento multi-tenant y la bandera `isSuperAdmin` quedan completamente sorteados.

- Rotar `JWT_SECRET` en Vercel (scope `erp-f3ca`) y en local. Todas las sesiones caen; es el efecto esperado.
- Rotar la API key de Resend y la de Brevo si estuvo expuesta.
- Escanear el historial de git en busca de secretos commiteados (`git log -S`, o herramienta de escaneo). Reportar hallazgos sin corregir el historial todavía.
- Verificar que `.env*` está en `.gitignore` y que existe `.env.example` sin valores reales.

## A.2 Corregir la deriva de CLAUDE.md

`CLAUDE.md` declara roles `ADMIN/VENDEDOR/BODEGUERO/CONTADOR/SOPORTE/RRHH`. El schema usa `OWNER/ADMIN/SALES/WAREHOUSE/ACCOUNTANT`.

El schema es la fuente de verdad. Corregir `CLAUDE.md`. Este archivo es la autoridad que se lee al inicio de cada sesión: mientras esté desactualizado, todo trabajo sobre RBAC parte de una premisa falsa.

Revisar de paso el resto del archivo contra el código y reportar cualquier otra divergencia.

> ## GATE A — DETENTE

---

# FASE B — Núcleo contable

## B.1 Modelo de datos

Nuevos modelos en `prisma/schema.prisma`, todos con `companyId` e índice compuesto.

**`Account`** — plan de cuentas
- `code` (String, único por empresa), `name`, `parentId` (autorelación)
- `type`: enum `ASSET | LIABILITY | EQUITY | REVENUE | COST | EXPENSE`
- `nature`: enum `DEBIT | CREDIT` (naturaleza del saldo)
- `isPostable` (Boolean) — solo las hojas reciben asientos; las agrupadoras suman
- `isCurrent` (Boolean, nullable) — corriente / no corriente, necesario para clasificar el balance
- `costBehavior`: enum `FIXED | VARIABLE | NONE` — necesario para punto de equilibrio
- `cashFlowCategory`: enum `OPERATING | INVESTING | FINANCING | NONE` — necesario para el flujo de efectivo
- `isActive`

**`AccountMapping`** — puente entre semántica y plan de cuentas
- `key` (String, único por empresa): `CAJA`, `BANCO`, `CLIENTES`, `PROVEEDORES`, `IVA_DEBITO`, `IVA_CREDITO`, `IVA_POR_PAGAR`, `PPM_POR_RECUPERAR`, `EXISTENCIAS`, `VENTAS_AFECTAS`, `VENTAS_EXENTAS`, `COSTO_VENTAS`, `DIFERENCIA_INVENTARIO`, `RETENCION_HONORARIOS`, `RESULTADO_EJERCICIO`, `RESULTADOS_ACUMULADOS`
- `accountId`

Esto es lo que permite que el motor de asientos no tenga códigos de cuenta incrustados. Cada empresa puede tener su plan y el motor sigue funcionando.

**`AccountingPeriod`**
- `year`, `month`, `status`: enum `OPEN | CLOSED | LOCKED`
- `closedAt`, `closedByUserId`
- Único por `(companyId, year, month)`

**`JournalEntry`** — cabecera
- `entryNumber` (correlativo por empresa y año, sin huecos)
- `date`, `description`, `periodId`
- `status`: enum `DRAFT | POSTED | REVERSED`
- `sourceType`: enum `SALES_DOCUMENT | PURCHASE_DOCUMENT | PAYMENT | INVENTORY_MOVEMENT | CASH_SHIFT | MANUAL | OPENING | CLOSING`
- `sourceId` (String, nullable) — trazabilidad al documento origen
- `reversalOfId` / `reversedById` (autorelación)
- `postedAt`, `createdByUserId`

**`JournalLine`**
- `entryId`, `accountId`, `debit` (Int), `credit` (Int), `description`, `lineNumber`
- Referencias opcionales: `customerId`, `supplierId`, `productId`, `costCenterId`
- Restricción: exactamente uno de `debit`/`credit` es mayor que cero, el otro es cero. Nunca ambos, nunca negativos.

**`CostCenter`** — necesario para abrir el estado de resultados por unidad de negocio.

## B.2 Invariantes forzados en base de datos

Prisma no puede expresar esto. Escribir migración SQL manual:

- **Cuadratura**: la suma de `debit` debe igualar la suma de `credit` por cada `JournalEntry` en estado `POSTED`. Implementar con trigger `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` que valide al confirmar la transacción. Un asiento descuadrado no debe poder existir ni por error de programación.
- **Signos**: `CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0))`.
- **Inmutabilidad**: trigger que rechace `UPDATE` (salvo transición a `REVERSED` y sus campos de reverso) y `DELETE` sobre entradas `POSTED`, y cualquier `UPDATE`/`DELETE` sobre sus líneas.
- **Solo cuentas hoja**: trigger o validación que rechace líneas contra cuentas con `isPostable = false`.

Escribir un test que intente violar cada uno de estos invariantes **por SQL crudo, saltándose la capa de aplicación**, y verifique que la base los rechaza.

## B.3 Motor de asientos

`src/modules/accounting/services/journal.service.ts`

- `createEntry(tx, input)` — recibe el cliente de transacción como parámetro, **nunca abre su propia transacción**. Esto es lo que permite que el asiento nazca dentro de la `$transaction` del documento.
- Valida: período abierto, cuentas existentes y posteables, cuadratura, empresa correcta en todas las cuentas.
- `postEntry`, `reverseEntry(entryId, reason)`.
- Numeración correlativa con el mismo patrón de `FolioSequence`: `upsert` dentro de la transacción, con `LOCKING_TX_OPTIONS`.

`src/modules/accounting/services/ledger.service.ts`

- `getAccountBalance(companyId, accountId, dateFrom, dateTo)`
- `getTrialBalance(companyId, period)` — balance de comprobación de 8 columnas
- `getLedger(companyId, accountId, dateFrom, dateTo)` — mayor con saldo corrido

**Rendimiento.** Empezar agregando sobre `JournalLine` con índices adecuados. Medir con el seed de doce meses (Fase G). Solo si hay evidencia de lentitud, introducir una tabla de saldos por cuenta y período — y en ese caso, **debe ser reconstruible desde cero** con un comando que la regenere y compare contra el cálculo directo, fallando ruidosamente ante cualquier diferencia.

## B.4 Plan de cuentas base para pyme chilena

Sembrar este plan al activar el módulo, editable por la empresa:

```
1 ACTIVO
  11 Activo Corriente
    1101 Caja                          [CAJA]
    1102 Banco                         [BANCO]
    1103 Clientes                      [CLIENTES]
    1104 Documentos por cobrar
    1105 IVA Crédito Fiscal            [IVA_CREDITO]
    1106 PPM por recuperar             [PPM_POR_RECUPERAR]
    1107 Existencias                   [EXISTENCIAS]
    1108 Anticipos a proveedores
  12 Activo No Corriente
    1201 Activo fijo
    1202 Depreciación acumulada        (contra-activo)
    1203 Intangibles

2 PASIVO
  21 Pasivo Corriente
    2101 Proveedores                   [PROVEEDORES]
    2102 Documentos por pagar
    2103 IVA Débito Fiscal             [IVA_DEBITO]
    2104 IVA por pagar                 [IVA_POR_PAGAR]
    2105 PPM por pagar
    2106 Retenciones por pagar         [RETENCION_HONORARIOS]
    2107 Remuneraciones por pagar
    2108 Provisiones
    2109 Obligaciones financieras c/p
  22 Pasivo No Corriente
    2201 Obligaciones financieras l/p

3 PATRIMONIO
  3101 Capital
  3102 Resultados acumulados           [RESULTADOS_ACUMULADOS]
  3103 Resultado del ejercicio         [RESULTADO_EJERCICIO]

4 INGRESOS
  4101 Ventas afectas                  [VENTAS_AFECTAS]
  4102 Ventas exentas                  [VENTAS_EXENTAS]
  4103 Otros ingresos
  4104 Devoluciones y descuentos       (contra-ingreso)

5 COSTOS
  5101 Costo de ventas                 [COSTO_VENTAS]
  5102 Diferencias de inventario       [DIFERENCIA_INVENTARIO]

6 GASTOS
  6101 Remuneraciones
  6102 Arriendos
  6103 Servicios básicos
  6104 Gastos financieros
  6105 Depreciación del ejercicio
  6106 Otros gastos operacionales
```

Variar la siembra según `CompanySettings.industryType` donde tenga sentido (una empresa `SERVICES` no necesita `Existencias` ni `Costo de ventas` con el mismo peso que una `DISTRIBUTION`).

## B.5 Permisos y feature flag

- Agregar `hasAccounting` a `CompanyFeatures`.
- Registrar el módulo en `MODULES[]` de `src/lib/auth/modules.ts`: flag, permisos y prefijos de ruta. Esto hace que sidebar, guards y panel superadmin se deriven solos.
- Permisos nuevos en `PERMISSIONS`: `accounting.view`, `accounting.post`, `accounting.manual_entry`, `accounting.close_period`, `accounting.manage_accounts`, `reports.financial`.
- Asignación por rol base: `ACCOUNTANT` y `OWNER` con todos; `ADMIN` sin `close_period`; `SALES` y `WAREHOUSE` sin ninguno.
- Verificar que `sanitizePermissions` descarte estos permisos cuando `hasAccounting` está apagado.

## B.6 Pruebas de la fase

Nueva suite `tests/accounting-core`:
- Asiento cuadrado se guarda; descuadrado es rechazado por la aplicación **y** por la base.
- Asiento `POSTED` no se puede editar ni borrar por ninguna vía.
- Reverso genera contrapartida exacta y enlaza ambas entradas.
- Período cerrado rechaza escrituras.
- Balance de comprobación cuadra: suma de débitos igual a suma de créditos.
- Aislamiento multi-tenant: no se puede postear contra una cuenta de otra empresa.

> ## GATE B — DETENTE
> Mostrar schema final, migraciones SQL de invariantes y la suite pasando.

---

# FASE C — Integración con los módulos existentes

Aquí es donde el ERP se vuelve un sistema único. **Ningún módulo existente cambia su comportamiento operativo**: solo se le agrega la emisión del asiento dentro de la transacción que ya tiene.

## C.1 Reglas de asiento por documento

Definir en `src/modules/accounting/posting-rules/`, una regla por tipo de documento, todas resolviendo cuentas vía `AccountMapping`.

**Venta `FACTURA_33` / `BOLETA_39`** (afecta)
```
D  CLIENTES (o CAJA si el pago es contado)      total
   H  VENTAS_AFECTAS                            neto
   H  IVA_DEBITO                                iva
```
más el asiento de costo, si el documento movió stock:
```
D  COSTO_VENTAS       Σ (unitCostPMP × cantidad)
   H  EXISTENCIAS     mismo monto
```
Usar `SalesDocumentItem.unitCostPMP` — el snapshot ya existe y es exactamente lo que se necesita.

**Venta `FACTURA_EXENTA_34`**: igual, contra `VENTAS_EXENTAS`, sin línea de IVA.

**`NOTA_CREDITO_61`**: reverso completo, incluyendo la reversión de costo por el `ADJUSTMENT_IN` que ya genera.

**Compra `FACTURA`** (mercadería)
```
D  EXISTENCIAS        neto
D  IVA_CREDITO        iva
   H  PROVEEDORES     total
```
Si la compra es de gasto y no de inventario, contra la cuenta de gasto correspondiente en vez de `EXISTENCIAS`.

**`Payment` tipo `INCOME`**
```
D  CAJA o BANCO       monto
   H  CLIENTES        monto
```

**`Payment` tipo `EXPENSE`**
```
D  PROVEEDORES        monto
   H  CAJA o BANCO    monto
```

**Ajuste de inventario `ADJUSTMENT_IN`**
```
D  EXISTENCIAS                cantidad × PMP
   H  DIFERENCIA_INVENTARIO   mismo monto
```
`ADJUSTMENT_OUT` a la inversa.

**Transferencia entre bodegas**: sin efecto contable (no cambia el valor total del inventario). Documentar explícitamente que la ausencia de asiento es deliberada.

## C.2 Puntos de enganche en el código existente

En cada uno, el asiento se emite **dentro** de la `$transaction` ya existente, después de persistir el documento:

- `src/modules/sales/` — emisión de documento y anulación
- `src/modules/purchases/` — recepción y factura
- `src/modules/treasury/` — registro de pago
- `src/modules/inventory/services/stock.service.ts` — solo para ajustes, no para movimientos ya cubiertos por venta o compra (cuidado con el doble conteo: una venta genera su costo desde la regla de venta, no desde el movimiento de stock)
- POS `closeShift` — evaluar si el turno genera asiento de resumen o si cada boleta ya lo generó. **Recomendación: cada boleta genera el suyo**, y el cierre de turno solo registra el descuadre contra una cuenta de diferencias de caja. Si el descuadre no queda contabilizado, se pierde.

**Regla de oro para evitar doble conteo:** cada hecho económico tiene exactamente un punto de emisión. Documentar la matriz completa en `docs/INTEGRACION_CONTABLE.md` antes de programar, y revisarla contra el código al terminar.

## C.3 Cuadraturas automáticas

Esta es la característica que separa un ERP confiable de uno que solo parece funcionar. Implementar `src/modules/accounting/services/reconciliation.service.ts`:

| Cuadratura | Debe coincidir |
|---|---|
| Existencias | Saldo contable de `EXISTENCIAS` **=** Σ (stock × PMP) sobre todas las bodegas |
| Clientes | Saldo de `CLIENTES` **=** Σ (`totalAmount` − `paidAmount`) de ventas emitidas |
| Proveedores | Saldo de `PROVEEDORES` **=** Σ pendiente de compras |
| IVA Débito | Saldo del período **=** débito fiscal calculado por `f29.ts` |
| IVA Crédito | Saldo del período **=** crédito fiscal calculado por `f29.ts` |
| Caja | Saldo de `CAJA` **=** esperado acumulado de turnos cerrados |

Las dos de IVA son especialmente valiosas: validan dos cálculos independientes uno contra otro. Si difieren, hay un error real en alguno de los dos y hay que encontrarlo.

Exponer un panel de cuadraturas con semáforo y detalle de la diferencia. Añadir estas verificaciones a `scripts/verify-erp.ts`.

## C.4 Datos históricos

La empresa ya tiene documentos registrados sin asiento. Proceder así:

1. Escribir `scripts/backfill-accounting.ts` que recorra los documentos históricos en orden cronológico y genere sus asientos aplicando las mismas reglas.
2. **Ejecutarlo primero en modo simulación**, produciendo un informe: cuántos asientos generaría, qué saldos resultarían, qué documentos no pudo mapear y por qué.
3. Contrastar los saldos resultantes contra las cifras que ya se conocen por otra vía (F29 calculado, stock valorizado, CxC).
4. Solo tras validar, ejecutar en firme dentro de una transacción única, con posibilidad de revertir.

Si algún documento histórico no se puede mapear limpiamente, **no forzarlo**: registrarlo en el informe y resolverlo con un asiento de apertura manual. Un backfill que inventa asientos para no dejar huecos es peor que un backfill incompleto y documentado.

> ## GATE C — DETENTE
> Mostrar el informe del backfill en simulación y el panel de cuadraturas en verde.

---

# FASE D — Estados financieros y libros

## D.1 Estados

Todos con comparativo de período anterior, variación absoluta y porcentual, y capacidad de abrir hasta el asiento y el documento de origen.

- **Balance de comprobación** de 8 columnas (saldo inicial, movimientos del período, saldos finales, deudor/acreedor).
- **Balance general clasificado**: corriente y no corriente según `Account.isCurrent`.
- **Estado de resultados**: por naturaleza, con subtotales de margen bruto, resultado operacional, EBITDA, resultado antes de impuestos y resultado del ejercicio. Con apertura por `CostCenter`.
- **Estado de flujo de efectivo**, método indirecto, usando `Account.cashFlowCategory`.
- **Libro diario** y **libro mayor**.

**Verificación cruzada obligatoria**: el resultado del ejercicio del estado de resultados debe coincidir con el del balance, y el efectivo final del flujo con el saldo de caja y banco del balance. Implementar como chequeo automático que falle ruidosamente, no como algo que se revisa a ojo.

## D.2 Libros para el SII

Ya estaban en la lista de pendientes y ahora salen casi gratis del modelo:

- **Libro de Ventas**: por período, con folio, fecha, RUT y razón social del cliente, neto, exento, IVA, total, por tipo de DTE.
- **Libro de Compras**: equivalente para el lado proveedor.
- Exportables en CSV con el formato que exige el SII, y en Excel para revisión interna.

## D.3 Cierre de período y de ejercicio

- Cierre mensual: valida que no queden asientos en borrador y que las cuadraturas estén en verde antes de permitir cerrar.
- Cierre anual: asiento de cierre que lleva ingresos, costos y gastos a `RESULTADO_EJERCICIO`, y traspaso a `RESULTADOS_ACUMULADOS`.
- Asiento de apertura del ejercicio siguiente.
- Reapertura de período: permitida solo con permiso `accounting.close_period`, registrada en `AuditLog`.

## D.4 F29 desde la contabilidad

El pendiente número 5 de la lista original. Ahora que existe el mayor:

- Pantalla en Tesorería para disparar `calculateAndStoreF29`.
- Mostrar el resultado **junto a la cuadratura contra los saldos contables** de `IVA_DEBITO` e `IVA_CREDITO`. Si difieren, no permitir dar el período por cerrado.

> ## GATE D — DETENTE

---

# FASE E — Ratios e inteligencia financiera

## E.1 Arquitectura del motor

Catálogo declarativo, no consultas escritas a mano por pantalla. `src/modules/analytics/ratios/`

```ts
{
  id: 'razon_corriente',
  nombre: 'Razón corriente',
  categoria: 'liquidez',
  formula: 'Activo corriente / Pasivo corriente',
  componentes: [...],        // agregados contables que alimentan cada término
  unidad: 'veces',           // veces | porcentaje | dias | monto
  direccion: 'mayor_mejor',  // mayor_mejor | menor_mejor | rango_optimo
  rangos: {...},             // por industryType, con valores por defecto
  interpretacion: '...',
  acciones: { bajo: [...], optimo: [...], alto: [...] },
  advertencias: [...],       // cuándo este ratio engaña
  requiere: [...]            // qué debe existir para poder calcularlo
}
```

Requisitos:
- **Trazabilidad completa**: desde cualquier ratio se abre el desglose y se llega a las cuentas, y desde ahí a los asientos y documentos.
- **Serie temporal**: mismo indicador en varios períodos con tendencia. Un ratio aislado dice poco.
- **Datos insuficientes**: si falta lo necesario, "sin datos". Nunca cero.
- **Casos degenerados resueltos explícitamente**: división por cero, patrimonio negativo, ventas en cero, primer período sin saldo inicial para promedios.
- **Rangos por `industryType`**: los cinco valores del enum ya existente. Un `RETAIL` y una `LIGHT_MANUFACTURING` no comparten benchmarks. Mostrar en la interfaz qué referencia se está usando.

## E.2 Catálogo

### Liquidez
| Indicador | Fórmula |
|---|---|
| Razón corriente | Activo corriente / Pasivo corriente |
| Prueba ácida | (Activo corriente − Existencias) / Pasivo corriente |
| Razón de efectivo | (Caja + Banco) / Pasivo corriente |
| Capital de trabajo neto | Activo corriente − Pasivo corriente |

### Actividad
| Indicador | Fórmula |
|---|---|
| Rotación de existencias | Costo de ventas / Existencias promedio |
| Días de inventario | 365 / Rotación de existencias |
| Rotación de clientes | Ventas a crédito / Clientes promedio |
| Días de cobro (DSO) | 365 / Rotación de clientes |
| Rotación de proveedores | Compras / Proveedores promedio |
| Días de pago (DPO) | 365 / Rotación de proveedores |
| **Ciclo de conversión de efectivo** | **Días inventario + DSO − DPO** |
| Rotación de activos | Ventas / Activos totales promedio |

El ciclo de conversión de efectivo es el indicador operativo más importante del sistema: cada día que se reduce libera caja sin necesidad de financiamiento. Debe estar en el dashboard principal, no escondido en un reporte.

### Endeudamiento
| Indicador | Fórmula |
|---|---|
| Razón de endeudamiento | Pasivo total / Activo total |
| Deuda sobre patrimonio | Pasivo total / Patrimonio |
| Cobertura de intereses | Resultado operacional / Gastos financieros |
| Deuda financiera neta / EBITDA | (Obligaciones financieras − Efectivo) / EBITDA |
| Solvencia | Activo total / Pasivo total |

### Rentabilidad
| Indicador | Fórmula |
|---|---|
| Margen bruto | (Ventas − Costo de ventas) / Ventas |
| Margen operacional | Resultado operacional / Ventas |
| Margen neto | Resultado del ejercicio / Ventas |
| Margen EBITDA | EBITDA / Ventas |
| ROA | Resultado del ejercicio / Activos promedio |
| ROE | Resultado del ejercicio / Patrimonio promedio |
| ROIC | Resultado operacional después de impuestos / Capital invertido |

**ROE lleva advertencia obligatoria en la interfaz**: sube al endeudarse más, sin que el negocio haya mejorado. Mostrarlo siempre acompañado de la razón de endeudamiento.

### DuPont
```
ROE = Margen neto × Rotación de activos × Multiplicador de apalancamiento
      (rentabilidad)  (eficiencia)         (financiamiento)
```
Tres barras comparables entre períodos. Es la vista más valiosa del módulo: no dice cuánto rinde el negocio, dice **de dónde viene** ese rendimiento.

### Punto de equilibrio
Usa `Account.costBehavior`.

| Indicador | Fórmula |
|---|---|
| Margen de contribución | (Ventas − Costos variables) / Ventas |
| Punto de equilibrio | Costos fijos / Margen de contribución |
| Margen de seguridad | (Ventas − Punto de equilibrio) / Ventas |
| Apalancamiento operativo | Margen de contribución / Resultado operacional |

### Inventario
Desde el kardex existente, sin necesidad de contabilidad:
- Clasificación ABC por valor de consumo
- Rotación por SKU
- **Existencias sin movimiento**: cantidad y valorización de lo que no rota hace más de N días. Suele ser el hallazgo más accionable de todo el sistema
- Cobertura en días por producto
- Exactitud de inventario contra conteo físico
- Quiebres de stock y venta perdida estimada

### Señales agregadas
- **Z-Score de Altman**, con advertencia visible de que su calibración original es para manufactura de cierto tamaño y en otros contextos es referencial.
- **Alertas por deterioro de tendencia**: un indicador que cae tres períodos seguidos aunque siga dentro de rango. La tendencia anticipa el problema que el valor puntual todavía no muestra.

## E.3 Dashboards

- Tarjetas con valor, variación y tendencia.
- Semáforo **con el criterio visible**: al pasar el cursor se muestra fórmula, rango aplicado, industria de referencia y origen del dato. Un semáforo verde sin criterio visible induce peores decisiones que no mostrar nada.
- Todo gráfico permite abrir hasta el documento.
- Filtros persistentes por período, centro de costo y bodega.
- Usar Recharts, ya está en el stack.

> ## GATE E — DETENTE

---

# FASE F — Excel

Con `exceljs`. Recordar que `xlsx` de npm está vetado.

## F.1 Exportación

- **Formato real**: encabezados con estilo, columnas dimensionadas, paneles congelados, autofiltro, formato numérico CLP entero, agrupación donde hay jerarquía.
- **Hoja de portada** en cada libro: contenido, período, filtros aplicados, fecha de generación, usuario. Un archivo que circula por correo sin contexto genera decisiones equivocadas.
- **Fórmulas vivas en el libro de análisis financiero**: los datos base en una hoja, los ratios como fórmulas de Excel que apuntan a ella. Así el usuario simula escenarios cambiando un supuesto. Esto es lo que separa un export decente de uno excelente, y es exactamente lo que se pidió.

**Libros a generar:**
1. **Análisis financiero**: balance, estado de resultados, flujo, ratios con fórmulas vivas, DuPont, comparativo de períodos.
2. **Inventario valorizado**: existencias por bodega, ABC, rotación por SKU, sin movimiento, cobertura.
3. **Cuentas corrientes**: CxC y CxP con antigüedad por tramos y detalle de documentos.
4. **Libro mayor** por cuenta y período.
5. **Libros de Ventas y Compras** para el SII.

Reutilizar lo que ya exista en `tests/report-workbook` y su implementación.

- **Volumen**: generación en streaming para conjuntos grandes. Si supera un umbral, generar en segundo plano y avisar al terminar. No bloquear la interfaz ni agotar la memoria del proceso.
- Registrar cada exportación en `AuditLog` con acción `EXPORT`, que ya está soportada.

## F.2 Importación

- Plantillas descargables con validación en la hoja y fila de ejemplo.
- **Validación previa obligatoria**: procesar, mostrar informe de errores por fila y columna, y recién entonces permitir confirmar. Nunca importar a medias.
- Todo o nada, en una transacción.
- Casos: plan de cuentas, saldos de apertura, maestros, inventario inicial, cartola bancaria para conciliación.
- Registro de cada importación con posibilidad de revertir.

> ## GATE F — DETENTE

---

# FASE G — Cierre: diseño, pendientes y calidad

## G.1 Unificar el sistema visual

Hoy conviven la paleta neutra de shadcn y "Obsidian HUD" a medias. **La solución no es eliminar una**, sino formalizar cuándo aplica cada una:

- **Obsidian HUD** para POS y pantallas de operación dedicada: sesión de pie, alto contraste, poca densidad de datos. Ahí funciona bien y ya está aplicado.
- **Paleta neutra** para el dashboard de datos: tablas largas, reportes, contabilidad. El `backdrop-blur-xl` repetido cuesta rendimiento real al hacer scroll sobre miles de filas, y la legibilidad en tablas densas es peor.

Documentar la regla en `docs/DISENO.md` con los tokens de cada tema y su ámbito de aplicación. El problema actual no es que haya dos temas: es que nadie sabe cuál aplica dónde.

**Para las pantallas contables y financieras**, exigencias específicas:
- **Tipografía monoespaciada con variantes tabulares para todas las cifras.** No es capricho: las columnas de números alineados se comparan visualmente mucho más rápido, y un balance se lee comparando columnas.
- Débitos y créditos claramente diferenciados, y los negativos legibles sin ambigüedad.
- Los colores de estado nunca comunican solos: siempre acompañados de ícono o texto, porque el rojo y el verde no son distinguibles para una parte de los usuarios.
- Contraste WCAG AA, foco de teclado visible, navegación completa por teclado.

Extender el `CommandMenu` existente a las nuevas rutas contables.

## G.2 Branding por empresa

- Campos nuevos en `Company` para color de marca (migración).
- Upload real de logo: hoy solo hay `logoUrl` pegada a mano. Requiere configurar Vercel Blob o equivalente.
- Aplicar en documentos impresos, tickets y exportaciones.

## G.3 Pendientes de la lista original

**Anulación en POS (punto 8).** Es el fraude clásico de caja: cobrar en efectivo, anular la boleta, quedarse con el billete, y el arqueo cuadra perfecto. Que ya se expongan `cancelledCount/cancelledTotal` fue buen instinto. Implementar:
- Anulación libre dentro de una ventana breve tras la emisión (configurable, sugerido 5 minutos) para el error de tipeo legítimo.
- Pasada esa ventana, exige autorización de supervisor con motivo, registrado en `AuditLog`.
- Alerta en el cierre cuando las anulaciones de un cajero superan un porcentaje de su turno. **El patrón se detecta por frecuencia, no por evento aislado.**

**PMP al anular venta (punto 7).** Ser consistente con la decisión ya tomada en compras, donde se bloqueó la cancelación porque revertir un promedio no tiene solución exacta. Como el kardex guarda `previousPmp`, la reversión exacta **sí es posible cuando es el último movimiento del producto**. Implementar: reversión exacta si no hubo movimientos posteriores, repromedio al costo snapshot si los hubo, y en ambos casos registrar explícitamente qué camino se tomó y por qué.

**Ticket térmico 58mm (punto 6).**

## G.4 Seed realista

Extender el seed a **doce meses de operación con estacionalidad**: varios clientes y proveedores, catálogo con productos de alta y baja rotación, inventario sin movimiento, cuentas por cobrar vencidas, gastos operativos mensuales, algún activo fijo con depreciación.

Esto no es cosmético: **los ratios solo se pueden evaluar contra datos que se parezcan a la realidad.** Con tres facturas de ejemplo, el módulo financiero no demuestra nada y no se puede medir su rendimiento.

## G.5 Pruebas

Extender `scripts/verify-erp.ts` con:
- Ciclo completo compra → venta → cobro, verificando el efecto en inventario **y** en contabilidad.
- Las seis cuadraturas de C.3 en verde.
- Balance cuadrado tras cada operación.
- Estado de resultados coincidente con el balance.
- F29 coincidente con los saldos contables de IVA.
- Cierre de período y de ejercicio.

Nuevas suites Jest: `accounting-core`, `posting-rules`, `financial-statements`, `ratios`.

**Pruebas de invariantes**: generar operaciones aleatorias y verificar tras cada una que el debe sigue igual al haber, que el kardex cuadra con existencias y que los estados financieros cierran.

## G.6 Documentación final

- `docs/CONTABILIDAD.md` — modelo, plan de cuentas, decisiones tomadas y alternativas descartadas
- `docs/INTEGRACION_CONTABLE.md` — matriz de documento a asiento
- `docs/RATIOS.md` — catálogo con fórmulas y fuentes
- `docs/DISENO.md` — los dos temas y su ámbito
- `docs/PENDIENTES.md` — lo que quedó fuera, con su razón
- Actualizar `CLAUDE.md` con las reglas nuevas del módulo contable

## G.7 Informe de cierre

Honesto: qué quedó funcional, qué parcial, qué no se hizo, qué riesgos persisten, y los tres siguientes pasos de mayor impacto.

---

## Fuera de alcance de este documento

**DTE real** (XML, firma con CAF, envío al SII) sigue siendo el bloqueador para uso tributario en producción, y no se aborda aquí. Antes de construirlo desde cero, evaluar integrar con un proveedor autorizado: implementarlo bien es un proyecto en sí mismo y mantenerlo al día con los cambios normativos es carga permanente. Como los tipos de DTE y la secuencia de folios ya están modelados, la superficie de integración es acotada.

---

## Por qué fases

**El contexto se agota.** Este trabajo no cabe en una sesión. A mitad de camino las decisiones del principio ya no están presentes y aparecen inconsistencias.

**Los errores estructurales se propagan.** Si las reglas de asiento quedan mal en la Fase C, las fases D a G se construyen encima. Corregirlo después significa regenerar todos los asientos.

**Y sobre todo: aquí los errores son de números.** Un bug de interfaz se ve. Un asiento mal armado produce estados financieros que parecen correctos y no lo son, y nadie lo nota hasta que un contador externo lo revisa. Por eso cada fase termina en cuadraturas verificables, y por eso los GATE existen para que revises.
