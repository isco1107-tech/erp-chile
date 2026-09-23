'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { StageItemStatus } from '@prisma/client';
import { ArrowDown, ArrowUp, Copy, Lightbulb, Link2, ListVideo, Music, Pencil, Play, Printer, RotateCcw, Shirt, SkipForward, Square, Trash2, Video } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { computeRunOfShow, formatDrift, type RunOfShowBlock } from '@/lib/events/run-of-show';
import {
  chainStageScheduleAction,
  createStageItemAction,
  deleteStageItemAction,
  duplicateStageItemAction,
  listProductionCandidateOptionsAction,
  listProductionProjectOptionsAction,
  listStageItemsAction,
  moveStageItemAction,
  stageLiveAction,
  updateStageItemAction,
} from '@/modules/production/actions/production.actions';
import type { ProductionCandidateOption, ProductionProjectOption, StageTimelineItemWithCandidate } from '@/modules/production/services/production.service';
import { STAGE_ITEM_STATUS_LABELS, STAGE_SEGMENT_META, STAGE_SEGMENT_TYPES, type StageSegmentTypeKey } from '@/modules/production/schema';
import { cn } from '@/lib/utils';
import { LiveShowOverlay } from './LiveShowOverlay';
import { SEGMENT_STRIPE, STAGE_STATUS_TONE, candidateLabel, formatClock, toLocalInput } from './stage-ui';

/** Poll cada 5s (3s en modo show): no hay WebSocket/SSE en el repo — otra pantalla ve el cambio en segundos. */
const POLL_MS = 5000;
const LIVE_POLL_MS = 3000;

interface BlockForm {
  id?: string;
  segmentType: StageSegmentTypeKey;
  title: string;
  startTime: string;
  durationMinutes: number;
  candidateId: string;
  responsible: string;
  audioCue: string;
  lightingCue: string;
  videoCue: string;
  description: string;
}

const EMPTY_FORM: BlockForm = {
  segmentType: 'OTHER',
  title: '',
  startTime: '',
  durationMinutes: 5,
  candidateId: '',
  responsible: '',
  audioCue: '',
  lightingCue: '',
  videoCue: '',
  description: '',
};

