'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RegisterPaymentDialog from '@/components/treasury/RegisterPaymentDialog';
import { getCxPSummaryAction, listPayablesAction } from '@/modules/treasury/actions/treasury.actions';
import type { CxPSummary, PayableRow } from '@/modules/treasury/services/treasury.service';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
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

function computeRowState(doc: PayableRow): RowState {
  if (doc.paymentStatus === 'PAID') return 'PAID';
  if (doc.dueDate && new Date(doc.dueDate) < new Date()) return 'OVERDUE';
  if (doc.paymentStatus === 'PARTIAL') return 'PARTIAL';
  return 'PENDING';
}

export default function CxPClient() {
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [summary, setSummary] = useState<CxPSummary | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [rowsResult, summaryResult] = await Promise.all([listPayablesAction(), getCxPSummaryAction()]);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Total por Pagar a Proveedores</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(summary?.totalPayable ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Facturas por Vencer esta Semana</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-amber-600">
            {summary?.dueThisWeekCount ?? 0} <span className="text-base font-normal text-muted-foreground">({formatCurrency(summary?.dueThisWeekAmount ?? 0)})</span>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[980px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Folio</th>
              <th className="p-2 font-medium">Proveedor</th>
              <th className="p-2 font-medium">Fecha Emisión</th>
              <th className="p-2 font-medium">Vencimiento</th>
              <th className="p-2 font-medium">Total</th>
              <th className="p-2 font-medium">Pagado</th>
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
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={9}>No hay facturas de proveedor pendientes</td></tr>
            )}
            {!loading && rows.map((doc) => {
              const state = computeRowState(doc);
              return (
                <tr key={doc.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{doc.folio}</td>
                  <td className="p-2">
                    <Link href={`/dashboard/purchases/${doc.id}`} className="hover:underline">
                      {doc.contact.rut} — {doc.contact.razonSocial}
                    </Link>
                    <div className="text-xs text-muted-foreground">{PURCHASE_DOCUMENT_TYPE_LABELS[doc.documentType]}</div>
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
                    <RegisterPaymentDialog
                      kind="purchase"
                      documentId={doc.id}
                      totalAmount={doc.totalAmount}
                      paidAmount={doc.paidAmount}
                      contactLabel={`${doc.contact.rut} — ${doc.contact.razonSocial}`}
                      triggerLabel="Registrar Pago a Proveedor"
                      onRegistered={load}
                    />
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
