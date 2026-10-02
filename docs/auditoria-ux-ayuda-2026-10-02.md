# Auditoría de experiencia de usuario: manual, tutoriales y asistente

Fecha: 2026-10-02. Alcance: todo lo que ayuda a una persona sin experiencia a usar el sistema —
Manual de Usuario, tutoriales guiados por pantalla, Asistente (IA), guía de configuración inicial y
los textos de ayuda de cada pantalla. Se recorrieron las 96 pantallas del menú (`workspace-nav.ts`)
con todos los módulos encendidos y se cruzó cada una con el manual, el mapa del asistente y los
tutoriales; los botones citados se verificaron contra el código real.

## 1. Hallazgos

### Manual de Usuario
| # | Hallazgo | Impacto |
|---|----------|---------|
| M1 | ~35 de 96 pantallas sin una línea de manual: notas de venta, listas de precios, comisiones, solicitudes de compra, importaciones, DTE recibidos, archivo de facturas, toma de inventario, lotes, etiquetas, cobranza, bancos y conciliación, cheques, nóminas de pago, RCV, libros contables, producción, servicio técnico, contratos firmados, afiches, folios del SII, automatizaciones… | Un usuario nuevo no tenía cómo aprender esas pantallas |
| M2 | Dos módulos comercializados sin sección: **Producción** y **Servicio técnico** | Clientes que pagan el módulo sin manual |
| M3 | Botones citados que no existen: "Nuevo documento", "Nueva compra", "Nuevo plan de pago", "Nuevo contrato", "Nueva boleta", "Invitar usuario", "Nueva persona", "Abrir turno" | La persona busca un botón que no está |
| M4 | Información desactualizada: el asistente "flotante abajo a la izquierda" (hoy está en la barra superior); anular ventas "siempre con nota de crédito" (existe "Anular"); cotización → "boleta/factura" (es "Convertir en nota de venta"); jurado con "categorías" (son rondas, criterios ponderados, "Votar ahora", acta PDF); organigrama con "Nueva persona" (se asignan cargos a usuarios) | Instrucciones que no se pueden seguir |
| M5 | Contabilidad describía "asiento manual" y "cerrar período", que no tienen pantalla; presupuestos prometía comparar "automáticamente" contra el gasto real | Promesas que el sistema no cumple |
| M6 | Filtraba solo por módulo contratado: un rol Bodega veía Remuneraciones, Contabilidad, etc. | Ruido para cada rol |
| M7 | Solo 13 de 33 secciones con captura; la versión impresa no tenía capturas ni índice; no había descarga en Word | No servía para capacitar ni para imprimir |
| M8 | Sin "para qué sirve" por módulo: se entraba directo a pasos sueltos | Un usuario nuevo no entiende el porqué |
| M9 | Búsqueda sensible a tildes ("liquidacion" no encontraba "liquidación") y por frase exacta | Búsquedas fallidas |
| M10 | Sin enlaces cruzados manual ↔ tutorial ↔ asistente | Cada ayuda aislada |

### Tutoriales
| # | Hallazgo |
|---|----------|
| T1 | ~50 pantallas sin tutorial propio (Inteligencia, CRM, Personas, Activo fijo, Gastos, Sitios web, Fidelización, Calidad, Tareas, Producción, Servicio técnico, Tesorería avanzada, RCV, libros contables, casting, etc.) |
| T2 | Subpantallas mostraban el tutorial de **otra** pantalla: la Escaleta y Vestuario abrían "Acreditaciones"; Bancos, Cheques y Cobranza abrían el de Cuentas por Cobrar; Notas de venta abría el de facturación |
| T3 | Contenido incorrecto: el POS ofrecía "boleta o factura" (solo emite boleta); Contactos prometía "autocompletado por RUT" y "cuentas pendientes en la ficha"; Flujo de Caja decía "proyecta" (muestra lo real); Contabilidad mencionaba un "cierre mensual" sin pantalla |
| T4 | El tour de bienvenida no mostraba dónde estaban el menú, el buscador ni el asistente |
| T5 | Sin forma de apagar los tours automáticos, y sin enlace al manual o al asistente al terminar |
| T6 | En el celular, un paso podía apuntar al menú lateral cerrado (fuera de la pantalla) |

