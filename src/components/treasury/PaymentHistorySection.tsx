'use client';

import { useEffect, useState } from 'react';
import type { Payment } from '@prisma/client';
import { listPaymentsForPurchaseDocumentAction, listPaymentsForSalesDocumentAction } from '@/modules/treasury/actions/treasury.actions';
import { PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import { formatCurrency } from '@/lib/chile/tax';

interface PaymentHistorySectionProps {
  kind: 'sales' | 'purchase';
  documentId: string;
  refreshKey?: number;
}

export default function PaymentHistorySection({ kind, documentId, refreshKey }: PaymentHistorySectionProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const action = kind === 'sales' ? listPaymentsForSalesDocumentAction : listPaymentsForPurchaseDocumentAction;
    action(documentId).then((result) => {
      if (result.success) setPayments(result.data);
      setLoading(false);
    });
  }, [kind, documentId, refreshKey]);

  return (
    <div className="space-y-2 rounded-xl border border-border p-4 print:hidden">
      <h3 className="text-sm font-semibold">Historial de Pagos / Abonos</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Fecha</th>
              <th className="p-2 font-medium">Monto</th>
              <th className="p-2 font-medium">Medio de Pago</th>
              <th className="p-2 font-medium">N° Comprobante</th>
              <th className="p-2 font-medium">Banco / Cuenta</th>
              <th className="p-2 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>Cargando...</td>
              </tr>
            )}
            {!loading && payments.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>Sin pagos registrados</td>
              </tr>
            )}
            {!loading &&
              payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-2">{new Date(p.paymentDate).toLocaleDateString('es-CL')}</td>
                  <td className="p-2 font-medium">{formatCurrency(p.amount)}</td>
                  <td className="p-2">{PAYMENT_METHOD_TYPE_LABELS[p.paymentMethod]}</td>
                  <td className="p-2">{p.referenceNumber ?? '—'}</td>
                  <td className="p-2">{p.bankAccount ?? '—'}</td>
                  <td className="p-2">{p.notes ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
