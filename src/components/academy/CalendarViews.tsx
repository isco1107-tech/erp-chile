'use client';

import { useMemo, type MouseEvent } from 'react';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEEKDAYS_SHORT, assignLanes, blockPosition, hourRangeFor, longDate, minutesToTime, monthGrid, timeToMinutes, weekDays } from '@/lib/academy/calendar';
import type { SessionRow } from '@/modules/academy/services/academy-calendar.service';
import { sessionRoll, toneOf, type GroupTone } from './calendar-style';

interface ViewProps {
  today: string;
  selected: string;
  sessions: SessionRow[];
  tones: Map<string, GroupTone>;
  canWrite: boolean;
  onSelect: (iso: string) => void;
  onOpen: (session: SessionRow) => void;
  onAdd: (iso: string, times?: { startTime: string; endTime: string }) => void;
}

function byDay(sessions: SessionRow[]): Map<string, SessionRow[]> {
  const map = new Map<string, SessionRow[]>();
  for (const session of sessions) map.set(session.date, [...(map.get(session.date) ?? []), session]);
  return map;
}

function RollIcon({ session, today }: { session: SessionRow; today: string }) {
  const state = sessionRoll(session, today);
  if (state === 'done') return <CheckCircle2 className="size-3 shrink-0 text-success" aria-label="Lista completa" />;
  if (state === 'pending' || state === 'partial') return <AlertCircle className="size-3 shrink-0 text-warning" aria-label="Falta pasar lista" />;
  return null;
}

function sessionLabel(session: SessionRow): string {
  return `${session.startTime} a ${session.endTime}, ${session.groupName}${session.title ? `, ${session.title}` : ''}${session.isCancelled ? ', cancelada' : ''}`;
}

const MAX_CHIPS = 3;

