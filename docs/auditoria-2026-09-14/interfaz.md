# Auditoría de interfaz y experiencia de uso

Fecha: 14 de septiembre de 2026. Revisión del código disponible en `D:\ERP`.

## Alcance y límites

Se revisaron la estructura de rutas y componentes, navegación compartida, formularios de ventas/compras/contactos/productos, POS, mensajería, carga de catálogos, tablas y primitivas de interfaz. El inventario de archivos detectó 166 componentes y 190 archivos bajo `src/app`, incluidos endpoints; estas cifras no equivalen a pantallas verificadas individualmente.

La evidencia es estática: lectura de código y búsquedas. No se inició el ERP, no se autenticó una sesión, no se ejecutaron operaciones comerciales y no se accedió a servicios externos. `CLAUDE.md` y `README.md` advierten que el entorno local comparte base de datos con producción. No se comprobaron visualmente tamaños, contraste, lectores de pantalla, impresión ni navegadores reales. Los escenarios descritos son casos que el código permite y que deben convertirse en verificaciones en un entorno aislado; no se presentan como incidentes observados en producción.

Las comprobaciones de TypeScript, lint y tests generales pertenecen al informe principal. No se detectó `AGENTS.md`; se leyeron las reglas del repositorio en `CLAUDE.md`. Este documento es el único archivo creado por esta revisión.

Prioridades: **P1** afecta una operación principal, importes, confianza en el destinatario o protección contra duplicados; **P2** causa fallos de uso, recuperación o accesibilidad; **P3** mejora consistencia y mantenimiento.

## Hallazgos

### UX-01 — Los selectores ocultan clientes y productos existentes — P1

**Evidencia:** `src/components/SalesDocumentForm.tsx:72` carga contactos y productos sin búsqueda; las líneas 110–120 filtran esos arreglos localmente. `src/modules/contacts/services/contacts.service.ts:13` devuelve como máximo 200 contactos recientes y `src/modules/inventory/services/products.service.ts:24` limita los productos a 300, ordenados por nombre. `src/components/PurchaseOrderForm.tsx:45` y `src/components/PurchaseDocumentForm.tsx:101` repiten la carga inicial. También consumen esas listas inventario, auspicios, pagarés, planes de pago, honorarios y `src/hooks/use-product-options.ts:22`.

**Escenario e impacto:** con 201 contactos, el más antiguo puede verse en la gestión paginada pero no aparecer al buscarlo para emitir una venta; lo mismo ocurre con productos fuera de los primeros 300. Puede impedir facturar al cliente correcto o incentivar crear registros duplicados. No se extiende este límite al POS: utiliza otro servicio.

**Corrección:** crear búsquedas de opciones en servidor, con filtro y límite pequeño, búsqueda por identificador exacto y recuperación del registro seleccionado por ID. Compartir el selector entre módulos y mostrar errores de carga explícitos.

**Aceptación:** con al menos 1.000 contactos y 2.000 productos, seleccionar registros del inicio, medio y final del conjunto en ventas, compras y formularios relacionados; ninguna selección debe depender de la primera página de catálogo.

### UX-02 — Los formularios no utilizan la idempotencia disponible — P1

**Evidencia:** `src/components/SalesDocumentForm.tsx:173` construye el payload sin `idempotencyKey`; `src/components/pos/PosTerminal.tsx:210` crea una venta POS sin esa clave. Los servicios admiten deduplicación opcional en `src/modules/sales/services/sales.service.ts:46` y `src/modules/pos/services/pos.service.ts:102`. La búsqueda de `idempotencyKey` en componentes y hooks no devolvió usos.

**Escenario e impacto:** el servidor confirma una venta, pero se pierde la respuesta. Al reintentar, la interfaz envía otra operación y puede registrar otro documento, movimiento de stock o cobro. Deshabilitar un botón mientras espera no resuelve la pérdida de respuesta.

**Corrección:** asignar una clave estable a cada intención de venta; conservarla en todos los reintentos y renovarla únicamente al iniciar una operación nueva. Acordar con backend la semántica de reutilización de clave y payload, respuesta recuperable y concurrencia. Consolidar este punto con la auditoría de negocio.

**Aceptación:** descartar artificialmente la primera respuesta después de confirmar la transacción y reintentar: debe existir una sola venta y un solo efecto en stock, tesorería y contabilidad. Comprobar también dos envíos simultáneos con la misma clave.

### UX-03 — La previsualización de IVA puede diferir del documento guardado — P1

