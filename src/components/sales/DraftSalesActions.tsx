'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { deleteDraftSalesDocumentAction, issueDraftSalesDocumentAction } from '@/modules/sales/actions/sales.actions';

/** Emitir o eliminar un documento de venta en borrador. */
export default function DraftSalesActions({ documentId, label }: { documentId: string; label: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function issue() {
    const ok = await confirm({
      title: `¿Emitir esta ${label.toLowerCase()}?`,
      description: 'Se asigna folio, se descuenta stock y se genera el asiento contable. Después solo se puede anular con nota de crédito.',
      confirmLabel: 'Emitir',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await issueDraftSalesDocumentAction(documentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Documento emitido');
      router.replace(`/dashboard/sales/${result.data.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: '¿Eliminar este borrador?', description: 'No es un documento tributario, así que se borra sin dejar rastro.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await deleteDraftSalesDocumentAction(documentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Borrador eliminado');
      router.push('/dashboard/sales');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={() => void remove()}>
        <Trash2 aria-hidden="true" /> Eliminar borrador
      </Button>
      <Button type="button" disabled={busy} onClick={() => void issue()}>
        <Send aria-hidden="true" /> {busy ? 'Emitiendo…' : 'Emitir documento'}
      </Button>
    </>
  );
}
