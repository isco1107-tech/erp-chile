'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlarmClock, FileUp, Inbox, Search, ShieldAlert, TimerOff } from 'lucide-react';
import type { ReceivedDteStatus } from '@prisma/client';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { CLAIM_WINDOW_DAYS } from '@/lib/chile/dte/received-meta';
import { cn } from '@/lib/utils';
import { listReceivedDtesAction } from '@/modules/dte/actions/received.actions';
import { RECEIVED_STATUS_LABELS, TED_STATUS_LABELS } from '@/modules/dte/schema';
import type { ReceivedDteRow, ReceivedDteSummary } from '@/modules/dte/services/received.service';

type Filter = 'ATTENTION' | 'ALL' | ReceivedDteStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'ATTENTION', label: 'Requieren atención' },
  { value: 'PENDING', label: 'Por revisar' },
  { value: 'ACCEPTED', label: 'Aceptados' },
  { value: 'REGISTERED', label: 'En Compras' },
  { value: 'CLAIMED', label: 'Reclamados' },
  { value: 'ALL', label: 'Todos' },
];

export const RECEIVED_STATUS_TONE: Record<ReceivedDteStatus, Tone> = { PENDING: 'warning', ACCEPTED: 'info', CLAIMED: 'danger', REGISTERED: 'success' };
export const TED_TONE: Record<string, Tone> = { VALID: 'success', INVALID: 'danger', MISSING: 'warning' };

const EMPTY_SUMMARY: ReceivedDteSummary = { pending: 0, expiring: 0, overdue: 0, invalidTed: 0, pendingAmount: 0, total: 0 };

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

