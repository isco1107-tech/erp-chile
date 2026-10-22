# Modelo de procesos de Aether y la Supersuite

31 diagramas BPMN 2.0 sacados del código de `erp-chile` y `supersuite`: cómo llega una empresa, cómo se da de alta y se pone en marcha, cómo opera cada mes y cómo la monitorea, la cobra y la administra la Supersuite.

> Generado con `node docs/procesos/generador/generar.mjs`. No edites los `.bpmn`, este README ni `visor.html` a mano: cambia la definición en `generador/procesos/` y vuelve a generar.

## Cómo abrirlos

**Todo en un solo archivo, para Bizagi:** [`bizagi/modelo-procesos-aether.xpdl`](bizagi/modelo-procesos-aether.xpdl) trae los procesos en un mismo diagrama, una columna por área y cada proceso con su título, con los colores de Bizagi. Bizagi no lo abre con «Abrir» ni con doble clic (eso es solo para `.bpm`): se importa en la pestaña **Exportar/Importar → grupo Importar → XPDL**, y después se guarda como `.bpm`. Pasos completos en [`bizagi/LEEME.txt`](bizagi/LEEME.txt). Hay un XPDL por proceso en [`bizagi/por-proceso/`](bizagi/por-proceso/) y el mismo diagrama único en BPMN 2.0 en [`bizagi/modelo-procesos-aether.bpmn`](bizagi/modelo-procesos-aether.bpmn). Todos cumplen los esquemas oficiales (XPDL 2.2 de la WfMC y BPMN 2.0 de la OMG).

| Herramienta | Cómo |
|---|---|
| **Bizagi Modeler** | El archivo `.xpdl` de [`bizagi/`](bizagi/) (todo junto) o, para un diagrama por proceso, cada archivo de [`bpmn/`](bpmn/) con la opción de importar BPMN 2.0. Cada actividad lleva su descripción con la referencia al código. |
| **Camunda Modeler, bpmn.io, Signavio, Visual Paradigm** | Abren los `.bpmn` directamente. |
| **Navegador** | Abre [`visor.html`](visor.html): mapa, diagramas navegables, fichas y brechas (necesita internet para cargar bpmn-js). |

Los colores van como extensión estándar *BPMN in Color*; un modelador que no la conoce simplemente los ignora.

## Cómo leer los diagramas

| Elemento | Significado en este modelo |
|---|---|
| Piscina (pool) | Una organización o sistema: Aether, la Supersuite, el SII, Khipu, el cliente. Las piscinas grises son participantes externos (caja negra). |
| Carril (lane) | Un rol (Dueño, Contador, Operador de la consola) o un componente del sistema (Sistema Aether, Worker, API de ingesta). |
| Tarea azul con persona | Tarea de usuario: alguien la hace en una pantalla. |
| Tarea gris con engranaje | Tarea automática del sistema. La tabla con líneas es una regla de negocio. |
| Tarea violeta con sobre | Envío o recepción de un mensaje (correo, webhook, orden). |
| Caja dorada con + | Subproceso: tiene su propio diagrama (el código Pxx de su nombre). |
| Círculo verde / rojo | Inicio / fin. Con sobre: llega o sale un mensaje. Con reloj: temporizador o cron (la expresión cron va en el XML). |
| Rombo con X / + / O / pentágono | Decisión exclusiva / paralelo / inclusiva / espera del primer evento que ocurra. |
| Línea punteada entre piscinas | Mensaje entre organizaciones o sistemas. |
| Nota que empieza con «Brecha:» | Algo que el proceso necesita y el código todavía no tiene. |

## Mapa de procesos

**Estratégicos.** Deciden qué empresas entran, qué contratan y si siguen.