export default function ProductionTimelineClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProductionProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<StageTimelineItemWithCandidate[]>([]);
  const [candidates, setCandidates] = useState<ProductionCandidateOption[]>([]);
  const [form, setForm] = useState<BlockForm>(EMPTY_FORM);
  const [showCues, setShowCues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);
  const [chainStart, setChainStart] = useState('');
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
    const result = await listStageItemsAction(projectId);
    if (result.success) {
      setItems(result.data);
      setLoadedAt(Date.now());
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
    listProductionCandidateOptionsAction(projectId).then((result) => {
      if (result.success) setCandidates(result.data);
    });
  }, [projectId, reload]);

  useEffect(() => {
    if (!projectId) return;
    const interval = setInterval(() => void reload(), live ? LIVE_POLL_MS : POLL_MS);
    return () => clearInterval(interval);
  }, [projectId, reload, live]);

  const state = useMemo(() => {
    const blocks: RunOfShowBlock[] = items.map((i) => ({
      id: i.id,
      startTime: new Date(i.startTime),
      durationMinutes: i.durationMinutes,
      status: i.status,
      actualStartedAt: i.actualStartedAt ? new Date(i.actualStartedAt) : null,
      actualEndedAt: i.actualEndedAt ? new Date(i.actualEndedAt) : null,
    }));
    return computeRunOfShow(blocks, new Date(loadedAt));
  }, [items, loadedAt]);

  const plannedMinutes = items.filter((i) => i.status !== 'SKIPPED').reduce((s, i) => s + i.durationMinutes, 0);
  const lastEnd = items.length > 0 ? new Date(new Date(items[items.length - 1]!.startTime).getTime() + items[items.length - 1]!.durationMinutes * 60_000) : null;
  const projectName = projects.find((p) => p.id === projectId)?.name ?? '';
  const setField = <K extends keyof BlockForm>(key: K, value: BlockForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  function startNewBlock() {
    setForm({ ...EMPTY_FORM, startTime: toLocalInput(lastEnd) });
  }

  function editBlock(item: StageTimelineItemWithCandidate) {
    setForm({
      id: item.id,
      segmentType: item.segmentType,
      title: item.title,
      startTime: toLocalInput(item.startTime),
      durationMinutes: item.durationMinutes,
      candidateId: item.candidateId ?? '',
      responsible: item.responsible ?? '',
      audioCue: item.audioCue ?? '',
      lightingCue: item.lightingCue ?? '',
      videoCue: item.videoCue ?? '',
      description: item.description ?? '',
    });
    setShowCues(Boolean(item.audioCue || item.lightingCue || item.videoCue));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseSegment(segmentType: StageSegmentTypeKey) {
    setForm((prev) => {
      const previousLabel = STAGE_SEGMENT_META[prev.segmentType].label;
      const meta = STAGE_SEGMENT_META[segmentType];
      return {
        ...prev,
        segmentType,
        // Solo precarga si el usuario no escribió un título propio.
        title: !prev.title || prev.title === previousLabel ? meta.label : prev.title,
        durationMinutes: prev.id ? prev.durationMinutes : meta.defaultMinutes,
      };
    });
  }

  async function handleSave() {
    if (!form.title.trim() || !form.startTime) {
      toast.error('Completa el título y la hora de inicio');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        startTime: new Date(form.startTime).toISOString(),
        durationMinutes: form.durationMinutes,
        candidateId: form.candidateId,
        segmentType: form.segmentType,
        responsible: form.responsible,
        audioCue: form.audioCue,
        lightingCue: form.lightingCue,
        videoCue: form.videoCue,
        description: form.description,
      };
      const result = form.id
        ? await updateStageItemAction(form.id, payload)
        : await createStageItemAction({ ...payload, projectId, candidateId: form.candidateId || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? 'Bloque actualizado' : 'Bloque agregado');
      setForm({ ...EMPTY_FORM, startTime: form.id ? '' : toLocalInput(new Date(new Date(form.startTime).getTime() + form.durationMinutes * 60_000)) });
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

  async function handleLive(id: string, action: 'start' | 'finish' | 'skip' | 'reset') {
    const result = await stageLiveAction(id, action);
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function handleDuplicate(id: string) {
    const result = await duplicateStageItemAction(id);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Duplicado');
    await reload();
  }

  async function handleDelete(id: string) {
    if (!(await confirm('¿Eliminar este bloque de la escaleta?'))) return;
    const result = await deleteStageItemAction(id);
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function handleChain() {
    const start = chainStart || toLocalInput(items[0]?.startTime);
    if (!start) return;
    const ok = await confirm({
      title: '¿Encadenar horarios?',
      description: 'Cada bloque va a empezar justo cuando termina el anterior, partiendo desde la hora indicada. Las duraciones no cambian.',
      confirmLabel: 'Encadenar',
    });
    if (!ok) return;
    const result = await chainStageScheduleAction({ projectId, firstStart: new Date(start).toISOString() });
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Horarios encadenados');
    await reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="prod-project">Certamen</Label>
          <select id="prod-project" className={cn(nativeSelectClass, 'min-w-[16rem]')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {projectId && (
            <Link href={`/dashboard/production/timeline/print?projectId=${projectId}`} target="_blank" className={buttonVariants({ variant: 'outline' })}>
              <Printer aria-hidden="true" />
              Imprimir escaleta
            </Link>
          )}
          <Button type="button" onClick={() => setLive(true)} disabled={!projectId}>
            <Play aria-hidden="true" />
            Modo show
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState title="Primero crea un certamen" description="La escaleta pertenece a un certamen o evento." action={<Link href="/dashboard/projects/new" className={buttonVariants()}>Crear certamen</Link>} />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Bloques" value={`${state.doneCount}/${items.length}`} icon={ListVideo} tone="accent" hint="al aire / total" trend={state.skippedCount > 0 ? `${state.skippedCount} omitidos` : undefined} />
            <KpiCard label="Duración planificada" value={`${Math.floor(plannedMinutes / 60)} h ${plannedMinutes % 60} min`} icon={ListVideo} tone="info" />
            <KpiCard label="Término planificado" value={state.plannedEnd ? formatClock(state.plannedEnd) : '—'} icon={ListVideo} tone="neutral" />
            <KpiCard
              label="Ritmo del show"
              value={formatDrift(state.driftMinutes)}
              icon={ListVideo}
              tone={state.driftMinutes > 5 ? 'danger' : state.driftMinutes > 0 ? 'warning' : 'success'}
              trend={state.projectedEnd ? `termina ${formatClock(state.projectedEnd)}` : undefined}
              hint="estimado"
            />
          </section>

          {canWrite && (
            <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{form.id ? 'Editar bloque' : 'Agregar bloque'}</h2>
                {form.id ? (
                  <Button type="button" size="sm" variant="ghost" onClick={startNewBlock}>
                    Cancelar edición
                  </Button>
                ) : (
                  !form.startTime &&
                  lastEnd && (
                    <Button type="button" size="sm" variant="ghost" onClick={startNewBlock}>
                      Continuar después del último bloque
                    </Button>
                  )
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="lg:col-span-2">
                  <Label htmlFor="stage-segment">Segmento</Label>
                  <select id="stage-segment" className={nativeSelectClass} value={form.segmentType} onChange={(e) => chooseSegment(e.target.value as StageSegmentTypeKey)}>
                    {STAGE_SEGMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {STAGE_SEGMENT_META[type].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-4">
                  <Label htmlFor="stage-title">Título del bloque</Label>
                  <Input id="stage-title" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Traje de baño — Grupo A" />
                </div>
                <div className="lg:col-span-2">
                  <Label htmlFor="stage-start">Hora de inicio</Label>
                  <Input id="stage-start" type="datetime-local" value={form.startTime} onChange={(e) => setField('startTime', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="stage-duration">Duración (min)</Label>
                  <Input id="stage-duration" type="number" min={1} max={600} value={form.durationMinutes} onChange={(e) => setField('durationMinutes', Number(e.target.value))} />
                </div>
                <div className="lg:col-span-2">
                  <Label htmlFor="stage-candidate">Candidata (opcional)</Label>
                  <select id="stage-candidate" className={nativeSelectClass} value={form.candidateId} onChange={(e) => setField('candidateId', e.target.value)}>
                    <option value="">—</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {candidateLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="stage-responsible">Pie / responsable</Label>
                  <Input id="stage-responsible" value={form.responsible} onChange={(e) => setField('responsible', e.target.value)} placeholder="Conductor" />
                </div>
              </div>
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setShowCues((v) => !v)}>
                {showCues ? 'Ocultar pies técnicos y notas' : 'Agregar pies técnicos (audio, luces, pantalla) y notas'}
              </button>
              {showCues && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label htmlFor="stage-audio">Audio</Label>
                    <Input id="stage-audio" value={form.audioCue} onChange={(e) => setField('audioCue', e.target.value)} placeholder="Pista 07 — fade in" />
                  </div>
                  <div>
                    <Label htmlFor="stage-lights">Luces</Label>
                    <Input id="stage-lights" value={form.lightingCue} onChange={(e) => setField('lightingCue', e.target.value)} placeholder="Cenital + seguidor" />
                  </div>
                  <div>
                    <Label htmlFor="stage-video">Pantalla / cámara</Label>
                    <Input id="stage-video" value={form.videoCue} onChange={(e) => setField('videoCue', e.target.value)} placeholder="LED: logo auspiciador" />
                  </div>
                  <div className="md:col-span-3">
                    <Label htmlFor="stage-notes">Notas de piso</Label>
                    <textarea id="stage-notes" className={textareaClass} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Guion, marcas en el escenario, orden de salida…" />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || !projectId}>
                  {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Agregar bloque'}
                </Button>
                {items.length > 1 && (
                  <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                    <Label htmlFor="chain-start" className="text-xs text-muted-foreground">
                      Encadenar desde
                    </Label>
                    <Input id="chain-start" type="datetime-local" className="h-7 w-auto" value={chainStart || toLocalInput(items[0]?.startTime)} onChange={(e) => setChainStart(e.target.value)} />
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleChain()}>
                      <Link2 aria-hidden="true" />
                      Encadenar horarios
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="space-y-2">
            {items.length === 0 && (
              <div className="rounded-lg border border-border bg-card">
                <EmptyState title="Sin bloques en la escaleta" description="Arma el show bloque a bloque: apertura, presentación, traje de baño, gala, preguntas, coronación." />
              </div>
            )}
            {items.map((item, index) => {
              const projected = state.projectedStartById[item.id];
              const shifted = projected && Math.abs(projected.getTime() - new Date(item.startTime).getTime()) >= 60_000;
              const readyLooks = item.wardrobeItems.filter((w) => w.status !== 'PENDING').length;
              const cues = [
                { icon: Music, value: item.audioCue, label: 'Audio' },
                { icon: Lightbulb, value: item.lightingCue, label: 'Luces' },
                { icon: Video, value: item.videoCue, label: 'Pantalla' },
              ].filter((c) => c.value);
              return (
                <article
                  key={item.id}
                  className={cn(
                    'relative flex flex-wrap items-center gap-3 overflow-hidden rounded-lg border bg-card py-3 pr-3 pl-4 text-sm shadow-card',
                    item.status === 'IN_PROGRESS' ? 'border-info ring-2 ring-info/30' : 'border-border',
                    (item.status === 'DONE' || item.status === 'SKIPPED') && 'opacity-70'
                  )}
                >
                  <span className={cn('absolute inset-y-0 left-0 w-1.5', SEGMENT_STRIPE[item.segmentType])} aria-hidden="true" />
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">#{item.blockOrder}</p>
                    <p className="font-mono text-base font-semibold tabular-nums">{formatClock(item.startTime)}</p>
                    {shifted && projected && <p className="font-mono text-[11px] text-warning tabular-nums">→ {formatClock(projected)}</p>}
                  </div>
                  <div className="min-w-[14rem] flex-1">
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {STAGE_SEGMENT_META[item.segmentType].label} · {item.durationMinutes} min
                      {item.candidate && ` · ${candidateLabel(item.candidate)}`}
                      {item.responsible && ` · Pie: ${item.responsible}`}
                    </p>
                    {(cues.length > 0 || item.wardrobeItems.length > 0) && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {cues.map((c) => (
                          <span key={c.label} className="inline-flex items-center gap-1" title={`${c.label}: ${c.value}`}>
                            <c.icon className="size-3" aria-hidden="true" />
                            <span className="max-w-[12rem] truncate">{c.value}</span>
                          </span>
                        ))}
                        {item.wardrobeItems.length > 0 && (
                          <span className={cn('inline-flex items-center gap-1', readyLooks < item.wardrobeItems.length && 'text-warning')}>
                            <Shirt className="size-3" aria-hidden="true" />
                            {readyLooks}/{item.wardrobeItems.length} looks listos
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {canWrite ? (
                    <select
                      aria-label="Estado del bloque"
                      className="h-8 rounded-lg border border-input bg-muted px-2 text-xs text-foreground"
                      value={item.status}
                      onChange={(e) => void handleStatus(item.id, e.target.value as StageItemStatus)}
                    >
                      {Object.entries(STAGE_ITEM_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge tone={STAGE_STATUS_TONE[item.status]}>{STAGE_ITEM_STATUS_LABELS[item.status]}</StatusBadge>
                  )}
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-1">
                      {item.status === 'PENDING' && (
                        <Button type="button" size="xs" variant="outline" onClick={() => void handleLive(item.id, 'start')} title="Poner al aire">
                          <Play />
                          Al aire
                        </Button>
                      )}
                      {item.status === 'IN_PROGRESS' && (
                        <Button type="button" size="xs" variant="outline" onClick={() => void handleLive(item.id, 'finish')}>
                          <Square />
                          Terminar
                        </Button>
                      )}
                      {item.status === 'PENDING' && (
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => void handleLive(item.id, 'skip')} aria-label="Omitir bloque" title="Omitir">
                          <SkipForward />
                        </Button>
                      )}
                      {(item.status === 'DONE' || item.status === 'SKIPPED') && (
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => void handleLive(item.id, 'reset')} aria-label="Volver a pendiente" title="Volver a pendiente">
                          <RotateCcw />
                        </Button>
                      )}
                      <Button type="button" size="icon-xs" variant="ghost" disabled={index === 0} onClick={() => void handleMove(item.id, 'up')} aria-label="Subir">
                        <ArrowUp />
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" disabled={index === items.length - 1} onClick={() => void handleMove(item.id, 'down')} aria-label="Bajar">
                        <ArrowDown />
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" onClick={() => editBlock(item)} aria-label="Editar">
                        <Pencil />
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" onClick={() => void handleDuplicate(item.id)} aria-label="Duplicar">
                        <Copy />
                      </Button>
                      <Button type="button" size="icon-xs" variant="destructive" onClick={() => void handleDelete(item.id)} aria-label="Eliminar">
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {live && projectId && <LiveShowOverlay projectId={projectId} projectName={projectName} items={items} canWrite={canWrite} onChanged={reload} onClose={() => setLive(false)} />}
    </div>
  );
}
