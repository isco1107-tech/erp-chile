'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { clockLabel } from '@/lib/retail/live-metrics';

/**
 * Vuelve a pedir la página al servidor cada `intervalMs` mientras la pestaña
 * está a la vista (`router.refresh()`: el Server Component recalcula y React
 * conserva el estado del cliente, como el orden o la búsqueda de una tabla).
 * Con la pestaña oculta no consulta; al volver, si ya pasó el intervalo,
 * actualiza de inmediato.
 */
export function LiveRefresh({ generatedAt, intervalMs }: { generatedAt: string; intervalMs: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paused, setPaused] = useState(false);
  const lastRefresh = useRef(0);

  // Al montar y al cambiar un filtro llegan datos nuevos: el intervalo corre desde ahí.
  useEffect(() => {
    lastRefresh.current = Date.now();
  }, [generatedAt]);

  const refresh = useCallback(() => {
    lastRefresh.current = Date.now();
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current >= intervalMs) refresh();
    };
    const timer = window.setInterval(tick, Math.min(intervalMs, 15_000));
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs, paused, refresh]);

  const time = clockLabel(new Date(generatedAt));
  const minutes = Math.round(intervalMs / 60_000);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className="inline-flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${paused ? 'bg-muted-foreground' : 'bg-success'}`} aria-hidden="true" />
        {paused ? `Pausado · datos de las ${time}` : `Datos de las ${time} · se actualiza cada ${minutes === 1 ? 'minuto' : `${minutes} minutos`}`}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" />
        Actualizar ahora
      </button>
      <button type="button" onClick={() => setPaused((value) => !value)} className="inline-flex h-7 items-center rounded-md px-2 font-medium text-foreground hover:bg-muted">
        {paused ? 'Reanudar' : 'Pausar'}
      </button>
    </div>
  );
}
