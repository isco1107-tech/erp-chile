'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RegisterPaymentDialog from '@/components/treasury/RegisterPaymentDialog';
import SendReminderButton from '@/components/treasury/SendReminderButton';
import { getCxCSummaryAction, listReceivablesAction } from '@/modules/treasury/actions/treasury.actions';
import type { CxCSummary, ReceivableRow } from '@/modules/treasury/services/treasury.service';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';

type RowState = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';

const ROW_STATE_LABEL: Record<RowState, string> = {
  PAID: 'Pagado',
  PARTIAL: 'Parcial',
  OVERDUE: 'Vencido',
  PENDING: 'Pendiente',
};

const ROW_STATE_BADGE: Record<RowState, string> = {
  PAID: 'bg-green-600/10 text-green-600',
  PARTIAL: 'bg-amber-500/10 text-amber-600',
  OVERDUE: 'bg-destructive/10 text-destructive',
  PENDING: 'bg-muted text-muted-foreground',
};

function computeRowState(doc: ReceivableRow): RowState {
  if (doc.paymentStatus === 'PAID') return 'PAID';
  if (doc.dueDate && new Date(doc.dueDate) < new Date()) return 'OVERDUE';
  if (doc.paymentStatus === 'PARTIAL') return 'PARTIAL';
  return 'PENDING';
}

export default function CxCClient() {
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [summary, setSummary] = useState<CxCSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [rowsResult, summaryResult] = await Promise.all([listReceivablesAction(), getCxCSummaryAction()]);
    if (rowsResult.success) setRows(rowsResult.data);
    else toast.error(rowsResult.error);
    if (summaryResult.success) setSummary(summaryResult.data);
    else toast.error(summaryResult.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Total por Cobrar</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(summary?.totalReceivable ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Monto Vencido / Moroso</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-destructive">{formatCurrency(summary?.overdueAmount ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cobrado este Mes</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-green-600">{formatCurrency(summary?.collectedThisMonth ?? 0)}</CardContent>
        </Card>
      </div>

      {summary && summary.topDebtors.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Ranking de Clientes con Mayor Saldo</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {summary.topDebtors.map((debtor) => (
                <li key={debtor.contactId} className="flex justify-between py-1.5">
                  <span>{debtor.rut} — {debtor.razonSocial}</span>
                  <span className="font-medium">{formatCurrency(debtor.balance)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[980px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Folio</th>
              <th className="p-2 font-medium">Cliente</th>
              <th className="p-2 font-medium">Fecha Emisión</th>
              <th className="p-2 font-medium">Vencimiento</th>
              <th className="p-2 font-medium">Total</th>
              <th className="p-2 font-medium">Cobrado</th>
              <th className="p-2 font-medium">Saldo Pendiente</th>
              <th className="p-2 font-medium">Estado</th>
              <th className="p-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={9}>Cargando...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={9}>No hay documentos pendientes de cobro</td></tr>
            )}
            {!loading && rows.map((doc) => {
              const state = computeRowState(doc);
              return (
                <tr key={doc.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{doc.folio ?? '—'}</td>
                  <td className="p-2">
                    <Link href={`/dashboard/sales/${doc.id}`} className="hover:underline">
                      {doc.contact.rut} — {doc.contact.razonSocial}
                    </Link>
                    <div className="text-xs text-muted-foreground">{DTE_TYPE_LABELS[doc.dteType]}</div>
                  </td>
                  <td className="p-2">{new Date(doc.issueDate).toLocaleDateString('es-CL')}</td>
                  <td className="p-2">{doc.dueDate ? new Date(doc.dueDate).toLocaleDateString('es-CL') : '—'}</td>
                  <td className="p-2">{formatCurrency(doc.totalAmount)}</td>
                  <td className="p-2">{formatCurrency(doc.paidAmount)}</td>
                  <td className="p-2 font-medium">{formatCurrency(doc.totalAmount - doc.paidAmount)}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROW_STATE_BADGE[state]}`}>
                      {ROW_STATE_LABEL[state]}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RegisterPaymentDialog
                        kind="sales"
                        documentId={doc.id}
                        totalAmount={doc.totalAmount}
                        paidAmount={doc.paidAmount}
                        contactLabel={`${doc.contact.rut} — ${doc.contact.razonSocial}`}
                        triggerLabel="Registrar Abono / Pago"
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
