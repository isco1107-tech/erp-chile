# Auditoría de operación, arquitectura e integraciones

Fecha: 14 de septiembre de 2026. Revisión de código, configuración versionada y comprobaciones locales. No se consultó PostgreSQL de producción ni se inspeccionaron los paneles de Neon, Vercel, R2, correo o SII. Las condiciones efectivas de esos proveedores siguen pendientes de verificación. Las prioridades indican orden de tratamiento; no son puntuaciones CVSS ni evidencia de incidentes.

## OP-01 — Desarrollo conectado a producción — P0

**Evidencia:** `README.md:57` y `CLAUDE.md:95` documentan expresamente que la conexión local comparte la instancia de producción. El inicio rápido propone migración y seed en ese mismo contexto. La configuración Prisma carga variables de entorno y utiliza DIRECT_DATABASE_URL o DATABASE_URL (`prisma.config.ts`).

**Impacto:** un script de pruebas, un seed o una migración local puede modificar datos reales y descoordinar código/esquema. La advertencia escrita depende de que cada operador la recuerde. La declaración del repositorio está comprobada; no se contrastaron conexiones contra los proveedores.

**Corrección y aceptación:** separar desarrollo, integración, staging y producción, incluyendo usuarios de BD, buckets, correo e integraciones. Incorporar rechazo explícito del entorno productivo en scripts de pruebas/destrucción y usar datos sintéticos. El equipo debe poder instalar, migrar, sembrar y ejecutar CI sin disponer de credenciales productivas. Migraciones mediante revisión SQL y cambios compatibles entre versiones; recuperación ensayada antes de cambios de datos.

## OP-02 — Exportación incompleta para portabilidad — P1

**Evidencia:** `src/modules/backup/services/company-backup.service.ts:94` selecciona solamente modelos que tienen `companyId`; `:177` exporta de Company únicamente id, businessName y rut. La inspección local del DMMF confirma que `ConversationParticipant` no tiene companyId y queda fuera. Company contiene también domicilio, contacto, giro, comuna, branding y configuración comercial. El exportado contiene referencias de archivos, no sus bytes. Las exclusiones de credenciales y CAF son deliberadas y apropiadas para portabilidad.

**Impacto:** el archivo descrito como todos los datos no conserva participantes de conversaciones ni el perfil completo de empresa; los archivos referenciados pueden desaparecer fuera del JSON. Es una limitación concreta, aun sin prometer restauración.

**Corrección y aceptación:** conservar derivación automática del esquema, agregando resolutores auditados de pertenencia indirecta y un perfil permitido completo. Manifestar expresamente exclusiones, archivos y errores. Prueba que compara cada modelo y relación contra la exportación: todo dato de negocio tiene inclusión o exclusión justificada; las credenciales nunca se incorporan a este formato.

## OP-03 — Recuperación operativa sin evidencia de ensayo — P1

**Evidencia:** README y el servicio de backup aclaran que el JSON no es restaurable. No se encontró un procedimiento versionado y probado de restauración total o por empresa, de objetos y de material de cifrado. No se verificó la retención ni la configuración PITR efectiva de Neon; su existencia se menciona en un comentario y no basta para acreditar recuperabilidad.

**Impacto:** una exportación descargable no prueba cuánto dato se perdería ni cuánto tardaría recuperar el servicio. Restaurar PostgreSQL sin objetos o sin claves puede dejar datos inutilizables.

**Corrección y aceptación:** acordar RPO y RTO, respaldos cifrados, custodia separada de claves, inventario de objetos y recuperación por tenant. Ensayar en un entorno aislado pérdida de BD, objeto y empresa; registrar tiempos, conteos, integridad referencial y conciliación financiera. Objetivos iniciales de planificación: RPO máximo 1 hora y RTO máximo 4 horas, sujetos a confirmación de necesidades y capacidades contratadas. No son capacidades medidas del ERP.

## OP-04 — Backup sin snapshot consistente — P1

**Evidencia:** `company-backup.service.ts:116` pagina con `orderBy: id`, `skip` y `take`; `:195` recorre tablas mediante consultas separadas, fuera de una transacción con snapshot. Ordenar por ID no congela el conjunto: borrar una fila anterior desplaza offsets; insertar o actualizar durante el recorrido mezcla estados.

