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
