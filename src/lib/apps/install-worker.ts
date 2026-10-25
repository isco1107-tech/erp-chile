import { APPS, type AppId } from './registry';

/**
 * Service worker de instalación de una app (Control, POS, Seller Center).
 *
 * NO guarda nada: ni páginas ni respuestas de la API. Esas pantallas muestran
 * datos privados de una empresa y una copia en el teléfono sería una fuga
 * (ver CLAUDE.md, «Aplicaciones»). Hace dos cosas:
 *  1. Habilita la instalación y toma el control de inmediato.
 *  2. Si una navegación falla por falta de señal, muestra una pantalla propia de
 *     «Sin conexión» (marca de la app, reintenta sola al volver la señal) en vez
 *     de la página de error del navegador, que dentro de una app instalada se ve
 *     como si la app estuviera rota.
 *
 * La app del bodeguero usa su propio service worker (`public/bodega-sw.js`),
 * que además guarda archivos estáticos para abrir sin señal.
 */
export function installWorkerSource(id: AppId): string {
  const app = APPS[id];
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${app.themeColor}"><title>${app.name}: sin conexión</title></head>` +
    `<body style="margin:0;font-family:system-ui,sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center;background:#f7f6f3;color:#12161f">` +
    `<main style="max-width:22rem"><div style="width:4rem;height:4rem;margin:0 auto 1.25rem;border-radius:1.1rem;background:${app.iconColor === '#ffffff' ? '#12161f' : app.iconColor}"></div>` +
    `<h1 style="font-size:1.25rem;margin:0 0 .5rem">Sin conexión</h1>` +
    `<p style="margin:0 0 1.25rem;line-height:1.5;color:#4b5160">${app.name} necesita internet para mostrar datos actualizados. Se reintentará sola cuando vuelva la señal.</p>` +
    `<button onclick="location.reload()" style="min-height:3rem;padding:0 1.5rem;border:0;border-radius:.75rem;background:#12161f;color:#fff;font-size:1rem;font-weight:600">Reintentar</button>` +
    `<script>addEventListener('online',function(){location.reload()})</script></main></body></html>`;
  return [
    `const OFFLINE_HTML = ${JSON.stringify(html)};`,
    "self.addEventListener('install', () => self.skipWaiting());",
    "self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));",
    "self.addEventListener('fetch', (event) => {",
    "  if (event.request.mode !== 'navigate') return;",
    '  event.respondWith(',
    '    fetch(event.request).catch(() => new Response(OFFLINE_HTML, { status: 503, headers: { \'Content-Type\': \'text/html; charset=utf-8\', \'Cache-Control\': \'no-store\' } })),',
    '  );',
    '});',
    '',
  ].join('\n');
}

/** Respuesta de la ruta `…/install-sw.js` de una app. `Service-Worker-Allowed` lo deja controlar solo su alcance. */
export function installWorkerResponse(id: AppId): Response {
  return new Response(installWorkerSource(id), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': APPS[id].scope,
    },
  });
}
