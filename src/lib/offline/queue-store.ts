import type { QueuedOperation } from './queue-rules';

/**
 * Almacenamiento en el equipo (IndexedDB) de la cola de contingencia y de las
 * copias de datos que los formularios necesitan sin conexión (catálogo,
 * bodegas, proveedores, órdenes de compra). Solo corre en el navegador.
 *
 * No se borra al cerrar sesión: lo que está en la cola ya ocurrió (una venta
 * cobrada) y tiene que llegar al servidor.
 */

const DB_NAME = 'aether-offline';
const DB_VERSION = 1;
const OPERATIONS = 'operations';
const SNAPSHOTS = 'snapshots';

/** Evento (misma pestaña) y canal (otras pestañas) que avisan que la cola cambió. */
export const QUEUE_EVENT = 'aether:offline-queue';
const QUEUE_CHANNEL = 'aether-offline-queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATIONS)) db.createObjectStore(OPERATIONS, { keyPath: 'idempotencyKey' });
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function notifyChange(): void {
  window.dispatchEvent(new Event(QUEUE_EVENT));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(QUEUE_CHANNEL);
    channel.postMessage('changed');
    channel.close();
  }
}

/** Se suscribe a cambios de la cola (en esta y otras pestañas). Devuelve la función para desuscribirse. */
export function onQueueChange(listener: () => void): () => void {
  window.addEventListener(QUEUE_EVENT, listener);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(QUEUE_CHANNEL) : null;
  if (channel) channel.onmessage = listener;
  return () => {
    window.removeEventListener(QUEUE_EVENT, listener);
    channel?.close();
  };
}

export async function listOperations(): Promise<QueuedOperation[]> {
  return run<QueuedOperation[]>(OPERATIONS, 'readonly', (store) => store.getAll() as IDBRequest<QueuedOperation[]>);
}

export async function saveOperation(op: QueuedOperation): Promise<void> {
  await run(OPERATIONS, 'readwrite', (store) => store.put(op));
  notifyChange();
}

export async function deleteOperation(idempotencyKey: string): Promise<void> {
  await run(OPERATIONS, 'readwrite', (store) => store.delete(idempotencyKey));
  notifyChange();
}

interface Snapshot<T> {
  key: string;
  savedAt: string;
  data: T;
}

/** Copia de datos para trabajar sin conexión (ej. catálogo de una bodega). La clave incluye la empresa. */
export async function saveSnapshot<T>(key: string, data: T): Promise<void> {
  await run(SNAPSHOTS, 'readwrite', (store) => store.put({ key, savedAt: new Date().toISOString(), data } satisfies Snapshot<T>));
}

export async function readSnapshot<T>(key: string): Promise<{ savedAt: string; data: T } | null> {
  const found = await run<Snapshot<T> | undefined>(SNAPSHOTS, 'readonly', (store) => store.get(key) as IDBRequest<Snapshot<T> | undefined>);
  return found ? { savedAt: found.savedAt, data: found.data } : null;
}
