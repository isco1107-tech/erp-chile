'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { StageItemStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import {
  createStageItemAction,
  deleteStageItemAction,
  listProductionCandidateOptionsAction,
  listProductionProjectOptionsAction,
  listStageItemsAction,
  moveStageItemAction,
  updateStageItemAction,
} from '@/modules/production/actions/production.actions';
import type { ProductionCandidateOption, ProductionProjectOption, StageTimelineItemWithCandidate } from '@/modules/production/services/production.service';
import { STAGE_ITEM_STATUS_LABELS } from '@/modules/production/schema';

const STATUS_TONE: Record<StageItemStatus, Tone> = { PENDING: 'neutral', IN_PROGRESS: 'info', DONE: 'success', SKIPPED: 'danger' };

/** Poll cada 5s: no hay WebSocket/SSE en el repo (ver plan) — el director de piso en otra pantalla ve el cambio en, como máximo, 5 segundos. */
const POLL_MS = 5000;

export default function ProductionTimelineClient({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<ProductionProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<StageTimelineItemWithCandidate[]>([]);
  const [candidates, setCandidates] = useState<ProductionCandidateOption[]>([]);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [candidateId, setCandidateId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProductionProjectOptionsAction().then((result) => {
      if (result.success) {
        setProjects(result.data);
        if (result.data.length > 0) setProjectId(result.data[0]!.id);
      }
    });
  }, []);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const result = await listStageItemsAction(projectId);
    if (result.success) setItems(result.data);
  }, [projectId]);

  useEffect(() => {
    reload();
    listProductionCandidateOptionsAction(projectId).then((result) => {
      if (result.success) setCandidates(result.data);
    });
  }, [projectId, reload]);

  useEffect(() => {
    if (!projectId) return;
    const interval = setInterval(reload, POLL_MS);
    return () => clearInterval(interval);
  }, [projectId, reload]);

  async function handleAdd() {
    if (!title.trim() || !startTime) {
      toast.error('Completa el título y la hora de inicio');
      return;
    }
    setSaving(true);
    try {
      const result = await createStageItemAction({ projectId, title, startTime, durationMinutes, candidateId: candidateId || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setTitle('');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    await moveStageItemAction(id, projectId, direction);
    await reload();
  }

  async function handleStatus(id: string, status: StageItemStatus) {
    const result = await updateStageItemAction(id, { status });
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este bloque de la escaleta?')) return;
    const result = await deleteStageItemAction(id);
    if (!result.success) toast.error(result.error);
    await reload();
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="prod-project">Certamen</Label>
        <select
          id="prod-project"
          className="h-10 w-full max-w-sm rounded-xl border border-input bg-muted px-3 text-sm text-foreground"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </div>

      {canWrite && projectId && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-5 sm:items-end">
          <div className="sm:col-span-2">
            <Label htmlFor="stage-title">Título del bloque</Label>
            <Input id="stage-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Traje de baño — Bloque 3" />
          </div>
          <div>
            <Label htmlFor="stage-start">Hora de inicio</Label>
            <Input id="stage-start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="stage-duration">Duración (min)</Label>
            <Input id="stage-duration" type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="stage-candidate">Candidata (opcional)</Label>
            <select
              id="stage-candidate"
              className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
            >
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.stageName || c.fullName}</option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving} className="sm:col-span-5 sm:w-fit">
            {saving ? 'Agregando...' : 'Agregar bloque'}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sin bloques en la escaleta todavía.</p>}
        {items.map((item, index) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm">
            <span className="hud-label w-8 shrink-0 text-center">#{item.blockOrder}</span>
            <div className="min-w-[10rem] flex-1">
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.startTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {item.durationMinutes} min
                {item.candidate && ` · ${item.candidate.stageName || item.candidate.fullName}`}
              </p>
            </div>
            {canWrite ? (
              <select
                className="h-8 rounded-lg border border-input bg-muted px-2 text-xs text-foreground"
                value={item.status}
                onChange={(e) => handleStatus(item.id, e.target.value as StageItemStatus)}
              >
                {Object.entries(STAGE_ITEM_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            ) : (
              <StatusBadge tone={STATUS_TONE[item.status]}>{STAGE_ITEM_STATUS_LABELS[item.status]}</StatusBadge>
            )}
            {canWrite && (
              <div className="flex items-center gap-1">
                <Button type="button" size="icon-xs" variant="ghost" disabled={index === 0} onClick={() => handleMove(item.id, 'up')}>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" disabled={index === items.length - 1} onClick={() => handleMove(item.id, 'down')}>
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon-xs" variant="destructive" onClick={() => handleDelete(item.id)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
