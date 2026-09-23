'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { refreshOnlinePaymentAction } from '@/modules/payment-plans/actions/online-payment.actions';
import { ONLINE_PAYMENT_STATUS_LABELS } from '@/modules/payment-plans/schema';
import type { OnlinePaymentRow } from '@/modules/payment-plans/services/online-payment.service';
import { formatCurrency } from '@/lib/chile/tax';

const STATUS_TONE: Record<OnlinePaymentRow['status'], Tone> = {
  PENDING: 'info',
  PAID: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
};

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' });
}

/** Pagos hechos desde el portal público para este plan, con su comprobante. */
export default function OnlinePaymentsSection({
  planId,
  payments,
  canWrite,
}: {
  planId: string;
  payments: OnlinePaymentRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  if (payments.length === 0) return null;

  async function handleRefresh(orderId: string) {
    setRefreshingId(orderId);
    try {
      const result = await refreshOnlinePaymentAction(orderId, planId);
      if (!result.success) return toast.error(result.error);
      toast.success(result.message ?? 'Estado actualizado');
      router.refresh();
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Pagos en línea</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Pagado por</th>
              <th className="px-3 py-2">Cuotas</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(payment.paidAt ?? payment.createdAt)}</td>
                <td className="px-3 py-2">
                  <div>{payment.payerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {payment.payerEmail}
                    {payment.payerBank ? ` · ${payment.payerBank}` : ''}
                  </div>
                </td>
                <td className="px-3 py-2">{payment.installmentNumbers.map((n) => `N° ${n}`).join(', ')}</td>
                <td className="px-3 py-2 text-right">
                  {formatCurrency(payment.amount)}
                  {payment.excessAmount > 0 && (
                    <div className="text-xs font-medium text-destructive">
                      {formatCurrency(payment.excessAmount)} pagado de más: devolver
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge tone={STATUS_TONE[payment.status]}>{ONLINE_PAYMENT_STATUS_LABELS[payment.status]}</StatusBadge>
                </td>
                <td className="px-3 py-2">
                  {payment.status === 'PAID' ? (
                    <a
                      href={`/api/payment-plans/online-payments/${payment.id}/receipt`}
                      target="_blank"
                      rel="noopener"
                      className={buttonVariants({ size: 'xs', variant: 'outline' })}
                    >
                      <FileText className="size-3.5" /> {payment.receiptLabel}
                    </a>
                  ) : payment.status === 'PENDING' && canWrite ? (
                    <Button type="button" size="xs" variant="ghost" disabled={refreshingId === payment.id} onClick={() => handleRefresh(payment.id)}>
                      <RefreshCw className="size-3.5" /> Revisar en Khipu
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
