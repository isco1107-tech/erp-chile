/**
 * Almacenamiento local del teléfono (IndexedDB) detrás de una interfaz mínima.
 *
 * Guarda lo que NO puede perderse si se cierra la app o se va la señal: la cola
 * de envío, el borrador, las fotos pendientes. Si el navegador no permite
 * IndexedDB (modo privado de algunos navegadores), se cae a memoria: la app
 * sigue funcionando, pero avisa que lo guardado se perdería al cerrarla.
 *
 * Solo navegador. La interfaz existe para poder probar el resto con la versión
 * en memoria.
 */

export const STORES = ['outbox', 'photos', 'draft', 'meta'] as const;
export type StoreName = (typeof STORES)[number];

export interface LocalDb {
  /** `false` si es la versión en memoria (nada sobrevive a cerrar la app). */
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  entries<T>(store: StoreName): Promise<Array<{ key: string; value: T }>>;
  clear(store: StoreName): Promise<void>;
  close(): void;
}

export function createMemoryDb(): LocalDb {
  const data = new Map<StoreName, Map<string, unknown>>(STORES.map((name) => [name, new Map<string, unknown>()]));
  const table = (store: StoreName) => data.get(store) as Map<string, unknown>;
  return {
    persistent: false,
    async get<T>(store: StoreName, key: string) {
      return table(store).get(key) as T | undefined;
    },
    async put<T>(store: StoreName, key: string, value: T) {
      table(store).set(key, value);
    },
    async delete(store, key) {
      table(store).delete(key);
    },
    async entries<T>(store: StoreName) {
      return [...table(store).entries()].map(([key, value]) => ({ key, value: value as T }));
    },
    async clear(store) {
      table(store).clear();
    },
    close() {},
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error de almacenamiento local'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Error de almacenamiento local'));
    tx.onabort = () => reject(tx.error ?? new Error('Almacenamiento local cancelado'));
  });
}

/** Abre (o crea) la base con ese nombre. Cae a memoria si IndexedDB no está disponible. */
export async function openLocalDb(name: string): Promise<LocalDb> {
  if (typeof indexedDB === 'undefined') return createMemoryDb();

  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => {
        for (const store of STORES) if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('No se pudo abrir el almacenamiento local'));
      open.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña'));
    });
  } catch {
    return createMemoryDb();
  }

  return {
    persistent: true,
    async get<T>(store: StoreName, key: string) {
      return (await request(db.transaction(store, 'readonly').objectStore(store).get(key))) as T | undefined;
    },
    async put<T>(store: StoreName, key: string, value: T) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      await done(tx);
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      await done(tx);
    },
    async entries<T>(store: StoreName) {
      const tx = db.transaction(store, 'readonly');
      const os = tx.objectStore(store);
      const [keys, values] = await Promise.all([request(os.getAllKeys()), request(os.getAll())]);
      return keys.map((key, index) => ({ key: String(key), value: values[index] as T }));
    },
    async clear(store) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      await done(tx);
    },
    close() {
      db.close();
    },
  };
}
