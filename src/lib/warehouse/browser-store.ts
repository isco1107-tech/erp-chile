import type { WarehouseLocalState } from './contracts';
import type { WarehouseStore } from './local';

const DATABASE = 'aether-warehouse-v1';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('state'); };
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento del navegador. Revisa el espacio disponible y evita el modo privado.'));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('Cierra otras ventanas de bodega y vuelve a intentar'));
  });
}
async function read<T>(key: string): Promise<T | null> {
  const db = await open();
  try { return await new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction('state', 'readonly');
    const request = transaction.objectStore('state').get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(new Error('No se pudieron leer los registros locales'));
  }); } finally { db.close(); }
}
async function write(key: string, updater: (value: unknown) => unknown, remove = false): Promise<unknown> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    const request = store.get(key);
    let result: unknown;
    let failure: unknown;
    request.onsuccess = () => {
      try { result = updater(request.result); if (remove) store.delete(key); else store.put(result, key); }
      catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure ?? new Error('No se pudo guardar. Revisa el espacio del teléfono; este registro aún no está guardado.'));
  }); } finally { db.close(); }
}
export function browserWarehouseStore(): WarehouseStore {
  return {
    activeScope: () => read<string>('active'),
    activate: async (scope) => { await write('active', () => scope); },
    read: (scope) => read<WarehouseLocalState>(`scope:${scope}`),
    change: async (scope, update) => await write(`scope:${scope}`, (previous) => update((previous as WarehouseLocalState | undefined) ?? null)) as WarehouseLocalState,
    remove: async (scope) => { await write(`scope:${scope}`, () => null, true); await write('active', (value) => value === scope ? null : value); },
  };
}

/** Cerrar sesión bloquea el acceso offline; jamás borra registros sin enviar. */
export async function lockBrowserWarehouse(): Promise<void> {
  const store = browserWarehouseStore();
  const scope = await store.activeScope();
  if (scope) {
    const state = await store.read(scope);
    if (state) await store.change(scope, (previous) => ({ ...(previous ?? state), identity: { ...(previous ?? state).identity, offlineUntil: new Date(0).toISOString() } }));
  }
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('aether-warehouse'); channel.postMessage('locked'); channel.close();
  }
}
