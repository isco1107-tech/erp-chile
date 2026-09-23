'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { issuePurchaseDocumentAction, cancelPurchaseDocumentAction } from '@/modules/purchases/actions/purchases.actions';

import { useConfirm } from '@/components/ui/confirm-provider';
export default function DraftPurchaseActions({ documentId }: { documentId: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  // Acción específica en curso (no un solo `busy` compartido): con un booleano
  // único, al hacer clic en "Emitir" el botón "Anular borrador" también
  // cambiaba a su propio texto de carga ("Anulando...") sin que nadie lo
  // hubiera tocado — confuso, aunque ambos quedaran deshabilitados igual.
  const [busyAction, setBusyAction] = useState<'issue' | 'cancel' | null>(null);

  async function handleIssue() {
    if (!await confirm('¿Emitir este documento? Se aplicará el movimiento de stock/PMP correspondiente.')) return;
    setBusyAction('issue');
    try {
      const result = await issuePurchaseDocumentAction(documentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCancel() {
    if (!await confirm('¿Anular este borrador? No se puede deshacer.')) return;
    setBusyAction('cancel');
    try {
      const result = await cancelPurchaseDocumentAction(documentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/dashboard/purchases/${documentId}/edit`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Editar
      </Link>
      <Button type="button" size="sm" disabled={busy} onClick={handleIssue}>
        {busyAction === 'issue' ? 'Emitiendo...' : 'Emitir'}
      </Button>
      <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={handleCancel}>
        {busyAction === 'cancel' ? 'Anulando...' : 'Anular borrador'}
      </Button>
    </div>
  );
}
