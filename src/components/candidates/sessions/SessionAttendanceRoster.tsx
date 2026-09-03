'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { saveSessionAttendanceAction } from '@/modules/candidates/actions/sessions.actions';
import { CANDIDATE_ACTIVITY_TYPE_LABELS, sessionAttendanceBulkSchema } from '@/modules/candidates/schema';
import type { SessionWithRoster } from '@/modules/candidates/services/sessions.service';

interface RowState {
  candidateId: string;
  fullName: string;
  stageName: string | null;
  attended: boolean;
  notes: string;
}

export default function SessionAttendanceRoster({ session, canWrite }: { session: SessionWithRoster; canWrite: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(
    session.roster.map((r) => ({
      candidateId: r.candidateId,
      fullName: r.fullName,
      stageName: r.stageName,
      attended: r.attended ?? true,
      notes: r.notes ?? '',
    }))
  );
  const [saving, setSaving] = useState(false);

  function setAttended(candidateId: string, attended: boolean) {
    setRows((prev) => prev.map((r) => (r.candidateId === candidateId ? { ...r, attended } : r)));
  }

  function setNotes(candidateId: string, notes: string) {
    setRows((prev) => prev.map((r) => (r.candidateId === candidateId ? { ...r, notes } : r)));
  }

  function markAll(attended: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, attended })));
  }

  async function handleSave() {
    const payload = {
      entries: rows.map((r) => ({ candidateId: r.candidateId, attended: r.attended, notes: r.notes || undefined })),
    };
    const parsed = sessionAttendanceBulkSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setSaving(true);
    const result = await saveSessionAttendanceAction(session.id, parsed.data);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Asistencia guardada');
    router.refresh();
  }

  const presentCount = rows.filter((r) => r.attended).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {CANDIDATE_ACTIVITY_TYPE_LABELS[session.activityType]}
            {session.title ? ` — ${session.title}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(session.date).toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
            {session.time ? ` · ${session.time}` : ''}
            {session.location ? ` · ${session.location}` : ''}
            {' · '}
            {session.project.name} ({session.project.code})
          </p>
        </div>
        <Link href="/dashboard/candidates/attendance" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{presentCount}/{rows.length} presentes</p>
          {canWrite && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => markAll(true)}>Marcar todas presentes</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => markAll(false)}>Marcar todas ausentes</Button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este proyecto no tiene candidatas activas.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.candidateId} className="flex flex-wrap items-center gap-3 py-2">
                <label className="flex flex-1 min-w-48 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={row.attended}
                    disabled={!canWrite}
                    onChange={(e) => setAttended(row.candidateId, e.target.checked)}
                  />
                  <span className={row.attended ? 'text-foreground' : 'text-muted-foreground line-through'}>
                    {row.stageName || row.fullName}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Nota (opcional)"
                  value={row.notes}
                  maxLength={500}
                  disabled={!canWrite}
                  onChange={(e) => setNotes(row.candidateId, e.target.value)}
                  className="h-8 w-56 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {canWrite && rows.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar asistencia'}
          </Button>
        </div>
      )}
    </div>
  );
}
