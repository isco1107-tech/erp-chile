'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSearch, FileUp, Info, Scale } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { receivedDteLabel } from '@/lib/chile/dte/received-meta';
import { cn } from '@/lib/utils';
import { createDraftFromRcvAction, getRcvViewAction } from '@/modules/dte/actions/rcv.actions';
import type { RcvView } from '@/modules/dte/services/rcv.service';

type Kind = 'PURCHASES' | 'SALES';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const FIELD_LABELS = { totalAmount: 'total', netAmount: 'neto', exemptAmount: 'exento', ivaAmount: 'IVA' } as const;

function signed(value: number): string {
  return value < 0 ? `−${formatCurrency(Math.abs(value))}` : formatCurrency(value);
}

function day(value: string | null): string {
  if (!value) return '—';
  const [year, month, date] = value.split('-');
  return `${date}/${month}/${year}`;
}

interface Props {
  initialYear: number;
  initialMonth: number;
  canCreatePurchases: boolean;
}

export default function RcvClient({ initialYear, initialMonth, canCreatePurchases }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('PURCHASES');
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [view, setView] = useState<RcvView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const result = await getRcvViewAction({ kind, year, month });
      if (cancelled) return;
      if (result.success) setView(result.data);
      else toast.error(result.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, year, month, reload]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('kind', kind);
      form.set('year', String(year));
      form.set('month', String(month));
      form.set('file', file);
      const response = await fetch('/api/reports/rcv', { method: 'POST', body: form });
      const result = (await response.json()) as { success: boolean; error?: string; data?: { rowCount: number; replaced: boolean } };
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'No se pudo importar el RCV');
        return;
      }
      toast.success(`${result.data.rowCount} documentos del SII ${result.data.replaced ? 'reemplazaron la carga anterior' : 'importados'}`);
      setReload((value) => value + 1);
    } catch {
      toast.error('No se pudo subir el archivo. Revisa tu conexión');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function createDraft(key: string) {
    setBusy(true);
    try {
      const result = await createDraftFromRcvAction({ year, month, key });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Borrador creado');
      router.push(`/dashboard/purchases/${result.data.purchaseDocumentId}`);
    } finally {
      setBusy(false);
    }
  }

  const years = Array.from({ length: 6 }, (_, index) => initialYear - index);
  const reconciliation = view?.reconciliation ?? null;
  const pendingIssues = reconciliation ? reconciliation.onlyInSii.length + reconciliation.differences.length + reconciliation.onlyInErp.length : 0;
  const ivaGap = reconciliation ? reconciliation.totals.sii.ivaAmount - reconciliation.totals.erp.ivaAmount : 0;
  const documentHref = (id: string) => (kind === 'PURCHASES' ? `/dashboard/purchases/${id}` : `/dashboard/sales/${id}`);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card lg:flex-row lg:items-center lg:justify-between" aria-label="Período">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Registro" className="inline-flex rounded-md bg-muted p-0.5">
            {(['PURCHASES', 'SALES'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => setKind(value)}
                className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', kind === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {value === 'PURCHASES' ? 'Compras' : 'Ventas'}
              </button>
            ))}
          </div>
          <select aria-label="Mes" className={cn(nativeSelectClass, 'h-8 w-36')} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
          <select aria-label="Año" className={cn(nativeSelectClass, 'h-8 w-24')} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view?.imported && (
            <span className="text-xs text-muted-foreground">
              {view.imported.fileName} · {view.imported.rowCount} documentos
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" aria-hidden="true" /> {busy ? 'Procesando…' : view?.imported ? 'Reemplazar archivo' : 'Importar RCV del SII'}
          </Button>
        </div>
      </section>

      {loading && !view ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : !view?.imported || !reconciliation ? (
        <section className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            icon={<FileSearch className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title={`Importa el RCV de ${kind === 'PURCHASES' ? 'compras' : 'ventas'} de ${MONTHS[month - 1].toLowerCase()} ${year}`}
            description={`En sii.cl → Servicios online → Factura electrónica → Registro de Compras y Ventas, elige el período, entra a ${kind === 'PURCHASES' ? 'Compras' : 'Ventas'} y usa "Descargar detalles". Sube ese CSV aquí: el ERP tiene ${view?.erpCount ?? 0} documento${view?.erpCount === 1 ? '' : 's'} para cruzar en este mes.`}
            actionLabel="Importar RCV del SII"
            onAction={() => fileRef.current?.click()}
          />
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Cuadratura"
              value={pendingIssues === 0 ? 'Cuadra' : `${pendingIssues} diferencia${pendingIssues === 1 ? '' : 's'}`}
              icon={pendingIssues === 0 ? CheckCircle2 : AlertTriangle}
              tone={pendingIssues === 0 ? 'success' : 'warning'}
              hint={`${reconciliation.matched.length} documento${reconciliation.matched.length === 1 ? '' : 's'} coinciden`}
            />
            <KpiCard label={`IVA según SII`} value={signed(reconciliation.totals.sii.ivaAmount)} icon={Scale} tone="info" hint={`${reconciliation.totals.sii.count} documentos en el RCV`} />
            <KpiCard label="IVA según ERP" value={signed(reconciliation.totals.erp.ivaAmount)} icon={Scale} tone="accent" hint={`${reconciliation.totals.erp.count} documentos del mes`} />
            <KpiCard
              label={kind === 'PURCHASES' ? 'Crédito fiscal por registrar' : 'Débito por revisar'}
              value={signed(ivaGap)}
              icon={AlertTriangle}
              tone={ivaGap === 0 ? 'success' : 'danger'}
              hint={ivaGap === 0 ? 'El IVA del mes coincide' : ivaGap > 0 ? 'El SII tiene más IVA que el ERP' : 'El ERP tiene más IVA que el SII'}
            />
          </div>

          {view.notComparable > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-xs text-info">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {kind === 'SALES'
                ? `${view.notComparable} boleta${view.notComparable === 1 ? '' : 's'} del mes no se cruzan por folio: el SII las informa agregadas en el resumen del RCV.`
                : `${view.notComparable} documento${view.notComparable === 1 ? '' : 's'} de compra (boletas, guías u otros) no forman parte del RCV y no se cruzan.`}
            </p>
          )}

          <Section
            title="Están en el SII y no en el ERP"
            description={kind === 'PURCHASES' ? 'Facturas que tus proveedores emitieron y no registraste: es crédito fiscal que se pierde.' : 'Documentos que el SII recibió y no aparecen como emitidos en el ERP este mes.'}
            count={reconciliation.onlyInSii.length}
          >
            {reconciliation.onlyInSii.map((entry) => (
              <Row key={entry.key} entry={entry} amountTone="danger">
                {entry.elsewhere ? (
                  <Link href={documentHref(entry.elsewhere.documentId)} className={cn('text-xs hover:underline', entry.elsewhere.draft ? 'font-medium text-warning' : 'text-muted-foreground')}>
                    {entry.elsewhere.draft ? 'En borrador: emítelo →' : `Registrado con fecha ${day(entry.elsewhere.date)} →`}
                  </Link>
                ) : entry.inboxId ? (
                  <Link href={`/dashboard/purchases/inbox/${entry.inboxId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Registrar desde la bandeja
                  </Link>
                ) : kind === 'PURCHASES' && canCreatePurchases && (entry.siiCode === 33 || entry.siiCode === 34) ? (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => createDraft(entry.key)}>
                    Crear borrador de compra
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{kind === 'PURCHASES' ? 'Regístralo en Compras' : 'Revisa la emisión'}</span>
                )}
              </Row>
            ))}
          </Section>

          <Section title="Montos distintos" description="El documento existe en ambos lados, pero con montos diferentes." count={reconciliation.differences.length}>
            {reconciliation.differences.map((difference) => (
              <Row key={`${difference.erp.documentId}`} entry={difference.sii} amountTone="warning">
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">
                    ERP: {formatCurrency(difference.erp.totalAmount)} · difiere en {difference.fields.map((field) => FIELD_LABELS[field]).join(', ')}
                  </p>
                  <Link href={documentHref(difference.erp.documentId)} className="hover:underline">Ver documento →</Link>
                </div>
              </Row>
            ))}
          </Section>

          <Section
            title="Están en el ERP y no en el SII"
            description={kind === 'PURCHASES' ? 'Compras registradas que el SII no tiene: revisa el folio y el RUT, o si el proveedor emitió el documento.' : 'Ventas que el SII no registra: revisa si el DTE se envió.'}
            count={reconciliation.onlyInErp.length}
          >
            {reconciliation.onlyInErp.map((entry) => (
              <Row key={entry.documentId} entry={entry} amountTone="neutral">
                <Link href={documentHref(entry.documentId)} className="text-xs hover:underline">Ver documento →</Link>
              </Row>
            ))}
          </Section>

          {reconciliation.matched.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              {reconciliation.matched.length} documento{reconciliation.matched.length === 1 ? '' : 's'} coinciden exactamente con el SII.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, description, count, children }: { title: string; description: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label={title}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <StatusBadge tone="warning">{count}</StatusBadge>
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function Row({
  entry,
  amountTone,
  children,
}: {
  entry: { siiCode: number; folio: number; rut: string; name: string; date: string | null; totalAmount: number; ivaAmount: number };
  amountTone: 'danger' | 'warning' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">
          {receivedDteLabel(entry.siiCode)} N° {entry.folio}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{day(entry.date)}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.name || 'Sin razón social'} · {entry.rut}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:justify-end">
        <div className="text-right tabular-nums">
          <p className={cn('font-medium', amountTone === 'danger' && 'text-danger', amountTone === 'warning' && 'text-warning')}>{formatCurrency(entry.totalAmount)}</p>
          <p className="text-xs text-muted-foreground">IVA {formatCurrency(entry.ivaAmount)}</p>
        </div>
        {children}
      </div>
    </li>
  );
}
