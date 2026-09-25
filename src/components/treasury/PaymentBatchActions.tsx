'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Download, Trash2 } from 'lucide-react';
import type { PaymentBatchStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cancelPaymentBatchAction, markPaymentBatchPaidAction, removePaymentBatchItemAction } from '@/modules/treasury/actions/payment-batches.actions';

interface Props {
  batchId: string;
  folio: number;
  status: PaymentBatchStatus;
  canWrite: boolean;
  /** Si viene, el componente es solo el botón para quitar esa línea. */
  removeItemId?: string;
  removeLabel?: string;
}

export default function PaymentBatchActions({ batchId, folio, status, canWrite, removeItemId, removeLabel }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>) {
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

  if (removeItemId) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Quitar ${removeLabel ?? 'factura'}`}
        disabled={busy}
        onClick={async () => {
          if (!(await confirm({ title: '¿Quitar esta factura de la nómina?', description: removeLabel, confirmLabel: 'Quitar' }))) return;
          await run(() => removePaymentBatchItemAction(batchId, removeItemId));
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <>
      <a href={`/api/treasury/payment-batches/${batchId}/file?format=xlsx`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
        <Download className="size-4" aria-hidden="true" /> Excel
      </a>
      <a href={`/api/treasury/payment-batches/${batchId}/file?format=csv`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
        <Download className="size-4" aria-hidden="true" /> CSV
      </a>
      {canWrite && status === 'DRAFT' && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (!(await confirm({ title: `¿Anular la nómina #${folio}?`, description: 'Las facturas vuelven a quedar disponibles para otra nómina. No se registra ningún pago.', confirmLabel: 'Anular', destructive: true }))) return;
              await run(() => cancelPaymentBatchAction(batchId));
            }}
          >
            Anular
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!(await confirm({ title: `¿El banco ya pagó la nómina #${folio}?`, description: 'Se registrará el pago de cada factura (con su asiento) en la cuenta de origen. Hazlo cuando el banco haya confirmado las transferencias.', confirmLabel: 'Marcar pagada' }))) return;
              await run(() => markPaymentBatchPaidAction(batchId));
            }}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" /> Marcar pagada
          </Button>
        </>
      )}
    </>
  );
}
