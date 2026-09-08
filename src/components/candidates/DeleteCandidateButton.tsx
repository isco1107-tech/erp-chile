'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { deleteCandidateAction } from '@/modules/candidates/actions/candidates.actions';

interface DeleteCandidateButtonProps {
  candidateId: string;
  candidateName: string;
  /** `icon` para la tarjeta del listado (dentro de un Link); `full` para la ficha de detalle. */
  variant?: 'icon' | 'full';
  /** Se llama al eliminar con éxito. Si no viene, redirige al listado (uso en la ficha de detalle). */
  onDeleted?: () => void;
}

export default function DeleteCandidateButton({
  candidateId,
  candidateName,
  variant = 'full',
  onDeleted,
}: DeleteCandidateButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openConfirm(event: MouseEvent) {
    // La tarjeta del listado envuelve todo en un <Link>: sin esto, el clic en
    // "eliminar" también navegaría a la ficha de detalle.
    event.preventDefault();
    event.stopPropagation();
    setConfirmOpen(true);
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteCandidateAction(candidateId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setConfirmOpen(false);
    toast.success(result.message ?? 'Candidata eliminada');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/candidates');
    router.refresh();
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={openConfirm}
          disabled={deleting}
          aria-label={`Eliminar a ${candidateName}`}
          title="Eliminar candidata"
          className="absolute top-2 right-2 z-10 rounded-full bg-card/95 p-1.5 text-muted-foreground opacity-100 shadow-sm ring-1 ring-border transition-opacity hover:text-destructive focus-visible:opacity-100 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : (
        <Button type="button" variant="destructive" onClick={openConfirm} disabled={deleting}>
          <Trash2 />
          {deleting ? 'Eliminando…' : 'Eliminar ficha'}
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar candidata"
        description={`¿Eliminar a "${candidateName}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
