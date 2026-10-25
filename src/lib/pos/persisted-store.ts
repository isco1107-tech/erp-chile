/**
 * Valor guardado en el navegador, leído con `useSyncExternalStore`: el primer
 * render (servidor y cliente) usa `fallback`, así que no hay diferencia de
 * hidratación, y el valor real aparece enseguida sin parpadeos de "cargando".
 *
 * Si el almacenamiento está bloqueado (ventana privada) o falla al escribir, el
 * valor se conserva en memoria hasta cerrar la pestaña: la caja sigue andando.
 */
export interface PersistedStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  getServerSnapshot(): T;
  set(value: T): void;
}

export function createPersistedStore<T>(options: {
  key: string;
  parse(raw: string | null): T;
  serialize(value: T): string;
  fallback: T;
}): PersistedStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue: T = options.fallback;
  let memoryValue: { value: T } | null = null;

  const readRaw = (): string | null => {
    try {
      return window.localStorage.getItem(options.key);
    } catch {
      return null;
    }
  };

  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        // Otra pestaña del mismo equipo cambió el valor.
        if (event.key === options.key || event.key === null) {
          cachedRaw = undefined;
          memoryValue = null;
          listener();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot() {
      if (typeof window === 'undefined') return options.fallback;
      if (memoryValue) return memoryValue.value;
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = options.parse(raw);
      }
      return cachedValue;
    },
    getServerSnapshot: () => options.fallback,
    set(value) {
      try {
        window.localStorage.setItem(options.key, options.serialize(value));
        memoryValue = null;
      } catch {
        memoryValue = { value };
      }
      cachedRaw = undefined;
      notify();
    },
  };
}