**Evidencia:** `src/components/SalesDocumentForm.tsx:147` asigna `isExempt` según si el documento es `FACTURA_EXENTA_34`, ignorando `product.isExempt`. La previsualización utiliza ese valor en la línea 129 y permite editarlo en la línea 461. El servidor sustituye el flag por el del catálogo en `src/modules/sales/services/sales.service.ts:77`. Las líneas libres se inicializan con el mismo chequeo limitado al tipo 34 en `SalesDocumentForm.tsx:162`.

**Escenario e impacto:** agregar un producto exento a una venta normal muestra IVA en pantalla, mientras el documento guardado usa la condición exenta del catálogo. Inversamente, marcar manualmente como exento un producto afecto muestra un total que el servidor no conservará. Puede confundir la aprobación del monto y la advertencia de límite de crédito. El hallazgo no afirma que el servidor persista el IVA incorrecto: el servidor observado corrige el atributo del catálogo.

**Corrección:** inicializar las líneas de catálogo desde `product.isExempt`, impedir cambios locales de ese atributo y usar los mismos helpers de tipo de documento para líneas libres. Validar coherencia antes de emitir y actualizar los totales con el resultado confirmado.

**Aceptación:** matriz de productos afectos/exentos, líneas libres, tipos 33/34/39/41, descuentos y documentos mixtos admitidos; total previsualizado, total confirmado y decisión de crédito deben coincidir.

### UX-04 — Cambiar de conversación puede mezclar contexto y borradores — P1

**Evidencia:** `src/components/messaging/MessagingClient.tsx:116` cambia `activeId` y carga mensajes, pero aplica el resultado sin comprobar que siga siendo el chat activo (línea 123). No limpia ni conserva `body` por conversación; el texto es un único estado en la línea 51. Al terminar un envío, la línea 167 añade el mensaje a la lista global y la línea 168 vacía ese mismo borrador sin comprobar la conversación activa. Las subidas añaden adjuntos al estado global en la línea 143.

**Escenario e impacto:** abrir A y después B mientras carga A puede dejar mensajes de A bajo la cabecera de B. Un borrador escrito en A continúa visible al abrir B y puede enviarse a B si el usuario lo confirma. Cambiar de chat durante un envío/subida también puede contaminar el estado visible. No se afirma envío automático ni acceso a conversaciones fuera de los permisos del usuario.

**Corrección:** estado y borradores por ID de conversación, protección frente a respuestas antiguas y resultados de subidas/envíos aplicados exclusivamente al chat de origen. Mostrar el destinatario de forma persistente y gestionar explícitamente el cambio de chat con trabajo pendiente.

**Aceptación:** alternar A/B con demoras artificiales y mientras se escribe, envía y sube un archivo; título, historial, borrador, adjuntos y destino deben conservar la misma identidad.

### UX-05 — Un hilo vacío no recibe su primer mensaje mediante polling — P2

**Evidencia:** `src/components/messaging/MessagingClient.tsx:100` configura polling; en las líneas 101–102 devuelve inmediatamente si no existe `lastId`. El refresco de conversaciones actualiza el listado, pero no carga mensajes del hilo vacío.

**Escenario e impacto:** dos usuarios abren una conversación nueva y uno envía el primer mensaje. El receptor que mantiene abierto el hilo vacío no lo incorpora hasta volver a abrirlo; la lista puede indicar actividad mientras el hilo permanece vacío.

**Corrección:** admitir lectura incremental desde un cursor vacío o ejecutar la carga inicial cuando todavía no hay mensajes. Evitar intervalos superpuestos, deduplicar por ID y pausar solicitudes cuando la pestaña no está visible.

**Aceptación:** dos sesiones aisladas reciben el primer mensaje y los siguientes sin recargar. Un corte de red y la recuperación no deben duplicar mensajes ni acumular solicitudes.

### UX-06 — Las tablas no protegen contra resultados de búsquedas anteriores — P2

**Evidencia:** `src/components/ContactsClient.tsx:45`, `src/components/ProductsClient.tsx:48` y `src/components/SalesHistoryClient.tsx:79` aplican cada resultado a estado sin un identificador de solicitud ni comprobación del filtro vigente. Cambiar filtro reinicia página en un efecto separado (`ContactsClient.tsx:41`, `ProductsClient.tsx:44`, `SalesHistoryClient.tsx:70`).

**Escenario e impacto:** búsquedas, filtros o páginas que cambian durante una carga pueden dejar resultados que corresponden a una solicitud anterior. La interfaz no verifica que las filas y el total correspondan al filtro que muestra. También puede solicitar transitoriamente la página anterior con el filtro nuevo.

**Corrección:** centralizar el estado de consulta/paginación y aplicar únicamente la última respuesta válida. Mantener un estado explícito de carga/error y ajustar una página que quedó fuera de rango después de eliminar registros.

