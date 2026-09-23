'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Check, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { startOfTodaySantiago, startOfTomorrowSantiago } from '@/lib/chile/timezone';
import { formatShortDate } from '@/lib/intelligence/format';
import {
  getCrmLookupsAction,
  listTasksAction,
  rescheduleActivityAction,
  setActivityCompletedAction,
  type CrmAgenda,
  type CrmLookups,
} from '@/modules/crm/actions/crm.actions';
import { ACTIVITY_TYPE_LABELS, DEAL_TYPE_LABELS } from '@/modules/crm/schema';
import type { CrmTask } from '@/modules/crm/services/crm.service';
import { cn } from '@/lib/utils';
import { fromDateInput, toDateInput } from './crm-ui';
import { useOpportunityDialogs } from './useOpportunityDialogs';

const DAY_MS = 24 * 60 * 60 * 1000;

type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'undated' | 'done';

const BUCKETS: Array<{ key: BucketKey; title: string; tone: string }> = [
  { key: 'overdue', title: 'Vencidas', tone: 'text-danger' },
  { key: 'today', title: 'Hoy', tone: 'text-foreground' },
  { key: 'tomorrow', title: 'Mañana', tone: 'text-foreground' },
  { key: 'week', title: 'Próximos 7 días', tone: 'text-foreground' },
  { key: 'later', title: 'Más adelante', tone: 'text-muted-foreground' },
  { key: 'undated', title: 'Sin fecha', tone: 'text-muted-foreground' },
  { key: 'done', title: 'Completadas (última semana)', tone: 'text-muted-foreground' },
];

function bucketOf(task: CrmTask, now: Date): BucketKey {
  if (task.completedAt) return 'done';
  if (!task.dueAt) return 'undated';
  const due = new Date(task.dueAt).getTime();
  const today = startOfTodaySantiago(now).getTime();
  const tomorrow = startOfTomorrowSantiago(now).getTime();
  if (due < today) return 'overdue';
  if (due < tomorrow) return 'today';
  if (due < tomorrow + DAY_MS) return 'tomorrow';
  if (due < today + 8 * DAY_MS) return 'week';
  return 'later';
}

/**
 * Agenda comercial: todas las actividades de seguimiento del equipo (o solo
 * las de mis negocios), agrupadas por urgencia. Es la pantalla con la que se
 * parte el día — lo vencido arriba, en rojo.
 */
export function CrmTasksClient({ canWrite }: { canWrite: boolean }) {
  const [agenda, setAgenda] = useState<CrmAgenda | null>(null);
  const [lookups, setLookups] = useState<CrmLookups | null>(null);
  const [mine, setMine] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const [tasks, lk] = await Promise.all([listTasksAction({ mine }), getCrmLookupsAction()]);
    if (tasks.success) {
      setAgenda(tasks.data);
      setLoadedAt(Date.now());
    } else toast.error(tasks.error);
    if (lk.success) setLookups(lk.data);
  }, [mine]);

  useEffect(() => {
    void load();
  }, [load]);

  const { openDetail, dialogs } = useOpportunityDialogs({ lookups, canWrite, onChanged: () => void load() });

  const grouped = useMemo(() => {
    const map = new Map<BucketKey, CrmTask[]>(BUCKETS.map((b) => [b.key, []]));
    if (!agenda) return map;
    const now = new Date(loadedAt);
    for (const task of agenda.tasks) map.get(bucketOf(task, now))?.push(task);
    return map;
  }, [agenda, loadedAt]);

  async function complete(task: CrmTask, done: boolean) {
    const result = await setActivityCompletedAction(task.id, done);
    if (!result.success) toast.error(result.error);
    else if (done) toast.success('Actividad completada');
    await load();
  }

  async function reschedule(task: CrmTask, dueAt: string | null) {
    const result = await rescheduleActivityAction(task.id, { dueAt });
    if (!result.success) toast.error(result.error);
    await load();
  }

  if (!agenda) return <p className="text-sm text-muted-foreground">Cargando agenda…</p>;
  const count = (key: BucketKey) => grouped.get(key)?.length ?? 0;
  const pending = agenda.tasks.filter((t) => !t.completedAt).length;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pendientes" value={String(pending)} icon={CalendarClock} tone="accent" />
        <KpiCard label="Vencidas" value={String(count('overdue'))} icon={CalendarClock} tone={count('overdue') > 0 ? 'danger' : 'success'} />
        <KpiCard label="Para hoy" value={String(count('today'))} icon={CalendarClock} tone="warning" />
        <KpiCard label="Completadas esta semana" value={String(count('done'))} icon={CheckCircle2} tone="success" />
      </section>

      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {[
          { v: true, label: 'Mis negocios' },
          { v: false, label: 'Todo el equipo' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setMine(option.v)}
            className={cn('rounded-md px-3 py-1', mine === option.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {agenda.tasks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState title="Agenda al día" description="No hay actividades de seguimiento. Agéndalas desde el detalle de cada oportunidad." />
        </div>
      ) : (
        <div className="space-y-5">
          {BUCKETS.map((bucket) => {
            const tasks = grouped.get(bucket.key) ?? [];
            if (tasks.length === 0) return null;
            return (
              <section key={bucket.key} aria-label={bucket.title}>
                <h2 className={cn('mb-2 text-sm font-semibold', bucket.tone)}>
                  {bucket.title} <span className="font-normal text-muted-foreground">· {tasks.length}</span>
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border bg-card shadow-card">
                  {tasks.map((task) => {
                    const done = task.completedAt !== null;
                    const party = task.opportunity.contact?.razonSocial ?? task.opportunity.prospectName ?? '';
                    return (
                      <li key={task.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => void complete(task, !done)}
                          aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
                          className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors', done ? 'border-success bg-success text-white' : 'border-input hover:border-foreground')}
                        >
                          {done && <Check className="size-3" />}
                        </button>
                        <div className="min-w-[14rem] flex-1">
                          <p className={cn('text-sm', done ? 'text-muted-foreground line-through' : 'text-foreground')}>{task.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{ACTIVITY_TYPE_LABELS[task.type]}</span>
                            {' · '}
                            <button type="button" className="hover:text-foreground hover:underline" onClick={() => openDetail(task.opportunity.id)}>
                              {task.opportunity.title}
                            </button>
                            {party && ` · ${party}`}
                            {` · ${DEAL_TYPE_LABELS[task.opportunity.dealType]}`}
                            {task.opportunity.owner && ` · ${task.opportunity.owner.name}`}
                          </p>
                        </div>
                        <span className={cn('text-xs tabular-nums', bucket.key === 'overdue' ? 'font-medium text-danger' : 'text-muted-foreground')}>
                          {task.dueAt ? formatShortDate(task.dueAt) : 'Sin fecha'}
                        </span>
                        {canWrite && !done && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void reschedule(task, new Date(startOfTomorrowSantiago(new Date(loadedAt)).getTime() + 12 * 60 * 60 * 1000).toISOString())}
                              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Mañana
                            </button>
                            <button
                              type="button"
                              onClick={() => void reschedule(task, new Date(startOfTodaySantiago(new Date(loadedAt)).getTime() + 7 * DAY_MS + 12 * 60 * 60 * 1000).toISOString())}
                              className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              +1 semana
                            </button>
                            <input
                              type="date"
                              aria-label="Reprogramar"
                              value={toDateInput(task.dueAt)}
                              onChange={(e) => void reschedule(task, fromDateInput(e.target.value))}
                              className="h-6 rounded-md border border-border bg-transparent px-1 text-xs text-muted-foreground"
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {dialogs}
    </div>
  );
}
