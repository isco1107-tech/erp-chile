/*
 * Service worker de Aether.
 *
 * 1. Avisos Web Push (contenido: src/lib/notifications/web-push.ts).
 * 2. POS sin conexión: guarda la pantalla del Punto de Venta y los archivos
 *    estáticos de Next para que el POS abra aunque no haya red. Nada más se
 *    intercepta: el resto del ERP necesita el servidor.
 *
 * La copia del POS tiene datos de la empresa: se borra al cerrar sesión y al
 * cambiar de empresa (mensaje `aether:clear-private`, ver
 * src/lib/offline/service-worker.ts).
 */
const STATIC_CACHE = 'aether-static-v1';
const PRIVATE_CACHE = 'aether-pos-v1';
const KNOWN_CACHES = [STATIC_CACHE, PRIVATE_CACHE];
const POS_PATH = '/dashboard/pos';
/** Cada despliegue trae archivos nuevos con otro hash: se guardan los más recientes y los viejos se descartan. */
const MAX_STATIC_ENTRIES = 400;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('aether-') && !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'aether:clear-private') {
    event.waitUntil(caches.delete(PRIVATE_CACHE));
  }
});

async function trimStatic(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  for (let i = 0; i < excess; i += 1) await cache.delete(keys[i]);
}

/** Archivos de /_next/static: su nombre cambia si cambia el contenido, así que la copia nunca queda vieja. */
async function staticCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    await trimStatic(cache);
  }
  return response;
}

/** Pantalla del POS: siempre la del servidor si hay red; la copia solo sin conexión. */
async function posNetworkFirst(request) {
  const cache = await caches.open(PRIVATE_CACHE);
  try {
    const response = await fetch(request);
    // Solo la pantalla real del POS: nunca una redirección al login ni un error.
    if (response.ok && !response.redirected && response.type === 'basic') {
      await cache.put(POS_PATH, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(POS_PATH);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticCacheFirst(request));
    return;
  }
  if (request.mode === 'navigate' && url.pathname === POS_PATH && url.search === '') {
    event.respondWith(posNetworkFirst(request));
  }
});

/** Solo rutas internas del mismo origen: un aviso nunca abre otro sitio. */
function safeTarget(href) {
  try {
    const url = new URL(typeof href === 'string' ? href : '/dashboard', self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL('/dashboard', self.location.origin).href;
  } catch {
    return new URL('/dashboard', self.location.origin).href;
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Aether';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icon.png',
      badge: '/icon.png',
      lang: 'es-CL',
      data: { href: safeTarget(data.href) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.href);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        return existing.focus().then((client) => (client && 'navigate' in client ? client.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});
