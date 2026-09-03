'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createSessionSeriesAction } from '@/modules/candidates/actions/sessions.actions';
import {
  CANDIDATE_ACTIVITY_TYPE_LABELS,
  CANDIDATE_ACTIVITY_TYPES,
  sessionSeriesCreateSchema,
  WEEKDAY_LABELS,
} from '@/modules/candidates/schema';

const selectClass =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // lunes primero

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateSessionSeriesDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activityType, setActivityType] = useState<(typeof CANDIDATE_ACTIVITY_TYPES)[number]>('ENSAYO');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [time, setTime] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [singleDay, setSingleDay] = useState(true);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function reset() {
    setActivityType('ENSAYO');
    setTitle('');
    setLocation('');
    setTime('');
    setStartDate(todayIso());
    setEndDate(todayIso());
    setDaysOfWeek([]);
    setSingleDay(true);
  }

  async function handleSave() {
    const effectiveDaysOfWeek = singleDay ? [new Date(`${startDate}T00:00:00Z`).getUTCDay()] : daysOfWeek;
    const payload = {
      projectId,
      activityType,
      title: title || undefined,
      location: location || undefined,
      time: time || undefined,
      startDate,
      endDate: singleDay ? startDate : endDate,
      daysOfWeek: effectiveDaysOfWeek,
    };
    const parsed = sessionSeriesCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setSaving(true);
    const result = await createSessionSeriesAction(parsed.data);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Sesiones creadas');
    reset();
    setOpen(false);
    onCreated();
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus /> Crear sesiones
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear sesiones de asistencia</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="radio" checked={singleDay} onChange={() => setSingleDay(true)} /> Evento puntual (un solo día)
              </label>
              <label className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="radio" checked={!singleDay} onChange={() => setSingleDay(false)} /> Serie recurrente
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ses-type">Tipo de actividad</Label>
                <select id="ses-type" className={selectClass} value={activityType} onChange={(e) => setActivityType(e.target.value as (typeof CANDIDATE_ACTIVITY_TYPES)[number])}>
                  {CANDIDATE_ACTIVITY_TYPES.map((type) => (
                    <option key={type} value={type}>{CANDIDATE_ACTIVITY_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ses-time">Hora (opcional)</Label>
                <Input id="ses-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ses-title">Título (opcional)</Label>
                <Input id="ses-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Ensayo módulo 2" />
              </div>
              <div>
                <Label htmlFor="ses-location">Lugar (opcional)</Label>
                <Input id="ses-location" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ses-start">{singleDay ? 'Fecha' : 'Desde'}</Label>
                <Input id="ses-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              {!singleDay && (
                <div>
                  <Label htmlFor="ses-end">Hasta</Label>
                  <Input id="ses-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
                </div>
              )}
            </div>

            {!singleDay && (
              <div>
                <Label>Días de la semana</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`h-9 rounded-lg border px-3 text-sm ${daysOfWeek.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-transparent text-foreground'}`}
                    >
                      {WEEKDAY_LABELS[day]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Creando…' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
