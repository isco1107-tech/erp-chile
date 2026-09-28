/**
 * Registro del service worker (`public/sw.js`) y limpieza de su copia privada.
 * Solo corre en el navegador.
 */
export const SERVICE_WORKER_URL = '/sw.js';

/** Debe coincidir con PRIVATE_CACHE en public/sw.js. */
const PRIVATE_CACHE = 'aether-pos-v1';

/**
 * Se registra siempre en producción: sin él, el POS no abre sin conexión y
 * el navegador no ofrece instalar la app. En desarrollo no, para que una
 * copia guardada no tape los cambios mientras se programa.
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {
    // Sin service worker el ERP funciona igual, solo sin modo sin conexión.
  });
}

/**
 * Borra la copia de la pantalla del POS (tiene datos de la empresa). Se llama
 * al cerrar sesión y al cambiar de empresa, para que el próximo que abra el
 * equipo sin conexión no vea la empresa de otro.
 */
export async function clearPrivateOfflineCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(PRIVATE_CACHE);
  } catch {
    // Almacenamiento bloqueado: no hay copia que borrar.
  }
}