**Impacto:** filas omitidas o repetidas y relaciones/documentos/pagos que corresponden a instantes distintos. Aumentar páginas incrementa además el costo de OFFSET.

**Corrección y aceptación:** exportación consistente desde snapshot o réplica/copia aislada, manifiesto de punto de corte y paginación adecuada. Cursor mejora paginación, pero por sí solo no proporciona consistencia entre tablas. Probar inserciones/borrados concurrentes durante el exportado y comprobar integridad, conteos y saldos contra el mismo corte. La distinción entre Read Committed y un snapshot estable se fundamenta en la [documentación de PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).

## OP-05 — Automatizaciones sin persistencia previa ni recuperación durable — P1

**Evidencia:** ventas dispara `void emitWorkflowEvent(...)` después del commit (`src/modules/sales/services/sales.service.ts:430`, `:564`). El motor ejecuta acciones antes de crear WorkflowExecution (`src/lib/workflows/engine.ts:25`, `:54`). No persiste un evento pendiente en la transacción de negocio ni dispone de reintento persistente en este camino.

**Impacto:** terminar el proceso después de guardar una venta y antes de completar la promesa pierde la automatización. Una acción externa puede ejecutarse y fallar luego el registro de su resultado, impidiendo saber qué ocurrió. El catch protege la venta, pero no garantiza la entrega.

**Corrección y aceptación:** outbox transaccional —guardar el evento junto con la venta— y trabajador con estados, reintentos, clave por efecto y registro de fallos agotados. No mover HTTP/correo dentro de la transacción. Interrumpir el trabajador en cada frontera: la venta persiste y el evento se recupera sin duplicar los efectos que soporten idempotencia. Para proveedores sin ella, documentar reconciliación y garantía real de entrega.

## OP-06 — Webhook puede duplicar un abono después de fallo parcial — P1

**Evidencia:** `src/app/api/webhooks/route.ts:85` reclama evento, `:96` ejecuta el handler y `:97` marca procesado en operaciones separadas. Si falla el marcado, `:112` lo cambia a FAILED. El handler confirma un Payment mediante Tesorería antes de volver (`src/modules/webhooks/services/n8n-handler.service.ts:56`). `claimWebhookEvent` permite reclamar otra vez FAILED, pero no tiene vencimiento de CLAIMED (`webhook-idempotency.service.ts:89`).

**Escenario:** abono de 20 sobre deuda de 100 confirma; falla markProcessed; se marca FAILED; reintento vuelve a abonar 20 porque queda saldo. En otro punto de interrupción el evento puede quedar CLAIMED indefinidamente y sus reintentos reciben éxito como duplicado aunque el efecto no ocurrió.

**Corrección y aceptación:** una identidad financiera única por evento, vinculación persistente evento/pago y confirmación atómica cuando comparten BD. Distinguir trabajo en curso, procesado, fallido y abandonado; lease/recuperación con idempotencia del efecto. Inyectar fallos antes/después de commit y del marcado: el mismo evento representa exactamente un pago recuperable.

**Identificación adicional:** el handler busca ventas por empresa+folio (`:51`) y compras por empresa+folio (`:71`), sin tipo DTE ni emisor en compras. Puede escoger otro documento cuando coincide el número. Exigir documentId autorizado o identidad completa; rechazar búsquedas ambiguas. Se relaciona con N-17.

## OP-07 — Confirmaciones de IA protegidas contra repetición solo en memoria — P1

**Evidencia:** `src/modules/agent-actions/token.ts` almacena JTI usados en un Map global del proceso. `src/app/api/ai/manual-assistant/confirm/route.ts` consume el JTI y ejecuta después la acción; no existe transacción persistente que una ambos hechos. Firma, expiración, usuario, empresa y permisos sí se comprueban.

**Impacto:** el mismo token válido puede consumirse una vez en cada instancia o tras reinicio dentro de su vigencia. El propio handler menciona crear planes de pago como efecto sin restricción única. Un fallo de negocio también consume el token local antes de producir el resultado.

