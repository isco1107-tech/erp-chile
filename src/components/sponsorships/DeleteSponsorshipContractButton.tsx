'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteSponsorshipContractAction } from '@/modules/sponsorships/actions/sponsorships.actions';

import { useConfirm } from '@/components/ui/confirm-provider';
interface DeleteSponsorshipContractButtonProps {
  contractId: string;
  contactName: string;
  /** `icon` para la tarjeta del Kanban; `full` para el detalle. */
  variant?: 'icon' | 'full';
  onDeleted?: () => void;
}

export default function DeleteSponsorshipContractButton({
  contractId,
  contactName,
  variant = 'full',
  onDeleted,
}: DeleteSponsorshipContractButtonProps) {
  const confirm = useConfirm();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!await confirm(`¿Eliminar el contrato de auspicio con "${contactName}"? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    const result = await deleteSponsorshipContractAction(contractId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Contrato eliminado');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/sponsorships');
    router.refresh();
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Eliminar contrato con ${contactName}`}
        title="Eliminar contrato"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
      <Trash2 />
      {deleting ? 'Eliminando…' : 'Eliminar contrato'}
    </Button>
  );
}
