'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CandidateStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { updateCandidateStatusAction } from '@/modules/candidates/actions/candidates.actions';
import { CANDIDATE_ASSIGNABLE_STATUSES, CANDIDATE_STATUS_LABELS } from '@/modules/candidates/schema';

const selectClass =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/**
 * Cambio de estado con motivo obligatorio al descartar (Sección 6). El motivo
 * solo se pide cuando el estado elegido es `REJECTED` — para el resto es un
 * cambio directo, sin paso intermedio.
 */
export default function StatusChangeSection({ candidateId, currentStatus }: { candidateId: string; currentStatus: CandidateStatus }) {
  const router = useRouter();
  const [selected, setSelected] = useState<CandidateStatus>(currentStatus);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const needsReason = selected === 'REJECTED';
  const changed = selected !== currentStatus;

  async function handleSave() {
    if (needsReason && !motivo.trim()) {
      toast.error('Debes indicar el motivo del descarte');
      return;
    }
    setSaving(true);
    const result = await updateCandidateStatusAction(candidateId, { status: selected, motivoDescarte: needsReason ? motivo.trim() : undefined });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Estado actualizado');
    setMotivo('');
    router.refresh();
  }

  return (
    <div className="rounded border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Estado de la postulación</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Label htmlFor="status-select">Estado</Label>
          <select
            id="status-select"
            className={selectClass}
            value={selected}
            onChange={(e) => setSelected(e.target.value as CandidateStatus)}
          >
            {CANDIDATE_ASSIGNABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{CANDIDATE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        {changed && (
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambio de estado'}
          </Button>
        )}
      </div>
      {needsReason && changed && (
        <div className="mt-3">
          <Label htmlFor="motivo-descarte">Motivo del descarte (obligatorio)</Label>
          <textarea
            id="motivo-descarte"
            className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={255}
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
