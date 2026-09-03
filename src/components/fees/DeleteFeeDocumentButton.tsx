'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteFeeDocumentAction } from '@/modules/fees/actions/fees.actions';

interface DeleteFeeDocumentButtonProps {
  documentId: string;
  folioNumber: string;
  /** `icon` para la fila de la tabla; `full` para el detalle. */
  variant?: 'icon' | 'full';
  onDeleted?: () => void;
}

export default function DeleteFeeDocumentButton({
  documentId,
  folioNumber,
  variant = 'full',
  onDeleted,
}: DeleteFeeDocumentButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Eliminar la boleta de honorarios N° ${folioNumber}? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    const result = await deleteFeeDocumentAction(documentId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Boleta eliminada');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/fees');
    router.refresh();
  }

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={handleDelete}
        disabled={deleting}
        title="Eliminar boleta"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    );
  }

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
      <Trash2 />
      {deleting ? 'Eliminando…' : 'Eliminar boleta'}
    </Button>
  );
}