### Asistente
| # | Hallazgo |
|---|----------|
| A1 | Solo 4 acciones, 3 de ellas de certámenes: un usuario de un ERP general no podía pedirle crear un producto, una cotización, una tarea, una oportunidad o una solicitud de compra |
| A2 | Respuestas en texto plano: las rutas no eran clicables y los asteriscos de negrita se veían crudos |
| A3 | El mapa de pantallas era una lista a mano que no calzaba con el menú (le faltaban ~35 pantallas y difería en Configuración): por regla, el asistente decía que esas pantallas "no existen" |
| A4 | Sugerencias iniciales genéricas, iguales en todas las pantallas |
| A5 | La conversación se perdía al recargar; tras confirmar una acción no había enlace a lo creado |
| A6 | Solo 3 consultas de datos (ventas, morosos, IVA): no respondía stock, precio de un producto ni saldo de un cliente |
| A7 | Con todos los módulos, el prompt crecía a ~35 mil tokens por pregunta |
| A8 | La auditoría registraba las acciones del asistente con entidad "CREATE_CONTACT" en vez de "Contact", así no contaban como uso del módulo |

### Detectado al capturar las pantallas
| # | Hallazgo | Estado |
|---|----------|--------|
| V1 | Indicadores (`KpiCard`) en grillas de 5–6 columnas cortaban la cifra a 1366 px ("$20.900.00" en el CRM) | Corregido: la cifra se achica según el ancho real de la tarjeta (container query) |
| V2 | "Ciclo de venta: -0 días" en el CRM (redondeo de un negativo chico) | Corregido en `formatDays` + prueba |
| V3 | En Cuentas por Cobrar/Pagar la columna de acciones queda parcialmente fuera de la vista a 1366 px (hay que desplazar la tabla) | Pendiente: apilar los botones o moverlos a un menú "⋯" |

### Otros (no corregidos, se recomiendan)
- **Presupuestos:** la columna "Real" suma pagos asociados a una línea, pero ninguna pantalla permite asociar un pago a una línea: hoy queda siempre en $0. Sugerencia: selector de línea de presupuesto en "Registrar pago".
- **Contabilidad:** existen los permisos `accounting:manual_entry` y `accounting:close_period`, pero no hay pantalla de asiento manual ni de cierre de período. La corrección de una depreciación contabilizada "revirtiendo desde el Libro Diario" tampoco tiene botón.
- **Guía de configuración inicial (onboarding):** siempre pide bodega y POS, aunque la empresa sea de eventos o servicios. Sugerencia: armar los pasos según los módulos contratados (el flujo "Puesta en marcha" del manual ya lo describe).
- **Asistente:** comparte la cuota gratuita de Gemini (5 preguntas/min por usuario). Con más uso convendrá una cuota pagada.

## 2. Qué se hizo

