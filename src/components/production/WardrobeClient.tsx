'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { WardrobeStatus } from '@prisma/client';
import { AlarmClock, ChevronRight, Gem, Pencil, Plus, Shirt, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { formatShortDate } from '@/lib/intelligence/format';
import {
  createWardrobeItemAction,
  deleteWardrobeItemAction,
  generateWardrobePlanAction,
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
import {
  STAGE_SEGMENT_META,
  WARDROBE_NEXT_STATUS,
  WARDROBE_SOURCE_LABELS,
  WARDROBE_SOURCES,
  WARDROBE_STATUS_LABELS,
  WARDROBE_STATUSES,
} from '@/modules/production/schema';
import { cn } from '@/lib/utils';
import { candidateLabel, toLocalInput } from './stage-ui';

const STATUS_TONE: Record<WardrobeStatus, Tone> = { PENDING: 'neutral', READY: 'info', ISSUED: 'accent', RETURNED: 'success' };
const DAY_MS = 24 * 60 * 60 * 1000;

type SourceKey = (typeof WARDROBE_SOURCES)[number];

interface LookForm {
  id?: string;
  name: string;
  designer: string;
  candidateId: string;
  stageTimelineItemId: string;
  status: WardrobeStatus;
  source: SourceKey;
  size: string;
  color: string;
  valuation: number;
  fittingAt: string;
  returnDueAt: string;
  notes: string;
}

const EMPTY_LOOK: LookForm = {
  name: '',
  designer: '',
  candidateId: '',
  stageTimelineItemId: '',
  status: 'PENDING',
  source: 'PRODUCTION',
  size: '',
  color: '',
  valuation: 0,
  fittingAt: '',
  returnDueAt: '',
  notes: '',
};

/** Una prenda que hay que devolver (arriendo, diseñador, auspicio) y todavía no vuelve. */
function needsReturn(item: WardrobeItemWithRelations): boolean {
  return item.status !== 'RETURNED' && item.source !== 'PRODUCTION' && item.source !== 'CANDIDATE_OWN';
}

export default function WardrobeClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProductionProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<WardrobeItemWithRelations[]>([]);
  const [candidates, setCandidates] = useState<ProductionCandidateOption[]>([]);
  const [stageItems, setStageItems] = useState<StageTimelineItemWithCandidate[]>([]);
  const [view, setView] = useState<'candidates' | 'table'>('candidates');
  const [statusFilter, setStatusFilter] = useState<WardrobeStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<SourceKey | ''>('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LookForm>(EMPTY_LOOK);
  const [saving, setSaving] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    listProductionProjectOptionsAction().then((result) => {
      if (result.success) {
        setProjects(result.data);
        const wanted = searchParams.get('projectId');
        const initial = result.data.find((p) => p.id === wanted) ?? result.data[0];
        if (initial) setProjectId(initial.id);
      }
    });
  }, [searchParams]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [wardrobe, cand, stage] = await Promise.all([listWardrobeItemsAction(projectId), listProductionCandidateOptionsAction(projectId), listStageItemsAction(projectId)]);
    if (wardrobe.success) setItems(wardrobe.data);
    if (cand.success) setCandidates(cand.data);
    if (stage.success) setStageItems(stage.data);
    setLoadedAt(Date.now());
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (sourceFilter && item.source !== sourceFilter) return false;
      if (!q) return true;
      return [item.name, item.designer, item.candidate?.fullName, item.candidate?.stageName, item.stageTimelineItem?.title, item.color].some((t) => t?.toLowerCase().includes(q));
    });
  }, [items, statusFilter, sourceFilter, search]);

  const stats = useMemo(() => {
    const now = loadedAt;
    const overdueReturns = items.filter((i) => needsReturn(i) && i.returnDueAt && new Date(i.returnDueAt).getTime() < now);
    const upcomingFittings = items.filter((i) => i.fittingAt && new Date(i.fittingAt).getTime() >= now - DAY_MS && new Date(i.fittingAt).getTime() <= now + 3 * DAY_MS);
    return {
      total: items.length,
      pending: items.filter((i) => i.status === 'PENDING').length,
      ready: items.filter((i) => i.status === 'READY' || i.status === 'ISSUED').length,
      toReturn: items.filter(needsReturn).length,
      value: items.reduce((s, i) => s + (i.valuation ?? 0), 0),
      overdueReturns,
      upcomingFittings,
    };
  }, [items, loadedAt]);

  const byCandidate = useMemo(() => {
    const groups = new Map<string, { label: string; number: number | null; items: WardrobeItemWithRelations[] }>();
    for (const item of filtered) {
      const key = item.candidate?.id ?? '—';
      const group = groups.get(key) ?? { label: item.candidate ? candidateLabel(item.candidate) : 'Sin candidata asignada', number: item.candidate?.candidateNumber ?? null, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.entries()].sort(([, a], [, b]) => (a.number ?? 9999) - (b.number ?? 9999) || a.label.localeCompare(b.label, 'es-CL'));
  }, [filtered]);

  function openNew(preset: Partial<LookForm> = {}) {
    setForm({ ...EMPTY_LOOK, ...preset });
    setFormOpen(true);
  }

  function openEdit(item: WardrobeItemWithRelations) {
    setForm({
      id: item.id,
      name: item.name,
      designer: item.designer ?? '',
      candidateId: item.candidateId ?? '',
      stageTimelineItemId: item.stageTimelineItemId ?? '',
      status: item.status,
      source: item.source,
      size: item.size ?? '',
      color: item.color ?? '',
      valuation: item.valuation ?? 0,
      fittingAt: toLocalInput(item.fittingAt),
      returnDueAt: toLocalInput(item.returnDueAt),
      notes: item.notes ?? '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error('Ponle un nombre a la prenda');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        designer: form.designer,
        candidateId: form.candidateId,
        stageTimelineItemId: form.stageTimelineItemId,
        status: form.status,
        source: form.source,
        size: form.size,
        color: form.color,
        valuation: form.valuation > 0 ? form.valuation : null,
        fittingAt: form.fittingAt ? new Date(form.fittingAt).toISOString() : null,
        returnDueAt: form.returnDueAt ? new Date(form.returnDueAt).toISOString() : null,
        notes: form.notes,
      };
      const result = form.id
        ? await updateWardrobeItemAction(form.id, payload)
        : await createWardrobeItemAction({ ...payload, projectId, candidateId: form.candidateId || undefined, stageTimelineItemId: form.stageTimelineItemId || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? 'Look actualizado' : 'Look agregado');
      setFormOpen(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: WardrobeStatus) {
    const result = await updateWardrobeItemAction(id, { status });
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function remove(item: WardrobeItemWithRelations) {
    if (!(await confirm({ title: `¿Eliminar "${item.name}"?`, confirmLabel: 'Eliminar' }))) return;
    const result = await deleteWardrobeItemAction(item.id);
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function generatePlan() {
    const ok = await confirm({
      title: '¿Generar el plan de looks?',
      description: 'Crea un look pendiente por cada candidata oficial en cada bloque de la escaleta que requiere vestuario (opening, traje de baño, gala, típico). No duplica los que ya existen.',
      confirmLabel: 'Generar',
    });
    if (!ok) return;
    const result = await generateWardrobePlanAction(projectId);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Plan generado');
    await reload();
  }

  function LookRow({ item }: { item: WardrobeItemWithRelations }) {
    const next = WARDROBE_NEXT_STATUS[item.status];
    const overdue = needsReturn(item) && item.returnDueAt && new Date(item.returnDueAt).getTime() < loadedAt;
    return (
      <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <div className="min-w-[12rem] flex-1">
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.stageTimelineItem ? `#${item.stageTimelineItem.blockOrder} ${item.stageTimelineItem.title}` : 'Sin bloque'}
            {` · ${WARDROBE_SOURCE_LABELS[item.source]}`}
            {item.designer && ` · ${item.designer}`}
            {item.size && ` · Talla ${item.size}`}
            {item.color && ` · ${item.color}`}
            {item.valuation ? ` · ${formatCurrency(item.valuation)}` : ''}
          </p>
          {(item.fittingAt || item.returnDueAt) && (
            <p className="text-[11px] text-muted-foreground">
              {item.fittingAt && `Prueba ${formatShortDate(item.fittingAt)}`}
              {item.fittingAt && item.returnDueAt && ' · '}
              {item.returnDueAt && <span className={cn(overdue && 'font-medium text-danger')}>Devolver {formatShortDate(item.returnDueAt)}</span>}
            </p>
          )}
        </div>
        <StatusBadge tone={STATUS_TONE[item.status]}>{WARDROBE_STATUS_LABELS[item.status]}</StatusBadge>
        {canWrite && (
          <div className="flex items-center gap-1">
            {next && (
              <Button type="button" size="xs" variant="outline" onClick={() => void setStatus(item.id, next)} title={`Marcar como ${WARDROBE_STATUS_LABELS[next].toLowerCase()}`}>
                <ChevronRight />
                {WARDROBE_STATUS_LABELS[next]}
              </Button>
            )}
            {item.status === 'RETURNED' && (
              <Button type="button" size="icon-xs" variant="ghost" onClick={() => void setStatus(item.id, 'ISSUED')} aria-label="Volver a entregada">
                <Undo2 />
              </Button>
            )}
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => openEdit(item)} aria-label="Editar">
              <Pencil />
            </Button>
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => void remove(item)} aria-label="Eliminar">
              <Trash2 />
            </Button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="wardrobe-project">Certamen</Label>
          <select id="wardrobe-project" className={cn(nativeSelectClass, 'min-w-[16rem]')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        {canWrite && projectId && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void generatePlan()}>
              <Sparkles aria-hidden="true" />
              Generar plan de looks
            </Button>
            <Button type="button" onClick={() => openNew()}>
              <Plus aria-hidden="true" />
              Nuevo look
            </Button>
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState title="Primero crea un certamen" action={<Link href="/dashboard/projects/new" className={buttonVariants()}>Crear certamen</Link>} />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Looks" value={String(stats.total)} icon={Shirt} tone="accent" trend={`${stats.pending} pendientes`} hint="por preparar" />
            <KpiCard label="Listos o entregados" value={String(stats.ready)} icon={Shirt} tone="success" />
            <KpiCard label="Por devolver" value={String(stats.toReturn)} icon={Undo2} tone={stats.overdueReturns.length > 0 ? 'danger' : 'warning'} trend={stats.overdueReturns.length > 0 ? `${stats.overdueReturns.length} vencidas` : undefined} hint="atrasadas" />
            <KpiCard label="Valor declarado" value={formatCurrency(stats.value)} icon={Gem} tone="info" />
          </section>

          {(stats.overdueReturns.length > 0 || stats.upcomingFittings.length > 0) && (
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="flex items-center gap-2 font-medium">
                <AlarmClock className="size-4" aria-hidden="true" />
                Atención de vestuario
              </p>
              {stats.overdueReturns.length > 0 && <p>Devoluciones vencidas: {stats.overdueReturns.map((i) => i.name).slice(0, 5).join(', ')}{stats.overdueReturns.length > 5 ? '…' : ''}</p>}
              {stats.upcomingFittings.length > 0 && (
                <p>
                  Pruebas próximas: {stats.upcomingFittings.map((i) => `${i.candidate ? candidateLabel(i.candidate) : i.name} (${formatShortDate(i.fittingAt as Date)})`).slice(0, 5).join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar prenda, candidata, diseñador…" className="max-w-xs" aria-label="Buscar looks" />
            <select aria-label="Estado" className={cn(nativeSelectClass, 'w-auto')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as WardrobeStatus | '')}>
              <option value="">Todo estado</option>
              {WARDROBE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {WARDROBE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select aria-label="Origen" className={cn(nativeSelectClass, 'w-auto')} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceKey | '')}>
              <option value="">Todo origen</option>
              {WARDROBE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {WARDROBE_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            <div className="ml-auto inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
              {(
                [
                  ['candidates', 'Por candidata'],
                  ['table', 'Por bloque'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setView(value)} className={cn('rounded-md px-3 py-1', view === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-card">
              <EmptyState
                title={items.length === 0 ? 'Sin looks todavía' : 'Sin resultados con estos filtros'}
                description={items.length === 0 ? 'Arma la escaleta con sus segmentos y usa "Generar plan de looks" para crear uno por candidata y bloque, o agrégalos uno a uno.' : undefined}
              />
            </div>
          ) : view === 'candidates' ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {byCandidate.map(([key, group]) => {
                const done = group.items.filter((i) => i.status !== 'PENDING').length;
                return (
                  <section key={key} className="rounded-lg border border-border bg-card shadow-card">
                    <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <h2 className="text-sm font-semibold">{group.label}</h2>
                      <span className="text-xs text-muted-foreground">
                        {done}/{group.items.length} listos
                      </span>
                    </header>
                    <ul className="divide-y divide-border">
                      {group.items.map((item) => (
                        <LookRow key={item.id} item={item} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {[...stageItems.map((s) => ({ id: s.id, title: `#${s.blockOrder} ${s.title}`, sub: STAGE_SEGMENT_META[s.segmentType].label })), { id: '', title: 'Sin bloque asignado', sub: '' }].map((block) => {
                const blockItems = filtered.filter((i) => (i.stageTimelineItemId ?? '') === block.id);
                if (blockItems.length === 0) return null;
                return (
                  <section key={block.id || 'none'} className="rounded-lg border border-border bg-card shadow-card">
                    <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <h2 className="text-sm font-semibold">
                        {block.title} {block.sub && <span className="font-normal text-muted-foreground">· {block.sub}</span>}
                      </h2>
                      <span className="text-xs text-muted-foreground">{blockItems.length} look(s)</span>
                    </header>
                    <ul className="divide-y divide-border">
                      {blockItems.map((item) => (
                        <LookRow key={item.id} item={item} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar look' : 'Nuevo look'}</DialogTitle>
            <DialogDescription>Una prenda o accesorio asignado a una candidata para un bloque del show.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="look-name">Prenda / look</Label>
                <Input id="look-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vestido de gala azul con pedrería" />
              </div>
              <div>
                <Label htmlFor="look-candidate">Candidata</Label>
                <select id="look-candidate" className={nativeSelectClass} value={form.candidateId} onChange={(e) => setForm({ ...form, candidateId: e.target.value })}>
                  <option value="">—</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {candidateLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="look-block">Bloque de la escaleta</Label>
                <select id="look-block" className={nativeSelectClass} value={form.stageTimelineItemId} onChange={(e) => setForm({ ...form, stageTimelineItemId: e.target.value })}>
                  <option value="">—</option>
                  {stageItems.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.blockOrder} {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="look-source">Origen</Label>
                <select id="look-source" className={nativeSelectClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as SourceKey })}>
                  {WARDROBE_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {WARDROBE_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="look-designer">Diseñador / proveedor</Label>
                <Input id="look-designer" value={form.designer} onChange={(e) => setForm({ ...form, designer: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="look-size">Talla</Label>
                  <Input id="look-size" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="S / 38" />
                </div>
                <div>
                  <Label htmlFor="look-color">Color</Label>
                  <Input id="look-color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="look-value">Valor declarado</Label>
                <CurrencyInput id="look-value" value={form.valuation} onChange={(v) => setForm({ ...form, valuation: v })} />
              </div>
              <div>
                <Label htmlFor="look-fitting">Prueba de vestuario</Label>
                <Input id="look-fitting" type="datetime-local" value={form.fittingAt} onChange={(e) => setForm({ ...form, fittingAt: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="look-return">Devolver a más tardar</Label>
                <Input id="look-return" type="datetime-local" value={form.returnDueAt} onChange={(e) => setForm({ ...form, returnDueAt: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="look-status">Estado</Label>
                <select id="look-status" className={nativeSelectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as WardrobeStatus })}>
                  {WARDROBE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {WARDROBE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="look-notes">Notas</Label>
                <textarea id="look-notes" className={textareaClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ajustes pendientes, accesorios, cuidado de la prenda…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Agregar look'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
