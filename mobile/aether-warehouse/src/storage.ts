import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { WarehouseStore } from '../../../src/lib/warehouse/local';
import type { WarehouseLocalState } from '../../../src/lib/warehouse/contracts';

export async function createNativeStore(): Promise<WarehouseStore> {
  let secret = await SecureStore.getItemAsync('aether.warehouse.db-key.v1');
  if (!secret) {
    secret = Array.from(Crypto.getRandomBytes(32), (value) => value.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync('aether.warehouse.db-key.v1', secret, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('No se pudo desbloquear el almacenamiento de este dispositivo');
  const db = await SQLite.openDatabaseAsync('aether-warehouse.db');
  await db.execAsync(`PRAGMA key = "x'${secret}'";`);
  const cipher = await db.getFirstAsync<Record<string, string>>('PRAGMA cipher_version');
  if (!cipher || Object.values(cipher).every((value) => !value)) throw new Error('Esta compilación no incluye el almacenamiento cifrado. Instala una compilación nativa de Aether Bodega.');
  await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS warehouse_state (scope TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);');
  const read = async <T>(scope: string): Promise<T | null> => {
    const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM warehouse_state WHERE scope = ?', scope);
    return row ? JSON.parse(row.payload) as T : null;
  };
  return {
    activeScope: () => read<string>('active'),
    activate: async (scope) => { await db.runAsync('INSERT INTO warehouse_state(scope, payload) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET payload = excluded.payload', 'active', JSON.stringify(scope)); },
    read: (scope) => read<WarehouseLocalState>(`scope:${scope}`),
    change: async (scope, updater) => {
      let next: WarehouseLocalState | null = null;
      await db.withExclusiveTransactionAsync(async (transaction) => {
        const row = await transaction.getFirstAsync<{ payload: string }>('SELECT payload FROM warehouse_state WHERE scope = ?', `scope:${scope}`);
        next = updater(row ? JSON.parse(row.payload) as WarehouseLocalState : null);
        await transaction.runAsync('INSERT INTO warehouse_state(scope, payload) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET payload = excluded.payload', `scope:${scope}`, JSON.stringify(next));
      });
      if (!next) throw new Error('No se pudo confirmar el guardado local');
      return next;
    },
    remove: async (scope) => { await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync('DELETE FROM warehouse_state WHERE scope = ?', `scope:${scope}`);
      const active = await transaction.getFirstAsync<{ payload: string }>('SELECT payload FROM warehouse_state WHERE scope = ?', 'active');
      if (active && JSON.parse(active.payload) === scope) await transaction.runAsync('DELETE FROM warehouse_state WHERE scope = ?', 'active');
    }); },
  };
}
