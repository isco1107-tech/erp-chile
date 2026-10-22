/*
 * Service worker de la app del bodeguero (alcance: /bodega).
 *
 * Vive en la raíz (`/bodega-sw.js`) y no en `/bodega/`: un service worker solo puede
 * controlar rutas bajo su propia carpeta, y la app abre en `/bodega` (sin barra
 * final), que NO está bajo `/bodega/`. Se registra con `scope: '/bodega'`.
 *
 * Hace tres cosas, y nada más:
 *  1. Guarda los archivos estáticos de la app (`/_next/static/…`, que tienen un
 *     nombre distinto en cada versión) para que abra rápido y sin señal.
 *  2. Guarda la última copia de la página `/bodega` para poder abrirla sin
 *     señal. Esa página no trae datos de la persona (los pide a la API), así que
 *     no hay nada privado en la copia.
 *  3. NUNCA toca `/api/*`: los datos siempre vienen del servidor o de la base
 *     local de la app, jamás de esta caché.
 *
 * Los avisos push del panel usan otro service worker (`/sw.js`); este es solo
 * de `/bodega`.
 */
const VERSION = 'bodega-v1';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL_URL = '/bodega';
const MAX_STATIC_ENTRIES = 150;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('bodega-') && !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// Al cerrar sesión la app pide borrar todo lo guardado.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('bodega-')).map((key) => caches.delete(key)))));
  }
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    await trim(cache, MAX_STATIC_ENTRIES);
  }
  return response;
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function shell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    // Una redirección (al login, por ejemplo) o un error nunca se guardan como "la página".
    if (response.ok && !response.redirected && response.type === 'basic') await cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    return new Response(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title></head>' +
        '<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:2rem;text-align:center;background:#f7f6f3;color:#12161f">' +
        '<div><h1 style="font-size:1.25rem">Sin conexión</h1><p>La primera vez que abres la app necesitas internet. Después podrás usarla aunque no haya señal.</p>' +
        '<p><a href="/bodega" style="color:#12161f">Reintentar</a></p></div></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate' && (url.pathname === '/bodega' || url.pathname === '/bodega/')) {
    event.respondWith(shell(request));
  }
});
