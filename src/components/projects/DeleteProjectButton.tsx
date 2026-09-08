'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { deleteProjectAction } from '@/modules/projects/actions/projects.actions';

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  /** `icon` para la tarjeta del listado (dentro de un Link); `full` para el detalle. */
  variant?: 'icon' | 'full';
  onDeleted?: () => void;
}

export default function DeleteProjectButton({ projectId, projectName, variant = 'full', onDeleted }: DeleteProjectButtonProps) {
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
    const result = await deleteProjectAction(projectId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    toast.success(result.message ?? 'Proyecto eliminado');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/projects');
    router.refresh();
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={openConfirm}
          disabled={deleting}
          aria-label={`Eliminar ${projectName}`}
          title="Eliminar proyecto"
          className="absolute top-2 right-2 z-10 rounded-full bg-card/95 p-1.5 text-muted-foreground opacity-100 shadow-sm ring-1 ring-border transition-opacity hover:text-destructive focus-visible:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : (
        <Button type="button" variant="destructive" onClick={openConfirm} disabled={deleting}>
          <Trash2 />
          {deleting ? 'Eliminando…' : 'Eliminar proyecto'}
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar proyecto"
        description={`¿Eliminar el proyecto "${projectName}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
