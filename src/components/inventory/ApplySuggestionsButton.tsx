'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-provider';
import { applySuggestionsAction } from '@/modules/inventory/actions/shrinkage.actions';

/** Confirma de una vez el responsable sugerido de las pérdidas sin asignar del filtro. */
export function ApplySuggestionsButton({ count, warehouseId, from, to, reason }: { count: number; warehouseId: string; from: string; to: string; reason?: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const apply = async () => {
    const ok = await confirm({
      title: count === 1 ? '¿Confirmar el responsable sugerido?' : `¿Confirmar los ${count} responsables sugeridos?`,
      description: 'Se asignan según los acuerdos por motivo de tu empresa. Las pérdidas sin sugerencia siguen sin asignar y cada una se puede cambiar después.',
      confirmLabel: 'Confirmar sugerencias',
      destructive: false,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await applySuggestionsAction({ warehouseId, from, to, reason });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Listo');
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={apply}
      disabled={pending || count === 0}
      className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Confirmando…' : `Confirmar sugerencias (${count})`}
    </button>
  );
}
