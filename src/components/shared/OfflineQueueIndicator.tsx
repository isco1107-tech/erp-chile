'use client';

import { useCallback, useEffect, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-provider';
import { markForRetry, summarize, type QueuedOperation } from '@/lib/offline/queue-rules';
import { deleteOperation, listOperations, onQueueChange, saveOperation } from '@/lib/offline/queue-store';
import { syncQueue } from '@/lib/offline/sync';

const AUTO_SYNC_MS = 30_000;

const STATUS_TEXT: Record<QueuedOperation['status'], string> = {
  PENDING: 'Por sincronizar',
  FAILED: 'Rechazada',
  REVIEW: 'Revisar',
  DONE: 'Sincronizada',
};

const timeFormat = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

/**
 * Estado del modo contingencia en la barra superior: sin conexión, lo que
 * falta enviar y lo que el servidor rechazó. Sincroniza solo al volver la red
 * y cada 30 s mientras haya pendientes. No se muestra si todo está al día.
 */
export function OfflineQueueIndicator({ companyId, userId }: { companyId: string; userId: string }) {
  const confirm = useConfirm();
  const [online, setOnline] = useState(true);
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setOperations(await listOperations());
    } catch {
      setOperations([]);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncQueue(companyId, userId);
      if (result && result.sent > 0) toast.success(`${result.sent} operación(es) hechas sin conexión quedaron registradas`);
      if (result && result.failed > 0) toast.error(`${result.failed} operación(es) sin conexión fueron rechazadas: revísalas`);
    } finally {
      setSyncing(false);
      await reload();
    }
  }, [companyId, userId, reload]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void reload().then(() => sync());
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribe = onQueueChange(() => void reload());
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
    };
  }, [reload, sync]);

  const summary = summarize(operations, companyId, userId);

  useEffect(() => {
    if (!online || summary.pending === 0) return;
    const timer = setInterval(() => void sync(), AUTO_SYNC_MS);
    return () => clearInterval(timer);
  }, [online, summary.pending, sync]);

  const mine = operations
    .filter((op) => op.companyId === companyId && op.userId === userId && op.status !== 'DONE')
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const problems = summary.failed + summary.review;

  if (online && mine.length === 0 && summary.foreign === 0) return null;

  async function retry(op: QueuedOperation) {
    await saveOperation(markForRetry(op));
    await sync();
  }

  async function discard(op: QueuedOperation) {
    const ok = await confirm({
      title: `¿Descartar "${op.label}"?`,
      description:
        op.status === 'REVIEW'
          ? 'Quedó a medias en el servidor. Descártala solo si ya revisaste en el sistema si se aplicó o no.'
          : 'El servidor la rechazó y no quedó registrada. Si la descartas, no se va a registrar.',
      confirmLabel: 'Descartar',
      destructive: true,
    });
    if (ok) await deleteOperation(op.idempotencyKey);
  }

  const label = !online
    ? mine.length > 0
      ? `Sin conexión · ${mine.length}`
      : 'Sin conexión'
    : problems > 0
      ? `${problems} por revisar`
      : syncing
        ? 'Sincronizando…'
        : `${summary.pending} por sincronizar`;

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium',
          !online || problems > 0 ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground'
        )}
        aria-label={`Modo sin conexión: ${label}`}
      >
        {!online ? <CloudOff className="size-3.5" aria-hidden="true" /> : problems > 0 ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} aria-hidden="true" />}
        <span className="hidden sm:inline">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg outline-none">
            <p className="text-sm font-medium text-foreground">{online ? 'Operaciones hechas sin conexión' : 'Estás sin conexión'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {online
                ? 'Se envían solas, en el orden en que se hicieron.'
                : 'Puedes seguir vendiendo y registrando hasta 2 horas. Todo se envía solo al volver la conexión.'}
            </p>
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {mine.map((op) => (
                <li key={op.idempotencyKey} className="rounded-lg border border-border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{op.label}</span>
                    <span className={cn('shrink-0', op.status === 'PENDING' ? 'text-muted-foreground' : 'text-warning')}>
                      {STATUS_TEXT[op.status]} · {timeFormat.format(new Date(op.capturedAt))}
                    </span>
                  </div>
                  {op.error && op.status !== 'PENDING' && <p className="mt-1 text-destructive">{op.error}</p>}
                  {(op.status === 'FAILED' || op.status === 'REVIEW') && (
                    <div className="mt-2 flex gap-2">
                      {op.status === 'FAILED' && (
                        <button type="button" onClick={() => retry(op)} disabled={!online || syncing} className="rounded-md bg-muted px-2 py-1 font-medium text-foreground disabled:opacity-50">
                          Reintentar
                        </button>
                      )}
                      <button type="button" onClick={() => discard(op)} className="rounded-md px-2 py-1 font-medium text-destructive hover:bg-destructive/10">
                        Descartar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {summary.foreign > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Hay {summary.foreign} operación(es) de otra empresa o de otra persona en este equipo: se envían cuando esa persona entre a esa empresa.
              </p>
            )}
            {online && summary.pending > 0 && (
              <button type="button" onClick={() => void sync()} disabled={syncing} className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">
                {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
