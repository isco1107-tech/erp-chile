'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, CloudUpload, RefreshCw } from 'lucide-react';
import { newId } from '@/lib/warehouse-mobile/client/ids';
import { MODE_DEFINITIONS } from '@/lib/warehouse-mobile/modes';
import type { OutboxEntry } from '@/lib/warehouse-mobile/outbox';
import type { SyncOperation } from '@/modules/warehouse-mobile/schema';
import type { RecentOp } from '@/modules/warehouse-mobile/types';
import { useConfirm } from '@/components/ui/confirm-provider';
import { useBodega } from './BodegaProvider';
import { BigButton, Pill, Spinner, formatQty } from './ui';
import { santiagoClockLabel, santiagoDateTimeLabel } from '@/lib/chile/timezone';

/**
 * Lo que se mandó (o está por mandarse) desde este teléfono. Es la respuesta a
 * "¿ya lo subí?": cada movimiento muestra si está en cola, enviándose, enviado o
 * si el servidor lo rechazó y por qué.
 */

function clock(timestamp: number): string {
  return santiagoClockLabel(new Date(timestamp));
}

function describe(entry: OutboxEntry): string {
  const { op } = entry;
  return `${MODE_DEFINITIONS[op.mode].label} · ${formatQty(op.quantity)} ${entry.label.unit}`;
}

function StatusPill({ entry, now }: { entry: OutboxEntry; now: number }) {
  if (entry.status === 'done') return <Pill tone="success">Enviado {clock(entry.createdAt)}</Pill>;
  if (entry.status === 'rejected') return <Pill tone="danger">No se aplicó</Pill>;
  if (entry.status === 'sending') return <Pill tone="info"><Spinner className="size-3.5" /> Enviando…</Pill>;
  if (entry.attempts > 0) {
    const seconds = Math.max(0, Math.ceil((entry.nextAttemptAt - now) / 1000));
    return <Pill tone="warning">Sin conexión · reintenta {seconds > 0 ? `en ${seconds} s` : 'ahora'}</Pill>;
  }
  return <Pill tone="neutral">En cola</Pill>;
}

