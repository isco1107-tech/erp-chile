# Auditoría del ERP Aether y plan integral de mejora

**Fecha:** 14 de septiembre de 2026. **Base:** repositorio local `D:\ERP`, commit `81e31ab8b1d7f6a22babf73bb20b194eeda2f870` más cambios locales preexistentes. **Resultado:** revisión y planificación terminadas; correcciones propuestas, todavía no implementadas.

## Dictamen

El ERP tiene una base técnica aprovechable y una cobertura funcional amplia. Sin embargo, **antes de ampliar su uso con datos sensibles o confiar en sus saldos como fuente financiera consolidada, deben corregirse fallos de autorización, transiciones documentales e integridad económica**. Los tests actuales aprueban cálculos y numerosos controles, pero dejan fuera escenarios completos de reintento, concurrencia, permisos y recuperación.

Los hallazgos de mayor impacto son concretos: datos médicos fuera del permiso sensible; recuperación de cuentas privilegiadas sin jerarquía; cambio de contraseña sin verificar que corresponda el flujo; eliminación de archivos sin acreditar su empresa; borradores de notas de crédito que aumentan inventario; guías/facturas con efectos incompletos; cierres de caja sin sincronización; aplicaciones de crédito y pagos que no concilian.

Se recomienda corregir la arquitectura actual por etapas. La evidencia no justifica una reescritura total. CRM, marketing, ecommerce y RR.HH. figuran como módulos planificados; no deben desplazar la estabilización del núcleo.

## Entregables y cómo usarlos

| Archivo | Contenido |
|---|---|
| [Este plan](PLAN_COMPLETO.md) | Dictamen, prioridades, cronograma, dependencias, recursos y criterios de salida |
| [Seguridad](seguridad.md) | 14 fichas SEG con evidencia, escenario, impacto, solución y aceptación |
| [Negocio e integridad de datos](negocio-datos.md) | 19 fichas N sobre ventas, compras, caja, contabilidad e integración financiera |
| [Interfaz y experiencia de uso](interfaz.md) | 14 fichas UX sobre operación, recuperación, navegación y accesibilidad |
| [Operación y arquitectura](operacion-arquitectura.md) | 16 fichas OP sobre entornos, respaldo, integraciones, pruebas y explotación |
| [Backlog ejecutable](backlog.csv) | 27 paquetes con responsable sugerido, esfuerzo, dependencias y aceptación |
| [Resumen de validaciones](validaciones.json) | Inventario, comandos, resultados y límites de las comprobaciones |
| [Resultados Jest](jest-results.json) | Resultado estructurado de las 32 suites ejecutadas |
| [Reproducción de SEG-09](repro-limite.cjs) y [resultado](repro-limite.json) | Fallo del limitador comprobado en memoria, sin servidor ni base de datos |
| [Lint](lint.txt), [TypeScript](typecheck.txt), [Prisma](prisma-validate.txt), [tests](tests.txt), [dependencias](npm-audit.json) | Salidas de las comprobaciones locales |

Las 63 fichas incluyen asuntos relacionados entre áreas; no deben sumarse como 63 defectos independientes. Por ejemplo, N-16 y UX-02 describen la misma brecha de idempotencia. El backlog agrupa esas dependencias para evitar duplicar trabajo.

## Alcance real y límites

Se inventariaron **35 módulos, 603 archivos bajo src, 100 páginas, 45 route handlers, 79 modelos Prisma, 48 migraciones y 33 archivos de test**. El código TypeScript/TSX bajo src suma aproximadamente 81.468 líneas; es una medida de tamaño, no una afirmación de lectura exhaustiva de cada línea.

