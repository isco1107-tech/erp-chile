'use client';

import { useEffect, useRef } from 'react';

/**
 * Widget de Cloudflare Turnstile (ver `src/lib/security/turnstile.ts`). Si
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está configurada no renderiza nada y el
 * servidor tampoco exige el token. En modo "managed" la mayoría de las
 * personas no ve ningún desafío: solo una casilla que se marca sola.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('No se pudo cargar Turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const isTurnstileConfigured = SITE_KEY.length > 0;

export default function TurnstileWidget({
  action,
  onToken,
  theme = 'auto',
  className,
}: {
  /** Debe coincidir con la acción que valida el servidor (`verifyTurnstile`). */
  action: string;
  /** Recibe el token al resolverse, o `null` cuando vence o falla. */
  onToken: (token: string | null) => void;
  theme?: 'auto' | 'light' | 'dark';
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          action,
          theme,
          language: 'es',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, theme]);

  if (!SITE_KEY) return null;
  return <div ref={container} className={className} />;
}
