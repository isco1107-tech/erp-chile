# 0015 · Marketing propio de Aether, operado desde la Supersuite

Fecha: 2026-10-30. Estado: aceptado. La parte de Aether ERP está construida y probada; la parte de la Supersuite (repositorio aparte) se construye siguiendo este documento. Continúa la regla «Sin superusuarios en Aether» de CLAUDE.md y la telemetría de `src/lib/supersuite/`.

## Contexto

El dueño quiere un agente de marketing que publique en las redes de **Aether** (Instagram, Facebook y las que vengan), decida qué publicar y cuándo para traer clientes, mida los resultados, proponga planes de acción y los ejecute. Dos condiciones:

1. **Es solo para Aether.** No es un módulo que se venda ni que pueda usar una empresa cliente. Se controla desde la Supersuite como un producto interno.
2. **Tiene que notarse la calidad.** Cada pieza tiene que verse hecha por alguien que conoce el oficio, no como «un anuncio más de IA».

Lo que existía antes: los formularios del landing (`/api/public/leads` y `/api/public/module-quote`) solo mandaban un correo a ventas. No guardaban nada, no sabían de qué campaña venía la persona y no le avisaban a la Supersuite. Sin eso, ningún agente puede saber qué publicación trajo clientes: optimizaría *likes*, no ventas.

## Decisiones

### Dónde vive

1. **El agente vive en la Supersuite, no en Aether.** La Supersuite ya recibe la ficha de cada empresa (plan, `tarifaMensual`, estado de prueba o activa), las solicitudes de módulos y la presencia de los usuarios: es donde se puede medir el embudo completo publicación → visita → lead → empresa → tarifa mensual. En Aether no hay módulo, ni interruptor en `CompanyFeatures`, ni ítem en el tarifario, ni pantalla, ni orden que lo encienda para una empresa. Ninguna empresa cliente puede recibirlo por error porque no existe del lado de las empresas.
2. **Aether ERP aporta cuatro piezas, todas sin tocar la base de datos:**

   | Pieza | Dónde | Para qué |
   |---|---|---|
   | Atribución de campañas | `src/lib/marketing/attribution.ts` (pura), `attribution-browser.ts`, `CampaignAttributionTracker` | Saber de qué publicación llegó cada visita y cada lead |
   | Eventos a la Supersuite | `src/lib/marketing/supersuite-events.ts`, `marketingSupersuite()` en `src/lib/supersuite/index.ts` | `landing_visita` y `lead_recibido` |
   | Orden `marketing.contexto` | `src/lib/marketing/context.ts` + `brand-voice.ts` + `claims.ts` | La única fuente de verdad de qué es Aether, qué ofrece, qué se puede mostrar y cómo se habla |
   | Orden `marketing.revisar` | `src/lib/marketing/copy-review.ts` | La puerta automática que toda pieza pasa antes de publicarse |

   El contexto y la revisión viven en Aether a propósito: ahí están el tarifario, la vitrina de módulos, las capturas reales y lo que el producto hace de verdad (CLAUDE.md). Si el producto cambia, cambia lo que el agente puede decir, sin tocar la Supersuite.

### Atribución (primera parte, sin cookies)