**Aceptación:** con respuestas demoradas y cambios rápidos de búsqueda, orden y página, filas/total/filtros siempre deben coincidir; eliminar el último registro de la última página debe llevar a una página válida.

### UX-07 — El hover de la paleta de comandos activa otra fila — P2

**Evidencia:** `src/components/shared/CommandMenu.tsx:375` define un contador mutable `rowCursor`; cada `onMouseEnter` lee ese mismo contador en las líneas 442, 457, 473 y 489. Al terminar de construir las filas, el contador tiene el índice final. Enter ejecuta `flatItems[activeIndex]` en la línea 370.

**Escenario e impacto:** pasar el ratón sobre cualquier resultado asigna como activo el último índice construido. Pulsar Enter después puede navegar a otro módulo o registro. El click directo utiliza el destino específico de la fila y no presenta el mismo defecto.

**Corrección:** capturar un índice inmutable por fila o renderizar directamente la lista plana con su índice. Vincular el elemento activo con la semántica accesible del buscador y mantenerlo visible al navegar con flechas.

**Aceptación:** hover, flechas, Enter y click seleccionan el mismo resultado con módulos, acciones, contactos y productos combinados.

### UX-08 — La navegación móvil oculta visualmente enlaces que siguen enfocados — P2

**Evidencia:** `src/components/shared/MobileNav.tsx:63` mantiene el drawer montado y lo esconde solamente mediante `translate-x`. No aplica `inert`, ocultación del árbol accesible ni control del foco. El componente completo no contiene cierre con Escape, restauración de foco, bloqueo de foco dentro del drawer ni bloqueo de desplazamiento. El toggle de la línea 36 carece de `aria-expanded` y `aria-controls`.

**Escenario e impacto:** en viewport móvil, Tab puede recorrer enlaces que están fuera de pantalla cuando el menú está cerrado; al abrirlo no existe una política de foco que preserve el contexto. El alcance exacto en lectores de pantalla debe medirse en navegador.

**Corrección:** implementar el drawer con la primitiva de diálogo accesible existente o aplicar una gestión equivalente que respete también el sidebar permanente de escritorio. Añadir un enlace para saltar al contenido y `aria-current` al enlace activo del sidebar (`SidebarNav.tsx:149`).

**Aceptación:** recorrer con teclado una pantalla de 360 px y una de escritorio, abrir/cerrar con Escape y seguir un enlace; no debe haber foco invisible, el foco debe regresar al control apropiado y el contenido debe quedar accesible al cerrar.

### UX-09 — Se ofrecen acciones de escritura a usuarios que solo pueden leer — P2

**Evidencia:** `src/app/(dashboard)/dashboard/contacts/page.tsx:11` y `src/app/(dashboard)/dashboard/products/page.tsx:11` renderizan clientes sin capacidades de escritura. `src/components/ContactsClient.tsx:145` ofrece crear y contiene handlers de editar/eliminar sin condición de permiso. `src/components/ProductsClient.tsx:104` presenta el mismo patrón. `src/components/SalesHistoryClient.tsx:154` ofrece Nueva Venta incondicionalmente. El sidebar y la paleta sí incorporan permisos.

**Escenario e impacto:** un rol con lectura puede acceder a formularios o acciones que el backend finalmente rechaza, dedicar tiempo a completarlos y recibir el rechazo al guardar. Es un problema de experiencia; no se deduce una evasión de autorización del servidor.

**Corrección:** transmitir capacidades calculadas en servidor y renderizar controles coherentes con ellas; explicar restricciones pertinentes. Conservar siempre el control obligatorio del backend.

**Aceptación:** matriz con lector, creador, aprobador y administrador por módulo; cada rol ve únicamente acciones utilizables y las llamadas directas siguen sujetas a permisos del servidor.

### UX-10 — Las fallas de transporte no tienen recuperación consistente — P2

**Evidencia:** `src/components/ContactsClient.tsx:47` y `ProductsClient.tsx:50` esperan acciones sin `catch/finally`, por lo que una promesa rechazada omite el cambio final de carga. `src/components/shared/CommandMenu.tsx:315` espera dos búsquedas sin captura. `SalesDocumentForm.tsx:72` ignora resultados negativos al cargar opciones. `src/hooks/use-product-options.ts:27` silencia la excepción y devuelve un selector vacío. `ContactForm.tsx:144` restaura `saving` con `finally` pero no presenta un fallo de transporte al usuario.

