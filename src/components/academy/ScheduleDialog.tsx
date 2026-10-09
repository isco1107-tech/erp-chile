'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { MAX_SERIES_SESSIONS, WEEKDAYS_SHORT, durationLabel, expandWeekly, isValidTimeRange, longDate, minutesToTime, shortDate, timeToMinutes, weekdayIndex } from '@/lib/academy/calendar';
import { createSessionsAction, updateSessionAction } from '@/modules/academy/actions/academy-class.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import type { SessionRow } from '@/modules/academy/services/academy-calendar.service';
import { fieldClass } from './shared';

export type ScheduleTarget =
  | { mode: 'create'; date: string; groupId?: string; startTime?: string; endTime?: string }
  | { mode: 'edit'; session: SessionRow };

interface ScheduleDialogProps {
  target: ScheduleTarget;
  groups: GroupRow[];
  /** Última franja que se usó, para no volver a escribirla. */
  defaults: { startTime: string; endTime: string };
  onClose: () => void;
  onSaved: (info: { date: string; startTime: string; endTime: string; sessionId: string | null }) => void;
}

const DURATIONS = [60, 90, 120, 180] as const;

/** Programar una clase (con repetición semanal opcional) o editar una ya programada. */
export default function ScheduleDialog({ target, groups, defaults, onClose, onSaved }: ScheduleDialogProps) {
  const editing = target.mode === 'edit' ? target.session : null;
  const activeGroups = groups.filter((g) => g.isActive);
  const [groupId, setGroupId] = useState(editing?.groupId ?? (target.mode === 'create' ? target.groupId : undefined) ?? activeGroups[0]?.id ?? '');
  const [date, setDate] = useState(editing?.date ?? (target.mode === 'create' ? target.date : ''));
  const [startTime, setStartTime] = useState(editing?.startTime ?? (target.mode === 'create' ? target.startTime : undefined) ?? defaults.startTime);
  const [endTime, setEndTime] = useState(editing?.endTime ?? (target.mode === 'create' ? target.endTime : undefined) ?? defaults.endTime);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [location, setLocation] = useState(editing?.location ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(8);
  const [weekdays, setWeekdays] = useState<number[]>(date ? [weekdayIndex(date)] : []);
  const [scope, setScope] = useState<'ONE' | 'FOLLOWING'>('ONE');
  const [busy, setBusy] = useState(false);

  const timesOk = isValidTimeRange(startTime, endTime);
  const dates = useMemo(() => (repeat && date ? expandWeekly(date, { weeks, weekdays }) : date ? [date] : []), [repeat, date, weeks, weekdays]);

  function applyDuration(minutes: number) {
    if (!startTime) return;
    setEndTime(minutesToTime(timeToMinutes(startTime) + minutes));
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!timesOk) return void toast.error('La clase debe terminar después de la hora de inicio');
    setBusy(true);
    const fields = { date, startTime, endTime, title, location, notes };
    if (editing) {
      const result = await updateSessionAction(editing.id, { ...fields, scope });
      setBusy(false);
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Clase actualizada');
      onSaved({ date, startTime, endTime, sessionId: editing.id });
      return;
    }
    const result = await createSessionsAction({ groupId, ...fields, repeat: repeat ? { weeks, weekdays } : null });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Clase programada');
    onSaved({ date, startTime, endTime, sessionId: result.data.created === 1 ? result.data.firstSessionId : null });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar clase' : 'Programar clase'}</DialogTitle>
            <DialogDescription>{date ? longDate(date) : 'Elige el grupo, el día y la hora.'}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Grupo
              <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={Boolean(editing)} required>
                {(editing ? groups.filter((g) => g.id === editing.groupId) : activeGroups).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Día
              <Input
                type="date"
                value={date}
                required
                onChange={(e) => {
                  setDate(e.target.value);
                  if (!repeat && e.target.value) setWeekdays([weekdayIndex(e.target.value)]);
                }}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">Desde
              <Input type="time" value={startTime} required onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm font-medium">Hasta
              <Input type="time" value={endTime} required onChange={(e) => setEndTime(e.target.value)} aria-invalid={!timesOk} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Duración:</span>
            {DURATIONS.map((minutes) => (
              <button key={minutes} type="button" onClick={() => applyDuration(minutes)} className={cn('rounded-full border px-2.5 py-1 font-medium transition-colors', timesOk && timeToMinutes(endTime) - timeToMinutes(startTime) === minutes ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                {durationLabel('00:00', minutesToTime(minutes))}
              </button>
            ))}
            {!timesOk && <span className="text-danger">La hora de término debe ser después del inicio.</span>}
          </div>

          {(!repeat || editing) && (
            <label className="block space-y-1 text-sm font-medium">Tema de la clase (opcional)
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ej. Postura y pasarela" />
            </label>
          )}
          <label className="block space-y-1 text-sm font-medium">Lugar (opcional)
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Ej. Sala 2" />
          </label>
          {(!repeat || editing) && (
            <label className="block space-y-1 text-sm font-medium">Notas (opcional)
              <textarea className={cn(fieldClass, 'min-h-16')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ej. Traer zapatos de taco." />
            </label>
          )}

          {!editing && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <Repeat className="size-4 text-muted-foreground" aria-hidden="true" /> Repetir cada semana
              </label>
              {repeat && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="space-y-1 text-sm font-medium">Durante cuántas semanas
                      <Input type="number" min={1} max={52} className="w-28" value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))} />
                    </label>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Los días</p>
                      <div className="flex flex-wrap gap-1" role="group" aria-label="Días de la semana">
                        {WEEKDAYS_SHORT.map((label, day) => (
                          <button key={label} type="button" aria-pressed={weekdays.includes(day)} onClick={() => toggleWeekday(day)} className={cn('h-8 min-w-10 rounded-md border px-2 text-xs font-medium transition-colors', weekdays.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {dates.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Se programarán <strong className="text-foreground">{dates.length} {dates.length === 1 ? 'clase' : 'clases'}</strong>
                      {dates.length >= MAX_SERIES_SESSIONS ? ` (el máximo por vez)` : ''}: {dates.slice(0, 4).map(shortDate).join(', ')}
                      {dates.length > 4 ? `… hasta el ${shortDate(dates[dates.length - 1]!)}` : ''}. El tema de cada clase se agrega después. Si un día ya tiene clase de este grupo, se deja como está.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {editing?.seriesId && (
            <fieldset className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Esta clase es parte de una serie semanal</legend>
              <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'ONE'} onChange={() => setScope('ONE')} /> Cambiar solo esta clase</label>
              <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'FOLLOWING'} onChange={() => setScope('FOLLOWING')} /> Cambiar la hora y el lugar de esta y las siguientes</label>
            </fieldset>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || !groupId || !date || !timesOk}>
              {busy ? 'Guardando…' : editing ? 'Guardar cambios' : repeat && dates.length > 1 ? `Programar ${dates.length} clases` : 'Programar clase'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
