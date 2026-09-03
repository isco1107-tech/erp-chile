'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { markFeeDocumentPaidAction } from '@/modules/fees/actions/fees.actions';

export default function MarkFeeDocumentPaidButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleMarkPaid() {
    if (!confirm('¿Marcar esta boleta de honorarios como pagada?')) return;
    setBusy(true);
    try {
      const result = await markFeeDocumentPaidAction(documentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Boleta marcada como pagada');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" disabled={busy} onClick={handleMarkPaid}>
      {busy ? 'Guardando...' : 'Marcar como pagada'}
    </Button>
  );
}
