'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { listGroupsAction } from '@/modules/academy/actions/academy.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import AttendanceSheet from './AttendanceSheet';
import { fieldClass, todayIso } from './shared';

/**
 * Pasar lista de cualquier día, sin pasar por el calendario (por ejemplo, una
 * clase que no se había programado). Para las clases del calendario, la lista
 * se abre desde la propia clase.
 */
export default function AttendancePanel({ canWrite }: { canWrite: boolean }) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(todayIso());

  useEffect(() => {
    void listGroupsAction().then((result) => {
      if (!result.success) return void toast.error(result.error);
      const active = result.data.filter((g) => g.isActive);
      setGroups(active);
      if (active[0]) setGroupId(active[0].id);
    });
  }, []);

  if (groups.length === 0) {
    return <section className="rounded-lg border border-border bg-card"><EmptyState title="Primero crea un grupo" description="La lista se pasa por grupo. Crea uno en la pestaña Grupos y asigna a las alumnas desde su ficha." /></section>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Para las clases del calendario, abre la clase y usa «Pasar lista». Aquí puedes pasar lista de cualquier fecha.</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm font-medium">Grupo
          <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Fecha de la clase<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {groupId && date && <AttendanceSheet key={`${groupId}|${date}`} groupId={groupId} date={date} canWrite={canWrite} />}
    </div>
  );
}