**Corrección y aceptación:** guardar intención y resultado en BD, con unicidad por tenant/JTI, huella de contenido y reintento definido; mantener confirmación humana y autorización vigente. En dos procesos y después de reinicio, confirmar una propuesta genera un único objeto; un fallo se distingue de una operación completada. Este riesgo también justifica límites de gasto de IA por tenant y observación de consumo, todavía no medidos.

## OP-08 — Correo no enviado contabilizado como éxito — P1

**Evidencia:** sin proveedor, `src/lib/email/mailer.ts:130` imprime destinatario, asunto y cuerpo completos y devuelve `logged`. Los crons semanal/mensual incrementan emailsSent si el resultado es distinto de failed (`weekly-report-cron.service.ts:60`, `monthly-closing-cron.service.ts:67`); workflows también lo informa como enviado (`src/lib/workflows/action-runner.ts:55`). Los fetch de ambos proveedores de correo no incluyen timeout explícito.

**Impacto:** invitaciones, recordatorios e informes pueden figurar exitosos sin entrega. El contenido de recuperación/invitación puede llegar a logs sin el saneador común. Una llamada colgada ocupa el presupuesto de ejecución.

**Corrección y aceptación:** en producción, configuración requerida y estados explícitos de pendiente/aceptado por proveedor/fallido; logged solo en desarrollo. No imprimir cuerpos con enlaces o datos privados; usar identificadores. Timeouts y reintentos idempotentes. Probar proveedor ausente, error 429/500 y timeout: ningún caso se contabiliza como envío real ni expone contenido sensible. La entrega al buzón requiere seguimiento del proveedor; aceptar HTTP no la prueba.

## OP-09 — Crons monolíticos sin checkpoints por empresa — P2

**Evidencia:** cron de agentes y servicios de reporte semanal/cierre mensual recorren empresas secuencialmente en una sola petición. No se encontró unicidad por empresa/tarea/período, lease ni checkpoint en esos caminos; ver `vercel.json`, `src/app/api/agents/run/route.ts:64` y ambos servicios de cron. Las excepciones por empresa no se devuelven siempre en un resumen de fallos; el cron mensual puede devolver success con empresas fallidas.

**Impacto:** reintentos pueden repetir correos/tareas, un proceso interrumpido puede dejar empresas sin ejecutar y el tiempo crece con tenants y destinatarios. No se midió saturación ni se consultaron los límites contratados del hosting.

**Corrección y aceptación:** fan-out por empresa, clave empresa+tarea+período, estado persistente, concurrencia acotada y métricas de retraso/fallo. Probar dos disparos simultáneos y caída a mitad de un lote sintético; toda empresa termina una vez o queda identificada para reintento. Revisar zona horaria y cambios estacionales usando America/Santiago.

## OP-10 — Excel y agregaciones cargan conjuntos completos en memoria — P2

**Evidencia:** `src/modules/reports/services/dataset.service.ts:198` ejecuta ocho consultas paralelas, incluyendo catálogo/stock completo y documentos con líneas, sin paginación. `workbook.service.ts:145` construye Workbook en memoria y `:428` genera writeBuffer; el correo luego codifica adjunto a base64. `src/modules/agents/services/business-metrics.service.ts:83` agrega documentos y líneas en aplicación.

**Impacto:** consumo de memoria/tiempo crece con datos y exportación; puede interferir con peticiones de negocio. No hay medición suficiente para afirmar que hoy se supere un límite.

**Corrección y aceptación:** consultas agregadas en BD cuando corresponda, rangos máximos de exportación síncrona y generación asíncrona de archivos grandes con streaming. Medir datos de 1.000/10.000/100.000 documentos, duración, memoria, conexiones y latencia de ventas en paralelo; establecer umbral de paso a trabajo asíncrono según presupuesto real.

## OP-11 — CI verde no verifica build, migraciones ni recorridos completos — P1

**Evidencia:** `.github/workflows/ci.yml` ejecuta instalación, validate, typecheck, lint y Jest. No incluye build de producción, BD efímera/migraciones, integración PostgreSQL ni E2E. `tests/security/brute-force.test.ts:215` convierte ausencia de servidor en un test aprobado; si hay servidor, realiza intentos que pueden bloquear cuentas. Incluso acepta un 404 como servidor disponible. Jest lo descubre por nombre sin una exclusión propia del proyecto.

