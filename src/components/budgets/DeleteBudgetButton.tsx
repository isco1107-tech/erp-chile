'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { deleteBudgetAction } from '@/modules/budgets/actions/budgets.actions';

interface DeleteBudgetButtonProps {
  budgetId: string;
  budgetName: string;
  /** `icon` para la tabla de listado; `full` para el detalle. */
  variant?: 'icon' | 'full';
  onDeleted?: () => void;
}

export default function DeleteBudgetButton({ budgetId, budgetName, variant = 'full', onDeleted }: DeleteBudgetButtonProps) {
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
      const result = await deleteBudgetAction(budgetId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Presupuesto eliminado');
      setConfirmOpen(false);
      if (onDeleted) onDeleted();
      else router.push('/dashboard/budgets');
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
          aria-label={`Eliminar presupuesto ${budgetName}`}
          title="Eliminar presupuesto"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : (
        <Button type="button" variant="destructive" onClick={openConfirm} disabled={deleting}>
          <Trash2 />
          {deleting ? 'Eliminando…' : 'Eliminar presupuesto'}
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar presupuesto"
        description={`¿Eliminar el presupuesto "${budgetName}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
