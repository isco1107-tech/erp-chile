'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { AlarmClock, HandCoins, Wallet } from 'lucide-react';
import RegisterPaymentDialog from '@/components/treasury/RegisterPaymentDialog';
import SendReminderButton from '@/components/treasury/SendReminderButton';
import { AgingSummary } from '@/components/treasury/AgingSummary';
import { daysOverdue } from '@/components/treasury/aging';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { Tone } from '@/components/ui/tone';
import { getCxCSummaryAction, listReceivablesAction } from '@/modules/treasury/actions/treasury.actions';
import type { CxCSummary, ReceivableRow } from '@/modules/treasury/services/treasury.service';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';

type RowState = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';

const ROW_STATE: Record<RowState, { label: string; tone: Tone }> = {
  PAID: { label: 'Pagado', tone: 'success' },
  PARTIAL: { label: 'Abono parcial', tone: 'warning' },
  OVERDUE: { label: 'Vencido', tone: 'danger' },
  PENDING: { label: 'Por vencer', tone: 'neutral' },
};

function computeRowState(doc: ReceivableRow): RowState {
  if (doc.paymentStatus === 'PAID') return 'PAID';
  if (doc.dueDate && new Date(doc.dueDate) < new Date()) return 'OVERDUE';
  if (doc.paymentStatus === 'PARTIAL') return 'PARTIAL';
  return 'PENDING';
}

const dateFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago' });

export default function CxCClient() {
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [summary, setSummary] = useState<CxCSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [rowsResult, summaryResult] = await Promise.all([listReceivablesAction(), getCxCSummaryAction()]);
      if (rowsResult.success) setRows(rowsResult.data);
      else toast.error(rowsResult.error);
      if (summaryResult.success) setSummary(summaryResult.data);
      else toast.error(summaryResult.error);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agingItems = rows.map((doc) => ({ balance: doc.totalAmount - doc.paidAmount, dueDate: doc.dueDate }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total por cobrar" value={formatCurrency(summary?.totalReceivable ?? 0)} icon={Wallet} tone="accent" />
        <KpiCard label="Vencido / moroso" value={formatCurrency(summary?.overdueAmount ?? 0)} icon={AlarmClock} tone="danger" />
        <KpiCard label="Cobrado este mes" value={formatCurrency(summary?.collectedThisMonth ?? 0)} icon={HandCoins} tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AgingSummary title="Antigüedad de la cartera" items={agingItems} />

        <section className="rounded-xl border border-border bg-card p-5 shadow-card" aria-label="Clientes con mayor saldo">
          <h2 className="text-sm font-semibold">Clientes con mayor saldo</h2>
          {summary && summary.topDebtors.length > 0 ? (
            <ol className="mt-3 space-y-2 text-sm">
              {summary.topDebtors.map((debtor, index) => (
                <li key={debtor.contactId} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {debtor.razonSocial}
                    <span className="ml-1.5 text-xs text-muted-foreground">{debtor.rut}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(debtor.balance)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Ningún cliente tiene saldo pendiente.</p>
          )}
        </section>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Emisión</th>
              <th className="px-4 py-2.5 font-medium">Vencimiento</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Cobrado</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }, (_, index) => (
                <tr key={index} className="border-b border-border/60">
                  <td colSpan={9} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {!loading && failed && (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    title="No se pudo cargar la cartera"
                    description="Revisa tu conexión e inténtalo de nuevo."
                    action={
                      <Button type="button" variant="outline" onClick={() => void load()}>
                        Reintentar
                      </Button>
                    }
                  />
                </td>
              </tr>
            )}
            {!loading && !failed && rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <EmptyState title="No hay documentos pendientes de cobro" description="Cuando emitas una venta a crédito aparecerá aquí hasta que se pague." />
                </td>
              </tr>
            )}
            {!loading &&
              !failed &&
              rows.map((doc) => {
                const state = computeRowState(doc);
                const late = daysOverdue(doc.dueDate);
                return (
                  <tr key={doc.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/sales/${doc.id}`} className="font-medium hover:underline">
                        N° {doc.folio ?? '—'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{DTE_TYPE_LABELS[doc.dteType]}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="max-w-[16rem] truncate">{doc.contact.razonSocial}</div>
                      <div className="text-xs text-muted-foreground">{doc.contact.rut}</div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{dateFormat.format(new Date(doc.issueDate))}</td>
                    <td className="px-4 py-2.5">
                      {doc.dueDate ? dateFormat.format(new Date(doc.dueDate)) : '—'}
                      {state === 'OVERDUE' && late > 0 && <div className="text-xs font-medium text-danger">{late} días de atraso</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(doc.totalAmount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(doc.paidAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(doc.totalAmount - doc.paidAmount)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={ROW_STATE[state].tone}>{ROW_STATE[state].label}</StatusBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <RegisterPaymentDialog
                          kind="sales"
                          documentId={doc.id}
                          totalAmount={doc.totalAmount}
                          paidAmount={doc.paidAmount}
                          contactLabel={`${doc.contact.rut} — ${doc.contact.razonSocial}`}
                          triggerLabel="Registrar pago"
                          onRegistered={load}
                        />
                        {state !== 'PAID' && <SendReminderButton contactId={doc.contactId} hasEmail={Boolean(doc.contact.email)} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
