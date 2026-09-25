'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BellRing, HandCoins, Mail, PauseCircle, PlayCircle, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { AGING_BUCKETS, AGING_LABELS, describeStage, type AgingBucket } from '@/lib/treasury/collections';
import { cn } from '@/lib/utils';
import {
  addCollectionNoteAction,
  getCustomerCollectionDetailAction,
  setRemindersPausedAction,
  updateCollectionSettingsAction,
} from '@/modules/treasury/actions/collections.actions';
import { sendPaymentReminderAction } from '@/modules/treasury/actions/reminders.actions';
import { COLLECTION_NOTE_KINDS, COLLECTION_NOTE_LABELS } from '@/modules/treasury/schema';
import type { CollectionCustomerRow, CollectionSettings, CollectionsOverview, CustomerCollectionDetail } from '@/modules/treasury/services/collections.service';

const BUCKET_COLOR: Record<AgingBucket, string> = {
  current: 'bg-info',
  d1_30: 'bg-warning/60',
  d31_60: 'bg-warning',
  d61_90: 'bg-danger/70',
  d90_plus: 'bg-danger',
};

const SUGGESTED_STAGES = [-3, 0, 7, 15, 30, 60];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : '—';
}

interface Props {
  overview: CollectionsOverview;
  settings: CollectionSettings;
  canWrite: boolean;
}

