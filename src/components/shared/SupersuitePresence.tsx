'use client';

import { useEffect } from 'react';

const BEAT_MS = 60_000;

/**
 * Avisa a la Supersuite (vía `/api/presence`) que este usuario sigue conectado.
 * Solo late con la pestaña visible: una pestaña olvidada en segundo plano deja
 * de contar como activa a los 5 minutos. No renderiza nada.
 */
export default function SupersuitePresence() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/presence', { method: 'POST', keepalive: true }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, BEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);

  return null;
}
