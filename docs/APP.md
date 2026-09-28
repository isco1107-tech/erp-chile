# Aether como app: estado actual y hoja de ruta

Análisis del 2026-09-28. Retoma lo que el commit `2e363b5` dejó "para una etapa aparte, ya conversada": que el ERP se sienta y funcione como una app, no como una pestaña del navegador.

## Qué existe hoy

**Web (PWA)**
- `src/app/manifest.ts`: nombre, íconos 192/512, `display: standalone`, `start_url: /dashboard`. El navegador ya puede instalarla.
- `public/sw.js`: service worker **solo para avisos push**, y se registra recién cuando alguien activa los avisos. No hay caché ni modo sin conexión.
- No hay botón "Instalar Aether": depende de que la persona encuentre la opción en el menú del navegador (y en iPhone, de "Agregar a inicio").

**Escritorio (`desktop-client/`, Tauri 2, v0.2.0)**
- Una ventana que carga `https://aetherp.online/dashboard` (constante `DASHBOARD_URL`), con pantalla de inicio propia, ícono en la bandeja y una pantalla local "Sin conexión" que reintenta sola.
- User-Agent `AetherDesktop/0.2.0`, que sirve para mantener la navegación dentro del ERP.
- El workflow `desktop-release.yml` construye instaladores para Windows (NSIS), Linux (AppImage) y macOS Apple Silicon e Intel (DMG). Se publican en `public/downloads/` con `SHA256SUMS.txt`.
- **No tiene:** firma de código ni notarización, actualización automática, notificaciones nativas, enlaces profundos (`aether://`), ni memoria del tamaño y la posición de la ventana.
- Superficie expuesta a la página remota: el comando `switch_main_window`, que solo acepta `"app"` u `"offline"`. La capability `default` no declara `remote`, así que la página remota no recibe los permisos de plugins. Hay que mantenerlo así: cualquier comando nuevo que reciba datos de la página debe validarlos igual de estricto.

**Multiempresa dentro de la app**
- La sesión es una sola cookie por navegador o perfil: hay **una empresa activa a la vez** en todas las ventanas.
- Desde el 2026-09-28, una pestaña o ventana que quedó en otra empresa se bloquea hasta recargar (`ActiveCompanyGuard`). Ya no se puede guardar en la empresa equivocada.

## Brechas, en orden de impacto

1. **Instalar sin miedo.** Un instalador sin firmar hace que Windows (SmartScreen) y macOS (Gatekeeper) lo presenten como peligroso. Es lo primero que ve un cliente nuevo. Requiere un certificado de firma para Windows (OV/EV, o Azure Trusted Signing) y una cuenta Apple Developer para notarizar. **Decisión de compra, no de código.**
2. **Actualizarse sola.** Con `tauri-plugin-updater` y un par de llaves de actualización, el shell se actualiza sin reinstalar. El contenido del ERP ya se actualiza solo porque se carga desde el servidor: el updater es solo para el shell, así que el costo de mantenerlo es bajo.
3. **Avisos nativos en escritorio.** El push web dentro del WebView de Tauri (WebView2 / WKWebView) no es confiable. La alternativa es un comando `notify` acotado (título y cuerpo validados, con largo máximo) que la página llama cuando detecta `AetherDesktop`, usando `tauri-plugin-notification`. Así la campanita llega como notificación del sistema.
4. **Abrir enlaces en la app.** Con `tauri-plugin-deep-link`, los enlaces de invitación o de un documento abren la app en vez del navegador. Las rutas se aceptan desde una lista cerrada, igual que `switch_main_window`.
5. **Detalles de "app de verdad".** Recordar tamaño y posición (`tauri-plugin-window-state`), menú nativo en macOS (copiar y pegar con ⌘) y un atajo para mostrar u ocultar la ventana.
6. **PWA instalable a propósito.** Registrar `sw.js` siempre (no solo al activar avisos) y mostrar un botón "Instalar Aether" con `beforeinstallprompt`. Es barato y es la puerta a los avisos push en iPhone, que solo funcionan con la app agregada al inicio.
7. **Una ventana por empresa.** Exigiría sesiones por pestaña: el token viajaría en un header y no en la cookie. Es un cambio de arquitectura de auth con riesgo. **No recomendado ahora**: el bloqueo de pestañas ya cubre la integridad de los datos.

## Sin conexión: qué sí y qué no

El ERP completo sin conexión no tiene sentido. Folios, stock, caja y contabilidad son estado compartido que el servidor tiene que ordenar. Conviene elegir flujos concretos donde sin conexión aporta valor y se puede hacer con seguridad:

| Flujo | Valor | Dificultad | Nota |
|---|---|---|---|
| Consulta de catálogo y contactos (solo lectura) | Medio | Baja | Caché en IndexedDB con fecha de actualización visible. Nunca se muestra como dato vigente sin decirlo. |
| Acreditación o validación de entradas en un evento | Alto | Media | Recintos sin señal. La lista firmada de entradas se descarga antes. Los escaneos se sincronizan después, con idempotencia. |
| POS sin conexión | Muy alto | Alta | Ver abajo. |

**POS sin conexión: el problema de fondo son los folios.** Hoy el folio sale del CAF en el servidor, con lock, dentro de la transacción de la venta. Sin conexión habría que reservar **bloques de folios por terminal** y timbrar en el dispositivo, lo que obliga a llevar la llave privada del CAF al equipo (riesgo alto si se pierde o se copia). La otra opción es un esquema de contingencia que timbre al reconectar. **Cuál de las dos acepta el SII lo tiene que definir el especialista tributario antes de escribir código.** Lo que ya ayuda:
- `createIdempotencyTracker` hace seguro reenviar la misma venta.
- `allowNegativeStock` da una política para ventas que sobrevenden mientras no hubo conexión.

Arquitectura común para cualquier flujo sin conexión: una cola local de operaciones (IndexedDB en web, SQLite en Tauri), cada una con su `idempotencyKey`, un sincronizador que reenvía en orden y la regla de que **el servidor decide**. Lo rechazado vuelve a la persona con el motivo, nunca se descarta en silencio.

## Hoja de ruta propuesta

| Fase | Contenido | Tamaño |
|---|---|---|
| 1 | PWA con botón de instalar y SW siempre registrado; ventana que recuerda tamaño; auto-actualización del shell; firma de código (según la compra de certificados) | Días |
| 2 | Notificaciones nativas en escritorio; enlaces profundos para invitaciones y documentos | 1–2 semanas |
| 3 | Consulta sin conexión (solo lectura) y acreditación de eventos sin conexión | Proyecto |
| 4 | POS sin conexión con folios reservados o contingencia, tras la definición tributaria | Proyecto grande |

## Decisiones pendientes (del dueño del producto)

1. ¿Se compran los certificados de firma (Windows y Apple Developer)? Sin ellos, la app de escritorio sigue viéndose como software no confiable al instalarla.
2. ¿Qué flujo sin conexión va primero: eventos (acreditación) o POS?
3. ¿Escritorio y PWA, o solo PWA? Tauri aporta firma, bandeja, avisos nativos y enlaces profundos. La PWA cubre gran parte con mucho menos mantenimiento.
