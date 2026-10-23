'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBodegaApi, type BodegaApi } from '@/lib/warehouse-mobile/client/api';
import { openLocalDb } from '@/lib/warehouse-mobile/client/idb';
import { applyOutcome, nextIdentifyWake, performIdentify, pickNext } from '@/lib/warehouse-mobile/client/identify-engine';
import { newId } from '@/lib/warehouse-mobile/client/ids';
import type { PreparedPhoto } from '@/lib/warehouse-mobile/client/image';
import { runSyncPass, sleepUntil } from '@/lib/warehouse-mobile/client/sync-engine';
import { createBodegaStore, dbNameFor, type BodegaStore } from '@/lib/warehouse-mobile/client/store';
import {
  addCode,
  addPhoto,
  addProduct,
  confirmLine,
  emptyDraft,
  patchLine,
  removeLine,
  resolveWithProduct,
  setQuantity,
  setSource,
  toOperations,
  validateDraft,
  type Draft,
  type DraftLine,
  type DraftProblem,
  type LineSource,
} from '@/lib/warehouse-mobile/draft';
import type { MobileMode } from '@/lib/warehouse-mobile/modes';
import { createOutboxEntry, recoverInterrupted, pruneDone, summarizeOutbox, type OutboxEntry, type OutboxLabel, type OutboxSummary } from '@/lib/warehouse-mobile/outbox';
import type { AppliedOpResult, BootstrapResponse, MobileProduct } from '@/modules/warehouse-mobile/types';
import { createProductOpSchema, moveOpSchema, type SyncOperation } from '@/modules/warehouse-mobile/schema';

/**
 * Estado central de la app del bodeguero.
 *
 * Principios (cada uno nació de un problema real de una bodega):
 *  - Offline primero: al abrir se muestra lo último que se sabía y se actualiza
 *    en segundo plano. Sin señal se puede seguir trabajando.
 *  - Lo confirmado vive en el teléfono hasta que el servidor lo acepta (cola de
 *    envío con claves de idempotencia). Cerrar la app o perder la señal no pierde nada.
 *  - La identificación (códigos, fotos y la IA) corre en segundo plano, una
 *    consulta a la vez, mientras la persona sigue trabajando.
 *  - Una base local POR persona y empresa: lo pendiente de una persona nunca se
 *    envía con la sesión de otra.
 */

export type BootState =
  | { status: 'loading' }
  | { status: 'ready'; data: BootstrapResponse; stale: boolean }
  | { status: 'blocked'; message: string }
  | { status: 'login'; message: string };

export interface AuthIssue {
  status: 401 | 403;
  message: string;
}

export type SubmitResult = { ok: true; count: number } | { ok: false; problems: DraftProblem[] };

export interface BodegaContextValue {
  boot: BootState;
  online: boolean;
  persistent: boolean;
  auth: AuthIssue | null;
  api: BodegaApi;
  draft: Draft | null;
  outbox: OutboxEntry[];
  summary: OutboxSummary;
  syncing: boolean;
  identifying: boolean;
  warehouseId: string;
  setWarehouseId(id: string): void;
  // borrador
  startDraft(mode: MobileMode): 'ok' | 'conflict';
  discardDraft(): void;
  updateDraft(fn: (draft: Draft) => Draft): void;
  addProductLine(product: MobileProduct, options?: { quantity?: number; confirmed?: boolean; origin?: 'code' | 'ai' | 'manual' }): void;
  addCodeLine(code: string, quantity?: number): void;
  addPhotoLine(photo: PreparedPhoto): Promise<void>;
  setLineQuantity(lineId: string, quantity: number): void;
  patchDraftLine(lineId: string, patch: Partial<Omit<DraftLine, 'id' | 'source' | 'createdAt'>>): void;
  removeDraftLine(lineId: string): void;
  confirmDraftLine(lineId: string): void;
  setLineSource(lineId: string, source: LineSource): void;
  resolveLine(lineId: string, product: MobileProduct, options: { confirmed: boolean; origin: 'code' | 'ai' | 'manual'; factor?: number }): void;
  retryIdentification(lineId: string): void;
  submitDraft(): SubmitResult;
  // cola
  retryOutbox(id?: string): void;
  discardOutboxEntry(id: string): void;
  enqueueOperation(op: SyncOperation, label: OutboxLabel, photoId?: string | null): void;
  // fotos
  getPhotoUrl(photoId: string): Promise<string | null>;
  // sesión
  refreshBootstrap(): Promise<void>;
  logout(): Promise<void>;
}

