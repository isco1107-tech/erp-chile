'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/EmptyState';
import { listGroupsAction } from '@/modules/academy/actions/academy.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import MaterialsPanel from './MaterialsPanel';

/**
 * Biblioteca de material de todos los grupos: subir documentos, presentaciones
 * o enlaces y enviarlos al correo de las alumnas. El material de una clase en
 * particular se sube desde la propia clase, en el calendario.
 */
export default function MaterialsTab({ canWrite, onGoToGroups }: { canWrite: boolean; onGoToGroups: () => void }) {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);

  useEffect(() => {
    let active = true;
    void listGroupsAction().then((result) => {
      if (!active) return;
      if (!result.success) return void toast.error(result.error);
      setGroups(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (groups === null) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!groups.some((g) => g.isActive)) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <EmptyState title="Primero crea un grupo" description="El material se comparte con las alumnas de un grupo. Crea uno en la pestaña Grupos." actionLabel="Ir a Grupos" onAction={onGoToGroups} />
      </section>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Sube la presentación o el documento de tus clases y llega al correo de las alumnas del grupo (y de sus apoderados). Para atarlo a una clase, ábrela en el calendario y usa la pestaña «Material».</p>
      <MaterialsPanel canWrite={canWrite} groups={groups} groupId={null} />
    </div>
  );
}
