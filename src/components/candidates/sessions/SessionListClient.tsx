'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import type { CandidateSession } from '@prisma/client';
import { listCandidateProjectOptionsAction } from '@/modules/candidates/actions/candidates.actions';
import { deleteSessionAction, listSessionsAction } from '@/modules/candidates/actions/sessions.actions';
import type { CandidateProjectOption } from '@/modules/candidates/services/candidates.service';
import { CANDIDATE_ACTIVITY_TYPE_LABELS } from '@/modules/candidates/schema';
import CreateSessionSeriesDialog from './CreateSessionSeriesDialog';

const selectClass =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export default function SessionListClient({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<CandidateProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sessions, setSessions] = useState<CandidateSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listCandidateProjectOptionsAction().then((r) => {
      if (r.success) {
        setProjects(r.data);
        if (r.data.length > 0) setProjectId(r.data[0].id);
      } else {
        toast.error(r.error);
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    const result = await listSessionsAction(projectId);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setSessions(result.data);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteSessionAction(id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Sesión eliminada');
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  const columns: DataTableColumn<CandidateSession>[] = [
    { id: 'date', header: 'Fecha', cell: (s) => new Date(s.date).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }) },
    { id: 'time', header: 'Hora', cell: (s) => s.time || '—' },
    { id: 'type', header: 'Actividad', cell: (s) => CANDIDATE_ACTIVITY_TYPE_LABELS[s.activityType] },
    { id: 'title', header: 'Título', cell: (s) => s.title || '—' },
    { id: 'location', header: 'Lugar', cell: (s) => s.location || '—' },
    {
      id: 'attendance',
      header: 'Pasar lista',
      cell: (s) => (
        <Link href={`/dashboard/candidates/attendance/${s.id}`} className="text-sm font-medium text-primary hover:underline">
          Abrir →
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground uppercase">Proyecto / Certamen</label>
          <select className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.length === 0 && <option value="">Sin proyectos</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
        </div>
        {canWrite && projectId && <CreateSessionSeriesDialog projectId={projectId} onCreated={load} />}
      </div>

      <DataTable
        columns={columns}
        data={sessions}
        getRowId={(s) => s.id}
        loading={loading}
        emptyTitle="Sin sesiones agendadas"
        emptyDescription="Crea una serie de sesiones (ej. martes y jueves) o un evento puntual para empezar a pasar lista."
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
