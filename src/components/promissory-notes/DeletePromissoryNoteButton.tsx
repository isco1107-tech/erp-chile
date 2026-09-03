'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  async function handleDelete(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`¿Eliminar el pagaré de "${contactName}"? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    const result = await deletePromissoryNoteAction(noteId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Pagaré eliminado');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/promissory-notes');
    router.refresh();
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Eliminar pagaré de ${contactName}`}
        title="Eliminar pagaré"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
      <Trash2 />
      {deleting ? 'Eliminando…' : 'Eliminar pagaré'}
    </Button>
  );
}
