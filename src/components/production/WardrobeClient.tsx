'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { WardrobeStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { Trash2 } from 'lucide-react';
import {
  createWardrobeItemAction,
  deleteWardrobeItemAction,
  listProductionCandidateOptionsAction,
  listProductionProjectOptionsAction,
  listStageItemsAction,
  listWardrobeItemsAction,
  updateWardrobeItemAction,
} from '@/modules/production/actions/production.actions';
import type {
  ProductionCandidateOption,
  ProductionProjectOption,
  StageTimelineItemWithCandidate,
  WardrobeItemWithRelations,
} from '@/modules/production/services/production.service';
import { WARDROBE_STATUS_LABELS, WARDROBE_STATUSES } from '@/modules/production/schema';

const STATUS_TONE: Record<WardrobeStatus, Tone> = { PENDING: 'neutral', READY: 'info', ISSUED: 'accent', RETURNED: 'success' };

export default function WardrobeClient({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<ProductionProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<WardrobeItemWithRelations[]>([]);
  const [candidates, setCandidates] = useState<ProductionCandidateOption[]>([]);
  const [stageItems, setStageItems] = useState<StageTimelineItemWithCandidate[]>([]);
  const [name, setName] = useState('');
  const [designer, setDesigner] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [stageTimelineItemId, setStageTimelineItemId] = useState('');
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
    const [wardrobe, cand, stage] = await Promise.all([
      listWardrobeItemsAction(projectId),
      listProductionCandidateOptionsAction(projectId),
      listStageItemsAction(projectId),
    ]);
    if (wardrobe.success) setItems(wardrobe.data);
    if (cand.success) setCandidates(cand.data);
    if (stage.success) setStageItems(stage.data);
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [projectId, reload]);

  async function handleAdd() {
    if (!name.trim()) {
      toast.error('Ingresa el nombre de la prenda');
      return;
    }
    setSaving(true);
    try {
      const result = await createWardrobeItemAction({
        projectId,
        name,
        designer: designer || undefined,
        candidateId: candidateId || undefined,
        stageTimelineItemId: stageTimelineItemId || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setName('');
      setDesigner('');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(id: string, status: WardrobeStatus) {
    const result = await updateWardrobeItemAction(id, { status });
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function handleDelete(id: string) {
    const result = await deleteWardrobeItemAction(id);
    if (!result.success) toast.error(result.error);
    await reload();
  }

  const columns: DataTableColumn<WardrobeItemWithRelations>[] = [
    { id: 'name', header: 'Prenda', cell: (r) => <span className="font-medium">{r.name}</span> },
    { id: 'designer', header: 'Diseñador', cell: (r) => r.designer || '—' },
    { id: 'candidate', header: 'Candidata', cell: (r) => (r.candidate ? r.candidate.stageName || r.candidate.fullName : '—') },
    { id: 'block', header: 'Bloque', cell: (r) => (r.stageTimelineItem ? `#${r.stageTimelineItem.blockOrder} ${r.stageTimelineItem.title}` : '—') },
    {
      id: 'status',
      header: 'Estado',
      cell: (r) =>
        canWrite ? (
          <select
            className="h-8 rounded-lg border border-input bg-muted px-2 text-xs text-foreground"
            value={r.status}
            onChange={(e) => handleStatus(r.id, e.target.value as WardrobeStatus)}
          >
            {WARDROBE_STATUSES.map((status) => (
              <option key={status} value={status}>{WARDROBE_STATUS_LABELS[status]}</option>
            ))}
          </select>
        ) : (
          <StatusBadge tone={STATUS_TONE[r.status]}>{WARDROBE_STATUS_LABELS[r.status]}</StatusBadge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="wardrobe-project">Certamen</Label>
        <select
          id="wardrobe-project"
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
          <div>
            <Label htmlFor="wi-name">Prenda</Label>
            <Input id="wi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vestido de gala #4" />
          </div>
          <div>
            <Label htmlFor="wi-designer">Diseñador</Label>
            <Input id="wi-designer" value={designer} onChange={(e) => setDesigner(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="wi-candidate">Candidata</Label>
            <select id="wi-candidate" className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground" value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
              <option value="">—</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.stageName || c.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="wi-block">Bloque de escaleta</Label>
            <select id="wi-block" className="h-10 w-full rounded-xl border border-input bg-muted px-2 text-sm text-foreground" value={stageTimelineItemId} onChange={(e) => setStageTimelineItemId(e.target.value)}>
              <option value="">—</option>
              {stageItems.map((s) => (
                <option key={s.id} value={s.id}>#{s.blockOrder} {s.title}</option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Asignando...' : 'Asignar prenda'}</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={items}
        getRowId={(r) => r.id}
        emptyTitle="Sin prendas asignadas todavía"
        rowActions={canWrite ? (row) => (
          <Button type="button" size="icon-xs" variant="destructive" onClick={() => handleDelete(row.id)}>
            <Trash2 />
          </Button>
        ) : undefined}
      />
    </div>
  );
}