| Área y módulos | Profundidad de revisión |
|---|---|
| auth, roles, platform | Seguimiento de autenticación, permisos, recuperación, sesiones y aislamiento; operación real del panel global no probada |
| sales, purchases, inventory, pos, treasury, accounting | Revisión detallada de servicios críticos, estados, locks, dinero, stock, asientos y reversos |
| dte, reports, import, contacts | Código de generación/cálculo/importación/exportación, identidad documental y selectores; sin emisión al SII ni importación real |
| payment-plans, promissory-notes, fees, sponsorships | Revisión de integración económica, pagos, archivos y trazabilidad |
| budgets, projects, ticketing, public-voting | Revisión parcial de contratos de datos, integración y flujos públicos; aforo, venta masiva y control de acceso físico requieren ejecución adicional |
| candidates, documents | Revisión detallada de datos sensibles, documentos, almacenamiento y acciones |
| judging, production, org-chart | Revisión parcial de interfaz/configuración y superficies compartidas; reglas completas de escrutinio, acreditación y jerarquía pendientes de validación operativa |
| messaging, calendar | Seguimiento de contexto UI, adjuntos, tokens y tareas; tiempo real/calendarios externos no probados |
| automation, webhooks, alerts, backup | Revisión de entrega, reintentos, consistencia, permisos y recuperación; proveedores no consultados |
| agents, agent-actions, manual | Revisión de ejecución, confirmaciones y cuotas; calidad de respuestas IA y costos no medidos |
| Infraestructura y desktop | Configuración versionada y contrato de distribución; sin inspección del hosting ni ejecución del binario de escritorio |

**No se accedió a datos de producción ni se ejecutaron migraciones, seeds, operaciones comerciales, correos o pruebas activas contra el ERP.** La documentación advierte que el entorno local comparte BD con producción. Las comprobaciones que podían resolver una conexión se ejecutaron con una URL ficticia de loopback.

La revisión es principalmente estática más pruebas locales. Un fallo comprobado en código no demuestra que haya ocurrido en producción. Los riesgos de concurrencia deben reproducirse con PostgreSQL aislado; permisos reales de storage, intrusiones previas, disponibilidad, configuración fiscal y calidad visual todavía requieren comprobación específica. Tampoco se certifica cumplimiento legal o tributario.

Cambios locales existentes preservados: `.claude/scheduled_tasks.lock`, `next-env.d.ts` y `src/components/tutorial/ModuleTutorial.tsx`. Los entregables se limitaron a esta carpeta de documentación.

## Evidencia de calidad actual

| Comprobación | Resultado | Interpretación |
|---|---|---|
| Prisma validate | Aprobado | Esquema sintácticamente válido; no prueba que las migraciones estén aplicadas ni su seguridad sobre datos reales |
| TypeScript, sin emisión ni caché incremental | Aprobado | Sin errores de tipos detectados |
| ESLint | 0 errores, 18 advertencias | Hay advertencias de hooks, imágenes y directivas; no sustituye validación funcional |
| Jest | **32 suites, 523 tests aprobados** | Se excluyó el archivo activo de fuerza bruta; no equivale a cobertura total del ERP |
| npm audit sobre lockfile | **0 vulnerabilidades conocidas reportadas** | Resultado del registro consultado en esta fecha; no evalúa vulnerabilidades del código propio ni garantiza ausencia futura |
| Reproducción aislada de SEG-09 | Defecto reproducido | Una limpieza de cuota de 1 minuto elimina otra cuota de 1 hora todavía vigente |
| Versiones principales | Manifest/lock/instalado coinciden en la muestra | Next, React, TypeScript, Prisma y Jest |
| Build de producción, migración desde cero, E2E y carga | No ejecutados | Deben incorporarse al circuito aislado T07/T25 |

El test excluido, `tests/security/brute-force.test.ts`, puede bloquear cuentas si encuentra un servidor. Además convierte ausencia de servidor en éxito. No se afirma que haya aprobado: **no se ejecutó**. No se ejecutó `npm run ci` literalmente; se realizaron sus componentes seguros por separado con esa exclusión.

## Prioridades y decisiones inmediatas