const BodegaContext = createContext<BodegaContextValue | null>(null);

export function useBodega(): BodegaContextValue {
  const value = useContext(BodegaContext);
  if (!value) throw new Error('useBodega debe usarse dentro de BodegaProvider');
  return value;
}

const LAST_CTX_KEY = 'aether-bodega:ctx';
const WAREHOUSE_KEY = 'aether-bodega:warehouse';
/** Las fotos guardadas que ya nadie usa se limpian pasado este tiempo (da margen a las recién sacadas). */
const PHOTO_GRACE_MS = 10 * 60_000;
const PERSIST_DEBOUNCE_MS = 250;
const MAX_LOOP_PASSES = 200;

function readLastCtx(): { companyId: string; userId: string } | null {
  try {
    const raw = window.localStorage.getItem(LAST_CTX_KEY);
    const parsed = raw ? (JSON.parse(raw) as { companyId?: unknown; userId?: unknown }) : null;
    return parsed && typeof parsed.companyId === 'string' && typeof parsed.userId === 'string' ? { companyId: parsed.companyId, userId: parsed.userId } : null;
  } catch {
    return null;
  }
}

function writeLastCtx(ctx: { companyId: string; userId: string }): void {
  try {
    window.localStorage.setItem(LAST_CTX_KEY, JSON.stringify(ctx));
  } catch {
    /* sin almacenamiento del navegador: se pierde solo la apertura sin señal */
  }
}

function photoIdOf(source: LineSource): string | null {
  return 'photoId' in source ? source.photoId : null;
}