function formatIssueDate(value: Date | string): string {
  // La fecha de emisión es un día calendario (guardado a mediodía UTC).
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function deadlineText(days: number): { text: string; tone: string } {
  if (days < 0) return { text: 'Plazo vencido: se entiende aceptado', tone: 'text-muted-foreground' };
  if (days <= 1) return { text: 'Último día para reclamar', tone: 'text-danger font-medium' };
  if (days <= 2) return { text: `${days} días para reclamar`, tone: 'text-warning font-medium' };
  return { text: `${days} días para reclamar`, tone: 'text-muted-foreground' };
}

interface UploadResponse {
  success: boolean;
  error?: string;
  data?: { imported: number; duplicates: number; foreign: number; invalidTed: number; linked: number; errors: string[] };
}

export default function ReceivedDteInboxClient({ canWrite }: { canWrite: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>('ATTENTION');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ReceivedDteRow[]>([]);
  const [summary, setSummary] = useState<ReceivedDteSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await listReceivedDtesAction(filter, query.trim() || undefined);
      if (cancelled) return;
      if (result.success) {
        setRows(result.data.rows);
        setSummary(result.data.summary);
      } else toast.error(result.error);
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filter, query, reload]);

  async function upload(files: File[]) {
    const xmlFiles = files.filter((file) => /\.xml$/i.test(file.name) || file.type.includes('xml'));
    if (xmlFiles.length === 0) {
      toast.error('Sube archivos .xml (el DTE que te envió el proveedor)');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of xmlFiles) form.append('file', file);
      const response = await fetch('/api/purchases/received-dtes', { method: 'POST', body: form });
      const result = (await response.json()) as UploadResponse;
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'No se pudieron cargar los documentos');
        return;
      }
      const { imported, duplicates, foreign, invalidTed, linked, errors } = result.data;
      const parts = [`${imported} documento${imported === 1 ? '' : 's'} nuevo${imported === 1 ? '' : 's'}`];
      if (duplicates > 0) parts.push(`${duplicates} ya estaba${duplicates === 1 ? '' : 'n'}`);
      if (linked > 0) parts.push(`${linked} ya registrado${linked === 1 ? '' : 's'} en Compras`);
      if (foreign > 0) parts.push(`${foreign} emitido${foreign === 1 ? '' : 's'} a otro RUT (omitido${foreign === 1 ? '' : 's'})`);
      toast.success(parts.join(' · '));
      if (invalidTed > 0) toast.warning(`${invalidTed} documento${invalidTed === 1 ? '' : 's'} con el timbre en problemas: revísalo${invalidTed === 1 ? '' : 's'} antes de aceptar`);
      for (const error of errors) toast.error(error);
      setFilter('ATTENTION');
      setReload((value) => value + 1);
    } catch {
      toast.error('No se pudieron subir los archivos. Revisa tu conexión');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Por revisar" value={String(summary.pending)} icon={Inbox} tone={summary.pending > 0 ? 'info' : 'neutral'} hint={summary.pending > 0 ? `${formatCurrency(summary.pendingAmount)} en documentos` : 'Todo revisado'} />
        <KpiCard label="Plazo por vencer" value={String(summary.expiring)} icon={AlarmClock} tone={summary.expiring > 0 ? 'warning' : 'neutral'} hint="2 días o menos para reclamar" />
        <KpiCard label="Plazo vencido" value={String(summary.overdue)} icon={TimerOff} tone={summary.overdue > 0 ? 'danger' : 'neutral'} hint={`Pasados ${CLAIM_WINDOW_DAYS} días se entienden aceptados`} />
        <KpiCard label="Timbre en problemas" value={String(summary.invalidTed)} icon={ShieldAlert} tone={summary.invalidTed > 0 ? 'danger' : 'success'} hint={summary.invalidTed > 0 ? 'No pagar sin verificar' : 'Todos los timbres cuadran'} />
      </div>

      {canWrite && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Cargar XML de documentos recibidos"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void upload(Array.from(event.dataTransfer.files));
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors',
            dragging ? 'border-primary bg-accent' : 'border-border bg-card hover:border-primary/60 hover:bg-muted/40',
            uploading && 'pointer-events-none opacity-60'
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void upload(files);
            }}
          />
          <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">{uploading ? 'Leyendo documentos…' : 'Arrastra aquí los XML de tus proveedores o haz clic para elegirlos'}</p>
          <p className="max-w-xl text-xs text-muted-foreground">
            Acepta el EnvioDTE que llega al correo de intercambio (uno o varios a la vez). Se verifica el timbre de cada documento y, si ya estaba registrado en Compras, se vincula solo.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Documentos recibidos">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Estado" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', filter === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Proveedor, RUT o folio" aria-label="Buscar documento recibido" className="h-9 pl-8 sm:w-64" />
          </div>
        </div>

        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title={query ? 'Sin resultados' : summary.total === 0 ? 'Aún no hay documentos recibidos' : 'Nada en esta vista'}
            description={
              query
                ? 'Prueba con otro proveedor, RUT o folio.'
                : summary.total === 0
                  ? 'Sube el XML de las facturas de tus proveedores: revisas, aceptas o reclamas dentro del plazo y las pasas a Compras sin tipear.'
                  : 'Cambia de pestaña para ver el resto de los documentos.'
            }
            actionLabel={canWrite && summary.total === 0 ? 'Cargar XML' : undefined}
            onAction={canWrite && summary.total === 0 ? () => fileRef.current?.click() : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Documento</th>
                  <th className="px-4 py-2.5 font-medium">Proveedor</th>
                  <th className="px-4 py-2.5 font-medium">Emisión</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Timbre</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                  </tr>
                )}
                {rows.map((row) => {
                  const deadline = row.claimDaysLeft !== null ? deadlineText(row.claimDaysLeft) : null;
                  return (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/purchases/inbox/${row.id}`} className="font-medium hover:underline">
                          {row.label}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">N° {row.folio}</p>
                      </td>
                      <td className="max-w-[260px] px-4 py-2.5">
                        <p className="truncate font-medium">{row.issuerName}</p>
                        <p className="text-xs text-muted-foreground">{row.issuerRut}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                        {formatIssueDate(row.issueDate)}
                        <p className="text-xs">recibido {formatDate(row.receivedAt)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={TED_TONE[row.tedStatus] ?? 'neutral'}>{TED_STATUS_LABELS[row.tedStatus] ?? row.tedStatus}</StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={RECEIVED_STATUS_TONE[row.status]}>{RECEIVED_STATUS_LABELS[row.status]}</StatusBadge>
                        {deadline && <p className={cn('mt-0.5 text-xs', deadline.tone)}>{deadline.text}</p>}
                        {row.status === 'REGISTERED' && !row.purchaseDocumentId && <p className="mt-0.5 text-xs text-warning">La compra fue eliminada</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/dashboard/purchases/inbox/${row.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                          {row.status === 'PENDING' ? 'Revisar' : 'Ver'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