- **P0:** contener o corregir de inmediato; bloquea ampliar la superficie sensible afectada. Incluye separación de entornos, datos médicos, recuperación privilegiada, cambio de contraseña y pertenencia de archivos.
- **P1:** necesaria para confiar en los flujos afectados; corregir antes de habilitar o ampliar esos procesos.
- **P2:** siguiente etapa de fiabilidad, usabilidad y operación; puede adelantarse si afecta al uso real.
- **P3:** mejora de mantenimiento/distribución condicionada por la necesidad del producto.

| Riesgo prioritario | Evidencias | Tratamiento |
|---|---|---|
| Desarrollo con acceso a producción | OP-01 | Separar credenciales/datos y proteger scripts antes de cualquier prueba integrada |
| Salud, recuperación de OWNER y archivos entre empresas | SEG-01 a SEG-04 | DTO restrictivos, reglas actor/objetivo y propiedad de objetos en servidor |
| Sesiones no revocables y restricciones incompletas | SEG-05, SEG-07, SEG-08, SEG-10 | Rutina única de sesión y política común de acceso interactivo/no interactivo |
| Inventario alterado por borradores, guías y anulaciones | N-01, N-02, N-05, N-09, N-10 | Modelo explícito de estados/relaciones/efectos, locks e identidad por línea |
| Aprobación y matching de compras eludibles | N-06, N-08, N-17 | Validación completa y versión aprobada; rechazo de transiciones inválidas |
| Dinero y saldos no conciliables | N-03, N-07, N-11 a N-15, N-19 | Libro de pagos/aplicaciones y cierre transaccional; clasificación por cuenta y origen |
| Reintentos que duplican o pierden hechos | N-16, OP-05 a OP-07 | Claves persistentes de intención/efecto, outbox y recuperación |
| Respaldo insuficiente y capacidad fiscal incompleta | OP-02 a OP-04, OP-15 | Recuperación ensayada y distinción explícita de origen/estado fiscal |

Como contención inicial, limitar los flujos concretos de mayor riesgo hasta desplegar su corrección: recuperación administrativa de cuentas protegidas, asociaciones/borrados de archivos no acreditados y exposición de datos médicos. No se propone detener indiscriminadamente toda la operación. Ninguna de estas restricciones se aplicó durante la auditoría.