**Escenario e impacto:** pérdida de red, despliegue durante una sesión o expiración pueden dejar un estado Cargando/Buscando permanente o hacer parecer que no existen productos. Los resultados de negocio `{ success: false }` sí se manejan en varios componentes; el vacío concreto corresponde a excepciones de transporte y a cargas silenciosas.

**Corrección:** contrato compartido para `idle/loading/success/empty/error`, captura de transporte, acción de reintento y conservación del trabajo del usuario. Distinguir ausencia de datos, falta de permiso y red caída. No reintentar automáticamente escrituras sin idempotencia.

**Aceptación:** simular desconexión, error 500 y expiración durante listados y formularios; todos deben salir del estado de carga, mostrar una recuperación comprensible y conservar el borrador.

### UX-11 — Borradores extensos y carrito POS no tienen recuperación ante salida — P2

**Evidencia:** `src/components/SalesDocumentForm.tsx:55` y `src/components/pos/PosTerminal.tsx:50` mantienen los datos únicamente en estado React. La búsqueda de `beforeunload` en componentes/hooks no encontró usos; el almacenamiento local detectado corresponde a tutoriales y onboarding. Ventas ofrece guardar como borrador explícito, pero el contenido todavía no guardado carece de recuperación.

**Escenario e impacto:** recargar, cerrar la pestaña o navegar involuntariamente pierde las líneas de una venta o el carrito sin emitir. En formularios extensos, la pérdida obliga a repetir trabajo. No se afirma que se pierdan documentos ya guardados.

**Corrección:** indicador de cambios pendientes y protección al abandonar; diseñar persistencia temporal de borradores/carritos con aislamiento por empresa, usuario y sesión, expiración y limpieza al confirmar. Evitar almacenar credenciales o datos sensibles innecesarios en el navegador.

**Aceptación:** recuperar un borrador tras una recarga, descartar deliberadamente uno y cambiar de empresa/cerrar sesión sin exponer borradores de otra identidad. Restaurar un carrito no debe ejecutar una venta.

### UX-12 — Sidebar y búsqueda de módulos mantienen catálogos distintos — P3

**Evidencia:** `src/components/shared/CommandMenu.tsx:65` declara su propia lista `NAV_ITEMS`; `src/app/(dashboard)/layout.tsx:78` construye otro conjunto. La paleta no incluye varias rutas presentes en sidebar, como calendario, mensajería, presupuestos, pagarés, cuotas, estados financieros, entradas, votación pagada y manual. El comentario de CommandMenu indica que deberían reflejar los mismos módulos.

**Escenario e impacto:** un módulo autorizado y visible en navegación no se encuentra desde el buscador global. Cambiar una etiqueta o permiso exige sincronizar varias listas y favorece divergencias.

**Corrección:** un registro tipado de módulos con etiqueta, ruta, grupo, capacidades y términos de búsqueda; reutilizarlo en sidebar, paleta, ayuda y accesos rápidos.

**Aceptación:** todo enlace de módulo visible en sidebar debe poder encontrarse en la paleta para el mismo contexto de permisos y módulos contratados, incluyendo acentos y sinónimos acordados.

### UX-13 — Formularios y controles compartidos requieren completar accesibilidad y consistencia — P2

**Evidencia:** `src/components/ContactForm.tsx:229` y siguientes muestra errores de campo como párrafos sin enlazarlos al input; `ProductForm.tsx` sigue el patrón `aria-invalid` sin descripción asociada. `SalesDocumentForm.tsx:198` presenta únicamente el primer error como toast. `CommandMenu.tsx:392` tiene un trigger cuyo texto se oculta bajo `sm` y carece de nombre accesible explícito; su input en la línea 415 depende del placeholder. `src/components/shared/NotificationBell.tsx:89` oculta descartar con `opacity-0` y solo lo muestra en hover. Persisten numerosas confirmaciones nativas, pese a existir `ConfirmDialog` en `src/components/ui/alert-dialog.tsx:98`.

**Escenario e impacto:** localizar y corregir varios errores exige buscar visualmente en el formulario; controles sin texto visible/accesible adecuado y acciones de hover dificultan teclado o touch. Las confirmaciones nativas no son por sí mismas una falla de seguridad, pero fragmentan el comportamiento y carecen de los estados de operación del componente común.

**Corrección:** componente de campo con label, descripción, error enlazado y foco al primer error; resumen para formularios largos. Dar nombre accesible a botones de iconos, mostrar acciones con foco y touch, y usar confirmaciones coherentes con alcance e impacto de la operación.

**Aceptación:** completar y corregir formularios con teclado y lector de pantalla, sin depender solo de color o toast. Cada control debe tener nombre comprensible y todas las acciones deben ser descubribles en móvil y teclado.