3. **Qué se guarda.** Al entrar a la portada, `/conoce-aether`, `/empresas` o la página de un módulo (`/modulos/[slug]`) con un enlace que trae `utm_source` (o `ref`, como atajo para referidos), el navegador guarda en `localStorage` (`aether-attribution:v1`) el **primer y el último contacto** con una campaña durante **90 días**: red (`source`), medio, campaña, pieza (`content`), término, la página de llegada y **solo el dominio** del sitio de origen (la ruta de otra página puede llevar datos personales). Después limpia los `utm_*` de la barra de direcciones para que quien copie el enlace no se lleve la campaña. No hay cookies, ni huella del dispositivo, ni identificador de la persona.
4. **Lista cerrada de caracteres.** Cada valor se normaliza a minúsculas, sin tildes, con guiones, solo `a-z 0-9 . _ -` y máximo 80 caracteres (`normalizeToken`). El servidor revalida con un esquema Zod **estricto**: un campo de más o un valor raro hace que la atribución se descarte entera.
5. **Un lead nunca se pierde por la atribución.** Si no calza, el formulario sigue su curso «sin campaña». El aviso a la Supersuite sale **solo si el correo a ventas salió**: no se cuenta un lead que ventas no recibió.
6. **Visitas.** El navegador avisa `POST /api/public/marketing/visit` con `sendBeacon` **una vez por campaña y pestaña** (`sessionStorage`). La ruta tiene límite de 30 por hora por IP (`MARKETING_VISIT_RATE_LIMIT`), cuerpo de 2 KB como máximo y esquema estricto, y responde 204. Es una **señal indicativa** (cualquiera puede mandar una): lo que mide de verdad son los leads y las empresas creadas.
7. **Privacidad.** `/aether/privacidad` lo informa (sección 2) y `TERMS_VERSION` subió a `2026-10-30`.

### Lo que viaja a la Supersuite

8. **`clienteId` reservado `aether`, módulo `marketing`.** Los eventos de marketing no son de ninguna empresa cliente: la Supersuite debe tratar `aether` como la casa. **No es un cliente** (no entra en conteos, mapa, adopción ni MRR), no tiene ficha y nunca recibe órdenes de empresa.
9. **Nunca datos de la persona.** Nombre, correo, teléfono, empresa y mensaje siguen llegando solo al correo de ventas, como antes. A la Supersuite va una **referencia opaca** `L-XXXXXXXX` (8 símbolos sin I, O, 0 ni 1, sin relación con ningún dato) más fichas de listas cerradas:

   ```json
   // modulo "marketing", accion "landing_visita"
   { "toque": { "fuente": "instagram", "medio": "social", "campana": "pos-cierre-de-caja", "contenido": "carrusel-01",
                "pagina": "/modulos/punto-de-venta", "referente": "l.instagram.com", "fecha": "2026-10-30T15:00:00.000Z" },
     "primerToque": { "…": "mismo formato" } }

   // modulo "marketing", accion "lead_recibido"
   { "ref": "L-7K3M9QX2", "formulario": "demo" | "cotizacion-modulos",
     "equipo": "6 a 20 personas",           // solo demo (lista SALES_LEAD_TEAM_SIZES)
     "areas": ["Ventas e inventario"],      // solo demo (lista SALES_LEAD_SOLUTIONS)
     "modulos": ["pos", "purchases"],       // solo cotización (ids del tarifario)
     "toque": { "…" } | null, "primerToque": { "…" } }
   ```

   Las pruebas (`tests/marketing-public-routes.test.ts`) recorren lo que se envía y fallan si aparece cualquier dato del formulario.
10. **Cierre del embudo.** El correo a ventas trae «Origen» (la campaña) y «Referencia» (`L-…`, también en el asunto). Al crear la empresa desde la Supersuite, ventas pega esa referencia en la orden `empresa.crear` como `leadRef`. Aether la valida (`L-` + 8 símbolos; una mal copiada falla antes de crear nada), la guarda en la bitácora del alta y la devuelve en `datos.leadRef`. La Supersuite une lead → empresa por la referencia y, desde ahí, la ficha de la empresa (estado, plan, `tarifaMensual`) le dice cuánto vale cada campaña.

### Las órdenes nuevas

