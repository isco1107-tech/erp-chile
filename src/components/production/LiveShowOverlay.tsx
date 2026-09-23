'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lightbulb, Music, SkipForward, Square, StepForward, Video, X } from 'lucide-react';
import { computeRunOfShow, formatCountdown, formatDrift, type RunOfShowBlock } from '@/lib/events/run-of-show';
import { advanceShowAction, stageLiveAction } from '@/modules/production/actions/production.actions';
import { STAGE_SEGMENT_META, WARDROBE_STATUS_LABELS } from '@/modules/production/schema';
import type { StageTimelineItemWithCandidate } from '@/modules/production/services/production.service';
import { cn } from '@/lib/utils';
import { SEGMENT_STRIPE, candidateLabel, formatClock } from './stage-ui';

interface Props {
  projectId: string;
  projectName: string;
  items: StageTimelineItemWithCandidate[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

function Cues({ item, large = false }: { item: StageTimelineItemWithCandidate; large?: boolean }) {
  const cues = [
    { icon: Music, label: 'Audio', value: item.audioCue },
    { icon: Lightbulb, label: 'Luces', value: item.lightingCue },
    { icon: Video, label: 'Pantalla / cámara', value: item.videoCue },
  ].filter((c) => c.value);
  if (cues.length === 0) return null;
  return (
    <ul className={cn('grid gap-2', large ? 'sm:grid-cols-3' : '')}>
      {cues.map((cue) => (
        <li key={cue.label} className="rounded-lg border border-background/15 bg-background/5 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-background/60 uppercase">
            <cue.icon className="size-3.5" aria-hidden="true" />
            {cue.label}
          </p>
          <p className={cn('mt-0.5', large ? 'text-base' : 'text-sm')}>{cue.value}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pantalla de control en vivo para el director de piso: bloque al aire con
 * cuenta regresiva, atraso acumulado, lo que viene y sus pies técnicos. Sin
 * permiso de escritura queda como monitor de solo lectura (para una pantalla
 * de backstage). El reloj corre local cada segundo; los datos se refrescan
 * con el mismo sondeo del editor.
 */
export function LiveShowOverlay({ projectId, projectName, items, canWrite, onChanged, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blocks: RunOfShowBlock[] = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        startTime: new Date(i.startTime),
        durationMinutes: i.durationMinutes,
        status: i.status,
        actualStartedAt: i.actualStartedAt ? new Date(i.actualStartedAt) : null,
        actualEndedAt: i.actualEndedAt ? new Date(i.actualEndedAt) : null,
      })),
    [items]
  );
  const state = computeRunOfShow(blocks, new Date(now));
  const current = items.find((i) => i.id === state.currentId) ?? null;
  const next = items.find((i) => i.id === state.nextId) ?? null;
  const nextIndex = next ? items.indexOf(next) : -1;
  const upcoming = nextIndex === -1 ? [] : items.slice(nextIndex + 1).filter((i) => i.status === 'PENDING').slice(0, 4);
  const remaining = state.currentRemainingSeconds;
  const elapsedPct = current && remaining !== null ? Math.min(100, Math.max(0, ((current.durationMinutes * 60 - remaining) / (current.durationMinutes * 60)) * 100)) : 0;

  async function run(fn: () => Promise<{ success: boolean; error?: string; message?: string }>) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.success) toast.error(result.error ?? 'No se pudo actualizar la escaleta');
      else if (result.message) toast.message(result.message);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-foreground text-background" role="dialog" aria-modal="true" aria-label="Modo show">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-background/10 px-6 py-3">
        <p className="text-xs font-semibold tracking-[0.2em] text-background/60 uppercase">Modo show · {projectName}</p>
        <p className="font-mono text-lg tabular-nums">{new Date(now).toLocaleTimeString('es-CL')}</p>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-semibold',
            state.driftMinutes > 5 ? 'bg-danger text-white' : state.driftMinutes > 0 ? 'bg-warning text-white' : 'bg-success text-white'
          )}
        >
          {formatDrift(state.driftMinutes)}
        </span>
        <p className="text-sm text-background/70">
          {state.doneCount}/{state.totalCount} bloques
          {state.projectedEnd && ` · término estimado ${formatClock(state.projectedEnd)}`}
          {state.plannedEnd && state.projectedEnd && state.plannedEnd.getTime() !== state.projectedEnd.getTime() && ` (plan ${formatClock(state.plannedEnd)})`}
        </p>
        <button type="button" onClick={onClose} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-background/20 px-3 py-1.5 text-sm hover:bg-background/10">
          <X className="size-4" aria-hidden="true" />
          Salir (Esc)
        </button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Al aire" className="flex flex-col gap-5">
          {current ? (
            <>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.25em] text-danger uppercase">
                  <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                  Al aire
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-background/70">
                  <span className={cn('h-3 w-1.5 rounded-full', SEGMENT_STRIPE[current.segmentType])} aria-hidden="true" />
                  #{current.blockOrder} · {STAGE_SEGMENT_META[current.segmentType].label}
                  {current.responsible && ` · Pie: ${current.responsible}`}
                </p>
                <h2 className="mt-1 text-4xl leading-tight font-bold sm:text-5xl">{current.title}</h2>
                {current.candidate && <p className="mt-2 text-2xl text-chart-1">{candidateLabel(current.candidate)}</p>}
              </div>
              <div>
                <p className={cn('font-mono text-7xl font-bold tabular-nums sm:text-8xl', remaining !== null && remaining < 0 ? 'text-danger' : remaining !== null && remaining < 60 ? 'text-warning' : '')}>
                  {remaining !== null ? formatCountdown(remaining) : '--:--'}
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background/15" aria-hidden="true">
                  <div className={cn('h-2 rounded-full transition-[width]', remaining !== null && remaining < 0 ? 'bg-danger' : 'bg-chart-1')} style={{ width: `${elapsedPct}%` }} />
                </div>
                <p className="mt-1 text-sm text-background/60">Duración planificada {current.durationMinutes} min · partió {current.actualStartedAt ? formatClock(current.actualStartedAt) : '—'}</p>
              </div>
              <Cues item={current} large />
              {current.description && <p className="rounded-lg bg-background/5 px-4 py-3 text-base whitespace-pre-line">{current.description}</p>}
              {current.wardrobeItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-background/60 uppercase">Vestuario del bloque</p>
                  <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {current.wardrobeItems.map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-2 rounded-md bg-background/5 px-3 py-1.5 text-sm">
                        <span className="truncate">{w.candidate ? candidateLabel(w.candidate) : w.name}</span>
                        <span className={cn('shrink-0 text-xs', w.status === 'PENDING' ? 'text-warning' : 'text-background/60')}>{WARDROBE_STATUS_LABELS[w.status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col justify-center">
              <p className="text-sm font-semibold tracking-[0.25em] text-background/60 uppercase">{state.doneCount > 0 && !next ? 'Show terminado' : 'En espera'}</p>
              <h2 className="mt-2 text-4xl font-bold">{next ? `Próximo: ${next.title}` : state.totalCount === 0 ? 'La escaleta está vacía' : 'No quedan bloques pendientes'}</h2>
              {next && <p className="mt-2 text-lg text-background/70">Programado {formatClock(next.startTime)}</p>}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section aria-label="Siguiente" className="rounded-xl border border-background/15 p-4">
            <p className="text-xs font-semibold tracking-[0.2em] text-background/60 uppercase">Siguiente</p>
            {next ? (
              <>
                <p className="mt-2 text-sm text-background/70">
                  #{next.blockOrder} · {STAGE_SEGMENT_META[next.segmentType].label} · {formatClock(state.projectedStartById[next.id] ?? next.startTime)} · {next.durationMinutes} min
                </p>
                <p className="text-2xl font-semibold">{next.title}</p>
                {next.candidate && <p className="text-chart-1">{candidateLabel(next.candidate)}</p>}
                {next.responsible && <p className="mt-1 text-sm text-background/70">Pie: {next.responsible}</p>}
                <div className="mt-3">
                  <Cues item={next} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-background/60">Nada más por salir.</p>
            )}
          </section>
          {upcoming.length > 0 && (
            <section aria-label="Después" className="rounded-xl border border-background/15 p-4">
              <p className="text-xs font-semibold tracking-[0.2em] text-background/60 uppercase">Después</p>
              <ol className="mt-2 space-y-2">
                {upcoming.map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <span className="w-12 shrink-0 font-mono text-sm tabular-nums text-background/60">{formatClock(state.projectedStartById[item.id] ?? item.startTime)}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{item.title}</span>
                      <span className="block text-xs text-background/50">{STAGE_SEGMENT_META[item.segmentType].label} · {item.durationMinutes} min</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>

      {canWrite && (
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-background/10 bg-foreground px-6 py-4">
          <button
            type="button"
            disabled={busy || (!current && !next)}
            onClick={() => void run(() => advanceShowAction(projectId))}
            className="inline-flex items-center gap-2 rounded-lg bg-chart-1 px-6 py-3 text-lg font-semibold text-foreground disabled:opacity-40"
          >
            <StepForward className="size-5" aria-hidden="true" />
            {current ? 'Siguiente bloque' : 'Iniciar show'}
          </button>
          {current && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => stageLiveAction(current.id, 'finish'))}
              className="inline-flex items-center gap-2 rounded-lg border border-background/25 px-4 py-3 hover:bg-background/10 disabled:opacity-40"
            >
              <Square className="size-4" aria-hidden="true" />
              Terminar bloque
            </button>
          )}
          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => stageLiveAction(next.id, 'skip'))}
              className="inline-flex items-center gap-2 rounded-lg border border-background/25 px-4 py-3 hover:bg-background/10 disabled:opacity-40"
            >
              <SkipForward className="size-4" aria-hidden="true" />
              Omitir el siguiente
            </button>
          )}
          <p className="ml-auto text-xs text-background/50">Otras pantallas ven el cambio en segundos.</p>
        </footer>
      )}
    </div>
  );
}