En autenticación, las comprobaciones deben residir en acciones y rutas de servidor además de la interfaz; es coherente con la [guía oficial de Next.js](https://nextjs.org/docs/app/guides/authentication). En archivos, autorización y almacenamiento privado deben evaluarse junto con validación del contenido, conforme a la [guía OWASP de subidas](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Plan de implementación y esfuerzo

Las jornadas son **días-persona de trabajo**, no días corridos. Incluyen desarrollo y verificación específica; el rango es una estimación a partir del código, sin medición de datos históricos ni cotización de proveedores. Los responsables son roles sugeridos.

| Paquete | Prioridad | Trabajo | Jornadas | Depende de |
|---|---|---|---|---|
| T01 | P0 | Aislar entornos y proteger scripts/migraciones | 2–4 | — |
| T02 | P0 | Restringir datos médicos y DTO de usuarios | 2–4 | T01 |
| T03 | P0 | Proteger recuperación privilegiada y cambio de contraseña | 3–5 | T01 |
| T04 | P0 | Autorizar propiedad de archivos y migrar documentos privados | 5–9 | T01 |
| T05 | P1 | Unificar emisión, revocación y política de sesión/IP | 3–6 | T03 |
| T06 | P1 | Completar controles de integraciones, abuso y CSP | 5–9 | T04, T05 |
| T07 | P1 | Crear CI de build, PostgreSQL aislado y recorridos E2E | 5–8 | T01 |
| T08 | P1 | Unificar estados y efectos de ventas, guías y notas de crédito | 6–10 | T07 |
| T09 | P1 | Corregir OC, recepción, matching y aprobación de compras | 6–10 | T07 |
| T10 | P1 | Cerrar idempotencia en ventas, POS, webhooks y acciones IA | 5–9 | T07 |
| T11 | P1 | Sincronizar cierre de caja con toda actividad del turno | 3–5 | T07 |
| T12 | P1 | Separar cobros, aplicaciones de crédito y reembolsos | 7–12 | T08, T09, T10 |
| T13 | P1 | Alinear costo, cuentas y conciliación de efectivo | 5–9 | T08, T09, T11 |
| T14 | P1 | Integrar pagos de eventos y libros auxiliares | 8–14 | T12, T13 |
| T15 | P1 | Corregir importación y reconciliar datos históricos | 6–10 | T12, T13, T14, T19 |
| T16 | P1 | Versionar F29 y habilitar cierre/reapertura efectiva | 6–10 | T12, T13, T15 |
| T17 | P1 | Distinguir origen fiscal, documentos internos y estados SII | 3–5 | T08, T16 |
| T18 | P1 | Completar integración fiscal con proveedor y pruebas aplicables | 15–30 | T17 |
| T19 | P1 | Completar exportación consistente y ensayar recuperación | 6–10 | T01, T04 |
| T20 | P1 | Persistir automatizaciones/crons y corregir correo autorizado | 7–12 | T10 |
| T21 | P1 | Resolver selección de catálogos y totales de formulario | 3–5 | T07, T08, T09 |
| T22 | P1 | Corregir contexto de mensajería y respuestas fuera de orden | 3–6 | T04, T07 |
| T23 | P2 | Completar navegación, permisos visibles y accesibilidad | 5–8 | T05, T07 |
| T24 | P2 | Recuperar borradores y carritos con aislamiento de identidad | 3–5 | T10, T07 |
| T25 | P2 | Medir rendimiento, limitar exportaciones y operar alertas | 5–9 | T20 |
| T26 | P2 | Sanear artefactos y documentar runtime/proveedores/escritorio | 3–5 | T01 |
| T27 | P1 | Pilotear, reconciliar y aprobar liberación por evidencia | 5–8 | T06, T15, T16, T19, T20, T21, T22, T25 |

La aceptación detallada y el responsable de cada paquete están en [backlog.csv](backlog.csv). Los anexos contienen las pruebas por hallazgo.

**Esfuerzo base:** 135–237 jornadas para los 27 paquetes. T18 supone integrar un proveedor fiscal con capacidad disponible; desarrollar el circuito SII propio se estima en 30–60 jornadas para ese paquete, sustituyendo sus 15–30, y lleva el conjunto a 150–267 jornadas. Son estimaciones de planificación que deben revisarse tras la fase de aislamiento y diagnóstico de datos.

**Equipo de referencia:** dos desarrolladores, QA con dedicación sostenida, apoyo de plataforma/seguridad y responsable contable/tributario disponible para definir reglas y aprobar conciliaciones. Con esa capacidad y trabajo solapado, reservar inicialmente **16–24 semanas**, más los plazos externos de certificación/proveedor cuando correspondan. Con un solo desarrollador, no usar ese calendario: el esfuerzo base equivale aproximadamente a 27–48 semanas-persona antes de esperas. Conviene reservar una contingencia presupuestaria del 20–30 % para saneamiento de datos y alcance fiscal; no está incluida en el total base.

### Secuencia orientativa

| Ventana desde inicio | Objetivo | Paquetes y condición de salida |
|---|---|---|
| Primeras 48 horas | Contención y entorno seguro | Iniciar T01–T04; identificar rutas expuestas, limitar flujos afectados y preparar validación aislada. No implica finalizar todas las migraciones en dos días |
| Semanas 1–3 | Seguridad base y regresiones | T01–T07; cero P0 abiertos en superficies habilitadas y CI aislado operativo |
| Semanas 3–7 | Integridad de operaciones | T08–T11, T21–T22; borradores, referencias, aprobación, reintentos y cierre de caja cubiertos |
| Semanas 6–12 | Conciliación y recuperación | T12–T15, T19–T20; pagos/asientos/stock coherentes, restauración ensayada y reparación histórica revisada |
| Semanas 10–18 | Cierre, interfaz y operación | T16–T17, T23–T26; reportes versionados, navegación fiable, métricas y documentación |
| Semanas 14–24 | Circuito fiscal y piloto | T18 y T27; validación externa aplicable y liberación por evidencia |

Las ventanas se solapan según capacidad; las dependencias del CSV mandan sobre las fechas orientativas. La parte fiscal puede avanzar antes en análisis/proveedor, pero no habilitarse sin sus dependencias económicas. La expansión de funciones queda después del piloto, salvo necesidades contractuales que obliguen a repriorizar.

## Reparación de datos ya existentes

Corregir código evita nuevos errores, pero no repara por sí solo stock, pagos o asientos históricos. T15 requiere un trabajo específico:

1. **Asegurar recuperación y corte.** Snapshot consistente de BD, archivos y claves con restauración ensayada. Documentar fecha y fuentes del análisis.
2. **Diagnóstico por empresa, de solo lectura.** Buscar borradores NC con movimientos; efectos duplicados; facturas de guía sin costo; cantidades recibidas/facturadas superiores al origen; anulados pendientes de aprobación; paidAmount mayor al total; diferencias entre cobros reales y aplicaciones; costo documento distinto de Kardex; asientos PAYMENT vivos tras devolución; pagos auxiliares ausentes del consolidado.
3. **Determinar límites de identificación.** Parte del Kardex usa referencias textuales y no vínculos suficientes. Marcar casos ambiguos para revisión; no inventar una relación por coincidencia de folio o fecha.
4. **Clasificar por evidencia.** Error demostrado, caso consistente y caso que requiere respaldo de negocio. Identificar importe, unidades, períodos y entidades afectados.
5. **Preparar simulación de corrección.** Mostrar antes/después y conciliaciones; no modificar documentos fiscales emitidos ni asientos inmutables sin el mecanismo de corrección aprobado.
6. **Ejecutar compensaciones trazables.** Preferir reversos/ajustes con vínculo al hecho original. Cada lote debe ser idempotente, tener resultado verificable y poder detenerse.
7. **Recalcular dependencias.** Inventario, aplicaciones, estados financieros y períodos F29 afectados bajo reglas versionadas. Validar con el responsable contable.
8. **Cerrar con evidencia.** Registro de lote, operador, motivos, conteos y conciliación final. Las excepciones pendientes quedan explícitas y no se incluyen como saldo confiable.

No se ejecutaron las consultas ni reparaciones anteriores durante esta auditoría. Su impacto y volumen real no se conocen todavía.

## Pruebas de aceptación que deben proteger el ERP

| Frente | Escenarios mínimos |
|---|---|
| Aislamiento | Dos empresas y roles contradictorios; acceso directo a acciones/rutas; archivos de otra empresa; tokens de empresa suspendida |
| Identidad | Reset de OWNER/superadmin, cambio forzado ilegítimo, sesiones antes/después de logout/cambio de empresa y política IP |
| Documentos | Borrador/emisión/anulación; guía parcial/completa; NC de otro cliente, de servicio y con líneas repetidas |
| Compras | Recepción 6+6 contra 10; factura sin vínculos OC; edición durante aprobación; anulado que se intenta aprobar |
| Concurrencia | Dos anulaciones, compra mientras venta lee costo, venta/cierre de caja, anulación de recepción/facturación |
| Reintentos | Pérdida de respuesta después de commit; webhook entre pago y marcado; reinicio y dos procesos confirmando la misma intención |
| Dinero | Factura 100/cobro 90/NC 30; reembolso parcial; abonos en fechas distintas; efectivo versus transferencia; compra mixta |
| Períodos | Calcular meses fuera de orden; cambio de tasa vigente; retroactividad en período cerrado; cambio de año y borde horario |
| Recuperación | Restaurar empresa, BD y objetos; exportar mientras cambian datos; comprobar relaciones y claves necesarias |
| Interfaz | Catálogos grandes, cambio rápido de filtros/chats, primera recepción de mensaje, red caída, teclado, móvil y recarga de borrador |
| Integraciones | Fallos 429/500/timeout, correo sin configurar, revocación de permisos antes de enviar informes, duplicados y lotes incompletos |
| Operación | Alertas recibidas sin datos sensibles, carga representativa, impresión POS/periféricos reales y despliegue con sesión abierta |

Una prueba debe comprobar efectos y ausencia de efectos indebidos, no solo que un helper devuelva true. Las pruebas de concurrencia requieren PostgreSQL real aislado y sincronización controlada; mocks de un Map no sustituyen sus locks y triggers.

## Criterios para habilitar y ampliar uso

- Cero P0 abiertos y cero P1 pendientes en el flujo que se habilite. Las funciones todavía restringidas deben quedar identificadas y protegidas en servidor.
- Stock, documentos, aplicaciones de pago y mayor conciliados para el conjunto de prueba y para los lotes históricos corregidos; diferencias justificadas registradas.
- Clave única y resultado recuperable para cada operación monetaria; mismo efecto una sola vez en los escenarios de reintento definidos.
- Recuperación demostrada de BD, archivos y claves dentro de los objetivos acordados, con informe de ensayo.
- Build, migraciones, pruebas de autorización/transacción y recorridos críticos aprobados en CI aislado.
- Responsable operativo, alertas probadas, procedimiento de incidente y rollback aplicable a código y cambios de datos.
- Si se ofrece facturación electrónica completa, firma/envío/estado y validación fiscal aplicable concluidos; distinguir documento comercial de situación tributaria. El [instructivo técnico del SII](https://www.sii.cl/factura_electronica/factura_mercado/instructivo_emision.pdf) describe esos componentes; su consulta no acredita certificación de este ERP.
- Piloto controlado con conciliación diaria y revisión de incidencias antes de ampliar empresas, usuarios o módulos.

## Métricas y presupuesto operativo a definir

Medir por empresa y módulo: tasa de error de operaciones, latencia p50/p95, conflictos/reintentos, antigüedad de eventos pendientes, correos aceptados/fallidos, errores de conciliación, sesiones sin registro, solicitudes rechazadas por permisos, archivos huérfanos, duración de exportaciones y costo de infraestructura/IA.

Como objetivos iniciales propuestos, sujetos a medición y acuerdo: cero duplicaciones económicas en pruebas de fallo; cero diferencias contables sin explicar en el piloto; RPO hasta 1 hora/RTO hasta 4 horas; búsquedas de opciones con p95 inferior a 1 segundo en el entorno acordado. No se presentan como métricas actuales ni como SLA comprometido.

El presupuesto debe contemplar, además de las jornadas, BD aisladas/PITR, objetos privados y retención, procesamiento de trabajos, correo, telemetría, consumo IA y proveedor/certificación fiscal. No se dan importes monetarios sin tarifas, volúmenes y cotizaciones verificadas.

## Decisiones pendientes que condicionan el plan

El trabajo de contención y corrección comprobada puede comenzar sin resolver todas estas decisiones. Antes de cerrar alcance económico y contratos operativos deben definirse: módulos realmente vendidos/activos; usuarios, documentos y concurrencia esperados; responsable de reglas contables; proveedor fiscal versus desarrollo propio; necesidad contractual de escritorio/offline; retención, RPO/RTO y presupuestos; fuentes válidas para reconstruir pagos históricos.

La siguiente entrega útil es T01–T04 con pruebas de denegación y contención verificables, mientras T07 prepara el entorno de regresión. El plan deja el resto del trabajo conectado a esas bases y a criterios medibles.
