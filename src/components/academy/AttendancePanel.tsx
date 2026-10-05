'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/academy/billing';
import { getAttendanceSheetAction, listGroupsAction, saveAttendanceAction } from '@/modules/academy/actions/academy.actions';
import type { AttendanceSheetRow, GroupRow } from '@/modules/academy/services/academy.service';
import { fieldClass, todayIso } from './shared';

const ACTIVE_TONE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success-soft text-success border-success',
  LATE: 'bg-warning-soft text-warning border-warning',
  ABSENT: 'bg-danger-soft text-danger border-danger',
  JUSTIFIED: 'bg-muted text-foreground border-border',
};

export default function AttendancePanel({ canWrite }: { canWrite: boolean }) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<AttendanceSheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void listGroupsAction().then((result) => {
      if (!result.success) return void toast.error(result.error);
      const active = result.data.filter((g) => g.isActive);
      setGroups(active);
      if (active[0]) setGroupId(active[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!groupId || !date) return;
    setLoading(true);
    const result = await getAttendanceSheetAction(groupId, date);
    setLoading(false);
    if (!result.success) return void toast.error(result.error);
    setRows(result.data);
    setDirty(false);
  }, [groupId, date]);
  useEffect(() => {
    void load();
  }, [load]);

  function mark(studentId: string, status: AttendanceStatus | null) {
    setRows((current) => current.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
    setDirty(true);
  }

  function markAll(status: AttendanceStatus) {
    setRows((current) => current.map((r) => ({ ...r, status })));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const result = await saveAttendanceAction({ groupId, date, entries: rows.map((r) => ({ studentId: r.studentId, status: r.status })) });
    setSaving(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Lista guardada');
    setDirty(false);
  }

  if (groups.length === 0) {
    return <section className="rounded-lg border border-border bg-card"><EmptyState title="Primero crea un grupo" description="La lista se pasa por grupo. Crea uno en la pestaña Grupos y asigna a las alumnas desde su ficha." /></section>;
  }

  const unmarked = rows.filter((r) => !r.status).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm font-medium">Grupo
          <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">Fecha de la clase<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {canWrite && rows.length > 0 && <Button variant="outline" size="sm" onClick={() => markAll('PRESENT')}>Todas presentes</Button>}
      </div>

      <section className="rounded-lg border border-border bg-card" aria-label="Lista de asistencia">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Este grupo no tiene alumnas activas" description="Asigna alumnas al grupo desde su ficha, en la pestaña Alumnas." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <p className="min-w-0 text-sm font-medium">{row.fullName}</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Asistencia de ${row.fullName}`}>
                  {ATTENDANCE_STATUSES.map((status) => (
                    <button key={status} type="button" disabled={!canWrite} aria-pressed={row.status === status} onClick={() => mark(row.studentId, row.status === status ? null : status)} className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60', row.status === status ? ACTIVE_TONE[status] : 'border-border text-muted-foreground hover:text-foreground')}>
                      {ATTENDANCE_LABELS[status]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canWrite && rows.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          {unmarked > 0 && <p className="text-xs text-muted-foreground">{unmarked} sin marcar</p>}
          <Button disabled={saving || !dirty} onClick={save}>Guardar lista</Button>
        </div>
      )}
    </div>
  );
}