export default function OutboxScreen({ onBack }: { onBack: () => void }) {
  const { outbox, summary, retryOutbox, discardOutboxEntry, enqueueOperation, api, online, syncing, auth } = useBodega();
  const confirm = useConfirm();
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<RecentOp[] | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!online) return;
    void api.recent().then((response) => {
      if (!cancelled && response.ok) setHistory(response.data);
    });
    return () => {
      cancelled = true;
    };
  }, [api, online, summary.done]);

  const sorted = [...outbox].sort((a, b) => b.createdAt - a.createdAt);
  const pending = sorted.filter((entry) => entry.status === 'queued' || entry.status === 'sending');
  const rejected = sorted.filter((entry) => entry.status === 'rejected');
  const done = sorted.filter((entry) => entry.status === 'done');
  const localIds = new Set(outbox.map((entry) => entry.id));

  /** Suma a un producto que ya existía lo que se intentó crear como nuevo. */
  const addToExisting = (entry: OutboxEntry) => {
    const { op, result } = entry;
    if (op.kind !== 'CREATE_PRODUCT' || result?.status !== 'REJECTED' || !result.existing) return;
    const move: SyncOperation = {
      kind: 'MOVE',
      clientOpId: newId(),
      mode: op.mode,
      productId: result.existing.id,
      warehouseId: op.warehouseId,
      quantity: op.quantity,
      ...(op.reference ? { reference: op.reference } : {}),
      ...(op.unitCost !== undefined ? { unitCost: op.unitCost } : {}),
      ...(op.note ? { note: op.note } : {}),
      ...(op.capturedAt ? { capturedAt: op.capturedAt } : {}),
    };
    enqueueOperation(move, { name: result.existing.name, sku: result.existing.sku, unit: result.existing.unit });
    discardOutboxEntry(entry.id);
  };

  /** El bodeguero revisó y es OTRO producto: se vuelve a enviar confirmando que no es duplicado. */
  const createAnyway = (entry: OutboxEntry) => {
    const { op } = entry;
    if (op.kind !== 'CREATE_PRODUCT') return;
    enqueueOperation({ ...op, clientOpId: newId(), confirmDistinct: true }, entry.label, entry.photoId);
    // La foto pasa a la operación nueva: se descarta solo la entrada, sin borrar el archivo.
    discardOutboxEntry(entry.id);
  };

  /** Un toque en falso no debe borrar un movimiento (con su foto) que todavía no quedó en el sistema. */
  const discard = async (entry: OutboxEntry) => {
    const ok = await confirm({
      title: '¿Descartar este movimiento?',
      description: `«${entry.label.name}» (${describe(entry)}) NO quedó registrado en el sistema. Si lo descartas, se borra de este teléfono y habrá que hacerlo de nuevo.`,
      confirmLabel: 'Descartar',
      destructive: true,
    });
    if (ok) discardOutboxEntry(entry.id);
  };

  const entryCard = (entry: OutboxEntry) => {
    const result = entry.result?.status === 'REJECTED' ? entry.result : null;
    return (
      <li key={entry.id} className={`rounded-2xl border bg-card p-3 shadow-card ${entry.status === 'rejected' ? 'border-danger' : 'border-border'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-medium break-words">{entry.label.name}</p>
            <p className="text-sm text-muted-foreground">{describe(entry)}</p>
          </div>
          <StatusPill entry={entry} now={now} />
        </div>
        {entry.status === 'rejected' ? (
          <>
            <p role="alert" className="mt-2 text-sm text-danger">
              {entry.lastError}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result?.existing && entry.op.kind === 'CREATE_PRODUCT' ? (
                <BigButton onClick={() => addToExisting(entry)}>Sumar a «{result.existing.name}»</BigButton>
              ) : null}
              {result?.code === 'DUPLICATE_PRODUCT' && entry.op.kind === 'CREATE_PRODUCT' && !result.existing?.barcode ? (
                <BigButton variant="secondary" onClick={() => createAnyway(entry)}>
                  Es otro producto: crearlo
                </BigButton>
              ) : null}
              {result?.code === 'INSUFFICIENT_STOCK' || result?.code === 'OTHER' ? (
                <BigButton variant="secondary" onClick={() => retryOutbox(entry.id)}>
                  Reintentar
                </BigButton>
              ) : null}
              <BigButton variant="danger" onClick={() => void discard(entry)}>
                Descartar
              </BigButton>
            </div>
          </>
        ) : null}
        {entry.status === 'queued' && entry.lastError ? <p className="mt-2 text-xs text-muted-foreground">{entry.lastError}</p> : null}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="Volver al inicio" className="flex size-12 items-center justify-center rounded-xl active:bg-muted">
          <ArrowLeft className="size-6" />
        </button>
        <h1 className="flex-1 text-lg font-semibold">Pendientes y enviados</h1>
        {summary.pending + summary.rejected > 0 ? (
          <button type="button" onClick={() => retryOutbox()} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:opacity-85">
            <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} /> Reintentar
          </button>
        ) : null}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {auth ? (
          <p role="alert" className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">
            {auth.message}
          </p>
        ) : null}

        {outbox.length === 0 && !history?.length ? (
          <div className="mt-10 text-center">
            <CloudUpload className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-base font-medium">No hay nada pendiente</p>
            <p className="mt-1 text-sm text-muted-foreground">Lo que envíes aparecerá aquí hasta que el sistema lo confirme.</p>
          </div>
        ) : null}

        {rejected.length > 0 ? (
          <section aria-label="Con problemas">
            <h2 className="mb-2 text-sm font-semibold text-danger">Con problemas ({rejected.length})</h2>
            <ul className="space-y-3">{rejected.map(entryCard)}</ul>
          </section>
        ) : null}

        {pending.length > 0 ? (
          <section aria-label="Por enviar">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Por enviar ({pending.length})</h2>
            <ul className="space-y-3">{pending.map(entryCard)}</ul>
          </section>
        ) : null}

        {done.length > 0 ? (
          <section aria-label="Enviados">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Enviados hoy ({done.length})</h2>
            <ul className="space-y-3">{done.map(entryCard)}</ul>
          </section>
        ) : null}

        {history && history.filter((item) => !localIds.has(item.clientOpId)).length > 0 ? (
          <section aria-label="Historial">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Historial reciente</h2>
            <ul className="space-y-2">
              {history
                .filter((item) => !localIds.has(item.clientOpId))
                .map((item) => (
                  <li key={item.clientOpId} className="rounded-2xl border border-border bg-card p-3">
                    <p className="text-base font-medium break-words">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {MODE_DEFINITIONS[item.mode].label} · {formatQty(item.quantity)} {item.unit} ·{' '}
                      {santiagoDateTimeLabel(new Date(item.createdAt))}
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
