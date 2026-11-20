'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
  PAGEANT_DRAFT_LABELS, makePageantDraft, pageantDraftBase, pageantDraftFields, pageantDraftSaved, pageantDraftScope,
  readPageantDraft, type PageantDraftRecord, type PageantDraftValues,
} from '@/lib/events/pageant-draft';

interface Copy {
  key: string;
  record: PageantDraftRecord;
}
type Options = { project: Project; userId: string; canWrite: boolean; values: PageantDraftValues };

export function usePageantDraft({ project, userId, canWrite, values }: Options) {
  const scope = pageantDraftScope(project.companyId, userId, project.id);
  const server = useMemo(() => pageantDraftBase(project), [project]);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [storageError, setStorageError] = useState(false);
  const ownKey = useRef('');
  const working = useRef(values);
  const base = useRef(server);
  const latestServer = useRef(server);
  const lastWritten = useRef<PageantDraftValues | null>(null);
  useLayoutEffect(() => { working.current = values; }, [values]);
  useLayoutEffect(() => { latestServer.current = server; }, [server]);

  function writeWorkingCopy() {
    if (!ownKey.current || working.current === lastWritten.current) return;
    try {
      const record = makePageantDraft(base.current, working.current, Date.now());
      if (record) window.localStorage.setItem(ownKey.current, JSON.stringify(record));
      else window.localStorage.removeItem(ownKey.current);
      lastWritten.current = working.current;
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  useEffect(() => {
    if (!canWrite) return;
    base.current = latestServer.current;
    lastWritten.current = null;
    ownKey.current = scope + crypto.randomUUID();
    function listCopies() {
      try {
        const storage = window.localStorage;
        const available: Copy[] = [];
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (!key?.startsWith(scope) || key === ownKey.current) continue;
          const record = readPageantDraft(storage.getItem(key));
          if (record && !pageantDraftSaved(record, latestServer.current)) available.push({ key, record });
          else storage.removeItem(key);
        }
        setCopies(available.sort((a, b) => b.record.time - a.record.time));
      } catch {
        setStorageError(true);
      }
    }
    listCopies();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith(scope)) listCopies();
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') writeWorkingCopy(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', writeWorkingCopy);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', writeWorkingCopy);
      document.removeEventListener('visibilitychange', onVisibility);
      writeWorkingCopy();
      ownKey.current = '';
    };
  }, [scope, canWrite]);

  useEffect(() => {
    if (!canWrite) return;
    const timer = window.setTimeout(writeWorkingCopy, 350);
    return () => window.clearTimeout(timer);
  }, [values, canWrite]);

  function markSaved(submitted: PageantDraftValues) {
    base.current = submitted;
    latestServer.current = submitted;
    lastWritten.current = null;
    writeWorkingCopy();
    setCopies((previous) => previous.filter(({ record }) => !pageantDraftSaved(record, submitted)));
  }

  const copy = copies[0];
  const conflicts = copy ? [...new Set([
    ...pageantDraftFields(copy.record, server).conflicts,
    ...pageantDraftFields(copy.record, values).conflicts,
  ])] : [];
  function dismiss(key: string) {
    window.localStorage.removeItem(key);
    setCopies((previous) => previous.filter((item) => item.key !== key));
  }

  function resolve(restore?: (changes: Partial<PageantDraftValues>) => void, acceptConflicts = false) {
    if (!canWrite || !copy || !ownKey.current) return;
    try {
      const current = readPageantDraft(window.localStorage.getItem(copy.key));
      if (!current) {
        dismiss(copy.key);
        return;
      }
      if (current.time !== copy.record.time) {
        // Otra pestaña acaba de editar esta copia. Mostrarla antes de permitir la acción.
        setCopies((previous) => previous.map((item) => item.key === copy.key ? { ...item, record: current } : item));
        return;
      }
      if (restore) {
        const nowConflicting = [...pageantDraftFields(current, latestServer.current).conflicts, ...pageantDraftFields(current, working.current).conflicts];
        if (nowConflicting.some((key) => !acceptConflicts || !conflicts.includes(key))) return;
        const next = { ...working.current, ...current.after };
        restore(current.after);
        working.current = next;
        // La copia de origen solo se elimina después de asegurar la recuperación en esta pestaña.
        writeWorkingCopy();
        if (lastWritten.current !== next) return;
      }
      dismiss(copy.key);
    } catch {
      setStorageError(true);
    }
  }
  return { copy: canWrite ? copy : undefined, conflicts, storageError: canWrite && storageError, markSaved, resolve };
}

export function PageantDraftNotice({ draft, onRestore }: {
  draft: ReturnType<typeof usePageantDraft>;
  onRestore: (changes: Partial<PageantDraftValues>) => void;
}) {
  if (!draft.copy && !draft.storageError) return null;
  return (
    <div className="mb-3 space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
      {draft.copy && <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Borrador local del {new Date(draft.copy.record.time).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</p>
          <p className="text-muted-foreground">{draft.conflicts.length
            ? 'El sitio tiene cambios que entran en conflicto con esta copia.'
            : 'Puedes recuperar el diseño y los textos pendientes en este navegador.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.conflicts.length === 0 && <Button type="button" size="sm" variant="outline" onClick={() => draft.resolve(onRestore)}>Recuperar borrador</Button>}
          <Button type="button" size="sm" variant="ghost" onClick={() => draft.resolve()}>Descartar copia</Button>
        </div>
      </div>}
      {draft.copy && draft.conflicts.length > 0 && <details key={draft.copy.key + draft.copy.record.time}>
        <summary className="cursor-pointer font-medium">Revisar diferencias</summary>
        <p className="my-2 text-sm">Si recuperas la copia, se reemplazarán estos campos en el editor. Podrás revisarlos antes de guardar.</p>
        <ul className="mb-3 list-inside list-disc">
          {draft.conflicts.map((field) => <li key={field}>{PAGEANT_DRAFT_LABELS[field]}</li>)}
        </ul>
        <Button type="button" size="sm" variant="outline" onClick={() => draft.resolve(onRestore, true)}>Recuperar mi versión</Button>
      </details>}
      {draft.storageError && <p role="status" className="text-muted-foreground">No se pudo acceder a la copia local. Guarda los cambios antes de cerrar.</p>}
    </div>
  );
}
