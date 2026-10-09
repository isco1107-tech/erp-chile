'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, MapPin, Paperclip, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { addDays, gridRange, longDate, monthTitle, periodOf, shiftMonth, shortDate, timeRangeLabel, weekRange, weekTitle } from '@/lib/academy/calendar';
import { listGroupsAction } from '@/modules/academy/actions/academy.actions';
import { getCalendarAction, getCalendarSummaryAction } from '@/modules/academy/actions/academy-class.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import type { CalendarSummary, SessionRow } from '@/modules/academy/services/academy-calendar.service';
import { MonthView, WeekView } from './CalendarViews';
import ScheduleDialog, { type ScheduleTarget } from './ScheduleDialog';
import SessionDialog, { type SessionTab } from './SessionDialog';
import { ROLL_TONE, buildToneMap, rollLabel, sessionHeading, sessionRoll, toneOf } from './calendar-style';
import { todayIso } from './shared';

type View = 'month' | 'week';

interface OpenSession {
  id: string;
  groupId: string;
  tab?: SessionTab;
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: typeof CalendarDays; label: string; value: string; hint: string; tone?: 'warning' }) {
  return (
    <article className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-accent text-accent-foreground')}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold leading-tight tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </article>
  );
}

/**
 * Inicio de la academia: un calendario grande para ver y programar las clases
 * (mes o semana con horas). Desde cada clase se pasa lista, se sube material y
 * se envía al correo de las alumnas; a un costado, lo de hoy, lo que falta y lo
 * que viene.
 */
