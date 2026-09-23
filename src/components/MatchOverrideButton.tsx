'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { overridePurchaseMatchAction } from '@/modules/purchases/actions/purchases.actions';

import { useConfirm } from '@/components/ui/confirm-provider';
export default function MatchOverrideButton({ documentId }: { documentId: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleOverride() {
    const notes = prompt('¿Por qué se fuerza el pago pese a la diferencia? (opcional)') ?? undefined;
    if (!await confirm('¿Forzar el pago de esta factura pese a no coincidir con su Orden de Compra?')) return;
    setBusy(true);
    try {
      const result = await overridePurchaseMatchAction(documentId, { notes: notes || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={handleOverride}>
      {busy ? 'Forzando...' : 'Forzar pago'}
    </Button>
  );
}
