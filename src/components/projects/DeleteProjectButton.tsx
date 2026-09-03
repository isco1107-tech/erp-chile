'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  async function handleDelete(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`¿Eliminar el proyecto "${projectName}"? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);
    const result = await deleteProjectAction(projectId);
    setDeleting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Proyecto eliminado');
    if (onDeleted) onDeleted();
    else router.push('/dashboard/projects');
    router.refresh();
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Eliminar ${projectName}`}
        title="Eliminar proyecto"
        className="absolute top-2 right-2 z-10 rounded-full bg-card/95 p-1.5 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
      <Trash2 />
      {deleting ? 'Eliminando…' : 'Eliminar proyecto'}
    </Button>
  );
}