/** Mes completo: una celda por día con las clases del día. */
export function MonthView({ period, today, selected, sessions, tones, canWrite, onSelect, onOpen, onAdd }: ViewProps & { period: string }) {
  const weeks = useMemo(() => monthGrid(period), [period]);
  const grouped = useMemo(() => byDay(sessions), [sessions]);

  return (
    <div role="grid" aria-label="Calendario del mes" className="overflow-hidden rounded-lg border border-border bg-card">
      <div role="row" className="grid grid-cols-7 border-b border-border bg-muted/60">
        {WEEKDAYS_SHORT.map((label) => (
          <div key={label} role="columnheader" className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]!.iso} role="row" className="grid grid-cols-7">
          {week.map((cell) => {
            const day = grouped.get(cell.iso) ?? [];
            const isToday = cell.iso === today;
            const isSelected = cell.iso === selected;
            return (
              <div
                key={cell.iso}
                role="gridcell"
                aria-selected={isSelected}
                className={cn(
                  'group relative min-h-16 min-w-0 border-b border-r border-border p-1 last:border-r-0 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0',
                  !cell.inMonth && 'bg-muted/40',
                  isSelected && 'bg-accent/70 ring-2 ring-inset ring-primary'
                )}
              >
                <button type="button" className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${longDate(cell.iso)}${day.length ? `, ${day.length} ${day.length === 1 ? 'clase' : 'clases'}` : ''}`} onClick={() => onSelect(cell.iso)} />
                <div className="pointer-events-none relative flex items-center justify-between">
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-xs font-semibold sm:size-7 sm:text-sm', isToday ? 'bg-primary text-primary-foreground' : cell.inMonth ? 'text-foreground' : 'text-muted-foreground/60')}>
                    {Number(cell.iso.slice(8, 10))}
                  </span>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={`Programar una clase el ${longDate(cell.iso)}`}
                      onClick={() => onAdd(cell.iso)}
                      className="pointer-events-auto hidden size-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border hover:bg-primary hover:text-primary-foreground focus-visible:flex group-hover:flex"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Pantalla grande: una ficha por clase. */}
                <ul className="pointer-events-none relative mt-1 hidden space-y-1 sm:block">
                  {day.slice(0, MAX_CHIPS).map((session) => {
                    const tone = toneOf(tones, session.groupId);
                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(session)}
                          aria-label={sessionLabel(session)}
                          className={cn('pointer-events-auto flex w-full min-w-0 items-center gap-1 rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring', tone.bar, tone.chip, session.isCancelled && 'opacity-60')}
                        >
                          <span className="shrink-0 font-semibold tabular-nums">{session.startTime}</span>
                          <span className={cn('min-w-0 flex-1 truncate', session.isCancelled && 'line-through')}>{session.groupName}</span>
                          <RollIcon session={session} today={today} />
                        </button>
                      </li>
                    );
                  })}
                  {day.length > MAX_CHIPS && (
                    <li>
                      <button type="button" onClick={() => onSelect(cell.iso)} className="pointer-events-auto px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                        +{day.length - MAX_CHIPS} más
                      </button>
                    </li>
                  )}
                </ul>

                {/* Celular: puntos de color; el detalle se ve al elegir el día. */}
                {day.length > 0 && (
                  <div className="pointer-events-none relative mt-1 flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden="true">
                    {day.slice(0, 4).map((session) => (
                      <span key={session.id} className={cn('size-1.5 rounded-full', toneOf(tones, session.groupId).dot, session.isCancelled && 'opacity-40')} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const HOUR_PX = 56;

/** Semana con horas: una columna por día y cada clase dibujada en su franja horaria. */
export function WeekView({ anchor, today, selected, sessions, tones, canWrite, onSelect, onOpen, onAdd }: ViewProps & { anchor: string }) {
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const grouped = useMemo(() => byDay(sessions), [sessions]);
  const range = useMemo(() => hourRangeFor(sessions), [sessions]);
  const hours = Array.from({ length: range.endHour - range.startHour }, (_, i) => range.startHour + i);
  const height = hours.length * HOUR_PX;

  function addAt(iso: string, event: MouseEvent<HTMLDivElement>) {
    if (!canWrite) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const minutes = Math.floor((range.startHour * 60 + ratio * (range.endHour - range.startHour) * 60) / 30) * 30;
    onAdd(iso, { startTime: minutesToTime(minutes), endTime: minutesToTime(Math.min(minutes + 60, 23 * 60 + 59)) });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="min-w-[46rem]">
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/60">
          <div />
          {days.map((iso, index) => {
            const isToday = iso === today;
            return (
              <button key={iso} type="button" onClick={() => onSelect(iso)} aria-label={longDate(iso)} className={cn('flex flex-col items-center gap-0.5 border-l border-border py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', iso === selected && 'bg-accent/70')}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{WEEKDAYS_SHORT[index]}</span>
                <span className={cn('flex size-7 items-center justify-center rounded-full text-sm font-semibold', isToday && 'bg-primary text-primary-foreground')}>{Number(iso.slice(8, 10))}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height }} aria-hidden="true">
            {hours.map((hour, i) => (
              <span key={hour} className={cn('absolute right-1.5 text-[11px] tabular-nums text-muted-foreground', i > 0 && '-translate-y-1/2')} style={{ top: i * HOUR_PX }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((iso) => {
            const day = grouped.get(iso) ?? [];
            const lanes = assignLanes(day);
            return (
              <div
                key={iso}
                onClick={(event) => addAt(iso, event)}
                className={cn('relative border-l border-border', iso === today && 'bg-accent/30', canWrite && 'cursor-cell')}
                style={{ height }}
              >
                {hours.map((hour, i) => (
                  <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: i * HOUR_PX }} />
                ))}
                {day.map((session) => {
                  const position = blockPosition(session.startTime, session.endTime, range);
                  const lane = lanes.get(session.id) ?? { lane: 0, lanes: 1 };
                  const tone = toneOf(tones, session.groupId);
                  const short = timeToMinutes(session.endTime) - timeToMinutes(session.startTime) <= 45;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(session);
                      }}
                      aria-label={sessionLabel(session)}
                      className={cn('absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring', tone.bar, tone.block, session.isCancelled && 'opacity-60')}
                      style={{ top: `${position.top}%`, height: `calc(${position.height}% - 2px)`, left: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`, width: `calc(${100 / lane.lanes}% - 4px)` }}
                    >
                      <span className="flex items-center gap-1 font-semibold tabular-nums">
                        {session.startTime}{short ? '' : ` – ${session.endTime}`}
                        <RollIcon session={session} today={today} />
                      </span>
                      <span className={cn('block truncate font-medium', session.isCancelled && 'line-through')}>{session.groupName}</span>
                      {!short && session.title && <span className="block truncate text-muted-foreground">{session.title}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
