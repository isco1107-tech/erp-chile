'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { deletePromissoryNoteAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';

interface Props {
  noteId: string;
  contactName: string;
  /** `icon` para la lista; `full` para el detalle. */
  variant?: 'icon' | 'full';
  onDeleted?: () => void;
}

export default function DeletePromissoryNoteButton({ noteId, contactName, variant = 'full', onDeleted }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openConfirm(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setConfirmOpen(true);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deletePromissoryNoteAction(noteId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Pagaré eliminado');
      setConfirmOpen(false);
      if (onDeleted) onDeleted();
      else router.push('/dashboard/promissory-notes');
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={openConfirm}
          disabled={deleting}
          aria-label={`Eliminar pagaré de ${contactName}`}
          title="Eliminar pagaré"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : (
        <Button type="button" variant="destructive" onClick={openConfirm} disabled={deleting}>
          <Trash2 />
          {deleting ? 'Eliminando…' : 'Eliminar pagaré'}
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar pagaré"
        description={`¿Eliminar el pagaré de "${contactName}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