export default function CollectionsClient({ overview, settings, canWrite }: Props) {
  const [query, setQuery] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(true);
  const [active, setActive] = useState<CollectionCustomerRow | null>(null);
  const { totals } = overview;

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return overview.customers.filter((row) => {
      if (onlyOverdue && row.aging.overdue <= 0) return false;
      return !term || row.razonSocial.toLowerCase().includes(term) || row.rut.toLowerCase().includes(term);
    });
  }, [overview.customers, query, onlyOverdue]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 shadow-card" aria-label="Antigüedad de la deuda">
        <h2 className="text-sm font-semibold">Antigüedad de la deuda</h2>
        {totals.total > 0 ? (
          <>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {AGING_BUCKETS.map((bucket) => (totals[bucket] > 0 ? <div key={bucket} className={BUCKET_COLOR[bucket]} style={{ width: `${(totals[bucket] / totals.total) * 100}%` }} /> : null))}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {AGING_BUCKETS.map((bucket) => (
                <div key={bucket}>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('size-2 rounded-full', BUCKET_COLOR[bucket])} aria-hidden="true" />
                    {AGING_LABELS[bucket]}
                  </dt>
                  <dd className="font-semibold tabular-nums">{formatCurrency(totals[bucket])}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No hay deuda de clientes pendiente.</p>
        )}
      </section>

      <ReminderSettings settings={settings} canWrite={canWrite} />

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Clientes con deuda">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
            Solo clientes con deuda vencida
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cliente o RUT" aria-label="Buscar cliente" className="h-9 pl-8 sm:w-64" />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<HandCoins className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title={query ? 'Sin resultados' : onlyOverdue ? 'Ningún cliente con deuda vencida' : 'Sin clientes con saldo'}
            description={onlyOverdue && !query ? 'Buen trabajo: la cartera está al día.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Vencido</th>
                  <th className="px-4 py-2.5 font-medium">Antigüedad</th>
                  <th className="px-4 py-2.5 font-medium">Última gestión</th>
                  <th className="px-4 py-2.5 font-medium">Promesa</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.contactId} className="hover:bg-muted/40">
                    <td className="max-w-[260px] px-4 py-2.5">
                      <button type="button" onClick={() => setActive(row)} className="block max-w-full truncate text-left font-medium hover:underline">
                        {row.razonSocial}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {row.rut} · {row.documents} doc.
                        {!row.email && <span className="ml-1 text-warning">· sin correo</span>}
                        {row.remindersPaused && <span className="ml-1">· recordatorios pausados</span>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.aging.total)}</td>
                    <td className={cn('px-4 py-2.5 text-right font-medium tabular-nums', row.aging.overdue > 0 && 'text-danger')}>{formatCurrency(row.aging.overdue)}</td>
                    <td className="px-4 py-2.5">
                      {row.oldestDaysLate > 0 ? (
                        <StatusBadge tone={row.oldestDaysLate > 90 ? 'danger' : row.oldestDaysLate > 30 ? 'warning' : 'info'}>{row.oldestDaysLate} días</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">Al día</StatusBadge>
                      )}
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5 text-xs text-muted-foreground">
                      {row.lastNote ? (
                        <>
                          <span className="font-medium text-foreground">{COLLECTION_NOTE_LABELS[row.lastNote.kind]}</span> · {formatDate(row.lastNote.createdAt)}
                          <p className="truncate">{row.lastNote.note}</p>
                        </>
                      ) : row.lastReminderAt ? (
                        <>Recordatorio automático · {formatDate(row.lastReminderAt)}</>
                      ) : (
                        'Sin gestiones'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {row.nextPromise ? (
                        <>
                          {formatDate(row.nextPromise.date)}
                          {row.nextPromise.amount ? <p className="text-muted-foreground tabular-nums">{formatCurrency(row.nextPromise.amount)}</p> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button type="button" size="sm" variant="outline" onClick={() => setActive(row)}>
                        Gestionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {active && <CustomerCollectionDialog row={active} canWrite={canWrite} onClose={() => setActive(null)} />}
    </div>
  );
}

function ReminderSettings({ settings, canWrite }: { settings: CollectionSettings; canWrite: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [days, setDays] = useState<number[]>(settings.days.length > 0 ? settings.days : [-3, 0, 7, 30]);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = enabled !== settings.enabled || days.join(',') !== settings.days.join(',');

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateCollectionSettingsAction({ enabled, days });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-card" aria-label="Cobranza automática">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <BellRing className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Recordatorios automáticos</h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Cada mañana se envía un correo al cliente con los documentos que llegan a uno de estos momentos. Cada documento recibe cada aviso una sola vez; los clientes pausados o sin correo no reciben nada.
            </p>
          </div>
        </div>
        <Switch label="Activar recordatorios automáticos" checked={enabled} disabled={!canWrite} onCheckedChange={setEnabled} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[...new Set([...SUGGESTED_STAGES, ...days])].sort((a, b) => a - b).map((day) => (
          <button
            key={day}
            type="button"
            disabled={!canWrite}
            aria-pressed={days.includes(day)}
            onClick={() => toggleDay(day)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60',
              days.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {day === 0 ? 'El día que vence' : day < 0 ? `${-day} días antes` : `${day} días después`}
          </button>
        ))}
        {canWrite && (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(custom);
              if (Number.isInteger(value) && value >= -30 && value <= 180 && !days.includes(value)) toggleDay(value);
              setCustom('');
            }}
          >
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="numeric" placeholder="Otro (días)" aria-label="Agregar otro momento en días (negativo = antes)" className="h-7 w-28 text-xs" />
          </form>
        )}
      </div>
      {canWrite && dirty && (
        <div className="mt-4 flex gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEnabled(settings.enabled);
              setDays(settings.days);
            }}
          >
            Descartar
          </Button>
        </div>
      )}
    </section>
  );
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

function CustomerCollectionDialog({ row, canWrite, onClose }: { row: CollectionCustomerRow; canWrite: boolean; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<CustomerCollectionDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [paused, setPaused] = useState(row.remindersPaused);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ kind: 'CALL' as (typeof COLLECTION_NOTE_KINDS)[number], text: '', promiseDate: todayIso(), promiseAmount: 0, salesDocumentId: 'none' });

  useEffect(() => {
    let cancelled = false;
    void getCustomerCollectionDetailAction(row.contactId).then((result) => {
      if (cancelled) return;
      if (result.success) setDetail(result.data);
      else toast.error(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [row.contactId, reload]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await addCollectionNoteAction({
        contactId: row.contactId,
        salesDocumentId: note.salesDocumentId === 'none' ? undefined : note.salesDocumentId,
        kind: note.kind,
        note: note.text,
        promiseDate: note.kind === 'PROMISE' ? note.promiseDate : undefined,
        promiseAmount: note.kind === 'PROMISE' && note.promiseAmount > 0 ? note.promiseAmount : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Gestión registrada');
      setNote((prev) => ({ ...prev, text: '', promiseAmount: 0 }));
      setReload((value) => value + 1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendReminder() {
    setBusy(true);
    try {
      const result = await sendPaymentReminderAction(row.contactId);
      if (!result.success) toast.error(result.error);
      else toast.success(result.message ?? 'Recordatorio enviado');
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    setBusy(true);
    try {
      const result = await setRemindersPausedAction(row.contactId, !paused);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPaused(!paused);
      toast.success(result.message ?? 'Listo');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl" showClose={false}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{row.razonSocial}</DialogTitle>
              <DialogDescription>
                {row.rut} · saldo {formatCurrency(row.aging.total)} · vencido {formatCurrency(row.aging.overdue)}
                {row.phone && <> · {row.phone}</>}
              </DialogDescription>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={onClose}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || !row.email} onClick={sendReminder}>
              <Mail className="size-4" aria-hidden="true" /> Enviar recordatorio ahora
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={togglePause}>
              {paused ? <PlayCircle className="size-4" aria-hidden="true" /> : <PauseCircle className="size-4" aria-hidden="true" />}
              {paused ? 'Reanudar recordatorios automáticos' : 'Pausar recordatorios automáticos'}
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 font-medium">Avisos enviados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!detail && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td>
                  </tr>
                )}
                {detail?.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-3 py-2">{doc.label}</td>
                    <td className={cn('px-3 py-2 tabular-nums', doc.daysLate > 0 && 'text-danger')}>
                      {formatDate(doc.dueDate)}
                      {doc.daysLate > 0 && <span className="ml-1 text-xs">({doc.daysLate} d)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(doc.balance)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{doc.remindersSent.length > 0 ? doc.remindersSent.map(describeStage).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canWrite && (
            <form onSubmit={addNote} className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Registrar gestión</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="note-kind">Tipo</Label>
                  <select id="note-kind" className={nativeSelectClass} value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as typeof note.kind })}>
                    {COLLECTION_NOTE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{COLLECTION_NOTE_LABELS[kind]}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="note-doc">Documento (opcional)</Label>
                  <select id="note-doc" className={nativeSelectClass} value={note.salesDocumentId} onChange={(e) => setNote({ ...note, salesDocumentId: e.target.value })}>
                    <option value="none">Toda la deuda del cliente</option>
                    {detail?.documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>{doc.label}</option>
                    ))}
                  </select>
                </div>
                {note.kind === 'PROMISE' && (
                  <>
                    <div>
                      <Label htmlFor="note-promise-date">Pagará el</Label>
                      <Input id="note-promise-date" type="date" value={note.promiseDate} onChange={(e) => setNote({ ...note, promiseDate: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="note-promise-amount">Monto comprometido</Label>
                      <CurrencyInput id="note-promise-amount" value={note.promiseAmount} onChange={(value) => setNote({ ...note, promiseAmount: value })} />
                    </div>
                  </>
                )}
              </div>
              <div>
                <Label htmlFor="note-text">Detalle</Label>
                <textarea id="note-text" className={textareaClass} value={note.text} maxLength={1000} placeholder="Ej. Habló con finanzas, pagará el viernes por transferencia" onChange={(e) => setNote({ ...note, text: e.target.value })} />
              </div>
              <Button type="submit" size="sm" disabled={busy || note.text.trim().length < 3}>
                Guardar gestión
              </Button>
            </form>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Historial</p>
            {detail && detail.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay gestiones registradas.</p>
            ) : (
              <ol className="space-y-2">
                {detail?.notes.map((item) => (
                  <li key={item.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{COLLECTION_NOTE_LABELS[item.kind]}</span> · {formatDate(item.createdAt)}
                      {item.createdByName && <> · {item.createdByName}</>}
                      {item.promiseDate && (
                        <>
                          {' '}
                          · promete {item.promiseAmount ? formatCurrency(item.promiseAmount) : 'pagar'} el {formatDate(item.promiseDate)}
                        </>
                      )}
                    </p>
                    <p className="whitespace-pre-line">{item.note}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