**Resultados de esta auditoría:** validate y typecheck aprobados; lint 0 errores/18 advertencias; 32 suites y 523 tests aprobados, excluyendo expresamente ese archivo de fuerza bruta. No se ejecutó npm run ci literalmente: se separaron los pasos para aislar conexiones y excluir el script activo. No se ejecutó build. Npm audit del lockfile contra el registro público devolvió 0 vulnerabilidades conocidas. Ver archivos de evidencia adjuntos.

**Corrección y aceptación:** dividir unitarios, integración y E2E; servidor/BD/identidades de prueba obligatorios para pruebas activas, rechazo de destinos productivos y skip explícito verificable. Incorporar build desde checkout limpio, migraciones desde cero y desde versión previa, invariantes y escenarios P0/P1. El flujo debe fallar al introducir deliberadamente una violación de autorización o duplicación económica.

## OP-12 — Observabilidad implementada pero aplicada de forma parcial — P2

**Evidencia:** existen instrumentation, logger y cliente Sentry con saneamiento. La búsqueda de llamadas console.error/log/info en src devuelve 73 coincidencias, entre ellas correo, crons y webhooks que operan fuera de captureException. La cifra es de coincidencias de búsqueda, no un conteo de incidentes ni de secretos filtrados. Ver `src/lib/email/mailer.ts`, `src/modules/accounting/services/monthly-closing-cron.service.ts:87` y `src/app/api/webhooks/route.ts:120`.

**Impacto:** fallos operativos pueden no llegar al receptor de alertas, carecer de contexto o exponer contenido de negocio. Tener SENTRY_DSN en la documentación no acredita que esté configurado ni que exista guardia operativa.

**Corrección y aceptación:** eventos estructurados para emisión, conciliación, cola, importación y proveedores; requestId/tenant/entidad sin payload sensible, alertas accionables y tablero. Simular fallos y demostrar que producen una alerta con causa y contexto útil; comprobar que no aparecen tokens ni contenido médico. Añadir comprobaciones de disponibilidad que no muten datos y métricas de latencia/error.

## OP-13 — Artefactos de datos en Git y documentación divergente — P2

**Evidencia:** git ls-files incluye tres logs de desarrollo y dos exportaciones ERP en XLSX en la raíz. No se inspeccionó su contenido, por lo que no se afirma que contengan datos personales reales. README describe almacenamiento Vercel Blob y SMTP, mientras el adaptador actual usa R2 con compatibilidad legacy y el correo usa Brevo/Resend HTTP. El README del escritorio conserva el texto de plantilla.

**Impacto:** riesgo de conservar datos o enlaces sensibles en historial y dificultad para desplegar correctamente. La lista de exclusiones .gitignore no elimina archivos ya versionados.

**Corrección y aceptación:** inventariar/clasificar esos artefactos localmente, mover fixtures a datos sintéticos y excluir salidas futuras. Evaluar historia y rotar material solo si se acredita exposición; cualquier reescritura de Git requiere un plan propio. Actualizar instrucciones de proveedores, variables y límites reales. Un onboarding desde cero debe funcionar con documentación y credenciales de prueba.

## OP-14 — Contrato de runtime y distribución de escritorio incompleto — P3

**Evidencia:** entorno de auditoría Node 22.16.0/npm 10.9.2; CI fija Node 26. No hay engines/packageManager en package.json. @prisma/adapter-pg se importa en runtime pero figura en devDependencies. Versiones instaladas y lock de Next, React, TypeScript, Prisma y Jest coinciden en la muestra. Desktop carga una URL remota fija y mantiene csp null (`desktop-client/src-tauri/tauri.conf.json:14`, `:22`); no se encontró flujo versionado de actualización/firma en esa configuración.

**Impacto:** instalación/despliegue no tienen un contrato único; un despliegue que omita devDependencies no dispondrá del adaptador. El cliente de escritorio depende del servicio remoto y requiere estrategia propia de publicación. csp null no demuestra por sí solo ejecución nativa arbitraria; capacidades y headers remotos deben revisarse en conjunto.

