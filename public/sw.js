/*
 * Service worker de Aether: solo avisos Web Push (sin caché offline).
 * El contenido lo arma src/lib/notifications/web-push.ts (buildPushPayload).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
