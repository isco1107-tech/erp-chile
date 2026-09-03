'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  async function handleDelete(event: MouseEvent) {
    // La tarjeta del listado envuelve todo en un <Link>: sin esto, el clic en
    // "eliminar" también navegaría a la ficha de detalle.
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`¿Eliminar a "${candidateName}"? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    const result = await deleteCandidateAction(candidateId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Candidata eliminada');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/candidates');
    router.refresh();
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Eliminar a ${candidateName}`}
        title="Eliminar candidata"
        className="absolute top-2 right-2 z-10 rounded-full bg-card/95 p-1.5 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
      <Trash2 />
      {deleting ? 'Eliminando…' : 'Eliminar ficha'}
    </Button>
  );
}
