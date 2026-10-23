import type { BootstrapResponse } from '@/modules/warehouse-mobile/types';
import type { Draft } from '../draft';
import type { OutboxEntry } from '../outbox';
import type { LocalDb } from './idb';

/**
 * Lo que la app guarda en el teléfono, con nombre y forma. Una base por
 * persona y empresa (ver `dbNameFor`): si dos personas comparten el teléfono,
 * lo pendiente de una nunca se envía con la sesión de la otra.
 */

export interface StoredPhoto {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export interface BodegaStore {
  readonly persistent: boolean;
  loadOutbox(): Promise<OutboxEntry[]>;
  saveOutboxEntry(entry: OutboxEntry): Promise<void>;
  deleteOutboxEntry(id: string): Promise<void>;
  loadDraft(): Promise<Draft | null>;
  saveDraft(draft: Draft | null): Promise<void>;
  savePhoto(photo: StoredPhoto): Promise<void>;
  getPhoto(id: string): Promise<StoredPhoto | null>;
  deletePhoto(id: string): Promise<void>;
  listPhotoIds(): Promise<string[]>;
  loadBootstrap(): Promise<BootstrapResponse | null>;
  saveBootstrap(data: BootstrapResponse): Promise<void>;
  close(): void;
}

const DRAFT_KEY = 'current';
const BOOTSTRAP_KEY = 'bootstrap';

/** Nombre de la base local de esta persona en esta empresa. */
export function dbNameFor(companyId: string, userId: string): string {
  return `aether-bodega:${companyId}:${userId}`;
}

export function createBodegaStore(db: LocalDb): BodegaStore {
  return {
    persistent: db.persistent,
    async loadOutbox() {
      return (await db.entries<OutboxEntry>('outbox')).map((row) => row.value);
    },
    async saveOutboxEntry(entry) {
      await db.put('outbox', entry.id, entry);
    },
    async deleteOutboxEntry(id) {
      await db.delete('outbox', id);
    },
    async loadDraft() {
      return (await db.get<Draft>('draft', DRAFT_KEY)) ?? null;
    },
    async saveDraft(draft) {
      if (draft) await db.put('draft', DRAFT_KEY, draft);
      else await db.delete('draft', DRAFT_KEY);
    },
    async savePhoto(photo) {
      await db.put('photos', photo.id, photo);
    },
    async getPhoto(id) {
      return (await db.get<StoredPhoto>('photos', id)) ?? null;
    },
    async deletePhoto(id) {
      await db.delete('photos', id);
    },
    async listPhotoIds() {
      return (await db.entries<StoredPhoto>('photos')).map((row) => row.key);
    },
    async loadBootstrap() {
      const saved = (await db.get<BootstrapResponse>('meta', BOOTSTRAP_KEY)) ?? null;
      // La copia guardada por una versión anterior no trae la lista de proveedores.
      return saved ? { ...saved, suppliers: saved.suppliers ?? [] } : null;
    },
    async saveBootstrap(data) {
      await db.put('meta', BOOTSTRAP_KEY, data);
    },
    close() {
      db.close();
    },
  };
}
