'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { AlarmClock, CalendarClock, Landmark } from 'lucide-react';
import RegisterPaymentDialog from '@/components/treasury/RegisterPaymentDialog';
import { AgingSummary } from '@/components/treasury/AgingSummary';
import { daysOverdue } from '@/components/treasury/aging';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { Tone } from '@/components/ui/tone';
import { getCxPSummaryAction, listPayablesAction } from '@/modules/treasury/actions/treasury.actions';
import type { CxPSummary, PayableRow } from '@/modules/treasury/services/treasury.service';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import { formatCurrency } from '@/lib/chile/tax';

type RowState = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';

const ROW_STATE: Record<RowState, { label: string; tone: Tone }> = {
  PAID: { label: 'Pagado', tone: 'success' },
  PARTIAL: { label: 'Abono parcial', tone: 'warning' },
  OVERDUE: { label: 'Vencido', tone: 'danger' },
  PENDING: { label: 'Por vencer', tone: 'neutral' },
};

function computeRowState(doc: PayableRow): RowState {
  if (doc.paymentStatus === 'PAID') return 'PAID';
  if (doc.dueDate && new Date(doc.dueDate) < new Date()) return 'OVERDUE';
  if (doc.paymentStatus === 'PARTIAL') return 'PARTIAL';
  return 'PENDING';
}

const dateFormat = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago' });

export default function CxPClient() {
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [summary, setSummary] = useState<CxPSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [rowsResult, summaryResult] = await Promise.all([listPayablesAction(), getCxPSummaryAction()]);
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
  const overdueAmount = rows
    .filter((doc) => computeRowState(doc) === 'OVERDUE')
    .reduce((sum, doc) => sum + (doc.totalAmount - doc.paidAmount), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total por pagar" value={formatCurrency(summary?.totalPayable ?? 0)} icon={Landmark} tone="accent" />
        <KpiCard
          label="Vence en los próximos 7 días"
          value={formatCurrency(summary?.dueThisWeekAmount ?? 0)}
          icon={CalendarClock}
          tone="warning"
          trend={summary ? `${summary.dueThisWeekCount} doc.` : undefined}
          trendDirection="neutral"
          hint="por pagar esta semana"
        />
        <KpiCard label="Ya vencido" value={formatCurrency(overdueAmount)} icon={AlarmClock} tone="danger" />
      </div>

      <AgingSummary title="Antigüedad de la deuda con proveedores" items={agingItems} />

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Documento</th>
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">Emisión</th>
              <th className="px-4 py-2.5 font-medium">Vencimiento</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-right font-medium">Pagado</th>
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
                    title="No se pudieron cargar las cuentas por pagar"
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
                  <EmptyState title="No hay facturas de proveedor pendientes" description="Las compras emitidas a crédito aparecen aquí hasta que se pagan." />
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
                      <Link href={`/dashboard/purchases/${doc.id}`} className="font-medium hover:underline">
                        N° {doc.folio}
                      </Link>
                      <div className="text-xs text-muted-foreground">{PURCHASE_DOCUMENT_TYPE_LABELS[doc.documentType]}</div>
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
                      <div className="flex justify-end">
                        <RegisterPaymentDialog
                          kind="purchase"
                          documentId={doc.id}
                          totalAmount={doc.totalAmount}
                          paidAmount={doc.paidAmount}
                          contactLabel={`${doc.contact.rut} — ${doc.contact.razonSocial}`}
                          triggerLabel="Registrar pago"
                          onRegistered={load}
                        />
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
