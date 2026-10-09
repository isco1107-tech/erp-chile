'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { deleteSalesDraftAction } from '@/modules/sales/actions/sales.actions';

interface Props {
  draftId: string;
  /** Quien mira puede crear ventas (`sales:write`): editar, emitir o eliminar el borrador. */
  canWrite: boolean;
}

/**
 * Salida del borrador: "Editar y emitir" abre el formulario de venta con los
 * datos ya cargados (al emitir, el borrador se reemplaza por el documento) y
 * "Eliminar borrador" lo descarta. Sin permiso se explica a quién pedirlo, en
 * vez de dejar el borrador sin ninguna acción.
 */
export default function DraftActions({ draftId, canWrite }: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: '¿Eliminar este borrador?',
      description: 'Se descarta por completo. No tiene folio ni movió stock, así que no queda nada que revertir.',
      confirmLabel: 'Eliminar borrador',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await deleteSalesDraftAction(draftId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Borrador eliminado');
      router.push('/dashboard/sales');
      router.refresh();
    } catch {
      toast.error('No se pudo contactar al servidor. Vuelve a intentarlo.');
    } finally {
      setDeleting(false);
    }
  }

  if (!canWrite) {
    return (
      <p className="text-xs text-muted-foreground">
        Para emitir este borrador pídele a alguien con permiso para «Crear ventas y cotizaciones» que lo abra desde el historial.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/dashboard/sales/new?draft=${draftId}`} className={buttonVariants()}>
        <Pencil aria-hidden="true" /> Editar y emitir
      </Link>
      <Button type="button" variant="outline" disabled={deleting} onClick={handleDelete}>
        <Trash2 aria-hidden="true" /> {deleting ? 'Eliminando...' : 'Eliminar borrador'}
      </Button>
    </div>
  );
}