### Manual (`src/modules/manual/`)
- Reescrito y dividido por área en `sections/` (59 secciones, ~185 temas), cada una con **"para qué sirve"**, pasos verificados contra la pantalla real, recuadros **"Importante"** y la ruta exacta de cada tema. Cubre las 96 pantallas del menú y los 34 módulos.
- Dos alcances, nunca con módulos no contratados: **"Mi rol"** (por defecto: solo lo que la persona puede hacer, incluso tema por tema) y **"Toda la empresa"** (todo lo contratado, para capacitar).
- Pantalla nueva: índice por capítulos (los mismos grupos del menú), búsqueda sin tildes y por palabras, captura de cada pantalla, botones **Ir a la pantalla / Ver tutorial guiado / Preguntar al asistente**, enlaces profundos (`/dashboard/manual#seccion--tema`), impresión completa con capturas.
- **Descarga en Word** (`GET /api/manual/docx?alcance=rol|empresa`): portada con la empresa, "cómo usar este manual", índice con enlaces, un capítulo por grupo del menú, capturas, pasos numerados, recuadros "Importante", flujos completos, problemas frecuentes y glosario, pie con "Página X de Y". Tamaño carta, listo para imprimir.
- Capturas reales de todas las secciones (`public/manual/screenshots/*.jpg`) generadas desde una empresa de demostración con datos coherentes (`scripts/seed-manual-demo-data.ts`, que se niega a correr fuera de una base local) por `scripts/capture-manual-screenshots.ts`, que recorre las secciones solo.
- Flujos de punta a punta nuevos (pedido con despacho parcial, compra completa, conciliación mensual, remuneraciones del mes, reparación, fabricación, certamen completo) y problemas frecuentes nuevos (folios internos sin CAF, caja que no se puede cerrar, compra "No coincide con OC", recordatorios que no llegan, conciliación, sitio que no publica, jurado que no puede votar). Glosario ampliado (CAF, TED, RCV, FEFO, Previred, UF/UTM, finiquito, NPS/CSAT, RFM, canje…).

### Tutoriales (`src/components/tutorial/`)
- Un tutorial propio por pantalla del menú (95 rutas): se acabaron los tours de otra pantalla.
- Contenido corregido y más corto (3–5 pasos, el detalle vive en el manual).
- Bienvenida que señala el menú, el buscador (Ctrl+K) y el asistente.
- El último paso enlaza **"Leer el manual paso a paso"** y **"Preguntar al asistente"**.
- Se puede abrir desde el manual (`#tutorial`) y apagar los tours automáticos ("seguirán en Cómo usar").
- Un paso cuyo elemento está fuera de la pantalla (menú cerrado en el celular) se muestra centrado.

### Asistente
- **10 acciones** con confirmación: a las 4 existentes se suman crear **producto** (convierte precio con IVA a neto), **cotización en borrador** (precios de la lista del cliente), **tarea** (con repetición y responsable), **oportunidad del CRM**, **certamen** y **solicitud de compra**. Por diseño no emite documentos tributarios, no mueve stock ni registra pagos.
- **6 consultas de datos**: se suman stock y precio de un producto, productos bajo el mínimo y saldo por cobrar/pagar de un contacto.
- Mapa de pantallas **derivado del menú real** (no puede volver a desfasarse) y manual en el prompt: completo si cabe, o índice + herramienta `consultarManual` si la empresa tiene muchos módulos (de ~35 mil a ~15 mil tokens por pregunta), siempre con el detalle de la pantalla actual.
- Respuestas con formato y **enlaces clicables** a las pantallas (solo rutas internas; nunca HTML del modelo), sugerencias según la pantalla, conversación que sobrevive a recargas, botón **"Ver"** tras crear algo, "Nueva conversación", y apertura con pregunta desde el manual y los tutoriales.
- Auditoría de acciones del asistente con la misma entidad que el formulario (y `viaAgent` en la metadata).
- El conector MCP usa la misma búsqueda sin tildes y expone las nuevas consultas.

### Pruebas que impiden volver atrás
- `tests/manual-coverage.test.ts`: cada pantalla del menú debe tener manual, tutorial propio y "para qué sirve"; cada módulo, su sección; cada sección, su captura; y no pueden reaparecer los botones inexistentes del manual anterior.
- `tests/manual-scope-and-search.test.ts`, `tests/manual-docx.test.ts`, `tests/assistant-markdown.test.ts`, `tests/assistant-actions-and-prompt.test.ts`.

## 3. Cómo mantenerlo
- Pantalla nueva en el menú → CI falla hasta agregar: su "para qué sirve" (`SCREEN_PURPOSES`), su tutorial (`tutorial-content.ts` + `tutorial-routes.ts`) y su sección o tema en `src/modules/manual/sections/`.
- Cambió una pantalla → actualizar los pasos y regenerar su captura: `MANUAL_SCREENSHOT_ONLY=<id-sección> npx tsx scripts/capture-manual-screenshots.ts` (pasos completos al inicio del script).
