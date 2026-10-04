'use client';

import { useEffect } from 'react';

const INTERVAL_MS = 60_000;

/**
 * Latido de presencia: mientras el panel está abierto y visible avisa cada
 * minuto que el usuario sigue conectado (alimenta «usuarios activos» de la
 * Supersuite). No pinta nada y un fallo de red se ignora.
 */
export default function PresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/presence', { method: 'POST', keepalive: true }).catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };

    beat();
    timer = setInterval(beat, INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