- [P00](#p00) Macroproceso: ciclo de vida de una empresa en Aether
- [P01](#p01) Captación y contratación
- [P04](#p04) Cambio de plan o módulos
- [P06](#p06) Telemetría, salud y alertas
- [P07](#p07) Cobro de la suscripción y morosidad

**Operativos.** La cadena de valor: lo que cada empresa hace todos los días en Aether.

- [P02](#p02) Alta de una empresa por orden firmada
- [P03](#p03) Puesta en marcha de la empresa
- [P10](#p10) Ciclo comercial: de la cotización al cobro
- [P11](#p11) Abastecimiento: de la solicitud al pago
- [P12](#p12) Punto de venta: turno de caja
- [P13](#p13) Cierre mensual y F29
- [P14](#p14) Remuneraciones
- [P15](#p15) Rendición de gastos
- [P16](#p16) Servicio técnico
- [P20](#p20) Preparación y lanzamiento del certamen
- [P21](#p21) Postulación y casting de candidatas
- [P22](#p22) Auspicios
- [P23](#p23) Venta de entradas y control de acceso
- [P24](#p24) Votación del público
- [P25](#p25) Evaluación del jurado y escrutinio
- [P26](#p26) Gala final en vivo (escaleta)
- [P27](#p27) Pago en línea de cuotas (Khipu)
- [P30](#p30) Sitio web: de la plantilla a la publicación
- [P31](#p31) Formularios del sitio con destino en el ERP
- [P32](#p32) Academia: inscripción, clases y material

**Soporte.** Lo que hace posible lo anterior: órdenes, despliegue, conexión, acceso y automatizaciones.

- [P05](#p05) Ciclo de vida de una orden de la Supersuite
- [P08](#p08) Despliegue y migraciones
- [P09](#p09) Conexión Aether ↔ Supersuite
- [P33](#p33) Dominio propio
- [P40](#p40) Acceso y seguridad
- [P41](#p41) Automatizaciones de la empresa

## Puesta en marcha, de punta a punta

1. **Infraestructura de Aether** ([P08](#p08)). Proyecto en Vercel sobre Neon. El build de producción aplica las migraciones antes de compilar.
   Variables: `DATABASE_URL`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `CRON_SECRET`, `APP_URL`, `BLOB_READ_WRITE_TOKEN`, `SENTRY_DSN`, `DTE_ENCRYPTION_KEY`, `VERCEL_API_TOKEN`, `AETHER_SALES_EMAIL`, `TURNSTILE_SECRET_KEY`.
2. **Supersuite en Render** ([P08](#p08)). Blueprint render.yaml: base, API, worker y panel. Las migraciones corren en preDeploy. Primer usuario con npm run usuario:crear y después se deja ADMIN_TOKEN vacío.
   Variables: `DATABASE_URL`, `CORS_ORIGIN`, `VITE_API_URL`, `ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `FLOW_API_KEY`, `KHIPU_API_KEY`, `WHATSAPP_TOKEN`.
3. **Conexión Aether ↔ Supersuite** ([P09](#p09)). Producto aether con sus módulos, API key, webhook y secreto; las tres variables en Vercel, ping, fichas y apagar la fase 1.
   Variables: `SUPERSUITE_URL`, `SUPERSUITE_KEY`, `SUPERSUITE_WEBHOOK_SECRET`.
4. **Venta** ([P01](#p01)). Demo sobre los procesos del cliente y propuesta con el tarifario.
5. **Alta de la empresa** ([P02](#p02)). Orden empresa.crear desde la Supersuite. **Bloqueado hoy: ver B1.**
6. **Puesta en marcha de la empresa** ([P03](#p03)). Clave propia, asistente de inicio, CAF, importaciones, roles, plan de cuentas y equipo.
7. **Operación del mes** ([P10](#p10), [P11](#p11), [P12](#p12), [P14](#p14), [P15](#p15), [P16](#p16), [P20](#p20), [P30](#p30), [P13](#p13)). Ventas, compras, caja, personas, certámenes y sitios; cierre y F29 el día 5.
8. **Monitoreo, cobro y crecimiento** ([P06](#p06), [P07](#p07), [P04](#p04)). Salud y alertas en vivo, cobro de la suscripción y ampliación de módulos.

## Brechas encontradas

| | Severidad | Brecha | Procesos |
|---|---|---|---|
| B1 | alta | La Supersuite no puede transmitir empresa.crear ni las otras órdenes nuevas de Aether | [P02](#p02), [P05](#p05) |
| B2 | media | El cierre del período contable no se puede registrar | [P13](#p13) |
| B3 | alta | Los DTE se timbran pero no se envían al SII | [P10](#p10) |
| B4 | media | El borrado permanente de una empresa no tiene vía | [P00](#p00), [P07](#p07) |
| B5 | baja | La entrega del acceso al Dueño nuevo es manual | [P02](#p02), [P03](#p03) |
| B6 | baja | Entradas y votos dependen de una confirmación manual del pago | [P23](#p23), [P24](#p24) |

**B1. La Supersuite no puede transmitir empresa.crear ni las otras órdenes nuevas de Aether.** Aether atiende 15 tipos de orden (ping incluido), pero el catálogo de la Supersuite (TIPOS_ORDEN y el esquema OrdenIn en packages/core) solo tiene 10. Faltan empresa.crear, modulos.listar, seguridad.ip.liberar, acceso.otorgar y acceso.revocar. Como Aether ya no tiene /superadmin, hoy no hay forma de crear una empresa nueva, liberar una lista de IPs que dejó a una empresa afuera ni dar acceso multiempresa. Además, modulo.activar de la Supersuite manda un solo módulo; Aether acepta una lista.

- Dónde: supersuite: packages/core/src/saas.ts y packages/core/src/esquemas.ts · Aether: src/lib/supersuite/ordenes.ts
- Propuesta: Sumar los cinco tipos a TIPOS_ORDEN, ORDENES (rol admin para empresa.crear, seguridad.ip.liberar y acceso.*) y OrdenIn, con empresa.crear sin clienteId ("nunca") y su formulario en la consola.

**B2. El cierre del período contable no se puede registrar.** Existe el permiso accounting:close_period y el diario rechaza asientos en períodos CLOSED o LOCKED, pero ninguna pantalla, acción ni servicio cambia AccountingPeriod a esos estados. El cierre mensual (P13) termina en un paso que el sistema no ofrece.

- Dónde: src/modules/accounting/services/journal.service.ts · src/lib/auth/permissions.ts
- Propuesta: Servicio y acción para cerrar, reabrir y bloquear un período (con requireAuthWithPermission('accounting:close_period') y auditoría).

**B3. Los DTE se timbran pero no se envían al SII.** Pendiente conocido: falta la firma XML-DSig con el certificado de la empresa, el envío (semilla, token, EnvioDTE), la consulta por Track ID y el Consumo de Folios de boletas. siiStatus PENDING significa "timbrado, sin despachar".

- Dónde: src/modules/dte/ · src/lib/chile/dte/
- Propuesta: Implementar el envío en el orden que ya fija CLAUDE.md §3, sin reserializar el XML firmado.

**B4. El borrado permanente de una empresa no tiene vía.** La confirmación con TOTP del superadmin se fue con la consola; platform-delete.service.ts quedó sin llamadores. Una empresa que pide irse solo puede quedar suspendida o cancelada.

- Dónde: src/modules/platform/services/platform-delete.service.ts
- Propuesta: Definir con el dueño cómo se confirma y exponerlo como orden de la Supersuite.

**B5. La entrega del acceso al Dueño nuevo es manual.** empresa.crear lleva la clave inicial en la orden y Aether no envía correo de bienvenida: el operador debe hacerle llegar correo y clave por otro canal.

- Dónde: src/lib/supersuite/ordenes.ts (crearEmpresa)
- Propuesta: Invitación por correo con enlace para fijar la clave, en vez de una clave que viaja en la orden.

**B6. Entradas y votos dependen de una confirmación manual del pago.** No hay pasarela: el staff confirma cada transferencia y una orden sin pagar reserva cupo hasta que alguien la cancela a mano. Es una decisión de diseño, pero en una gala con mucho público es trabajo y riesgo de sobrerreserva.

- Dónde: src/modules/ticketing/ · src/modules/public-voting/
- Propuesta: Reusar el cobro por Khipu de las cuotas (P27), con la misma regla de confirmar contra el proveedor.

## Catálogo

### Plataforma SaaS: Aether y Supersuite

| Código | Proceso | Disparador | Dueño | Archivo |
|---|---|---|---|---|
| [P00](#p00) | Macroproceso: ciclo de vida de una empresa en Aether | Una empresa necesita ordenar su operación tributaria o producir un certamen. | Dirección de Aether | [P00-macroproceso.bpmn](bpmn/P00-macroproceso.bpmn) |
| [P01](#p01) | Captación y contratación | Un prospecto envía la solicitud de demo o el carrito de módulos desde aetherp.online. | Ventas Aether | [P01-captacion-contratacion.bpmn](bpmn/P01-captacion-contratacion.bpmn) |
| [P02](#p02) | Alta de una empresa por orden firmada | Contrato aceptado (fin de P01). | Operaciones Supersuite | [P02-alta-empresa.bpmn](bpmn/P02-alta-empresa.bpmn) |
| [P03](#p03) | Puesta en marcha de la empresa | El Dueño recibe su correo y clave inicial (fin de P02). | Dueño de la empresa cliente (con soporte de Aether) | [P03-puesta-en-marcha.bpmn](bpmn/P03-puesta-en-marcha.bpmn) |
| [P04](#p04) | Cambio de plan o módulos | El Dueño o un Administrador necesita otro módulo o un plan distinto. | Operaciones Supersuite | [P04-cambio-plan-modulos.bpmn](bpmn/P04-cambio-plan-modulos.bpmn) |
| [P05](#p05) | Ciclo de vida de una orden de la Supersuite | Un operador transmite cambios desde la consola SaaS. | Operaciones Supersuite | [P05-ciclo-orden-supersuite.bpmn](bpmn/P05-ciclo-orden-supersuite.bpmn) |
| [P06](#p06) | Telemetría, salud y alertas | Cualquier acción auditada, latido o cambio de ficha en Aether; o los ciclos del worker. | Operaciones Supersuite | [P06-telemetria-salud.bpmn](bpmn/P06-telemetria-salud.bpmn) |
| [P07](#p07) | Cobro de la suscripción y morosidad | Una notificación de pago del proveedor, un pago manual o el ciclo de reglas del worker. | Cobranza Aether (Supersuite) | [P07-cobro-suscripcion.bpmn](bpmn/P07-cobro-suscripcion.bpmn) |
| [P08](#p08) | Despliegue y migraciones | Un cambio listo en una rama. | Desarrollo | [P08-despliegue-migraciones.bpmn](bpmn/P08-despliegue-migraciones.bpmn) |
| [P09](#p09) | Conexión Aether ↔ Supersuite | Primera conexión o cambio de credenciales. | Desarrollo + Operaciones Supersuite | [P09-conexion-supersuite.bpmn](bpmn/P09-conexion-supersuite.bpmn) |

### Núcleo ERP y tributario

| Código | Proceso | Disparador | Dueño | Archivo |
|---|---|---|---|---|
| [P10](#p10) | Ciclo comercial: de la cotización al cobro | Un cliente pide precio o compra. | Jefatura comercial | [P10-ciclo-comercial.bpmn](bpmn/P10-ciclo-comercial.bpmn) |
| [P11](#p11) | Abastecimiento: de la solicitud al pago | Alguien necesita comprar, o llega una factura sin orden de compra. | Jefatura de compras | [P11-abastecimiento.bpmn](bpmn/P11-abastecimiento.bpmn) |
| [P12](#p12) | Punto de venta: turno de caja | Comienza la jornada en una caja. | Jefatura de tienda | [P12-punto-de-venta.bpmn](bpmn/P12-punto-de-venta.bpmn) |
| [P13](#p13) | Cierre mensual y F29 | Día 5 de cada mes a las 08:00 (cron de Vercel). | Contador | [P13-cierre-mensual-f29.bpmn](bpmn/P13-cierre-mensual-f29.bpmn) |
| [P14](#p14) | Remuneraciones | Cierre de mes de remuneraciones. | Encargado de remuneraciones | [P14-remuneraciones.bpmn](bpmn/P14-remuneraciones.bpmn) |
| [P15](#p15) | Rendición de gastos | Un colaborador pagó un gasto de la empresa con su dinero. | Administración | [P15-rendicion-gastos.bpmn](bpmn/P15-rendicion-gastos.bpmn) |
| [P16](#p16) | Servicio técnico | Un cliente deja un equipo. | Jefatura de servicio técnico | [P16-servicio-tecnico.bpmn](bpmn/P16-servicio-tecnico.bpmn) |

### Producción de certámenes

| Código | Proceso | Disparador | Dueño | Archivo |
|---|---|---|---|---|
| [P20](#p20) | Preparación y lanzamiento del certamen | La productora decide hacer un certamen. | Productora del certamen | [P20-preparacion-certamen.bpmn](bpmn/P20-preparacion-certamen.bpmn) |
| [P21](#p21) | Postulación y casting de candidatas | Una persona postula por el link del certamen. | Equipo de casting | [P21-postulacion-casting.bpmn](bpmn/P21-postulacion-casting.bpmn) |
| [P22](#p22) | Auspicios | Una marca muestra interés (micrositio, CRM o contacto directo). | Comercial del certamen | [P22-auspicios.bpmn](bpmn/P22-auspicios.bpmn) |
| [P23](#p23) | Venta de entradas y control de acceso | Un comprador elige entradas en el portal del certamen. | Producción del certamen | [P23-entradas-acreditacion.bpmn](bpmn/P23-entradas-acreditacion.bpmn) |
| [P24](#p24) | Votación del público | Un votante elige candidata y cantidad de votos. | Producción del certamen | [P24-votacion-publico.bpmn](bpmn/P24-votacion-publico.bpmn) |
| [P25](#p25) | Evaluación del jurado y escrutinio | El certamen tiene candidatas oficiales. | Director del certamen | [P25-jurado-escrutinio.bpmn](bpmn/P25-jurado-escrutinio.bpmn) |
| [P26](#p26) | Gala final en vivo (escaleta) | Se acerca la gala final. | Director de show | [P26-gala-en-vivo.bpmn](bpmn/P26-gala-en-vivo.bpmn) |
| [P27](#p27) | Pago en línea de cuotas (Khipu) | Alguien (candidata, apoderado u otro) ingresa al portal /pagar de la empresa. | Cobranza del certamen | [P27-pago-cuotas-khipu.bpmn](bpmn/P27-pago-cuotas-khipu.bpmn) |

### Canales digitales

| Código | Proceso | Disparador | Dueño | Archivo |
|---|---|---|---|---|
| [P30](#p30) | Sitio web: de la plantilla a la publicación | La empresa necesita un sitio para sí o para un cliente de su servicio de diseño web. | Editor del sitio (websites:write / websites:publish) | [P30-sitio-web.bpmn](bpmn/P30-sitio-web.bpmn) |
| [P31](#p31) | Formularios del sitio con destino en el ERP | Un visitante envía un formulario del sitio publicado. | Equipo de la empresa | [P31-formularios-sitio.bpmn](bpmn/P31-formularios-sitio.bpmn) |
| [P32](#p32) | Academia: inscripción, clases y material | Una apoderada o alumna se inscribe por el link de la academia. | Dirección de la academia | [P32-academia.bpmn](bpmn/P32-academia.bpmn) |
| [P33](#p33) | Dominio propio | El cliente tiene un dominio y lo ingresa al crear el sitio o después. | Administrador del sitio | [P33-dominio-propio.bpmn](bpmn/P33-dominio-propio.bpmn) |

### Transversales

| Código | Proceso | Disparador | Dueño | Archivo |
|---|---|---|---|---|
| [P40](#p40) | Acceso y seguridad | Un usuario abre /login. | Seguridad de la plataforma | [P40-acceso-seguridad.bpmn](bpmn/P40-acceso-seguridad.bpmn) |
| [P41](#p41) | Automatizaciones de la empresa | Un hecho de negocio confirmado (venta emitida, stock bajo mínimo, folios por agotarse, entrada o voto pagado…). | Administrador de la empresa | [P41-automatizaciones.bpmn](bpmn/P41-automatizaciones.bpmn) |

## Fichas

### P00

**Macroproceso: ciclo de vida de una empresa en Aether.** Vista de nivel 0: cómo una empresa llega, se da de alta, se pone en marcha, opera cada mes y renueva, amplía o se va.

- **Objetivo:** Mostrar en una sola lámina cómo se encadenan los procesos detallados y quién es responsable de cada tramo.
- **Disparador:** Una empresa necesita ordenar su operación tributaria o producir un certamen.
- **Resultado:** Empresa operando en Aether, monitoreada y cobrada desde la Supersuite.
- **Dueño del proceso:** Dirección de Aether
- **Participantes:** Ciclo de vida de una empresa en Aether (Empresa cliente, Equipo Aether (ventas y soporte), Supersuite (consola SaaS))
- **Módulos:** Todos
- **Diagrama:** [bpmn/P00-macroproceso.bpmn](bpmn/P00-macroproceso.bpmn)

Reglas de negocio:

- Toda la administración de la plataforma (altas, módulos, plan, suspensión) se hace desde la Supersuite como orden firmada; Aether no tiene superusuarios.
- La Supersuite nunca escribe en la base de Aether: pide, Aether aplica y confirma.
- Cada módulo se vende por separado (CompanyFeatures) y se cobra a precio de lista del tarifario.

> **Brecha B4:** El borrado permanente de una empresa no tiene vía.

Código: `src/lib/supersuite/` · `src/modules/platform/` · `src/lib/pricing/`

### P01

**Captación y contratación.** Del formulario de demo o el carrito de módulos de la landing hasta los datos listos para dar de alta la empresa.

- **Objetivo:** Convertir el interés de una empresa en un acuerdo de plan y módulos con los datos que exige el alta.
- **Disparador:** Un prospecto envía la solicitud de demo o el carrito de módulos desde aetherp.online.
- **Resultado:** Datos de alta completos (RUT, razón social, plan, módulos, topes y Dueño) o la oportunidad cerrada como perdida.
- **Dueño del proceso:** Ventas Aether
- **Participantes:** Prospecto (empresa interesada) (externo); Aether (Sitio público aetherp.online, Ventas Aether)
- **Módulos:** Landing (src/components/marketing), Tarifario (src/lib/pricing)
- **Diagrama:** [bpmn/P01-captacion-contratacion.bpmn](bpmn/P01-captacion-contratacion.bpmn)

Reglas de negocio:

- Ninguna de las dos rutas públicas escribe en la base: el destino es el correo de ventas (AETHER_SALES_EMAIL) con replyTo del prospecto.
- Límite por IP, campo señuelo y validación Zod antes de enviar nada.
- Facturación electrónica y Boletas de honorarios están fuera de toda oferta y plan; ninguna empresa supera 5 bodegas.

Código: `src/app/api/public/leads/route.ts` · `src/app/api/public/module-quote/route.ts` · `src/lib/pricing/catalog.ts` · `src/lib/pricing/quote.ts`

### P02

**Alta de una empresa por orden firmada.** La Supersuite transmite empresa.crear; Aether valida, crea la empresa con su Dueño en una transacción y confirma.

- **Objetivo:** Crear la empresa con el plan, los módulos y los topes acordados, sin consola de superusuario en Aether.
- **Disparador:** Contrato aceptado (fin de P01).
- **Resultado:** Empresa ACTIVE o TRIAL con bodega principal, ajustes, Dueño y (si contrató Contabilidad) plan de cuentas; ficha visible en la Supersuite.
- **Dueño del proceso:** Operaciones Supersuite
- **Participantes:** Dueño de la empresa nueva (externo); Supersuite (Operador de la consola, API de la Supersuite); Aether ERP (Webhook /api/supersuite/ordenes, Servicio de plataforma)
- **Módulos:** platform, supersuite
- **Diagrama:** [bpmn/P02-alta-empresa.bpmn](bpmn/P02-alta-empresa.bpmn)

Reglas de negocio:

- La orden se autentica con X-Supersuite-Firma (HMAC-SHA256 con marca de tiempo, máximo 5 minutos) y SUPERSUITE_WEBHOOK_SECRET; sin secreto el endpoint responde 503.
- Idempotente: si el RUT ya existe y lo creó esta misma vía, la reentrega responde "ya estaba creada".
- Una empresa nueva solo nace ACTIVE o TRIAL. El plan trae sus módulos y topes (PLAN_PRESETS); los módulos extra se suman por nombre.
- Si el correo del Dueño ya tiene cuenta, se vincula como Dueño y se activa Multiempresa; si no, se crea con la clave inicial y debe cambiarla al entrar.
- Aether no envía correo de bienvenida: el operador entrega el acceso.

> **Brecha B1:** La Supersuite no puede transmitir empresa.crear ni las otras órdenes nuevas de Aether.

> **Brecha B5:** La entrega del acceso al Dueño nuevo es manual.

Código: `src/lib/supersuite/ordenes.ts (crearEmpresa)` · `src/app/api/supersuite/ordenes/route.ts` · `src/modules/platform/services/platform.service.ts (createTenant)` · `src/modules/accounting/services/chart-setup.service.ts`

### P03

**Puesta en marcha de la empresa.** Primer ingreso del Dueño, asistente de inicio en cuatro pasos y la carga en paralelo de folios, datos, accesos y contabilidad.

- **Objetivo:** Dejar la empresa lista para emitir y trabajar con su equipo, con sus datos actuales como punto de partida.
- **Disparador:** El Dueño recibe su correo y clave inicial (fin de P02).
- **Resultado:** Empresa operando: datos tributarios, bodega, catálogo, equipo invitado, folios y plan de cuentas revisados.
- **Dueño del proceso:** Dueño de la empresa cliente (con soporte de Aether)
- **Participantes:** SII (externo); Puesta en marcha en Aether (Dueño o Administrador, Sistema Aether, Colaborador invitado)
- **Módulos:** auth, inventory, import, dte, roles, accounting, workspace
- **Diagrama:** [bpmn/P03-puesta-en-marcha.bpmn](bpmn/P03-puesta-en-marcha.bpmn)

Reglas de negocio:

- El asistente aparece mientras la empresa tenga como máximo una bodega, ningún producto y ninguna invitación; cada paso se puede omitir.
- Con la clave inicial pendiente, ninguna acción del panel corre hasta cambiarla (mustChangePassword).
- El CAF se valida y se guarda cifrado con AES-256-GCM. Sin CAF, la empresa emite con numeración interna, sin timbre ni validez tributaria (deliberado).
- Las importaciones se revisan en una vista previa antes de confirmar.

> **Brecha B5:** La entrega del acceso al Dueño nuevo es manual.

Código: `src/components/onboarding/OnboardingWizard.tsx` · `src/lib/services/onboarding.service.ts` · `src/modules/dte/` · `src/modules/import/` · `src/lib/auth/guards.ts (assertPasswordChangeNotPending)`

### P04

**Cambio de plan o módulos.** La empresa arma y pide módulos desde Aether; la Supersuite aprueba de un clic y transmite solo lo que falta.

- **Objetivo:** Ampliar lo que una empresa usa sin que Aether active ni cobre nada por su cuenta.
- **Disparador:** El Dueño o un Administrador necesita otro módulo o un plan distinto.
- **Resultado:** Módulos encendidos, solicitud cerrada sola y ficha comercial (tarifa) actualizada en la Supersuite; o solicitud rechazada con respuesta a la empresa.
- **Dueño del proceso:** Operaciones Supersuite
- **Participantes:** Empresa cliente (Aether) (Dueño o Administrador, Sistema Aether); Supersuite (API y panel en vivo, Operador de la consola)
- **Módulos:** workspace (planes), pricing, supersuite
- **Diagrama:** [bpmn/P04-cambio-plan-modulos.bpmn](bpmn/P04-cambio-plan-modulos.bpmn)

Reglas de negocio:

- La cotización se recalcula siempre en el servidor. Pedir módulos solo avisa por correo a ventas y abre la alerta: no activa nada ni cobra.
- Hay una sola solicitud abierta por empresa (alerta solicitud-modulos); la última reemplaza a la anterior.
- plan.cambiar suma los módulos y topes del plan y nunca quita lo que ya tenía; apagar es modulo.desactivar. La plataforma base no se apaga.
- Entradas y votación del público se encienden juntos. Bodegas: tope 5.

Código: `src/modules/workspace/actions/plans.actions.ts (requestModulesAction)` · `src/lib/pricing/quote.ts` · `src/lib/supersuite/ordenes.ts (cambiarModulos, plan.cambiar)` · `supersuite: apps/api/src/routes/saas.ts (solicitudes/:id/aprobar)`

### P05

**Ciclo de vida de una orden de la Supersuite.** Cómo viaja una orden de la consola a Aether: cola, entrega firmada, reintentos, confirmación y vencimiento.

- **Objetivo:** Garantizar que cada cambio de la consola se aplique una sola vez en Aether, o quede fallido a la vista, nunca perdido.
- **Disparador:** Un operador transmite cambios desde la consola SaaS.
- **Resultado:** Orden aplicada (copia de la cuenta actualizada) o fallida/vencida en la bitácora, con aviso en el panel.
- **Dueño del proceso:** Operaciones Supersuite
- **Participantes:** Supersuite (Operador de la consola, API: entregas, Worker (limpieza)); Aether ERP (Webhook de órdenes)
- **Módulos:** supersuite (consola SaaS), Aether: /api/supersuite/ordenes
- **Diagrama:** [bpmn/P05-ciclo-orden-supersuite.bpmn](bpmn/P05-ciclo-orden-supersuite.bpmn)

Reglas de negocio:

- Estados: pendiente → entregado → aplicado, o fallido, cancelado o vencido.
- Entrega por webhook con reintentos de espera creciente (10 s, 20 s, 40 s… hasta 10 min); a los 8 intentos queda fallida. Timeout de 8 s.
- Una entregada sin confirmar en 2 minutos se vuelve a entregar por consulta (lease de 120 s). Nadie la recoge en 72 h: vencida.
- Todos los manejadores de Aether son idempotentes: activar algo ya activo responde "Ya estaba activo".
- Un tipo sin manejador se informa como fallido, nunca se ignora en silencio.

> **Brecha B1:** La Supersuite no puede transmitir empresa.crear ni las otras órdenes nuevas de Aether.

Código: `supersuite: apps/api/src/lib/ordenes.ts` · `supersuite: apps/worker/src/jobs/ordenes.ts` · `supersuite: packages/core/src/saas.ts` · `src/lib/supersuite/cliente.ts (responderWebhook, verificarFirma)` · `src/lib/supersuite/ordenes.ts`

### P06

**Telemetría, salud y alertas.** Aether reporta uso, presencia, cajas, folios y fichas; la Supersuite calcula salud y riesgo, abre alertas y avisa por WhatsApp.

- **Objetivo:** Ver en vivo qué empresas usan qué, detectar riesgo de fuga y problemas operativos antes que el cliente.
- **Disparador:** Cualquier acción auditada, latido o cambio de ficha en Aether; o los ciclos del worker.
- **Resultado:** Panel en vivo, salud y riesgo calculados, alertas abiertas o resueltas y avisos críticos en el teléfono.
- **Dueño del proceso:** Operaciones Supersuite
- **Participantes:** Aether ERP (Puntos centrales de Aether); Supersuite (API de ingesta, Worker, Equipo de la Supersuite); WhatsApp del equipo (externo)
- **Módulos:** supersuite, audit, presence, pos, alerts
- **Diagrama:** [bpmn/P06-telemetria-salud.bpmn](bpmn/P06-telemetria-salud.bpmn)

Reglas de negocio:

- El SDK nunca lanza ni frena a Aether: agrupa en lotes, envía con after() y descarta lo más antiguo si la Supersuite está caída.
- Solo viajan ids, módulo y acción: nunca datos personales ni de documentos. El usuario va como id opaco.
- Una acción de un módulo de negocio cuenta como uso; lo demás llega como "plataforma" y no cuenta para adopción ni salud.
- Salud = 45 % conectividad + 35 % adopción de módulos + 20 % actividad reciente. Cliente inactivo: sin eventos en 7 días.
- WhatsApp: hasta 3 alertas críticas por minuto una por una; más que eso, un solo resumen.

Código: `src/lib/supersuite/index.ts` · `src/lib/auth/audit.ts (createAuditLog)` · `src/app/api/presence/route.ts` · `supersuite: apps/api/src/routes/ingesta.ts` · `supersuite: apps/worker/src/jobs/` · `supersuite: packages/core/src/metricas.ts`

### P07

**Cobro de la suscripción y morosidad.** Pagos por Flow, Khipu o a mano; alertas de morosidad y suspensión o reactivación de la cuenta por orden.

- **Objetivo:** Saber quién pagó lo que debía y actuar sobre los atrasos sin intervenir la base de Aether.
- **Disparador:** Una notificación de pago del proveedor, un pago manual o el ciclo de reglas del worker.
- **Resultado:** Pago registrado y MRR real; o alerta de morosidad, cuenta suspendida y luego reactivada al pagar.
- **Dueño del proceso:** Cobranza Aether (Supersuite)
- **Participantes:** Empresa cliente (externo); Flow / Khipu (externo); Supersuite (API de la Supersuite, Worker (reglas), Operador o admin); Aether ERP (Sistema Aether)
- **Módulos:** supersuite (Cobros), Aether: platform
- **Diagrama:** [bpmn/P07-cobro-suscripcion.bpmn](bpmn/P07-cobro-suscripcion.bpmn)

Reglas de negocio:

- La notificación nunca se cree: solo aporta el id; el estado y el monto se piden a la API del proveedor con la credencial propia.
- Orden de comercio ss:<proyecto>:<cliente>:<YYYY-MM>; los reenvíos no duplican pagos y un pago confirmado no vuelve atrás.
- Morosidad: más de 35 días sin pagar abre alerta alta; más de 60, crítica. Se cierra sola al pagar.
- Suspender es de rol admin. Una empresa suspendida pierde el acceso desde el login y en cada request; una cancelada no se reactiva por orden.

> **Brecha B4:** El borrado permanente de una empresa no tiene vía.

Código: `supersuite: apps/api/src/lib/pagos.ts` · `supersuite: apps/api/src/routes/webhooks.ts` · `supersuite: apps/worker/src/jobs/reglas.ts` · `src/lib/supersuite/ordenes.ts (cambiarEstado)` · `src/modules/auth/services/auth.service.ts (SuspendedCompanyError)`

### P08

**Despliegue y migraciones.** De la rama al aire: CI, revisión, migraciones aplicadas en el build de Vercel y la Supersuite en Render.

- **Objetivo:** Llevar cambios a producción sin dejar código nuevo contra un esquema viejo (ni al revés) sobre la base compartida.
- **Disparador:** Un cambio listo en una rama.
- **Resultado:** Producción actualizada con sus migraciones; o build rechazado y la versión anterior sigue viva.
- **Dueño del proceso:** Desarrollo
- **Participantes:** Entrega de Aether a producción (Desarrollador, GitHub Actions (CI), Vercel: build de producción); Neon PostgreSQL (misma base que producción) (externo); Supersuite en Render (Blueprint render.yaml)
- **Módulos:** CI, Vercel, Neon, Render
- **Diagrama:** [bpmn/P08-despliegue-migraciones.bpmn](bpmn/P08-despliegue-migraciones.bpmn)

Reglas de negocio:

- La DATABASE_URL local es la misma base de producción: una migración aplicada en local ya está en producción.
- Migraciones aditivas e idempotentes (IF NOT EXISTS, duplicate_object); revisar el SQL con prisma migrate diff antes de aplicarlo.
- El build de producción aplica las migraciones (VERCEL_ENV=production o MIGRATE_ON_BUILD=1); si una falla, el build falla y queda la versión anterior. Reintenta solo una marcada como fallida (P3009).
- npm run ci (prisma validate, typecheck, lint, test) debe pasar antes de dar algo por terminado.

Código: `.github/workflows/ci.yml` · `scripts/migrate-deploy.mjs` · `vercel.json (crons)` · `supersuite: render.yaml` · `tests/migrations-idempotent.test.ts`

### P09

**Conexión Aether ↔ Supersuite.** Puesta en marcha de la integración: producto, API key, webhook y secreto, variables en Vercel, ping y carga de fichas.

- **Objetivo:** Dejar a Aether reportando en tiempo real y recibiendo órdenes firmadas, sin contar eventos dos veces.
- **Disparador:** Primera conexión o cambio de credenciales.
- **Resultado:** Consola muestra "Aether escucha órdenes", el ping responde y todas las fichas están cargadas.
- **Dueño del proceso:** Desarrollo + Operaciones Supersuite
- **Participantes:** Supersuite (Admin de la Supersuite, API de la Supersuite); Aether (Administrador de Aether (Vercel), Aether en producción)
- **Módulos:** supersuite (Conexión), Vercel
- **Diagrama:** [bpmn/P09-conexion-supersuite.bpmn](bpmn/P09-conexion-supersuite.bpmn)

Reglas de negocio:

- La API key y el secreto del webhook se muestran una sola vez y se guardan hasheados en la Supersuite.
- Variables de Aether: SUPERSUITE_URL, SUPERSUITE_KEY y SUPERSUITE_WEBHOOK_SECRET (Vercel, producción). Sin URL ni key, la telemetría es un no-op.
- La fase 1 (lectura de una réplica) solo trae la historia inicial: con las dos fases encendidas los eventos se cuentan dos veces y la tarifa se pisa.

Código: `supersuite: apps/api/src/routes/saas.ts (proyectos, keys, secreto)` · `supersuite: docs/conectar-aether.md` · `src/lib/supersuite/index.ts` · `src/app/api/supersuite/ordenes/route.ts`

### P10

**Ciclo comercial: de la cotización al cobro.** Cotización, emisión del documento (folio, timbre, kardex, asiento y cobro en una transacción) y cobranza hasta el pago.

- **Objetivo:** Vender con el impuesto, el folio, el inventario y la contabilidad correctos, y cobrar lo que queda a crédito.
- **Disparador:** Un cliente pide precio o compra.
- **Resultado:** Documento emitido, stock y PMP actualizados, asiento contable y documento pagado (o en cobranza).
- **Dueño del proceso:** Jefatura comercial
- **Participantes:** Cliente (externo); Aether ERP (Vendedor, Sistema Aether, Tesorería y cobranza)
- **Módulos:** sales, dte, inventory, accounting, treasury
- **Diagrama:** [bpmn/P10-ciclo-comercial.bpmn](bpmn/P10-ciclo-comercial.bpmn)

Reglas de negocio:

- IVA 19 % redondeado una vez sobre el neto y repartido por resto mayor (calc.ts). La condición de exento se lee siempre del catálogo, nunca del formulario.
- Folio desde el CAF con SELECT … FOR UPDATE dentro de la transacción: si la emisión falla, el folio vuelve atrás y no queda hueco. Sin CAF, contador interno sin timbre (deliberado).
- Límite de crédito con bloqueo del cliente; una nota de crédito no se bloquea por límite.
- Una factura que formaliza una guía no vuelve a descontar stock. La venta al contado deja un Payment real.
- Cada emisión lleva idempotencyKey: el reintento devuelve el mismo documento. Las automatizaciones se disparan después de confirmar.
- Un DTE emitido se corrige con nota de crédito (61); anular solo vale antes de llegar al SII.

> **Brecha B3:** Los DTE se timbran pero no se envían al SII.

Código: `src/modules/sales/services/sales.service.ts (createSalesDocument)` · `src/modules/sales/calc.ts` · `src/modules/dte/` · `src/lib/chile/dte/` · `src/modules/inventory/services/stock.service.ts` · `src/modules/treasury/services/collections.service.ts`

### P11

**Abastecimiento: de la solicitud al pago.** Solicitud aprobada, cotizaciones, orden de compra, recepción con PMP, factura con matching de 3 vías o umbral de aprobación, y pago.

- **Objetivo:** Comprar lo aprobado, valorizar el inventario por PMP y pagar solo lo que cuadra.
- **Disparador:** Alguien necesita comprar, o llega una factura sin orden de compra.
- **Resultado:** Mercadería en bodega al PMP correcto, deuda contabilizada y pagada y conciliada.
- **Dueño del proceso:** Jefatura de compras
- **Participantes:** Proveedor (externo); Aether ERP (Solicitante, Compras, Bodega, Sistema Aether, Aprobador (purchases:approve), Tesorería)
- **Módulos:** purchases, inventory, accounting, treasury
- **Diagrama:** [bpmn/P11-abastecimiento.bpmn](bpmn/P11-abastecimiento.bpmn)

Reglas de negocio:

- Nuevo PMP = (stock × costo actual + cantidad entrante × costo entrante) / (stock + cantidad entrante), redondeado a 2 decimales, con bloqueo FOR UPDATE del producto.
- Con orden de compra, el stock entra en la recepción y la factura solo formaliza y dispara el matching de 3 vías; una diferencia (MISMATCHED) bloquea el pago hasta resolverse.
- Sin orden de compra, una factura sobre el umbral (purchaseApprovalThreshold) queda pendiente sin tocar stock ni PMP hasta que alguien con purchases:approve la apruebe.
- La factura, no la recepción, es el hecho contable que genera la deuda con el proveedor.

Código: `src/modules/purchases/services/purchase-request.service.ts` · `src/modules/purchases/services/purchase-order.service.ts` · `src/modules/purchases/services/goods-receipt.service.ts` · `src/modules/purchases/services/purchases.service.ts` · `src/lib/inventory/pmp.ts` · `src/modules/treasury/services/payment-batches.service.ts`

### P12

**Punto de venta: turno de caja.** Apertura del turno, ventas con boleta, movimientos de efectivo y cierre con arqueo; la caja reporta su estado a la Supersuite.

- **Objetivo:** Vender rápido en el local sin perder el control del efectivo ni del inventario.
- **Disparador:** Comienza la jornada en una caja.
- **Resultado:** Turno cerrado con arqueo y diferencia justificada; ventas con stock, cobro y asiento.
- **Dueño del proceso:** Jefatura de tienda
- **Participantes:** Cliente en el local (externo); Aether POS (Cajero, Sistema Aether, Supervisor); Supersuite (externo)
- **Módulos:** pos, sales, inventory, accounting, supersuite
- **Diagrama:** [bpmn/P12-punto-de-venta.bpmn](bpmn/P12-punto-de-venta.bpmn)

Reglas de negocio:

- Cada venta lleva idempotencyKey (createIdempotencyTracker): un reintento no duplica la boleta.
- La venta descuenta stock al PMP vigente, registra el cobro y el asiento en la misma transacción; sin stock se bloquea salvo allowNegativeStock.
- Abrir turno y la pantalla del POS abierta envían latidos; cerrar turno envía "apagado", así la Supersuite no alerta de noche.

Código: `src/modules/pos/services/cash.service.ts` · `src/modules/pos/services/pos.service.ts (createPosSale)` · `src/lib/idempotency.ts`

### P13

**Cierre mensual y F29.** El cron del día 5 calcula el F29 del mes anterior y las cuadraturas; el contador corrige, declara en el SII y cierra.

- **Objetivo:** Declarar el IVA y el PPM correctos a tiempo, con la contabilidad cuadrada contra los documentos.
- **Disparador:** Día 5 de cada mes a las 08:00 (cron de Vercel).
- **Resultado:** F29 calculado, revisado y declarado; diferencias corregidas.
- **Dueño del proceso:** Contador
- **Participantes:** SII (externo); Aether ERP (Cron de Vercel, Sistema Aether, Contador)
- **Módulos:** accounting, dte, fixed-assets
- **Diagrama:** [bpmn/P13-cierre-mensual-f29.bpmn](bpmn/P13-cierre-mensual-f29.bpmn)

Reglas de negocio:

- F29 real sobre documentos ISSUED del período: débito, crédito, remanente del mes anterior, PPM según ppmRateBasisPoints e impuesto determinado.
- Corre para toda empresa con facturación electrónica; las cuadraturas solo si el plan de cuentas está mapeado.
- El mes se cierra en hora de Santiago, no en UTC.
- Un período que no está OPEN no admite asientos nuevos.

> **Brecha B2:** El cierre del período contable no se puede registrar.

Código: `src/modules/accounting/services/monthly-closing-cron.service.ts` · `src/lib/chile/f29.ts` · `src/modules/accounting/services/reconciliation.service.ts` · `src/modules/fixed-assets/ (postMonthlyDepreciation)` · `vercel.json`

### P14

**Remuneraciones.** Período del mes con parámetros confirmados contra Previred, cálculo de liquidaciones, cierre con asiento y portal del trabajador.

- **Objetivo:** Pagar sueldos correctos con los parámetros legales del mes, sin cifras escritas en el código.
- **Disparador:** Cierre de mes de remuneraciones.
- **Resultado:** Período CLOSED, liquidaciones definitivas visibles para cada trabajador, asiento contable y cotizaciones declaradas.
- **Dueño del proceso:** Encargado de remuneraciones
- **Participantes:** Trabajadores (externo); Aether ERP (Encargado de remuneraciones, Sistema Aether, Dueño o Contador (payroll:close)); Previred (externo)
- **Módulos:** hr, accounting
- **Diagrama:** [bpmn/P14-remuneraciones.bpmn](bpmn/P14-remuneraciones.bpmn)

Reglas de negocio:

- UF, UTM, topes y tasas nunca se escriben en el código: entran como parámetros guardados en el período y la pantalla obliga a confirmarlos contra Previred.
- El cálculo es una función pura (payroll.ts).
- Si cambian anticipos o préstamos después del cálculo, no se puede cerrar: hay que recalcular.
- Cerrar descuenta las cuotas de préstamos y genera el asiento contable en la misma transacción.

Código: `src/lib/chile/payroll.ts` · `src/modules/hr/services/payroll.service.ts (calculatePeriod, closePeriod)` · `src/modules/hr/services/employee-portal.service.ts`

### P15

**Rendición de gastos.** El colaborador rinde lo que pagó, un aprobador decide y Tesorería reembolsa; lo rechazado vuelve a corregirse.

- **Objetivo:** Devolver a tiempo lo que el equipo paga por la empresa, con respaldo y aprobación.
- **Disparador:** Un colaborador pagó un gasto de la empresa con su dinero.
- **Resultado:** Rendición REIMBURSED con la referencia del reembolso.
- **Dueño del proceso:** Administración
- **Participantes:** Aether ERP (Colaborador, Aprobador, Tesorería)
- **Módulos:** expenses
- **Diagrama:** [bpmn/P15-rendicion-gastos.bpmn](bpmn/P15-rendicion-gastos.bpmn)

Reglas de negocio:

- DRAFT → SUBMITTED → APPROVED → REIMBURSED; una REJECTED vuelve a editarse y enviarse.
- Una rendición enviada no se modifica; cada transición usa un UPDATE condicionado al estado anterior.
- Cada gasto puede imputarse a un proyecto o certamen.

Código: `src/modules/expenses/services/expenses.service.ts`

### P16

**Servicio técnico.** Recepción del equipo, diagnóstico, presupuesto aprobado por el cliente en su enlace, reparación y entrega facturada.

- **Objetivo:** Reparar con el visto bueno del cliente y facturar repuestos y mano de obra por el flujo normal de ventas.
- **Disparador:** Un cliente deja un equipo.
- **Resultado:** Equipo entregado (DELIVERED) con su boleta o factura; u orden cancelada si rechaza el presupuesto.
- **Dueño del proceso:** Jefatura de servicio técnico
- **Participantes:** Cliente (externo); Aether ERP (Recepción, Técnico, Sistema Aether)
- **Módulos:** service-desk, sales
- **Diagrama:** [bpmn/P16-servicio-tecnico.bpmn](bpmn/P16-servicio-tecnico.bpmn)

Reglas de negocio:

- RECEIVED → DIAGNOSING → WAITING_APPROVAL → APPROVED → IN_REPAIR → READY → DELIVERED (o CANCELLED).
- El enlace del cliente se arma campo por campo: no muestra RUT, notas internas ni el técnico.
- La orden genera una nota de venta con repuestos (reservados en bodega) y mano de obra; la boleta o factura sale desde ahí.

Código: `src/modules/service-desk/services/service-tickets.service.ts` · `src/app/servicio/[token]`

### P20

**Preparación y lanzamiento del certamen.** Proyecto con presupuesto, convocatoria, micrositio, auspicios, entradas y jurado en paralelo, checklist del centro de mando y campaña.

- **Objetivo:** Lanzar el certamen con todo lo público configurado y sin datos inventados.
- **Disparador:** La productora decide hacer un certamen.
- **Resultado:** Micrositio publicado, convocatoria abierta y afiches de campaña generados.
- **Dueño del proceso:** Productora del certamen
- **Participantes:** Público (externo); Aether ERP (Productora (projects:write), Sistema Aether)
- **Módulos:** projects, candidates, sponsorships, ticketing, public-voting, judging
- **Diagrama:** [bpmn/P20-preparacion-certamen.bpmn](bpmn/P20-preparacion-certamen.bpmn)

Reglas de negocio:

- El micrositio se arma campo por campo, nunca con include completo: de una candidata solo nombre artístico, número, representación, foto y bio pública.
- El contacto público (correo, WhatsApp, Instagram) vive en el proyecto; nunca contactos fijos en código.
- Los afiches nunca inventan un dato: una pieza sin su dato no está disponible y pieceAvailability dice qué configurar.
- Un plan de auspicio sin certamen es plantilla del tarifario general: se copia al certamen antes de publicarlo.

Código: `src/modules/projects/services/hub.service.ts` · `src/lib/events/readiness.ts` · `src/modules/projects/services/public-site.service.ts` · `src/lib/posters/` · `src/modules/projects/services/poster.service.ts`

### P21

**Postulación y casting de candidatas.** Formulario público con controles antibots, ficha con número de postulación, revisión, casting y nombramiento como candidata oficial.

- **Objetivo:** Recibir postulaciones de forma segura y llevar a las seleccionadas hasta el micrositio.
- **Disparador:** Una persona postula por el link del certamen.
- **Resultado:** Candidata oficial con contrato, documentos y presentación pública; las no seleccionadas se purgan al vencer la retención.
- **Dueño del proceso:** Equipo de casting
- **Participantes:** Postulante (externo); Aether ERP (Sistema Aether, Equipo de casting, Producción)
- **Módulos:** candidates, payment-plans, automation
- **Diagrama:** [bpmn/P21-postulacion-casting.bpmn](bpmn/P21-postulacion-casting.bpmn)

Reglas de negocio:

- La empresa y el certamen salen siempre del token del link, nunca del cuerpo. Límites por IP, señuelo y Turnstile.
- El correo de confirmación va con replyTo del contacto público del certamen y queda fuera de la transacción (after()).
- Etapas: APPLICANT → UNDER_REVIEW → CALLED_TO_CASTING → OFFICIAL_CANDIDATE → FINALIST → WINNER (o WITHDRAWN, REJECTED).
- Los campos públicos de la candidata tienen esquema y acción propios: el formulario de postulación nunca puede escribirlos.

Código: `src/app/api/public/candidates/[token]/apply/route.ts` · `src/modules/candidates/services/` · `vercel.json (/api/candidates/purge-retention/cron)`

### P22

**Auspicios.** De la propuesta con un paquete del tarifario al convenio firmado, los pagos y el cumplimiento de contraprestaciones.

- **Objetivo:** Cerrar y cobrar auspicios con lo prometido a cada marca cumplido y a la vista.
- **Disparador:** Una marca muestra interés (micrositio, CRM o contacto directo).
- **Resultado:** Auspicio COMPLETED: pagado y con sus contraprestaciones cumplidas.
- **Dueño del proceso:** Comercial del certamen
- **Participantes:** Auspiciador (externo); Aether ERP (Comercial del certamen, Sistema Aether, Producción)
- **Módulos:** sponsorships, crm
- **Diagrama:** [bpmn/P22-auspicios.bpmn](bpmn/P22-auspicios.bpmn)

Reglas de negocio:

- Estados: PROPOSAL → CONFIRMED → COMPLETED (o CANCELLED).
- El estado de pago se recalcula siempre en el servidor a partir del monto pagado.
- El micrositio publica los paquetes sin «+ IVA»; la plantilla del tarifario general no se publica hasta copiarla al certamen.

Código: `src/modules/sponsorships/services/sponsorships.service.ts` · `src/modules/sponsorships/services/packages.service.ts` · `src/modules/sponsorships/services/agreement-pdf.service.ts`

### P23

**Venta de entradas y control de acceso.** Orden pública que reserva cupo, pago por transferencia confirmado por el staff, entrada con QR y lectura en la puerta.

- **Objetivo:** Vender sin sobreventa y dejar entrar solo a quien pagó, una vez.
- **Disparador:** Un comprador elige entradas en el portal del certamen.
- **Resultado:** Entrada pagada con QR y asistente registrado en la puerta; o cupo liberado si no paga.
- **Dueño del proceso:** Producción del certamen
- **Participantes:** Comprador (externo); Aether ERP (Portal público de entradas, Sistema Aether, Staff del certamen)
- **Módulos:** ticketing, automation
- **Diagrama:** [bpmn/P23-entradas-acreditacion.bpmn](bpmn/P23-entradas-acreditacion.bpmn)

Reglas de negocio:

- La empresa y el certamen salen siempre del token; nunca de un campo del formulario.
- El cupo se descuenta contra todas las órdenes, pagadas o no, con bloqueo de fila: una orden sin pagar reserva el cupo.
- No hay pasarela: el staff confirma el pago y el estado se recalcula en el servidor. El correo con el QR sale fuera de la transacción.
- El ingreso es idempotente: un QR ya usado no vuelve a registrar.

> **Brecha B6:** Entradas y votos dependen de una confirmación manual del pago.

Código: `src/modules/ticketing/services/ticketing.service.ts`

### P24

**Votación del público.** Orden de votos con el precio del link, pago confirmado por el staff y ranking en vivo solo con órdenes pagadas.

- **Objetivo:** Recaudar con votos pagados y mostrar un ranking que solo cuente votos reales.
- **Disparador:** Un votante elige candidata y cantidad de votos.
- **Resultado:** Votos contados en el ranking y confirmación al comprador; o la orden descartada.
- **Dueño del proceso:** Producción del certamen
- **Participantes:** Votante (externo); Aether ERP (Portal público de votación, Sistema Aether, Staff del certamen)
- **Módulos:** public-voting
- **Diagrama:** [bpmn/P24-votacion-publico.bpmn](bpmn/P24-votacion-publico.bpmn)

Reglas de negocio:

- Empresa, certamen y precio por voto salen siempre del token del link, nunca del formulario.
- Una orden UNPAID no es un voto: el ranking solo suma órdenes PAID.
- El correo de confirmación sale una sola vez, fuera de la transacción.

> **Brecha B6:** Entradas y votos dependen de una confirmación manual del pago.

Código: `src/modules/public-voting/services/public-voting.service.ts`

### P25

**Evaluación del jurado y escrutinio.** Rondas con criterios ponderados, votación del jurado por enlace, resultado recalculado, cortes y acta de escrutinio.

- **Objetivo:** Elegir finalistas y ganadora con un escrutinio ponderado, auditable y corregible en vivo.
- **Disparador:** El certamen tiene candidatas oficiales.
- **Resultado:** Ganadora proclamada, acta de escrutinio en PDF y resultados publicados.
- **Dueño del proceso:** Director del certamen
- **Participantes:** Aether ERP (Director del certamen, Jurado (acceso por enlace), Sistema Aether)
- **Módulos:** judging, candidates, projects
- **Diagrama:** [bpmn/P25-jurado-escrutinio.bpmn](bpmn/P25-jurado-escrutinio.bpmn)

Reglas de negocio:

- Ronda: DRAFT → READY → VOTING → VOTING_CLOSED → COMPLETED. "Votar ahora" equilibra los criterios a 100 % si hace falta y cierra cualquier otra ronda en votación.
- El resultado ponderado se recalcula en cada consulta; nunca se persiste.
- Una ronda que ya entró en votación no se borra: es un hecho de producción en vivo. Se puede reabrir para corregir.

Código: `src/modules/judging/services/rounds.service.ts` · `src/modules/judging/services/judging.service.ts` · `src/modules/judging/services/scrutiny-pdf.service.ts`

### P26

**Gala final en vivo (escaleta).** Escaleta, vestuario, acreditación y ensayo en paralelo; luego el modo show recorre los segmentos e intercala las rondas del jurado.

- **Objetivo:** Conducir la gala segmento a segmento con todo el equipo viendo lo mismo.
- **Disparador:** Se acerca la gala final.
- **Resultado:** Gala terminada con coronación.
- **Dueño del proceso:** Director de show
- **Participantes:** Aether ERP (Director de show, Backstage: vestuario y acreditación, Sistema Aether (modo show), Jurado)
- **Módulos:** production, judging
- **Diagrama:** [bpmn/P26-gala-en-vivo.bpmn](bpmn/P26-gala-en-vivo.bpmn)

Reglas de negocio:

- Cada segmento pasa por PENDING → IN_PROGRESS → DONE o SKIPPED.
- Las rondas del jurado se abren desde la escaleta con el flujo de P25.
- El ingreso del público se controla con el QR de su entrada (P23).

Código: `src/modules/production/services/production.service.ts`

### P27

**Pago en línea de cuotas (Khipu).** Portal público por RUT de la beneficiaria, cobro en Khipu, confirmación solo consultando a Khipu, comprobante numerado y correo.

- **Objetivo:** Cobrar cuotas en línea sin que una notificación falsa o un retorno del navegador marquen algo como pagado.
- **Disparador:** Alguien (candidata, apoderado u otro) ingresa al portal /pagar de la empresa.
- **Resultado:** Orden PAID aplicada a las cuotas, comprobante no tributario numerado y enviado por correo; o la orden vencida.
- **Dueño del proceso:** Cobranza del certamen
- **Participantes:** Pagador (candidata, apoderado u otro) (externo); Aether ERP (Portal público /pagar, Sistema Aether, Cobranza automática); Khipu (externo)
- **Módulos:** payment-plans, Khipu
- **Diagrama:** [bpmn/P27-pago-cuotas-khipu.bpmn](bpmn/P27-pago-cuotas-khipu.bpmn)

Reglas de negocio:

- Una orden solo pasa a PAID en syncOrderWithProvider: consulta el cobro a Khipu y exige monto, moneda y transaction_id exactos.
- La API key de Khipu es por empresa, cifrada (khipuApiCredential), y solo la edita quien tiene settings:company.
- Al pagarse se aplica a las cuotas, se numera el comprobante (INSTALLMENT_RECEIPT, PDF no tributario) y se envía por correo.

Código: `src/modules/payment-plans/services/online-payment.service.ts` · `src/lib/payments/khipu.ts` · `src/app/api/public/installments/` · `vercel.json (/api/payment-plans/overdue-reminder/cron)`

### P30

**Sitio web: de la plantilla a la publicación.** Plantilla por propósito, edición guiada o HTML propio en borrador, lista de lo que falta y publicación revalidada en el servidor.

- **Objetivo:** Publicar un sitio (propio o de un cliente) sin exponer el borrador ni código ajeno ejecutable desde nuestro dominio.
- **Disparador:** La empresa necesita un sitio para sí o para un cliente de su servicio de diseño web.
- **Resultado:** Sitio PUBLISHED en /web/[slug] o en su dominio propio.
- **Dueño del proceso:** Editor del sitio (websites:write / websites:publish)
- **Participantes:** Visitantes (externo); Aether ERP (Editor del sitio, Sistema Aether)
- **Módulos:** web-sites
- **Diagrama:** [bpmn/P30-sitio-web.bpmn](bpmn/P30-sitio-web.bpmn)

Reglas de negocio:

- Borrador y publicado son copias distintas (draftBlocks / publishedBlocks): el público nunca ve el borrador.
- El HTML de un cliente solo sale por /web/[slug]/raw con Content-Security-Policy: sandbox, sin allow-scripts ni allow-same-origin, dentro de un iframe sandbox.
- En modo guiado todo texto va escapado y todo enlace o imagen pasa por safeHref / safeImageSrc; las imágenes solo de nuestro almacenamiento, sin SVG ni GIF.
- Publicar un formulario con destino exige el permiso de crear en ese destino (publishPermission).
- Se ve solo si está PUBLISHED, la empresa no está suspendida y tiene el módulo.

Código: `src/modules/web-sites/` · `src/lib/web-sites/blocks.ts` · `src/lib/web-sites/readiness.ts` · `src/lib/web-sites/html.ts (SANDBOX_CSP)` · `src/lib/web-sites/urls.ts`

### P31

**Formularios del sitio con destino en el ERP.** Cada envío se valida contra el formulario publicado, queda siempre en la bandeja y además llega al CRM, la academia o las tareas.

- **Objetivo:** Convertir los envíos de un sitio en trabajo dentro del ERP sin perder ninguno.
- **Disparador:** Un visitante envía un formulario del sitio publicado.
- **Resultado:** Mensaje en la bandeja, enlazado con la oportunidad, postulación o tarea creada; aviso al equipo.
- **Dueño del proceso:** Equipo de la empresa
- **Participantes:** Visitante (externo); Aether ERP (Sistema Aether, Módulo de destino, Equipo de la empresa)
- **Módulos:** web-sites, crm, academy, tasks
- **Diagrama:** [bpmn/P31-formularios-sitio.bpmn](bpmn/P31-formularios-sitio.bpmn)

Reglas de negocio:

- La empresa se resuelve desde el sitio, nunca del cuerpo. Límite por IP y por sitio, más señuelo.
- Se valida contra el formulario PUBLICADO (findPublishedForm + validateFormAnswers); sin formId va al formulario de contacto.
- Todo envío queda en WebSiteMessage y además en su destino, enlazado por routedKind / routedId. Sin el módulo o si el destino falla, queda solo en la bandeja con routeNote.
- CRM deduplica 24 h; la academia valida con publicApplicationSchema antes de guardar. Al navegador nunca viaja el rol de cada pregunta.
- No se envía correo a direcciones escritas por el visitante: el aviso es por campanita y por el disparador WEB_SITE_MESSAGE_RECEIVED.

Código: `src/app/api/public/web-sites/[slug]/contact` · `src/modules/web-sites/services/web-site-forms.service.ts` · `src/lib/web-sites/forms.ts` · `src/lib/web-sites/site-forms.ts`

### P32

**Academia: inscripción, clases y material.** Inscripción por link público, aprobación, grupo, calendario semanal, lista de asistencia, material por correo y mensualidades.

- **Objetivo:** Llevar la academia completa: de la inscripción a la clase dictada y su material entregado.
- **Disparador:** Una apoderada o alumna se inscribe por el link de la academia.
- **Resultado:** Alumna en su grupo, clases programadas con asistencia y material enviado.
- **Dueño del proceso:** Dirección de la academia
- **Participantes:** Apoderada o alumna (externo); Aether ERP (Dirección de la academia, Sistema Aether, Profesora)
- **Módulos:** academy
- **Diagrama:** [bpmn/P32-academia.bpmn](bpmn/P32-academia.bpmn)

Reglas de negocio:

- Una clase por grupo y día (@@unique([groupId, date])): la asistencia es por alumna y día. Una clase cancelada no admite lista; borrar una clase no borra la asistencia.
- Los días se guardan YYYY-MM-DD a las 12:00 UTC y "hoy" lo manda el navegador.
- Una serie semanal crea hasta 60 clases con skipDuplicates; "esta y las siguientes" solo propaga hora y lugar.
- Material: PDF, Office, OpenDocument o imagen, máx. 4 MB, extensión y firma deben coincidir (nunca SVG ni HTML), o un enlace https. El envío se reserva 60 s para que un doble clic no lo duplique.
- El sitio público de la academia se arma campo por campo: nunca RUT, contactos, asistencia ni pagos.

Código: `src/modules/academy/services/academy-enrollment.service.ts` · `src/modules/academy/services/academy-calendar.service.ts` · `src/modules/academy/services/academy-material.service.ts` · `src/lib/academy/calendar.ts` · `src/lib/academy/materials.ts`

### P33

**Dominio propio.** Conectar un dominio ya comprado a un certamen, sitio web o academia, y darlo por verificado solo cuando de verdad muestra la plataforma.

- **Objetivo:** Publicar cada sitio público en el dominio del cliente sin que quede apuntando a un error.
- **Disparador:** El cliente tiene un dominio y lo ingresa al crear el sitio o después.
- **Resultado:** Dominio verificado (customDomainVerifiedAt) y el enlace de la plataforma redirige a él.
- **Dueño del proceso:** Administrador del sitio
- **Participantes:** Vercel (externo); Aether ERP (Administrador del sitio, Sistema Aether); Proveedor del dominio (DNS) (externo)
- **Módulos:** projects, web-sites, academy, hosting
- **Diagrama:** [bpmn/P33-dominio-propio.bpmn](bpmn/P33-dominio-propio.bpmn)

Reglas de negocio:

- Un dominio es de un solo destino en toda la plataforma (domainTakenByOther / domainOwner).
- Solo queda verificado cuando https://dominio/api/hosting/ping responde { app: "aether-erp" }: los DNS pueden apuntar bien y Vercel no servirlo si el dominio no está agregado al proyecto (pasó en producción).
- Sin VERCEL_API_TOKEN, el panel avisa que el administrador debe agregarlo en Vercel → Settings → Domains, y queda un aviso en los logs.
- src/proxy.ts decide solo por el host, sin base de datos: la raíz del dominio se reescribe a /sitio/[host], que busca certamen → sitio web → academia.

Código: `src/lib/hosting/domain-lifecycle.ts` · `src/lib/hosting/custom-domain.ts` · `src/components/hosting/DomainPanel.tsx` · `src/proxy.ts` · `src/app/sitio/[host]`

### P40

**Acceso y seguridad.** Ingreso con límites y Turnstile, bloqueo por intentos, empresa suspendida, 2FA, lista de IPs, sesión de 8 horas, elección de empresa y cambio de clave.

- **Objetivo:** Dejar entrar solo a quien corresponde, a la empresa que corresponde, y cortar el acceso al instante cuando cambia algo.
- **Disparador:** Un usuario abre /login.
- **Resultado:** Sesión activa en el panel de la empresa elegida; o el ingreso rechazado con un motivo claro.
- **Dueño del proceso:** Seguridad de la plataforma
- **Participantes:** Aether ERP (Usuario, Aether: ingreso y guards)
- **Módulos:** auth
- **Diagrama:** [bpmn/P40-acceso-seguridad.bpmn](bpmn/P40-acceso-seguridad.bpmn)

Reglas de negocio:

- Claves con bcryptjs (costo 12); correo inexistente y clave incorrecta responden en el mismo tiempo, para no revelar qué correos existen.
- 5 intentos fallidos bloquean 15 minutos (también en el código TOTP) y avisan a Dueños y Administradores.
- Sesión: JWT cifrado con jose en cookie httpOnly, secure en producción, sameSite strict, máximo 8 horas.
- Sin excepción por superusuario: una empresa suspendida no entra ni para reactivarse; eso se hace desde la Supersuite.
- getAuthContext relee la base en cada request: suspender una empresa o desactivar un usuario corta el acceso de inmediato. Toda Server Action empieza con requireAuthWithPermission.

Código: `src/app/api/auth/signin/route.ts` · `src/app/api/auth/verify-totp/route.ts` · `src/modules/auth/services/auth.service.ts` · `src/lib/auth/guards.ts` · `src/lib/auth/ip-allowlist-guard.ts` · `src/proxy.ts`

### P41

**Automatizaciones de la empresa.** Cada empresa arma reglas (disparador, condiciones, acciones); el motor las ejecuta después de que el hecho de negocio quedó guardado.

- **Objetivo:** Avisar y conectar con otros sistemas sin que un correo o un webhook puedan afectar una venta.
- **Disparador:** Un hecho de negocio confirmado (venta emitida, stock bajo mínimo, folios por agotarse, entrada o voto pagado…).
- **Resultado:** Correos, notificaciones y webhooks firmados enviados, y la ejecución registrada.
- **Dueño del proceso:** Administrador de la empresa
- **Participantes:** Destinatarios: correo, n8n u otro sistema (externo); Aether ERP (Administrador de la empresa, Módulo de negocio, Motor de automatizaciones)
- **Módulos:** automation, webhooks
- **Diagrama:** [bpmn/P41-automatizaciones.bpmn](bpmn/P41-automatizaciones.bpmn)

Reglas de negocio:

- emitWorkflowEvent es el único punto de entrada: nunca lanza y se llama después de confirmar la transacción, nunca dentro de prisma.$transaction.
- El webhook saliente se firma con HMAC y pasa por outbound-url.ts antes de cada envío (https obligatorio, sin IP privadas, localhost ni metadata de nube, sin seguir redirecciones).

Código: `src/lib/workflows/ (emitWorkflowEvent, WORKFLOW_TRIGGER_DEFINITIONS)` · `src/modules/automation/` · `src/lib/security/outbound-url.ts`

## Fuera de este modelo

Módulos que existen y no tienen diagrama propio todavía: CRM (embudo), atención al cliente y encuestas, calidad, tareas y delegación, inventario (tomas y multibodega), producción y manufactura, activo fijo, presupuestos, inteligencia, agentes ejecutivos (crons diarios de `vercel.json`), mensajería, respaldo, importaciones, honorarios, pagarés, organigrama, calendario, documentos y protección de datos. Se suman agregando un archivo en `generador/procesos/`.

## Cómo agregar o cambiar un proceso

1. Edita o crea la definición en `generador/procesos/*.mjs`: piscinas y carriles, nodos `[id, tipo, carril, columna, nombre, { f: fila, doc }]`, flujos, mensajes y notas. El formato está al principio de `generador/bpmn.mjs`.
2. Tipos de nodo: `inicio`, `inicio-msg`, `inicio-timer`, `inicio-senal`, `inicio-cond`, `fin`, `fin-msg`, `fin-terminar`, `fin-error`, `msg-recibir`, `msg-enviar`, `timer`, `senal-enviar`, `usuario`, `manual`, `servicio`, `script`, `regla`, `enviar`, `recibir`, `tarea`, `sub`, `xor`, `and`, `or`, `evento`.
3. `node docs/procesos/generador/generar.mjs`. El generador falla con un mensaje claro si un flujo cruza piscinas, un mensaje queda dentro de la misma piscina, un nodo no tiene entrada o salida, o falta un carril.