11. **`marketing.contexto`** (sin empresa; solo lee datos públicos, no toca la base ni la bitácora). Devuelve:
    - `version`: hash del contenido. Si no cambió, la Supersuite sigue con lo que tiene. Pedirlo **al menos una vez al día** y antes de cada brief.
    - `marca`: nombre, promesa, colores (tinta `#12161f`, dorado `#dbc076`), tipografías (Anton para titulares, Geist para texto), logos, páginas y correo de ventas.
    - `guia`: la guía editorial completa (`brand-voice.ts`): esencia, audiencias con lo que les duele, tono, cinco pilares con su proporción, estructura, reglas visuales, proceso y ritmo.
    - `canales`: topes por red (caracteres, gancho, hashtags, emojis, si un enlace escrito se puede tocar, formatos).
    - `afirmaciones`: lo que **no** se puede decir y por qué (`claims.ts`). Ejemplos: «envía al SII», «facturación electrónica», «certificado por el SII», «funciona sin conexión», «el mejor ERP», «garantizado».
    - `oferta`: la política de precios (hoy **no se publican precios**: el landing cotiza a medida, así que el contexto no lleva ningún monto), los planes con lo que incluyen, **cada módulo de la vitrina con su página pública, su portada y sus pantallas reales con los pasos del manual** (la materia prima de un carrusel) y `noPromocionar` (lo que está fuera de la oferta).
    - `enlaces`: parámetros, fuentes y medios permitidos, reglas y un ejemplo. Las pruebas verifican que el landing lo entiende tal cual.
    - `medicion`: qué significa cada evento y cómo se cierra el embudo.
12. **`marketing.revisar`**: recibe una pieza (`{ canal, texto }`) o un calendario (`{ piezas: [{ id, canal, texto }] }`, hasta 50). Devuelve por pieza `{ id, canal, aprobado, puntaje, hallazgos: [{ regla, nivel: "bloquea" | "advierte", mensaje, fragmento? }], metricas }`. **Aprobado = sin bloqueos y puntaje ≥ 76** (100 − 30 por bloqueo − 8 por advertencia). Es determinista. Revisa:
    - promesas que el producto no cumple y la Ley 19.496 (superlativos, garantías);
    - precios (hoy, cualquier monto bloquea);
    - cifras sin fuente (porcentajes, «x veces», «ahorra N»; el 19% de IVA sí se puede citar);
    - muletillas de texto generado («en la era digital», «lleva tu negocio al siguiente nivel», «descubre cómo», «no es solo X, es Y», «más que un ERP», rayas en serie; tres o más bloquean por plantilla);
    - exceso de emojis, hashtags, exclamaciones y MAYÚSCULAS, y el largo del gancho por canal;
    - datos personales (correos ajenos, RUT, teléfonos) y españolismos;
    - enlaces a Aether sin `utm_campaign` y enlaces escritos donde no se pueden tocar.

    No mide si la pieza es *buena*: eso lo hacen la crítica y la persona (decisión 14). Atrapa lo que la delata como genérica o la vuelve falsa.

### La vara de calidad: que no parezca un anuncio más de IA

13. **Principios que el agente aplica siempre** (están en `guia` y son la diferencia con cualquier herramienta de publicación automática):
    - **Nada inventado.** Cada dato sale del contexto, de la ley o del SII (con la fuente anotada en la ficha de la pieza) o de un cliente con autorización escrita. Si el contexto no lo trae, la pieza no existe.
    - **El producto real a la vista.** Capturas reales de `oferta.modulos[].pantallas` (datos de demostración), recortadas pero nunca redibujadas. **Prohibido** generar con IA personas, rostros, manos, oficinas de banco de imágenes o pantallas de software que no existen.
    - **Una idea por pieza**, con estructura gancho → paso o dato que lo resuelve → una sola acción.
    - **Prueba de la marca intercambiable:** si se cambia «Aether» por el nombre de otro ERP y el texto sigue funcionando, se reescribe.
    - **Español de Chile**, con tú, frases cortas y sin exagerar. Mejor 3 piezas buenas a la semana que 7 de relleno.
