# 0003 — Sitios web: HTML propio publicado en un documento aislado

Estado: aceptada (2026-09-28)

## Contexto

El módulo *Sitios web* deja que una empresa arme un sitio para sí misma o para un cliente. Ofrece un modo guiado (bloques) y un modo de HTML propio. El HTML propio es contenido escrito por un usuario de un tenant que se sirve bajo el dominio de la plataforma (`/web/[slug]`) o de un dominio propio. Sin aislamiento, un `<script>` publicado ahí correría con el mismo origen que el panel: podría llamar a Server Actions y a la API con la cookie de sesión de quien visite el sitio.

## Decisión

1. El HTML propio nunca se pinta dentro de una página de la plataforma. Se sirve como documento independiente en `/web/[slug]/raw` con `Content-Security-Policy: sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'none'; …` y se incrusta en un `<iframe sandbox>` con los mismos permisos. Sin `allow-scripts` ni `allow-same-origin`: origen opaco, sin JavaScript, sin formularios, sin conexiones.
2. `sanitizeHtml` quita lo evidente (scripts, `on…=`, `javascript:`, marcos, formularios, `@import`) al guardar y al servir, y el editor le muestra al usuario qué se quitará. Es una ayuda y una segunda barrera, **no** la defensa: las expresiones regulares no bastan para sanear HTML.
3. El modo guiado no admite HTML: los textos son texto de React (escapado) y los enlaces e imágenes pasan por listas de esquemas permitidos.
4. En dominio propio solo se sirve `/web/[slug]/raw` (patrón exacto), no todo `/web/`.

## Consecuencias

- El HTML propio no puede tener scripts ni formularios: para contacto, un enlace `mailto:`/`tel:`/`wa.me` o el modo guiado (que sí tiene formulario, con límite y señuelo).
- Cambiar `SANDBOX_CSP` a algo más permisivo es una decisión de seguridad, no de producto: requiere revisar `tests/web-sites-core.test.ts` (que fija la política) y esta ADR.
- El CSP global de `next.config.js` sigue aplicando; el del documento propio se suma y prevalece lo más restrictivo.

## Cabecera: por qué también está en `next.config.js`

Next aplica primero las cabeceras globales de `/:path*` y no permite que un route handler las reemplace. La CSP `sandbox` del handler de `/web/[slug]/raw` **no llegaba al navegador**: la revisión de seguridad lo comprobó con `next start` y ese documento corría con la CSP global (scripts permitidos), en el origen de la plataforma. Por eso `next.config.js` repite la política en una entrada `/web/:slug/raw` **después** de la global (con la misma clave repetida gana la última) y `tests/web-sites-core.test.ts` verifica que sea idéntica a `SANDBOX_CSP` y que vaya después. Tras un cambio de hosting o de versión de Next, comprobar con `curl -sI https://<dominio>/web/<slug>/raw` que la única `Content-Security-Policy` sea la que empieza con `sandbox`.

## Riesgos conocidos (pendientes)

- **Verificación de dominio (WS-SEC-04):** "el DNS apunta a Vercel" vale para cualquier empresa. Con un DNS colgante (una empresa se fue pero su dominio sigue apuntando a Vercel), otra empresa podría registrarlo y publicar bajo él. Lo mismo vale para los certámenes. Corrección: exigir un registro TXT `_aether.<dominio>` con un token por sitio antes de servir.
- **Formulario de contacto (WS-SEC-06):** los límites en memoria no se comparten entre instancias (se sumó un tope por sitio contado en la base de datos), no hay Turnstile, y una regla de automatización con `{{senderEmail}}` como destinatario convierte el formulario en un auto-respondedor que puede usarse para molestar a un tercero (acotado por los límites). Corrección: Turnstile en el formulario y vetar al remitente como destinatario en este disparador.
