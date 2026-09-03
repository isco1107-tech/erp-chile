'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  async function handleDelete(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`¿Eliminar el presupuesto "${budgetName}"? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    const result = await deleteBudgetAction(budgetId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Presupuesto eliminado');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/budgets');
    router.refresh();
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Eliminar presupuesto ${budgetName}`}
        title="Eliminar presupuesto"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
      <Trash2 />
      {deleting ? 'Eliminando…' : 'Eliminar presupuesto'}
    </Button>
  );
}