14. **Proceso de cada pieza en la Supersuite** (todos los pasos son obligatorios):
    1. **Brief:** pilar, audiencia, objetivo medible (por ejemplo, «20 visitas a /modulos/punto-de-venta y 2 leads en 7 días»), fuentes de cada dato y la pantalla real que se va a mostrar.
    2. **Borrador:** el modelo de lenguaje más capaz disponible escribe **tres ganchos distintos** y elige uno con razones.
    3. **Crítica:** un segundo pase, con instrucciones de editor exigente y sin ver el razonamiento del primero, califica de 1 a 5 seis criterios: especificidad, verdad (todo dato con fuente), utilidad (¿alguien lo guardaría?), voz de marca, una sola idea y acción clara. **Menos de 4 en cualquiera obliga a reescribir** (máximo dos vueltas; si no llega, la pieza se descarta y se anota por qué).
    4. **Diseño:** plantilla propia con la paleta y tipografías de `marca`, captura real y como máximo 12 palabras por lámina. Se renderiza en la Supersuite (con satori o similar, como el motor de afiches de Aether), no con un generador de imágenes.
    5. **Revisión automática:** `marketing.revisar` aprobado.
    6. **Aprobación humana** según el nivel de autonomía (decisión 15).
    7. **Medición** a los 7 días contra el objetivo del brief, con una línea de qué se aprendió. Ese aprendizaje entra en el siguiente brief del mismo pilar.

### Autonomía y lo que el agente puede hacer

15. **Tres niveles**, elegidos en la Supersuite; el de fábrica es el 1:
    - **0 · Sugerir:** arma el calendario y los borradores; no publica nada.
    - **1 · Aprobar:** una persona aprueba cada pieza o la semana completa y el agente publica a la hora elegida.
    - **2 · Piloto automático acotado:** publica solo lo que pasó la crítica y la revisión, dentro de los pilares aprobados, con tope de publicaciones por día y por red, pausa con un clic y bitácora de cada acción.

    **Siempre pasan por una persona, en cualquier nivel:** la primera pieza de cada pilar, todo caso de cliente, todo contenido pagado, toda respuesta pública a un comentario y toda pieza del pilar tributario (un error ahí daña la confianza en todo el producto).
16. **Lista cerrada de acciones que el agente puede ejecutar:** crear, reprogramar o pausar publicaciones orgánicas propias; reordenar el calendario; cambiar la mezcla de pilares y módulos que promueve; proponer experimentos (dos ganchos de una misma pieza en semanas distintas); preparar borradores de anuncios **sin publicarlos**; crear tareas para el equipo (por ejemplo, «pedir autorización a tal cliente para un caso»). **Nunca:** gastar dinero, cambiar precios u ofertas, responder mensajes directos o comentarios por su cuenta, borrar publicaciones con interacción, usar datos de empresas clientes ni publicar fuera de las cuentas de Aether.
17. **«Qué publicar y cuándo».**
    - **Qué:** sale de la proporción de pilares, de lo que el embudo dice que trae leads (por módulo y por pilar, con la referencia `L-…`), de las novedades reales (módulos nuevos en el contexto, comparando `version`) y del calendario tributario chileno (F29 mensual, Operación Renta en abril), tomado de fuentes oficiales.
    - **Cuándo:** primero horarios razonables para pymes chilenas y después los que muestren las métricas de las propias cuentas, recién cuando haya al menos 30 publicaciones por red. Sin datos suficientes se dice así; nunca se inventa una «hora óptima».
18. **Plan de acción semanal:** un informe con lo publicado, el embudo por campaña (visitas → leads → empresas → tarifa), qué funcionó y qué no, con hipótesis, y **máximo tres** acciones para la semana siguiente, cada una dentro de la lista de la decisión 16. En el nivel 1 se aprueban junto con el calendario.

### Redes (del lado de la Supersuite)

