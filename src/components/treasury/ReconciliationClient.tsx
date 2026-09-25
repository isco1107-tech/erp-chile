'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, FileUp, Link2, ListChecks, Scale, Sparkles, Undo2, Wallet } from 'lucide-react';
import type { BankLineStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/chile/tax';
import { bankName } from '@/lib/treasury/banks';
import { cn } from '@/lib/utils';
import { matchBankLineAction, runAutoMatchAction, unmatchBankLineAction } from '@/modules/treasury/actions/banks.actions';
import type { ReconciliationView, ReconLineView } from '@/modules/treasury/services/banks.service';
import { IgnoreLineDialog, MatchManyDialog, RegisterFromLineDialog } from './ReconciliationDialogs';

const TABS: Array<{ value: BankLineStatus | 'ALL'; label: string }> = [
  { value: 'UNMATCHED', label: 'Por conciliar' },
  { value: 'MATCHED', label: 'Conciliados' },
  { value: 'IGNORED', label: 'Sin registro' },
  { value: 'ALL', label: 'Todos' },
];

function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00Z`) : value;
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' });
}

/** Ajuste con signo explícito (+$1.000 / −$1.000) para la cuadratura. */
function signedCurrency(value: number): string {
  if (value === 0) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
}

type DialogState = { kind: 'register' | 'many' | 'ignore'; line: ReconLineView } | null;

interface Props {
  view: ReconciliationView;
  status: BankLineStatus | 'ALL';
  canWrite: boolean;
}

export default function ReconciliationClient({ view, status, canWrite }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const { account, summary } = view;

  async function handleUpload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('bankAccountId', account.id);
      form.set('file', file);
      const response = await fetch('/api/treasury/bank-statements', { method: 'POST', body: form });
      const result = (await response.json()) as { success: boolean; error?: string; data?: { imported: number; duplicates: number; skipped: number; autoMatched: number } };
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'No se pudo importar la cartola');
        return;
      }
      const { imported, duplicates, autoMatched } = result.data;
      toast.success(
        `${imported} movimiento${imported === 1 ? '' : 's'} nuevo${imported === 1 ? '' : 's'}${duplicates > 0 ? ` (${duplicates} ya estaban)` : ''}. ${autoMatched} conciliado${autoMatched === 1 ? '' : 's'} automáticamente.`
      );
      router.refresh();
    } catch {
      toast.error('No se pudo subir la cartola. Revisa tu conexión');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function run<T>(action: () => Promise<{ success: true; data: T; message?: string } | { success: false; error: string }>) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const tied = summary.difference === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${bankName(account.bankCode)} · ${account.accountNumber}`}
        title={account.name}
        description={account.openingDate ? `Conciliando desde el ${formatDate(account.openingDate)} con saldo inicial ${formatCurrency(account.openingBalance)}.` : 'Importa la cartola desde el portal de tu banco (Excel o CSV).'}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
              <Button type="button" variant="outline" disabled={busy || view.counts.UNMATCHED === 0} onClick={() => run(() => runAutoMatchAction(account.id))}>
                <Sparkles className="size-4" aria-hidden="true" /> Conciliar automáticamente
              </Button>
              <Button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                <FileUp className="size-4" aria-hidden="true" /> {busy ? 'Procesando…' : 'Importar cartola'}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Saldo según banco" value={formatCurrency(summary.bankBalance)} icon={Wallet} tone="info" hint={view.lastStatementBalance !== null && view.lastStatementBalance !== summary.bankBalance ? `La cartola informa ${formatCurrency(view.lastStatementBalance)}` : 'Saldo inicial + cartolas'} />
        <KpiCard label="Saldo según registros" value={formatCurrency(summary.bookBalance)} icon={ListChecks} tone="accent" hint="Cobros y pagos en esta cuenta" />
        <KpiCard label="Por conciliar" value={String(view.counts.UNMATCHED)} icon={Link2} tone={view.counts.UNMATCHED > 0 ? 'warning' : 'success'} hint={`${view.counts.MATCHED} conciliados · ${view.counts.IGNORED} sin registro`} />
        <KpiCard label="Cuadratura" value={tied ? 'Cuadra' : signedCurrency(summary.difference)} icon={Scale} tone={tied ? 'success' : 'danger'} hint={tied ? 'Banco y registros explicados' : 'Diferencia sin explicar'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="min-w-0 rounded-lg border border-border bg-card shadow-card" aria-label="Movimientos de la cartola">
          <div className="border-b border-border p-4">
            <div role="tablist" aria-label="Estado" className="inline-flex rounded-md bg-muted p-0.5">
              {TABS.map((tab) => (
                <Link
                  key={tab.value}
                  role="tab"
                  aria-selected={status === tab.value}
                  href={`?status=${tab.value}`}
                  className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', status === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {tab.label}
                  {tab.value !== 'ALL' && <span className="ml-1 tabular-nums opacity-70">{view.counts[tab.value]}</span>}
                </Link>
              ))}
            </div>
          </div>

          {view.lines.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-10 text-success/60" aria-hidden="true" />}
              title={status === 'UNMATCHED' ? (view.counts.MATCHED + view.counts.IGNORED > 0 ? 'Todo conciliado' : 'Aún no hay movimientos') : 'Sin movimientos en esta vista'}
              description={status === 'UNMATCHED' && view.counts.MATCHED + view.counts.IGNORED === 0 ? 'Descarga la cartola en Excel o CSV desde el portal de tu banco e impórtala aquí.' : undefined}
              actionLabel={canWrite && status === 'UNMATCHED' ? 'Importar cartola' : undefined}
              onAction={canWrite && status === 'UNMATCHED' ? () => fileRef.current?.click() : undefined}
            />
          ) : (
            <ul className="divide-y divide-border">
              {view.lines.map((line) => (
                <li key={line.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(line.date)}
                        {line.reference && <span className="ml-2 font-mono">N° {line.reference}</span>}
                      </p>
                      <p className="truncate font-medium">{line.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {line.status === 'MATCHED' && <StatusBadge tone="success">Conciliado</StatusBadge>}
                      {line.status === 'IGNORED' && <StatusBadge tone="neutral">Sin registro</StatusBadge>}
                      <span className={cn('text-base font-semibold tabular-nums', line.amount > 0 ? 'text-success' : 'text-foreground')}>
                        {line.amount > 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(line.amount))}
                      </span>
                    </div>
                  </div>

                  {line.status === 'MATCHED' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {line.matchedPayments.map((payment) => (
                        <span key={payment.id} className="rounded-full bg-muted px-2.5 py-1">
                          {payment.label} · {payment.contactName}
                        </span>
                      ))}
                      {canWrite && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => unmatchBankLineAction(line.id))}>
                          <Undo2 className="size-3.5" aria-hidden="true" /> Deshacer
                        </Button>
                      )}
                    </div>
                  )}

                  {line.status === 'IGNORED' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{line.ignoredReason}</span>
                      {canWrite && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(() => unmatchBankLineAction(line.id))}>
                          <Undo2 className="size-3.5" aria-hidden="true" /> Deshacer
                        </Button>
                      )}
                    </div>
                  )}

                  {line.status === 'UNMATCHED' && canWrite && (
                    <div className="mt-3 space-y-2">
                      {line.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {line.suggestions.slice(0, 3).map((suggestion) => (
                            <button
                              key={suggestion.paymentId}
                              type="button"
                              disabled={busy}
                              onClick={() => run(() => matchBankLineAction(line.id, { paymentIds: [suggestion.paymentId] }))}
                              title={suggestion.reasons.join(' · ')}
                              className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/30 bg-accent/40 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:opacity-50"
                            >
                              <Link2 className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                              <span className="truncate">
                                {suggestion.label} · {suggestion.contactName} · {formatDate(suggestion.date)}
                              </span>
                              <span className="shrink-0 font-semibold text-primary tabular-nums">{suggestion.score}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'register', line })}>
                          {line.amount > 0 ? 'Registrar cobro' : 'Registrar pago'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'many', line })}>
                          Buscar en registros
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'ignore', line })}>
                          Sin registro en libros
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 shadow-card" aria-label="Cuadratura">
            <h2 className="text-sm font-semibold">Cuadratura</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Saldo según banco</dt>
                <dd className="font-medium tabular-nums">{formatCurrency(summary.bankBalance)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Depósitos en tránsito</dt>
                <dd className="tabular-nums">{signedCurrency(summary.depositsInTransit)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Pagos aún no cobrados</dt>
                <dd className="tabular-nums">{signedCurrency(-summary.outstandingPayments)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Movimientos del banco sin registro</dt>
                <dd className="tabular-nums">{signedCurrency(-summary.unrecordedBankMovements)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold">
                <dt>= Saldo según registros</dt>
                <dd className="tabular-nums">{formatCurrency(summary.bookBalance)}</dd>
              </div>
            </dl>
            {!tied && <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">Hay {formatCurrency(Math.abs(summary.difference))} sin explicar: revisa el saldo inicial y la fecha desde la que concilias.</p>}
          </section>

          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Registros aún no en el banco">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">En tus registros, aún no en el banco</h2>
            {view.openPayments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada pendiente.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {view.openPayments.slice(0, 50).map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{payment.contactName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(payment.date)} · {payment.label}
                      </p>
                    </div>
                    <span className={cn('shrink-0 tabular-nums', payment.amount > 0 ? 'text-success' : '')}>
                      {payment.amount > 0 ? '+' : '−'}
                      {formatCurrency(Math.abs(payment.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {dialog?.kind === 'register' && <RegisterFromLineDialog line={dialog.line} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
      {dialog?.kind === 'many' && <MatchManyDialog line={dialog.line} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
      {dialog?.kind === 'ignore' && <IgnoreLineDialog line={dialog.line} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
    </div>
  );
}
