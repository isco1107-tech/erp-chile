'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { offlineCaptureBlock, type QueuedOperation } from '@/lib/offline/queue-rules';
import { listOperations, onQueueChange, readSnapshot, saveOperation, saveSnapshot } from '@/lib/offline/queue-store';
import { syncQueue } from '@/lib/offline/sync';

type Loaded<T> = { success: true; data: T } | { success: false; error: string };

export interface OfflineData<T> {
  data: T | null;
  /** Hora de la copia en uso cuando no se pudo cargar del servidor; `null` = datos al día. */
  savedAt: string | null;
  error: string | null;
  loading: boolean;
}

/**
 * Datos de un formulario de contingencia: del servidor si hay conexión (y se
 * guarda una copia en el equipo), o de esa copia si no la hay.
 */
export function useOfflineData<T>(key: string, load: () => Promise<Loaded<T>>): OfflineData<T> & { refresh: () => Promise<void> } {
  const [state, setState] = useState<OfflineData<T>>({ data: null, savedAt: null, error: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const result = await load();
      if (result.success) {
        await saveSnapshot(key, result.data).catch(() => undefined);
        setState({ data: result.data, savedAt: null, error: null, loading: false });
      } else {
        setState((prev) => ({ ...prev, error: result.error, loading: false }));
      }
    } catch {
      const snapshot = await readSnapshot<T>(key).catch(() => null);
      setState(
        snapshot
          ? { data: snapshot.data, savedAt: snapshot.savedAt, error: null, loading: false }
          : {
              data: null,
              savedAt: null,
              error: 'Sin conexión y sin datos guardados en este equipo. Abre esta pantalla con conexión al menos una vez para poder usarla sin red.',
              loading: false,
            }
      );
    }
  }, [key, load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}

/** Operaciones en la cola del equipo, al día con lo que cambie en esta u otras pestañas. */
export function useQueuedOperations(): QueuedOperation[] {
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  useEffect(() => {
    const reload = () => {
      listOperations()
        .then(setOperations)
        .catch(() => setOperations([]));
    };
    reload();
    return onQueueChange(reload);
  }, []);
  return operations;
}

/**
 * Guarda la operación en la cola (respetando el límite de 2 horas). Con
 * conexión se envía de inmediato; sin ella, al volver. `true` si quedó guardada.
 */
export function useEnqueue(companyId: string, userId: string) {
  return useCallback(
    async (operation: QueuedOperation): Promise<boolean> => {
      let block: string | null;
      try {
        block = offlineCaptureBlock(await listOperations(), companyId);
      } catch {
        toast.error('Este navegador no permite guardar operaciones sin conexión');
        return false;
      }
      if (block) {
        toast.error(block);
        return false;
      }
      try {
        await saveOperation(operation);
      } catch {
        toast.error('No se pudo guardar en este equipo. Inténtalo de nuevo.');
        return false;
      }

      if (!navigator.onLine) {
        toast.success(`${operation.label}: guardado en este equipo`, { description: 'Se registra solo al volver la conexión.' });
        return true;
      }
      const result = await syncQueue(companyId, userId).catch(() => null);
      if (result && result.failed > 0) toast.error('El servidor rechazó una operación: revísala en el aviso de la barra superior');
      else if (result && result.sent > 0) toast.success(`${operation.label}: registrado`);
      else toast.success(`${operation.label}: guardado`, { description: 'Se registra en cuanto el servidor responda.' });
      return true;
    },
    [companyId, userId]
  );
}