export function BodegaProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => createBodegaApi(), []);

  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [online, setOnline] = useState(true);
  const [persistent, setPersistent] = useState(true);
  const [auth, setAuth] = useState<AuthIssue | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [warehouseId, setWarehouseIdState] = useState('');

  const storeRef = useRef<BodegaStore | null>(null);
  const storeKeyRef = useRef<string | null>(null);
  const openChain = useRef<Promise<void>>(Promise.resolve());
  const bootRef = useRef<BootState>(boot);
  const draftRef = useRef<Draft | null>(null);
  const outboxRef = useRef<OutboxEntry[]>([]);
  const holdUntilRef = useRef(0);
  const identifyRunning = useRef(false);
  const identifyAgain = useRef(false);
  const syncRunning = useRef(false);
  const syncAgain = useRef(false);
  const identifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoUrls = useRef(new Map<string, string>());
  const warehouseRef = useRef('');
  const kickIdentifyRef = useRef<() => void>(() => undefined);
  const kickSyncRef = useRef<() => void>(() => undefined);

  // Las funciones de larga vida (temporizadores, bucles) leen estos valores desde refs: se actualizan en un efecto, nunca durante el render.
  useEffect(() => {
    bootRef.current = boot;
  }, [boot]);
  useEffect(() => {
    warehouseRef.current = warehouseId;
  }, [warehouseId]);

  // ── Borrador ──────────────────────────────────────────────────────────────

  const commitDraft = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void storeRef.current?.saveDraft(draftRef.current);
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  /** Aplica un cambio al borrador VIGENTE (nunca a una copia vieja) y despierta la identificación. */
  const updateDraft = useCallback(
    (fn: (current: Draft) => Draft) => {
      const current = draftRef.current;
      if (!current) return;
      commitDraft(fn(current));
      kickIdentifyRef.current();
    },
    [commitDraft]
  );

  // ── Cola de envío ─────────────────────────────────────────────────────────

  const commitOutbox = useCallback((next: OutboxEntry[]) => {
    outboxRef.current = next;
    setOutbox(next);
  }, []);

  /** Mezcla el resultado de un pase sobre la cola VIGENTE: no resucita lo descartado ni pisa lo agregado. */
  const reconcileOutbox = useCallback(
    (updated: readonly OutboxEntry[]) => {
      const byId = new Map(updated.map((entry) => [entry.id, entry]));
      commitOutbox(outboxRef.current.map((entry) => byId.get(entry.id) ?? entry));
    },
    [commitOutbox]
  );

  const scheduleSyncWake = useCallback((wakeAt: number | null) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const delay = sleepUntil(wakeAt, Date.now());
    if (delay !== null) syncTimer.current = setTimeout(() => kickSyncRef.current(), delay);
  }, []);

  const runSync = useCallback(async () => {
    if (syncRunning.current) {
      syncAgain.current = true;
      return;
    }
    syncRunning.current = true;
    setSyncing(true);
    let wakeAt: number | null = null;
    try {
      do {
        syncAgain.current = false;
        for (let pass = 0; pass < MAX_LOOP_PASSES; pass++) {
          const store = storeRef.current;
          const current = bootRef.current;
          if (!store || current.status !== 'ready') break;
          const result = await runSyncPass(outboxRef.current, { api, store, now: Date.now, maxBatch: current.data.limits.maxOpsPerBatch });
          reconcileOutbox(result.entries);
          wakeAt = result.wakeAt;
          if (result.auth) {
            setAuth(result.auth);
            break;
          }
          if (result.applied.length > 0) {
            setAuth(null);
            notifyApplied(result.applied);
          }
          if (!result.worked) break;
        }
      } while (syncAgain.current);
    } finally {
      syncRunning.current = false;
      setSyncing(false);
      scheduleSyncWake(wakeAt);
    }
  }, [api, reconcileOutbox, scheduleSyncWake]);

  useEffect(() => {
    kickSyncRef.current = () => void runSync();
  }, [runSync]);

  // ── Identificación en segundo plano ───────────────────────────────────────

  const scheduleIdentifyWake = useCallback(() => {
    if (identifyTimer.current) clearTimeout(identifyTimer.current);
    const current = draftRef.current;
    if (!current) return;
    const wakeAt = nextIdentifyWake(current, holdUntilRef.current);
    const delay = sleepUntil(wakeAt, Date.now());
    if (delay !== null) identifyTimer.current = setTimeout(() => kickIdentifyRef.current(), delay);
  }, []);

  const runIdentify = useCallback(async () => {
    if (identifyRunning.current) {
      identifyAgain.current = true;
      return;
    }
    identifyRunning.current = true;
    setIdentifying(true);
    try {
      do {
        identifyAgain.current = false;
        for (let pass = 0; pass < MAX_LOOP_PASSES; pass++) {
          const current = draftRef.current;
          const store = storeRef.current;
          if (!current || !store) break;
          const line = pickNext(current, holdUntilRef.current, Date.now());
          if (!line) break;
          const result = await performIdentify(line, current.warehouseId, holdUntilRef.current, {
            api,
            now: Date.now,
            getPhotoBlob: async (photoId) => (await store.getPhoto(photoId))?.blob ?? null,
          });
          holdUntilRef.current = result.holdUntil;
          if (result.outcome.kind === 'auth') {
            setAuth({ status: result.outcome.status, message: result.outcome.message });
            break;
          }
          // Sobre el borrador de ESTE momento: la persona pudo editarlo mientras se esperaba.
          const latest = draftRef.current;
          if (latest) commitDraft(applyOutcome(latest, line.id, result.outcome));
        }
      } while (identifyAgain.current);
    } finally {
      identifyRunning.current = false;
      setIdentifying(false);
      scheduleIdentifyWake();
    }
  }, [api, commitDraft, scheduleIdentifyWake]);

  useEffect(() => {
    kickIdentifyRef.current = () => void runIdentify();
  }, [runIdentify]);

  // ── Fotos guardadas en el teléfono ────────────────────────────────────────

  const cleanupPhotos = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    const used = new Set<string>();
    for (const line of draftRef.current?.lines ?? []) {
      const id = photoIdOf(line.source);
      if (id) used.add(id);
    }
    for (const entry of outboxRef.current) if (entry.photoId) used.add(entry.photoId);
    for (const id of await store.listPhotoIds()) {
      if (used.has(id)) continue;
      const photo = await store.getPhoto(id);
      if (photo && Date.now() - photo.createdAt > PHOTO_GRACE_MS) await store.deletePhoto(id);
    }
  }, []);

  const getPhotoUrl = useCallback(async (photoId: string): Promise<string | null> => {
    const known = photoUrls.current.get(photoId);
    if (known) return known;
    const photo = await storeRef.current?.getPhoto(photoId);
    if (!photo) return null;
    const url = URL.createObjectURL(photo.blob);
    photoUrls.current.set(photoId, url);
    return url;
  }, []);

  // ── Apertura: base local, borrador, cola y servidor ───────────────────────

  /**
   * Abre la base local de esta persona. Idempotente y en fila: pedirla dos veces a la
   * vez (arranque + reconexión) no cierra una base mientras la otra aún la usa.
   */
  const openStoreFor = useCallback(
    (companyId: string, userId: string): Promise<BodegaStore> => {
      const key = `${companyId}:${userId}`;
      const run = async (): Promise<BodegaStore> => {
        if (storeKeyRef.current === key && storeRef.current) return storeRef.current;
        storeRef.current?.close();
        const db = await openLocalDb(dbNameFor(companyId, userId));
        const store = createBodegaStore(db);
        storeRef.current = store;
        storeKeyRef.current = key;
        setPersistent(db.persistent);

        const now = Date.now();
        const entries = pruneDone(recoverInterrupted(await store.loadOutbox(), now), now);
        commitOutbox(entries);
        const saved = await store.loadDraft();
        draftRef.current = saved;
        setDraft(saved);
        holdUntilRef.current = 0;
        void cleanupPhotos();
        return store;
      };
      const next = openChain.current.then(run, run);
      openChain.current = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
    [cleanupPhotos, commitOutbox]
  );

  const chooseWarehouse = useCallback((data: BootstrapResponse) => {
    let saved = '';
    try {
      saved = window.localStorage.getItem(`${WAREHOUSE_KEY}:${data.company.id}:${data.user.id}`) ?? '';
    } catch {
      saved = '';
    }
    const valid = data.warehouses.some((warehouse) => warehouse.id === saved);
    const fallback = data.warehouses.find((warehouse) => warehouse.isDefault)?.id ?? data.warehouses[0]?.id ?? '';
    setWarehouseIdState((current) => (data.warehouses.some((warehouse) => warehouse.id === current) ? current : valid ? saved : fallback));
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const response = await api.bootstrap();
    if (response.ok) {
      const data = response.data;
      await openStoreFor(data.company.id, data.user.id);
      writeLastCtx({ companyId: data.company.id, userId: data.user.id });
      await storeRef.current?.saveBootstrap(data);
      chooseWarehouse(data);
      setBoot({ status: 'ready', data, stale: false });
      setAuth(null);
      kickSyncRef.current();
      kickIdentifyRef.current();
      return;
    }

    const { failure } = response;
    if (failure.kind === 'auth') {
      if (failure.status === 401) {
        // Sin sesión: si hay datos guardados se sigue mostrando la app (lo pendiente se conserva) con el aviso de entrar de nuevo.
        setAuth({ status: 401, message: 'Tu sesión venció. Inicia sesión para enviar lo pendiente.' });
        setBoot((current) => (current.status === 'ready' ? current : { status: 'login', message: failure.message }));
      } else {
        setBoot({ status: 'blocked', message: failure.message });
      }
      return;
    }
    if (failure.kind === 'client') {
      setBoot({ status: 'blocked', message: failure.message });
      return;
    }
    // Sin conexión o servidor caído: se sigue con lo guardado, si lo hay.
    setBoot((current) => (current.status === 'ready' ? { ...current, stale: true } : { status: 'blocked', message: 'Necesitas conexión la primera vez que abres la app.' }));
  }, [api, chooseWarehouse, openStoreFor]);

  useEffect(() => {
    let cancelled = false;
    setOnline(navigator.onLine);

    void (async () => {
      const last = readLastCtx();
      if (last) {
        const store = await openStoreFor(last.companyId, last.userId);
        const cached = await store.loadBootstrap();
        if (cancelled) return;
        if (cached) {
          chooseWarehouse(cached);
          setBoot({ status: 'ready', data: cached, stale: true });
        }
      }
      if (!cancelled) await refreshBootstrap();
    })();

    return () => {
      cancelled = true;
    };
    // Se abre una sola vez al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Cuando vuelve la señal (o la persona vuelve a la app) no tiene sentido seguir
   * esperando el plazo de un reintento calculado para cuando NO había conexión:
   * todo lo que esperaba por falta de señal se intenta ahora. Lo que esperaba su
   * turno de la IA no se toca (ese plazo lo fijó el servidor).
   */
  const wakeForConnection = useCallback(() => {
    const now = Date.now();
    commitOutbox(outboxRef.current.map((entry) => (entry.status === 'queued' && entry.nextAttemptAt > now ? { ...entry, nextAttemptAt: now } : entry)));
    const current = draftRef.current;
    if (!current) return;
    const lines = current.lines.map((line) => {
      const { source } = line;
      if ((source.kind === 'code' || source.kind === 'identify') && source.pending.attempts > 0 && source.pending.nextAttemptAt > now) {
        return { ...line, source: { ...source, pending: { ...source.pending, nextAttemptAt: now } } };
      }
      return line;
    });
    commitDraft({ ...current, lines });
  }, [commitDraft, commitOutbox]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      wakeForConnection();
      void refreshBootstrap();
      kickSyncRef.current();
      kickIdentifyRef.current();
    };
    const handleOffline = () => setOnline(false);
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      wakeForConnection();
      kickSyncRef.current();
      kickIdentifyRef.current();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [refreshBootstrap, wakeForConnection]);

  // Al cerrar o recargar con cambios sin guardar, se guarda lo último del borrador.
  useEffect(() => {
    const flush = () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      void storeRef.current?.saveDraft(draftRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  useEffect(() => {
    const urls = photoUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      if (identifyTimer.current) clearTimeout(identifyTimer.current);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  // Con la app lista, despierta los motores (hay cosas pendientes de una sesión anterior).
  useEffect(() => {
    if (boot.status !== 'ready') return;
    kickSyncRef.current();
    kickIdentifyRef.current();
  }, [boot.status]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const setWarehouseId = useCallback(
    (id: string) => {
      setWarehouseIdState(id);
      const current = bootRef.current;
      if (current.status === 'ready') {
        try {
          window.localStorage.setItem(`${WAREHOUSE_KEY}:${current.data.company.id}:${current.data.user.id}`, id);
        } catch {
          /* se pierde solo la preferencia */
        }
      }
      const open = draftRef.current;
      if (open) commitDraft({ ...open, warehouseId: id, targetWarehouseId: open.targetWarehouseId === id ? '' : open.targetWarehouseId });
    },
    [commitDraft]
  );

  const startDraft = useCallback(
    (mode: MobileMode): 'ok' | 'conflict' => {
      const current = draftRef.current;
      if (current && current.mode === mode) return 'ok';
      if (current && current.lines.length > 0) return 'conflict';
      commitDraft(emptyDraft(mode, warehouseRef.current));
      return 'ok';
    },
    [commitDraft]
  );

  const discardDraft = useCallback(() => {
    commitDraft(null);
    void storeRef.current?.saveDraft(null);
    void cleanupPhotos();
  }, [cleanupPhotos, commitDraft]);

  const addProductLine = useCallback<BodegaContextValue['addProductLine']>(
    (product, options) => updateDraft((current) => addProduct(current, product, { id: newId(), now: Date.now(), ...options })),
    [updateDraft]
  );

  const addCodeLine = useCallback<BodegaContextValue['addCodeLine']>(
    (code, quantity) => updateDraft((current) => addCode(current, code, { id: newId(), now: Date.now(), quantity })),
    [updateDraft]
  );

  const addPhotoLine = useCallback<BodegaContextValue['addPhotoLine']>(
    async (photo) => {
      const store = storeRef.current;
      if (!store) return;
      const photoId = newId();
      const lineId = newId();
      const aiEnabled = bootRef.current.status === 'ready' ? bootRef.current.data.ai.enabled : true;
      await store.savePhoto({ id: photoId, blob: photo.blob, width: photo.width, height: photo.height, createdAt: Date.now() });
      updateDraft((current) => {
        const next = addPhoto(current, photoId, { id: lineId, now: Date.now() });
        // Sin IA en el servidor no se manda la foto a "identificarse": la persona elige o crea el producto (la foto queda para el producto nuevo).
        return aiEnabled
          ? next
          : setSource(next, lineId, { kind: 'resolve', reason: 'unavailable', candidates: [], read: null, photoId, code: null, message: 'La identificación por foto no está disponible en este servidor.' });
      });
    },
    [updateDraft]
  );

  const setLineQuantity = useCallback((lineId: string, quantity: number) => updateDraft((current) => setQuantity(current, lineId, quantity)), [updateDraft]);
  const patchDraftLine = useCallback<BodegaContextValue['patchDraftLine']>((lineId, patch) => updateDraft((current) => patchLine(current, lineId, patch)), [updateDraft]);
  const removeDraftLine = useCallback(
    (lineId: string) => {
      updateDraft((current) => removeLine(current, lineId));
      void cleanupPhotos();
    },
    [cleanupPhotos, updateDraft]
  );
  const confirmDraftLine = useCallback((lineId: string) => updateDraft((current) => confirmLine(current, lineId)), [updateDraft]);
  const setLineSource = useCallback((lineId: string, source: LineSource) => updateDraft((current) => setSource(current, lineId, source)), [updateDraft]);
  const resolveLine = useCallback<BodegaContextValue['resolveLine']>(
    (lineId, product, options) => updateDraft((current) => resolveWithProduct(current, lineId, product, options)),
    [updateDraft]
  );

  const retryIdentification = useCallback(
    (lineId: string) => {
      holdUntilRef.current = 0;
      updateDraft((current) => {
        const line = current.lines.find((candidate) => candidate.id === lineId);
        if (!line) return current;
        const photoId = 'photoId' in line.source ? line.source.photoId : null;
        const code = line.source.kind === 'resolve' ? line.source.code : null;
        const pending = { attempts: 0, nextAttemptAt: Date.now(), message: null };
        if (photoId) return setSource(current, lineId, { kind: 'identify', photoId, pending });
        if (code) return setSource(current, lineId, { kind: 'code', code, pending });
        return current;
      });
    },
    [updateDraft]
  );

  const submitDraft = useCallback((): SubmitResult => {
    const current = draftRef.current;
    const data = bootRef.current.status === 'ready' ? bootRef.current.data : null;
    if (!current || !data) return { ok: false, problems: [{ message: 'La app todavía no está lista.' }] };

    const problems = validateDraft(current, { canCreateProduct: data.can.createProduct });
    if (problems.length > 0) return { ok: false, problems };

    const { ops, photos, labels } = toOperations(current);
    // Última red de seguridad: lo que sale del teléfono debe pasar el mismo esquema que valida el servidor.
    for (const op of ops) {
      const valid = (op.kind === 'MOVE' ? moveOpSchema : createProductOpSchema).safeParse(op);
      if (!valid.success) return { ok: false, problems: [{ lineId: op.clientOpId, message: valid.error.issues[0]?.message ?? 'Hay un dato inválido.' }] };
    }

    const now = Date.now();
    const entries = ops.map((op) => createOutboxEntry(op, now, photos[op.clientOpId] ?? null, labels[op.clientOpId]));
    commitOutbox([...outboxRef.current, ...entries]);
    for (const entry of entries) void storeRef.current?.saveOutboxEntry(entry);

    commitDraft(null);
    void storeRef.current?.saveDraft(null);
    kickSyncRef.current();
    return { ok: true, count: entries.length };
  }, [commitDraft, commitOutbox]);

  const enqueueOperation = useCallback(
    (op: SyncOperation, label: OutboxLabel, photoId: string | null = null) => {
      const entry = createOutboxEntry(op, Date.now(), photoId, label);
      commitOutbox([...outboxRef.current, entry]);
      void storeRef.current?.saveOutboxEntry(entry);
      kickSyncRef.current();
    },
    [commitOutbox]
  );

  const retryOutbox = useCallback(
    (id?: string) => {
      const now = Date.now();
      commitOutbox(
        outboxRef.current.map((entry) => {
          if (id ? entry.id !== id : entry.status === 'done' || entry.status === 'sending') return entry;
          if (entry.status === 'done' || entry.status === 'sending') return entry;
          const next: OutboxEntry = { ...entry, status: 'queued', nextAttemptAt: now };
          void storeRef.current?.saveOutboxEntry(next);
          return next;
        })
      );
      setAuth(null);
      kickSyncRef.current();
    },
    [commitOutbox]
  );

  const discardOutboxEntry = useCallback(
    (id: string) => {
      commitOutbox(outboxRef.current.filter((entry) => entry.id !== id));
      void storeRef.current?.deleteOutboxEntry(id);
      void cleanupPhotos();
    },
    [cleanupPhotos, commitOutbox]
  );

  const router = useRouter();
  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('signout');
    } catch {
      // Sin señal no se puede cerrar la sesión en el servidor: mejor avisar que dejar al usuario creyendo que salió.
      toast.error('Necesitas conexión para cerrar sesión.');
      return;
    }
    try {
      if ('caches' in window) await Promise.all((await caches.keys()).filter((key) => key.startsWith('bodega-')).map((key) => caches.delete(key)));
    } catch {
      /* sin caché que limpiar */
    }
    router.push('/bodega/ingresar');
  }, [router]);

  const summary = useMemo(() => summarizeOutbox(outbox), [outbox]);

  const value: BodegaContextValue = {
    boot,
    online,
    persistent,
    auth,
    api,
    draft,
    outbox,
    summary,
    syncing,
    identifying,
    warehouseId,
    setWarehouseId,
    startDraft,
    discardDraft,
    updateDraft,
    addProductLine,
    addCodeLine,
    addPhotoLine,
    setLineQuantity,
    patchDraftLine,
    removeDraftLine,
    confirmDraftLine,
    setLineSource,
    resolveLine,
    retryIdentification,
    submitDraft,
    retryOutbox,
    discardOutboxEntry,
    enqueueOperation,
    getPhotoUrl,
    refreshBootstrap,
    logout,
  };

  return <BodegaContext.Provider value={value}>{children}</BodegaContext.Provider>;
}

/** Un solo aviso por tanda de movimientos enviados (no uno por cada producto). */
function notifyApplied(applied: readonly AppliedOpResult[]): void {
  const fresh = applied.filter((result) => !result.replayed);
  if (fresh.length === 0) return;
  const created = fresh.filter((result) => result.createdProduct).length;
  const merged = fresh.filter((result) => result.mergedIntoExisting).length;
  const parts = [`${fresh.length} ${fresh.length === 1 ? 'movimiento enviado' : 'movimientos enviados'}`];
  if (created > 0) parts.push(`${created} ${created === 1 ? 'producto nuevo' : 'productos nuevos'}`);
  if (merged > 0) parts.push(`${merged} sumado${merged === 1 ? '' : 's'} a un producto que ya existía`);
  toast.success(parts.join(' · '));
}

