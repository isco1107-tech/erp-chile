# Hoja de ruta del ERP

Estado verificado el 2026-09-24 contra el código, sobre la auditoría del 2026-09-14 (`docs/auditoria-2026-09-14/`, 63 fichas). Cada ficha pendiente cita su ID: el detalle, la evidencia y el criterio de aceptación están en la ficha original.

## Estado de la auditoría

| Área | Resuelto | Parcial | Pendiente | No verificable |
|---|---|---|---|---|
| Seguridad (SEG) | 8 | 1 | 5 | 0 |
| Negocio e integridad (N) | 3 | 2 | 14 | 0 |
| Operación (OP) | 0 | 4 | 11 | 1 |
| Interfaz (UX) | 5 | 2 | 7 | 0 |

Incluye lo corregido el 2026-09-24: SEG-09 (limitador), SEG-10 (empresas suspendidas en webhooks y calendario), N-01 (NC en borrador), N-05 en notas de crédito (líneas repetidas), N-08 (aprobar compras anuladas) y N-09 (doble anulación). N-05 sigue parcial en recepciones de OC.

## Olas de trabajo

Una ficha, o un grupo chico de fichas relacionadas, por PR. Cada PR con test de regresión que falle con el código anterior.

### Ola 1: seguridad (pendientes de riesgo real)
- **SEG-05**: cambiar de empresa emite un JWT sin fila de sesión, imposible de revocar por dispositivo.
- **SEG-12**: el webhook de ZapSign descarga y sube el PDF antes de validar el token local, y responde 200 ante cualquier error.
- **SEG-13**: falta verificar la firma binaria en pagarés, y mensajería sube el adjunto antes de comprobar que el usuario participa.
- **SEG-07**: la lista de IP permitidas no se revalida en cada request ni al cambiar de empresa.
- **OP-06**: si falla el marcado de un webhook de n8n ya aplicado, el reintento vuelve a abonar el pago.
- **OP-07**: los tokens de confirmación de acciones de IA se marcan como usados solo en la memoria de cada instancia; en otra instancia se pueden reutilizar.
- SEG-06 (almacenamiento privado con URL expirable) y SEG-14 (CSP sin `unsafe-inline`/`unsafe-eval`) son proyectos más grandes: planificarlos aparte.

### Ola 2: dinero y stock
- **N-11 / N-03**: anular una venta cobrada deja vivo el asiento del cobro; la aplicación de notas de crédito mezcla dinero y crédito. Requiere un libro de aplicaciones.
- **N-07**: nada serializa venta, cierre y anulación de un mismo turno de caja.
- **N-10**: ventas toma el costo PMP antes del lock; POS ya usa el costo del movimiento.
- **N-02**: facturar una guía no registra costo contable; la anulación repone según el tipo de documento y no según el efecto real.
- **N-04**: una NC puede referenciar un documento de otro cliente y no tiene tope contra el saldo.
- **N-06 / N-05 (OC)**: el cruce de compras deja líneas sin vínculo como MATCHED; las líneas repetidas superan lo disponible.
- **N-12**: una venta por transferencia se contabiliza en CAJA.
- **N-17**: la unicidad del folio de compras ignora el tipo de documento (requiere migración).
- **N-15**: cuotas, pagarés y auspicios no generan `Payment`, así que el flujo de caja no los ve.
- **N-18 / N-19**: la importación histórica permite `paidAmount > total`; la conciliación suma arqueos históricos.
- **N-16 (parcial)**: una clave de idempotencia repetida con otro contenido devuelve el documento anterior en vez de rechazarse.

### Ola 3: contabilidad y tributario
- **N-13**: el F29 no guarda un snapshot, usa la tasa de PPM actual para meses pasados y no invalida en cascada.
- **N-14**: existe el permiso `accounting:close_period`, pero no el flujo de cierre y reapertura.
- **OP-15**: firma XML-DSig, envío al SII, Track ID y clasificación del origen fiscal en el F29. Cuando se construya el envío, bloquear la anulación de DTE ya enviados (ver `CONTEXT.md`, "Anular").

### Ola 4: operación
- **OP-11 + UX-14**: CI con `next build`, PostgreSQL efímero con migraciones desde cero y recorridos E2E con Playwright. Es la base para validar las olas 2 y 3 con concurrencia real.
- **OP-01**: separar los entornos. Hoy desarrollo apunta a la base de producción.
- **OP-05 / OP-09**: outbox persistente para automatizaciones; lease por empresa, tarea y período en los crons.
- **OP-08 / OP-16**: timeout en el envío de correo, estados reales por proveedor y destinatarios según sus permisos efectivos (roles personalizados incluidos).
- **OP-10 / OP-02 / OP-04**: exportaciones en streaming; respaldo con perfil de empresa completo y snapshot consistente.
- **OP-13**: sacar del repo los `.xlsx` y `.log` versionados, corregir el README y mover `@prisma/adapter-pg` a `dependencies`.

### Ola 5: experiencia de uso
- **UX-01**: búsqueda de clientes y productos en el servidor, en vez de cargar 200 o 300 filas.
- **UX-04 / UX-05**: la mensajería mezcla respuestas y borradores entre conversaciones, y no ve el primer mensaje de un hilo vacío.
- **UX-06 / UX-10**: los listados aplican respuestas fuera de orden y no manejan fallas de red.
- **UX-09**: los botones se muestran sin considerar los permisos del usuario.
- **UX-11**: el borrador de venta y el carrito del POS se pierden al recargar.
- **UX-13**: los errores de formulario no están enlazados al campo (`aria-describedby`).

## Automatizaciones

Disparadores disponibles en el motor: 23, 7 de ellos agregados el 2026-09-24 (cuota pagada, pagaré pagado, honorarios pagados, cierre de turno con diferencia, compra revisada, mercadería recibida, vacaciones revisadas).

Próximos candidatos, cuando exista el dato que los produce:
- **Presupuesto excedido:** `Payment.budgetLineId` existe, pero nadie lo escribe.
- **Aviso de CAF por vencer por fecha:** hoy el aviso solo mira la cantidad de folios.
- **Resumen de automatizaciones fallidas del día:** depende del outbox de OP-05.

## IA del producto

Cada uso de IA elige un nivel de capacidad (`src/modules/agents/services/model-tiers.ts`), configurable con `GEMINI_MODEL_LITE`, `GEMINI_MODEL_STANDARD` y `GEMINI_MODEL_REASONING`. Sin configurar, todos usan `gemini-3.6-flash`. Los niveles de razonamiento tienen menos cuota gratuita por minuto, compartida entre todas las empresas.

## Cómo ejecutar cada ola con agentes

| Paso | Agente (`.claude/agents/`) | Modelo |
|---|---|---|
| Ubicar el código de la ficha | `code-scout` | haiku |
| Implementar con test de regresión | `fullstack-developer` / `test-writer` | sonnet |
| Revisar dinero, impuestos y DTE | `chile-tax-dte-specialist` | opus |
| Revisar permisos y tenant | `security-multitenant-guardian` | opus |
| Revisar migraciones | `prisma-schema-guardian` | sonnet |
| Cierre antes del merge | `integration-flow-auditor` | sonnet |

Los revisores de modelo opus solo entran en PR que tocan su área: son los más caros.