### UX-14 — No hay una suite automatizada de recorridos UI que proteja estos comportamientos — P1

**Evidencia:** `jest.config.js:4` configura entorno `node` y raíz `tests`; `package.json:8` ejecuta Jest. Hay Playwright como dependencia (`package.json:66`), pero los usos encontrados son scripts de capturas (`scripts/capture-manual-screenshots.ts` y `scripts/_tmp-screenshot-legal.js`), sin configuración/suite de recorridos E2E, Testing Library, jsdom ni axe detectados.

**Impacto:** los tests de negocio existentes no verifican que el usuario pueda encontrar un producto fuera del límite inicial, que el total mostrado coincida, que el teclado active el resultado correcto o que cambiar de chat mantenga el destinatario. Las capturas no equivalen a assertions funcionales.

**Corrección:** crear fixtures en una base exclusivamente de pruebas y una suite pequeña de recorridos críticos que cubra ventas/POS, selector de catálogos grandes, permisos, mensajería, red caída y teclado. Incorporar verificaciones automáticas de accesibilidad y revisión manual de los puntos que no pueda cubrir el automatismo.

**Aceptación:** ejecutar en CI con Chromium y un viewport móvil, sin credenciales ni base de producción. Los escenarios de UX-01 a UX-10 deben tener verificaciones funcionales relevantes; ampliar navegadores según uso real.

## Controles positivos existentes

- La arquitectura utiliza TypeScript estricto, primitivas Base UI y un conjunto compartido de botones, inputs, diálogos, estados vacíos y paginación.
- Hay páginas `loading.tsx`, un error boundary del dashboard con reintento y digest, páginas públicas con límites de error y una pantalla de no encontrado. No corresponde afirmar que esos mecanismos estén ausentes.
- El documento raíz declara `lang="es"`; `src/app/globals.css:349` contempla reducción de movimiento.
- Contactos, productos y ventas ya tienen paginación de servidor, límites de página y búsqueda con debounce. El problema de UX-01 está en los selectores que reutilizan listas truncadas, no en esas tablas de gestión.
- Sidebar y paleta consideran permisos y módulos contratados; existen onboarding, manual, tutoriales y ayudas tributarias.
- Las cantidades monetarias tienen formato chileno, componentes específicos para moneda/RUT y validación con esquemas. Ventas comparte `computeDocument` con el backend, aunque la condición de exención que le entrega el formulario aún diverge.
- POS toma la exención del producto, exige efectivo suficiente en la interfaz, facilita lector de códigos y ofrece impresión. Se requiere validar estos recorridos en navegador e impresora antes de darles conformidad operativa.

## Trabajo recomendado y dependencias

1. **Preparar verificación aislada.** Base de pruebas, usuarios con capacidades distintas, datos sintéticos grandes y simulación de latencia/desconexión; depende del frente de infraestructura. Añadir las primeras pruebas UI a la vez que se corrigen defectos.
2. **Asegurar ventas y selección.** Resolver UX-01, UX-02 y UX-03 junto con backend; priorizar escenarios de monto mostrado, catálogo grande y respuesta de venta perdida.
3. **Asegurar contexto y recuperación.** Resolver UX-04, UX-05, UX-06 y UX-10; usar identificadores de operación/conversación y estados compartidos de carga/error.
4. **Completar navegación y accesibilidad.** Resolver UX-07, UX-08, UX-09, UX-12 y UX-13; comprobar teclado y móvil en las tareas principales.
5. **Reducir pérdidas de trabajo.** Resolver UX-11 y ampliar UX-14 con borradores, cambios de empresa y cierre de sesión.

## Validaciones pendientes antes de afirmar calidad visual y de rendimiento

- Navegación completa a 360, 390, 768 y 1440 px, zoom 200 %, teclado y lector de pantalla; revisar tablas con desplazamiento horizontal y diálogos largos.
- Contraste con las paletas configurables de cada empresa y todos los estados de error, deshabilitado, foco y selección.
- Impresión POS/documentos, lectores de código e impresoras que realmente usan los operadores.
- Rendimiento medido por rutas y datos representativos: carga inicial, duración de búsquedas, tamaño de bundles, número de solicitudes y latencia bajo concurrencia. La importación directa de asistentes/tutoriales en `src/app/(dashboard)/layout.tsx:22` es candidata a medir y diferir, pero no constituye por sí sola una lentitud demostrada.
- Sesiones largas, pestañas múltiples, cambio de empresa, expiración y despliegue durante formularios abiertos.

No se asigna una puntuación de usabilidad ni se afirma conformidad de accesibilidad con esta revisión estática.
