/*
 * Avisos Web Push y shell neutral de Bodega. Nunca cachea APIs ni HTML del panel.
 * El contenido lo arma src/lib/notifications/web-push.ts (buildPushPayload).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const WAREHOUSE_CACHE = 'aether-warehouse-shell-v1';
function warehouseAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/warehouse-ocr/') || ['/icon.png', '/branding/app-icon-512.png'].includes(url.pathname));
}
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && url.pathname === '/bodega') {
    event.respondWith((async () => {
      const cache = await caches.open(WAREHOUSE_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && !response.redirected && response.headers.get('content-type')?.includes('text/html')) await cache.put('/bodega', response.clone());
        return response;
      } catch {
        const cached = await cache.match('/bodega');
        return cached || new Response('Prepara Bodega con conexión antes de trabajar sin señal.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
      }
    })());
  } else if (warehouseAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(WAREHOUSE_CACHE);
      const cached = await cache.match(request);
      const development = ['localhost', '127.0.0.1'].includes(self.location.hostname);
      if (cached && !development && !url.pathname.endsWith('/manifest.json')) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && !response.redirected) await cache.put(request, response.clone());
        return response;
      } catch (error) { if (cached) return cached; throw error; }
    })());
  }
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WAREHOUSE_PREPARE') return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(WAREHOUSE_CACHE);
      const shell = await fetch('/bodega', { credentials: 'same-origin', cache: 'no-store' });
      if (!shell.ok || shell.redirected || !shell.headers.get('content-type')?.includes('text/html')) throw new Error('session');
      const html = await shell.clone().text();
      const shellAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1].replaceAll('&amp;', '&'));
      const response = await fetch('/warehouse-ocr/manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('ocr-assets');
      const manifest = await response.json();
      const extra = Array.isArray(event.data.assets) ? event.data.assets.slice(0, 200) : [];
      const files = [...new Set([...manifest.files, ...extra, ...shellAssets])].filter((path) => typeof path === 'string' && warehouseAsset(new URL(path, self.location.origin)));
      for (const file of files) {
        const url = new URL(file, self.location.origin);
        const asset = await fetch(url.href, { cache: 'no-store' });
        if (!asset.ok || asset.redirected) throw new Error('asset');
        await cache.put(url.href, asset);
      }
      await cache.put('/bodega', shell);
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ ok: false }); }
  })());
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
