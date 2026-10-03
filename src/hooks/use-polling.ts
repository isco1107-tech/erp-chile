'use client';

import { useEffect, useRef } from 'react';
import { createPoller } from '@/lib/polling/poller';

export interface UsePollingOptions {
  /** `false` apaga el sondeo (p. ej. mientras no hay una conversación abierta). */
  enabled?: boolean;
  /** Seguir consultando con la pestaña oculta. Solo para pantallas en vivo. */
  keepAliveWhenHidden?: boolean;
}

/**
 * Llama a `run` cada `intervalMs` ms sin solaparse, en pausa con la pestaña
 * oculta y con refresco inmediato al volver (ver `src/lib/polling/poller.ts`).
 * No hace la primera carga: cada pantalla ya tiene la suya.
 */
export function usePolling(run: () => unknown | Promise<unknown>, intervalMs: number, options: UsePollingOptions = {}) {
  const { enabled = true, keepAliveWhenHidden = false } = options;
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (!enabled) return;
    const poller = createPoller({ run: () => runRef.current(), intervalMs, pauseWhenHidden: !keepAliveWhenHidden });
    poller.start();
    return () => poller.stop();
  }, [enabled, intervalMs, keepAliveWhenHidden]);
}
