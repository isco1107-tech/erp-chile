'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserWarehouse } from '@/lib/warehouse/web-client';
import { WarehouseConnectionError, type WarehouseClient } from '@/lib/warehouse/local';
import type { WarehouseLocalState, WarehouseOperation } from '@/lib/warehouse/contracts';

export function useWarehouse() {
  const client = useRef<WarehouseClient | null>(null);
  const [state, setState] = useState<WarehouseLocalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [online, setOnline] = useState(true);
  const syncing = useRef(false);
  const manuallyLocked = useRef(false);
  const sync = useCallback(async (quiet = false, fullRefresh = true) => {
    if (manuallyLocked.current && quiet) return;
    if (!quiet) manuallyLocked.current = false;
    if (!client.current || syncing.current) return;
    syncing.current = true;
    setBusy(true);
    try {
      const next = await client.current.synchronize(fullRefresh);
      setState(next); setLocked(false); setError('');
      const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('aether-warehouse') : null;
      channel?.postMessage('changed'); channel?.close();
    } catch (problem) {
      if (problem instanceof WarehouseConnectionError && [401, 403].includes(problem.status)) { setLocked(true); setState(null); }
      if (problem instanceof WarehouseConnectionError && problem.status === 0) {
        try { const local = await client.current.current(); if (local) setState(local); }
        catch (localError) { setLocked(true); setState(null); setError(localError instanceof Error ? localError.message : 'Vuelve a iniciar sesión'); return; }
      }
      if (!quiet || !(problem instanceof WarehouseConnectionError) || problem.status !== 0) setError(problem instanceof Error ? problem.message : 'No se pudo actualizar la bodega');
    } finally { syncing.current = false; setBusy(false); setLoading(false); }
  }, []);
  useEffect(() => {
    client.current = createBrowserWarehouse();
    if ('serviceWorker' in navigator && navigator.onLine) void navigator.serviceWorker.register('/sw.js').catch(() => { /* El modo local sigue disponible sin instalación. */ });
    let disposed = false;
    const initialize = async () => {
      if (navigator.onLine) { await sync(true); return; }
      const local = await client.current?.current();
      if (!disposed && local) setState(local);
    };
    void initialize().catch((problem: unknown) => {
      if (!disposed) { setLocked(problem instanceof WarehouseConnectionError && problem.status === 401); setError(problem instanceof Error ? problem.message : 'No se pudieron leer los registros locales'); }
    }).finally(() => { if (!disposed) setLoading(false); });
    setOnline(navigator.onLine);
    const connected = () => { setOnline(true); void sync(true, false); };
    const disconnected = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      void client.current?.current().then((local) => { if (!disposed && local) setState(local); }).catch(() => { if (!disposed) { setLocked(true); setState(null); } });
      if (navigator.onLine) void sync(true, false);
    };
    window.addEventListener('online', connected); window.addEventListener('offline', disconnected); document.addEventListener('visibilitychange', visible);
    const interval = setInterval(() => {
      void client.current?.current().catch(() => { if (!disposed) { setLocked(true); setState(null); } });
      if (navigator.onLine && document.visibilityState === 'visible') void sync(true, false);
    }, 60_000);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('aether-warehouse') : null;
    if (channel) channel.onmessage = (event: MessageEvent<string>) => {
      if (event.data === 'locked') { manuallyLocked.current = true; setLocked(true); setState(null); return; }
      void client.current?.current().then((local) => { if (!disposed) setState(local); }).catch(() => { if (!disposed) { setLocked(true); setState(null); } });
    };
    return () => { disposed = true; clearInterval(interval); channel?.close(); window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); document.removeEventListener('visibilitychange', visible); };
  }, [sync]);
  const capture = useCallback(async (input: Omit<WarehouseOperation, 'id' | 'deviceId' | 'protocol' | 'capturedAt'>) => {
    if (!client.current) return false;
    try {
      setState(await client.current.capture(input)); setError('');
      if (navigator.onLine) void sync(true, false);
      return true;
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo guardar el registro'); return false; }
  }, [sync]);
  return { state, loading, busy, locked, online, error, sync, capture, setError };
}
