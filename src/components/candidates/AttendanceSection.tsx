'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { CandidateAttendance } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Trash2 } from 'lucide-react';
import { addAttendanceAction, deleteAttendanceAction } from '@/modules/candidates/actions/candidates.actions';
import { CANDIDATE_ACTIVITY_TYPE_LABELS, CANDIDATE_ACTIVITY_TYPES } from '@/modules/candidates/schema';

interface Props {
  candidateId: string;
  attendance: CandidateAttendance[];
  canWrite: boolean;
}

export default function AttendanceSection({ candidateId, attendance: initial, canWrite }: Props) {
  const [rows, setRows] = useState<CandidateAttendance[]>(initial);
  const [activityType, setActivityType] = useState<(typeof CANDIDATE_ACTIVITY_TYPES)[number]>('ENSAYO');
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [attended, setAttended] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd() {
    setSaving(true);
    try {
      const result = await addAttendanceAction(candidateId, { activityType, activityDate, attended, notes: notes || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRows((prev) => [result.data, ...prev]);
      setNotes('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const result = await deleteAttendanceAction(id, candidateId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<CandidateAttendance>[] = [
    { id: 'date', header: 'Fecha', cell: (r) => new Date(r.activityDate).toLocaleDateString('es-CL') },
    { id: 'type', header: 'Actividad', cell: (r) => CANDIDATE_ACTIVITY_TYPE_LABELS[r.activityType] },
    {
      id: 'attended',
      header: 'Asistió',
      cell: (r) => <StatusBadge tone={r.attended ? 'success' : 'danger'}>{r.attended ? 'Sí' : 'No'}</StatusBadge>,
    },
    { id: 'notes', header: 'Notas', cell: (r) => r.notes || '—' },
  ];

  return (
    <div className="rounded border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Asistencia a talleres/ensayos</p>

      {canWrite && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
          <div>
            <Label htmlFor="att-type">Actividad</Label>
            <select
              id="att-type"
              className="h-9 w-full rounded-lg border border-input bg-muted px-2 text-sm text-foreground"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as (typeof CANDIDATE_ACTIVITY_TYPES)[number])}
            >
              {CANDIDATE_ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>{CANDIDATE_ACTIVITY_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="att-date">Fecha</Label>
            <Input id="att-date" type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" checked={attended} onChange={(e) => setAttended(e.target.checked)} /> Asistió
          </label>
          <div className="sm:col-span-1">
            <Label htmlFor="att-notes">Notas</Label>
            <Input id="att-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        emptyTitle="Sin registros de asistencia"
        rowActions={
          canWrite
            ? (row) => (
                <Button type="button" size="icon-xs" variant="destructive" disabled={busyId === row.id} onClick={() => handleDelete(row.id)}>
                  <Trash2 />
                </Button>
              )
            : undefined
        }
      />
    </div>
  );
}