**Corrección y aceptación:** fijar runtimes compatibles, declarar dependencias según uso, probar artefacto final y política de actualización/firmado/dominio/capacidades de escritorio si es un canal comercial. Probar instalación limpia y actualización; documentar comportamiento sin red y alcance real del soporte periférico. No construir modo offline sin una necesidad validada.

## OP-15 — Facturación SII aún sin ciclo completo — P1

**Evidencia:** `README.md:118` y `CLAUDE.md` declaran pendientes firma XML-DSig, envío, consulta de Track ID y consumo de folios de boletas. `src/modules/dte/services/stamping.service.ts` guarda en signedXml un XML que aún no tiene la firma completa; sin CAF usa numeración interna. F29 selecciona por estado ISSUED/tipo/fecha, no por una clasificación explícita de origen fiscal (`src/lib/chile/f29.ts:36`).

**Impacto:** estado comercial emitido, timbre y documento tributario completamente procesado son cosas distintas. Deben quedar claras en UI, exportaciones y reportes; un tipo 33 y un contador interno no acreditan emisión tributaria. La documentación oficial distingue generar XML, timbrar, firmar documento completo y enviar/intercambiar: [instructivo técnico del SII, 28/10/2021](https://www.sii.cl/factura_electronica/factura_mercado/instructivo_emision.pdf). Se consultó como referencia técnica, no como certificación de cumplimiento vigente del producto.

**Corrección y aceptación:** decidir integración con proveedor o implementación propia; definir origen interno/importado/fiscal, estados de generación/firma/envío/respuesta y recuperación. Migrar empresas que usan numeración interna sin cortarles la operación, de acuerdo con las reglas del proyecto. Evitar filtrar ingenuamente todo por estado ACCEPTED: los documentos fiscales importados y los pendientes requieren tratamiento validado por el responsable tributario. Completar pruebas/certificación aplicables, firma, rechazo/reintento, unicidad de folio, archivo e intercambio. DTE y F29 requieren validación contable/tributaria especializada antes de presentarlos como solución fiscal completa.

## OP-16 — Informes por correo omiten permisos personalizados — P1

**Evidencia:** `weekly-report-cron.service.ts:33` y `monthly-closing-cron.service.ts:45` eligen destinatarios por rol base OWNER/ADMIN/ACCOUNTANT e isActive. No resuelven CustomRole ni permisos efectivos. El control interactivo usa los permisos efectivos que sustituyen al rol base; así lo documenta README y lo implementa `src/lib/auth/effective-permissions.ts`.

**Impacto:** un usuario cuyo rol personalizado retiró acceso a reportes puede seguir recibiendo el Excel o resumen financiero por pertenecer a un rol base seleccionado. A la inversa, un rol autorizado distinto de esos tres puede quedar excluido. Es una divergencia de autorización comprobada en código; no se verificaron destinatarios reales.

**Corrección y aceptación:** resolver autorización efectiva por destinatario y alcance de informe al ejecutarse el envío; preferencias de recepción separadas de permisos. Una matriz de usuarios con roles base/customRole contradictorios debe recibir únicamente contenido autorizado; una revocación previa a la entrega debe impedirla.

## Controles que conviene conservar

La modularización por dominio, TypeScript estricto, esquemas Zod, límites del pool PostgreSQL, transacciones, índices y triggers contables son bases aprovechables. Hay CI, lockfiles coherentes en la muestra, 523 pruebas locales aprobadas, autenticación de cron que rechaza ausencia de secreto y herramientas de observabilidad. No hay fundamento en esta revisión para recomendar una reescritura total ni microservicios como primera medida. La prioridad es completar las garantías transaccionales, de autorización y de operación sobre la arquitectura actual.

## Verificación externa todavía necesaria

Configuración real de credenciales/roles de BD, RLS si existiera, permisos y versionado de objetos, retención/PITR, disponibilidad, despliegue automático y protección de ramas, región/latencia, métricas de consumo y costos, recepción de alertas, entregas de correo, compatibilidad de impresoras y certificación SII. Su ausencia en el repositorio no demuestra que esos controles no existan fuera de él.
