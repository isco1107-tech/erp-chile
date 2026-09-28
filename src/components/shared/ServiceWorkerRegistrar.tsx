'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/offline/service-worker';

/** Registra `public/sw.js` al entrar al panel (POS sin conexión, app instalable, avisos push). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