19. **Instagram y Facebook por la Graph API de Meta**, con una app de Meta propia de Aether, las cuentas profesionales de Aether y las personas del equipo como administradoras de la app. Al ser **solo las cuentas propias**, en principio basta el acceso estándar y no hace falta el App Review completo. **Verificarlo al crear la app**, junto con los permisos de publicar y leer métricas, el tope de publicaciones por API cada 24 horas y la renovación de tokens, porque Meta cambia estas reglas seguido. Los tokens van cifrados en la Supersuite y nunca vuelven a un navegador ni a la bitácora.
20. **Después:** LinkedIn (página de empresa; requiere aprobación de su API), TikTok (sin auditoría solo publica en privado) y Perfil de Google. X queda fuera (API de pago). Los anuncios pagados son un proyecto aparte y siempre con aprobación humana del gasto.

### Modelo sugerido en la Supersuite

21. Como referencia para quien lo construya: `CuentaSocial` (red, id externo, token cifrado, vence), `Pieza` (brief, pilar, canal, texto, diseño, estado `borrador → criticada → revisada → aprobada → programada → publicada | fallida | descartada`, `contextoVersion`, resultado de `marketing.revisar`, quién aprobó, id externo, clave de idempotencia para no publicar dos veces si se reintenta), `MetricaPieza` (fotos periódicas de alcance, guardados, clics y visitas), `Campana` (id = `utm_campaign`, objetivo, pilar), `Lead` (`ref`, campaña, primer y último toque, `empresaId` cuando se cree), `Aprendizaje` (pieza, objetivo, resultado, conclusión) y `AccionAgente` (bitácora de todo lo que hizo el agente y con qué nivel).

## Lo que esto NO hace

- **No publica nada desde Aether** ni guarda cuentas o tokens de redes en Aether: eso es de la Supersuite.
- **No es un módulo para empresas clientes**, ni lo será sin un ADR nuevo. Si algún día se quiere vender, el diseño es otro: datos por empresa, permisos y su propia app de Meta con App Review.
- **No identifica personas ni sigue a nadie entre sitios.** La atribución es por campaña. Una visita que borró su almacenamiento o llegó sin enlace con campaña queda «sin campaña».
- **No publica precios** mientras el landing no los publique (`plans[].priceFrom`). Si el landing pasa a mostrar un «desde», el contexto y la revisión lo toman solos.
- **Las visitas se pueden inflar** con envíos falsos (límite por IP aparte); por eso el agente se optimiza por leads y empresas, no por visitas.
- **La revisión automática no reemplaza al editor:** atrapa lo falso y lo genérico, no garantiza que la pieza sea buena.
- **Las reglas de `claims.ts` hay que mantenerlas.** Cuando llegue el envío al SII o se pruebe Webpay con Transbank, se actualiza la regla y su ejemplo en `tests/marketing-copy-review.test.ts` (la prueba exige un ejemplo por regla).

## Cómo comprobarlo

- Pruebas: `tests/marketing-attribution.test.ts`, `tests/marketing-copy-review.test.ts`, `tests/marketing-context.test.ts` (toda captura y logo que recibe el agente existe en `public/`, nada fuera de la oferta se promociona, ningún monto viaja si el landing no lo publica), `tests/marketing-public-routes.test.ts` (ningún dato de la persona llega a la Supersuite) y los casos nuevos de `tests/supersuite-ordenes.test.ts`.
- A mano, con la Supersuite conectada:
  1. Abrir `/?utm_source=instagram&utm_medium=social&utm_campaign=prueba&utm_content=pieza-01`: la barra de direcciones queda en `/`, llega un `landing_visita` y una recarga no manda otro.
  2. Cotizar un módulo: llega un `lead_recibido` con `ref` y la campaña, y el correo de ventas trae «Origen» y «Referencia».
  3. Crear una empresa con esa `leadRef`: la orden la devuelve.
  4. Enviar `marketing.contexto` y `marketing.revisar` con `scripts/enviar-orden-supersuite.ts` o desde el panel.