export default function CalendarPanel({ canWrite, onGoToGroups }: { canWrite: boolean; onGoToGroups: () => void }) {
  const [today, setToday] = useState<string | null>(null);
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState('');
  const [selected, setSelected] = useState('');
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [summary, setSummary] = useState<CalendarSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleTarget | null>(null);
  const [open, setOpen] = useState<OpenSession | null>(null);
  const [lastTimes, setLastTimes] = useState({ startTime: '10:00', endTime: '12:00' });

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const closeSession = useCallback(() => setOpen(null), []);

  // El día de hoy se lee en el navegador (zona horaria de quien mira), ya montado, para no desajustar el HTML del servidor.
  useEffect(() => {
    const now = todayIso();
    setToday(now);
    setAnchor(now);
    setSelected(now);
  }, []);

  useEffect(() => {
    let active = true;
    void listGroupsAction().then((result) => {
      if (!active) return;
      if (!result.success) return void toast.error(result.error);
      setGroups(result.data);
    });
    return () => {
      active = false;
    };
  }, [version]);

  const range = useMemo(() => (anchor ? (view === 'month' ? gridRange(periodOf(anchor)) : weekRange(anchor)) : null), [anchor, view]);

  useEffect(() => {
    if (!range) return;
    let active = true;
    async function load(from: string, to: string) {
      setLoading(true);
      const result = await getCalendarAction({ from, to });
      if (!active) return;
      setLoading(false);
      if (!result.success) return void toast.error(result.error);
      setSessions(result.data);
    }
    void load(range.from, range.to);
    return () => {
      active = false;
    };
  }, [range, version]);

  useEffect(() => {
    if (!today) return;
    let active = true;
    void getCalendarSummaryAction(today).then((result) => {
      if (!active) return;
      if (result.success) setSummary(result.data);
    });
    return () => {
      active = false;
    };
  }, [today, version]);

  const activeGroups = useMemo(() => (groups ?? []).filter((g) => g.isActive), [groups]);
  const tones = useMemo(() => buildToneMap(groups ?? []), [groups]);
  const inFilter = useCallback((s: SessionRow) => !filter || s.groupId === filter, [filter]);
  const visible = useMemo(() => sessions.filter(inFilter), [sessions, inFilter]);

  if (!today || !range || groups === null) {
    return <div className="h-96 animate-pulse rounded-lg border border-border bg-muted/40" aria-busy="true" aria-label="Cargando el calendario" />;
  }

  if (activeGroups.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={<CalendarDays className="size-16 text-muted-foreground/40" aria-hidden="true" />}
          title="Primero crea un grupo"
          description="Las clases se programan por grupo (por ejemplo «Modelaje juvenil»). Crea el primero y vuelve aquí para armar el calendario."
          actionLabel="Ir a Grupos"
          onAction={onGoToGroups}
        />
      </section>
    );
  }

  const period = periodOf(anchor);

  function choose(iso: string) {
    setSelected(iso);
  }

  function shift(delta: number) {
    if (view === 'month') {
      const next = shiftMonth(period, delta);
      setAnchor(`${next}-01`);
      setSelected(today && periodOf(today) === next ? today : `${next}-01`);
    } else {
      const next = addDays(anchor, delta * 7);
      const { from, to } = weekRange(next);
      setAnchor(next);
      setSelected(today && today >= from && today <= to ? today : from);
    }
  }

  function goToday() {
    if (!today) return;
    setAnchor(today);
    setSelected(today);
  }

  function changeView(next: View) {
    setView(next);
    setAnchor(selected || today!);
  }

  function addClass(iso: string, times?: { startTime: string; endTime: string }) {
    setSchedule({ mode: 'create', date: iso, groupId: filter || undefined, ...times });
  }

  function openClass(session: SessionRow, tab?: SessionTab) {
    setOpen({ id: session.id, groupId: session.groupId, tab });
  }

  const dayList = sessions.filter((s) => s.date === selected && inFilter(s));
  const monthCount = visible.filter((s) => !s.isCancelled && (view === 'week' || periodOf(s.date) === period)).length;
  const todayCount = summary ? summary.today.filter((s) => !s.isCancelled && inFilter(s)).length : 0;
  const pending = (summary?.pendingRoll ?? []).filter(inFilter);
  const upcoming = (summary?.upcoming ?? []).filter(inFilter);
  const next = upcoming[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CalendarCheck} label="Hoy" value={String(todayCount)} hint={todayCount === 0 ? 'Sin clases hoy' : todayCount === 1 ? 'clase hoy' : 'clases hoy'} />
        <Stat icon={ClipboardCheck} label="Falta pasar lista" value={String(pending.length)} hint={pending.length === 0 ? 'Todo al día' : 'clases anteriores'} tone={pending.length > 0 ? 'warning' : undefined} />
        <Stat icon={CalendarDays} label={view === 'month' ? 'Clases del mes' : 'Clases de la semana'} value={String(monthCount)} hint={next ? `Próxima: ${shortDate(next.date)} ${next.startTime}` : 'Sin clases por venir'} />
        <Stat icon={Users} label="Alumnas activas" value={String(summary?.activeStudents ?? 0)} hint={`${summary?.activeGroups ?? activeGroups.length} ${(summary?.activeGroups ?? activeGroups.length) === 1 ? 'grupo' : 'grupos'}`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => shift(-1)} aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'}><ChevronLeft aria-hidden="true" /></Button>
          <Button type="button" variant="outline" size="icon" onClick={() => shift(1)} aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'}><ChevronRight aria-hidden="true" /></Button>
          <Button type="button" variant="outline" onClick={goToday}>Hoy</Button>
          <h2 className="ml-1 text-lg font-semibold first-letter:uppercase sm:text-2xl" aria-live="polite">{view === 'month' ? monthTitle(period) : weekTitle(anchor)}</h2>
          {loading && <span className="text-xs text-muted-foreground">Actualizando…</span>}
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Vista del calendario" className="inline-flex rounded-md bg-muted p-0.5">
            {([['month', 'Mes'], ['week', 'Semana']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => changeView(value)} className={cn('rounded px-3 py-1.5 text-xs font-medium transition-colors', view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          {canWrite && <Button type="button" onClick={() => addClass(selected || today)}><Plus aria-hidden="true" /> Programar clase</Button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por grupo">
        <button type="button" aria-pressed={filter === ''} onClick={() => setFilter('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', filter === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
          Todos los grupos
        </button>
        {activeGroups.map((group) => (
          <button key={group.id} type="button" aria-pressed={filter === group.id} onClick={() => setFilter(filter === group.id ? '' : group.id)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors', filter === group.id ? 'border-primary bg-accent text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
            <span className={cn('size-2.5 rounded-full', toneOf(tones, group.id).dot)} aria-hidden="true" />
            {group.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {view === 'month' ? (
            <MonthView period={period} today={today} selected={selected} sessions={visible} tones={tones} canWrite={canWrite} onSelect={choose} onOpen={(s) => openClass(s)} onAdd={addClass} />
          ) : (
            <WeekView anchor={anchor} today={today} selected={selected} sessions={visible} tones={tones} canWrite={canWrite} onSelect={choose} onOpen={(s) => openClass(s)} onAdd={addClass} />
          )}
          {canWrite && view === 'week' && <p className="mt-2 text-xs text-muted-foreground">Haz clic en un espacio vacío del calendario para programar una clase a esa hora.</p>}
        </div>

        <aside className="space-y-4" aria-label="Detalle del día">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Día seleccionado</p>
                <h3 className="text-base font-semibold first-letter:uppercase">{longDate(selected)}</h3>
              </div>
              {selected === today && <StatusBadge tone="accent">Hoy</StatusBadge>}
            </div>
            {dayList.length === 0 ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">No hay clases este día.</p>
                {canWrite && <Button type="button" variant="outline" size="sm" onClick={() => addClass(selected)}><Plus aria-hidden="true" /> Programar clase este día</Button>}
              </div>
            ) : (
              <ul className="space-y-2">
                {dayList.map((session) => {
                  const state = sessionRoll(session, today);
                  const tone = toneOf(tones, session.groupId);
                  const needsRoll = state === 'pending' || state === 'partial';
                  return (
                    <li key={session.id} className={cn('rounded-lg border border-border border-l-4 p-3', tone.bar, tone.chip, session.isCancelled && 'opacity-70')}>
                      <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"><Clock3 className="size-3.5" aria-hidden="true" /> {timeRangeLabel(session.startTime, session.endTime)}</p>
                      <p className={cn('break-words text-sm', session.isCancelled && 'line-through')}>{sessionHeading(session)}</p>
                      {session.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden="true" /> {session.location}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={ROLL_TONE[state]}>{rollLabel(session, state)}</StatusBadge>
                        {session.materials > 0 && <StatusBadge tone="info"><Paperclip className="mr-1 size-3" aria-hidden="true" />{session.materials}</StatusBadge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {!session.isCancelled && state !== 'upcoming' && <Button type="button" size="sm" variant={needsRoll && canWrite ? 'default' : 'outline'} onClick={() => openClass(session, 'ROLL')}>{canWrite && state !== 'done' ? 'Pasar lista' : 'Ver lista'}</Button>}
                        <Button type="button" size="sm" variant="outline" onClick={() => openClass(session, 'MATERIAL')}>Material</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => openClass(session, 'DETAILS')}>Detalles</Button>
                      </div>
                    </li>
                  );
                })}
                {canWrite && <li><Button type="button" variant="ghost" size="sm" onClick={() => addClass(selected)}><Plus aria-hidden="true" /> Otra clase este día</Button></li>}
              </ul>
            )}
          </section>

          {pending.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">Falta pasar lista</h3>
              <ul className="space-y-1">
                {pending.map((session) => (
                  <li key={session.id}>
                    <button type="button" onClick={() => openClass(session, 'ROLL')} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <span className={cn('size-2.5 shrink-0 rounded-full', toneOf(tones, session.groupId).dot)} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{session.groupName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{shortDate(session.date)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Próximas clases</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay clases programadas por delante.</p>
            ) : (
              <ul className="space-y-1">
                {upcoming.map((session) => (
                  <li key={session.id}>
                    <button type="button" onClick={() => openClass(session)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <span className={cn('size-2.5 shrink-0 rounded-full', toneOf(tones, session.groupId).dot)} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{session.groupName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shortDate(session.date)} · {session.startTime}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {schedule && (
        <ScheduleDialog
          key={schedule.mode === 'edit' ? schedule.session.id : `new-${schedule.date}`}
          target={schedule}
          groups={groups}
          defaults={lastTimes}
          onClose={() => {
            if (schedule.mode === 'edit') setOpen({ id: schedule.session.id, groupId: schedule.session.groupId, tab: 'DETAILS' });
            setSchedule(null);
          }}
          onSaved={(info) => {
            setLastTimes({ startTime: info.startTime, endTime: info.endTime });
            if (schedule.mode === 'edit') {
              setOpen({ id: schedule.session.id, groupId: schedule.session.groupId, tab: 'DETAILS' });
            } else {
              // Se muestra el mes donde quedó la clase.
              setAnchor(info.date);
              setSelected(info.date);
            }
            setSchedule(null);
            refresh();
          }}
        />
      )}

      {open && (
        <SessionDialog
          key={open.id}
          sessionId={open.id}
          initialTab={open.tab}
          today={today}
          groups={groups}
          tone={toneOf(tones, open.groupId)}
          canWrite={canWrite}
          onEdit={(session) => {
            setOpen(null);
            setSchedule({ mode: 'edit', session });
          }}
          onChanged={refresh}
          onClose={closeSession}
        />
      )}
    </div>
  );
}
