'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, CalendarOff, CalendarX2, MapPin, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import { dayRelation, durationLabel, longDate, timeRangeLabel } from '@/lib/academy/calendar';
import { deleteSessionAction, getSessionAction, setSessionCancelledAction } from '@/modules/academy/actions/academy-class.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import type { SessionRow } from '@/modules/academy/services/academy-calendar.service';
import AttendanceSheet from './AttendanceSheet';
import MaterialsPanel from './MaterialsPanel';
import { ROLL_TONE, rollLabel, sessionRoll, type GroupTone } from './calendar-style';

export type SessionTab = 'ROLL' | 'MATERIAL' | 'DETAILS';

interface SessionDialogProps {
  sessionId: string;
  initialTab?: SessionTab;
  today: string;
  groups: GroupRow[];
  tone: GroupTone;
  canWrite: boolean;
  onEdit: (session: SessionRow) => void;
  /** Algo cambió (lista, material, cancelación…): el calendario debe refrescarse. */
  onChanged: () => void;
  onClose: () => void;
}

/**
 * Una clase del calendario, con todo lo que se hace con ella en un solo lugar:
 * pasar lista, subir y enviar material, y editarla, cancelarla o borrarla.
 */
export default function SessionDialog({ sessionId, initialTab, today, groups, tone, canWrite, onEdit, onChanged, onClose }: SessionDialogProps) {
  const confirm = useConfirm();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [tab, setTab] = useState<SessionTab | null>(initialTab ?? null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const load = useCallback(async () => {
    const result = await getSessionAction(sessionId);
    if (!result.success) {
      toast.error(result.error);
      return onClose();
    }
    setSession(result.data);
    setTab((current) => current ?? (dayRelation(result.data.date, today) === 'future' || result.data.isCancelled ? 'MATERIAL' : 'ROLL'));
  }, [sessionId, today, onClose]);
  useEffect(() => {
    void load();
  }, [load]);

  const changed = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);

  async function requestClose(open: boolean) {
    if (open) return;
    if (dirtyRef.current && !(await confirm({ title: '¿Salir sin guardar la lista?', description: 'Marcaste alumnas y no guardaste los cambios.', confirmLabel: 'Salir sin guardar' }))) return;
    onClose();
  }

  async function toggleCancel() {
    if (!session) return;
    if (!session.isCancelled) {
      const ok = await confirm({ title: '¿Cancelar esta clase?', description: 'Queda en el calendario marcada como cancelada y no se pasa lista. Podrás reactivarla.', confirmLabel: 'Cancelar clase' });
      if (!ok) return;
    }
    const result = await setSessionCancelledAction(session.id, !session.isCancelled);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Listo');
    changed();
  }

  async function remove(scope: 'ONE' | 'FOLLOWING') {
    if (!session) return;
    const ok = await confirm({
      title: scope === 'ONE' ? '¿Eliminar esta clase?' : '¿Eliminar esta clase y las siguientes de la serie?',
      description: 'Desaparece del calendario. La lista que ya pasaste se conserva en el historial de cada alumna y el material queda en el grupo.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const result = await deleteSessionAction(session.id, scope);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Clase eliminada');
    onChanged();
    onClose();
  }

  const relation = session ? dayRelation(session.date, today) : 'future';
  const roll = session ? sessionRoll(session, today) : 'upcoming';
  const tabs: Array<{ value: SessionTab; label: string }> = [
    { value: 'ROLL', label: 'Pasar lista' },
    { value: 'MATERIAL', label: session && session.materials > 0 ? `Material (${session.materials})` : 'Material' },
    { value: 'DETAILS', label: 'Detalles' },
  ];

  return (
    <Dialog open onOpenChange={(open) => void requestClose(open)}>
      <DialogContent className="max-w-3xl" aria-describedby={undefined}>
        {!session ? (
          <>
            <DialogTitle className="sr-only">Clase</DialogTitle>
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando la clase…</p>
          </>
        ) : (
          <div className="space-y-4">
            <DialogHeader className="pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('size-3 shrink-0 rounded-full', tone.dot)} aria-hidden="true" />
                <DialogTitle className={cn('text-lg', session.isCancelled && 'line-through')}>{session.groupName}</DialogTitle>
                {session.isCancelled ? <StatusBadge tone="neutral">Cancelada</StatusBadge> : relation === 'today' ? <StatusBadge tone="accent">Hoy</StatusBadge> : null}
                {!session.isCancelled && relation !== 'future' && <StatusBadge tone={ROLL_TONE[roll]}>{rollLabel(session, roll)}</StatusBadge>}
              </div>
              <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" aria-hidden="true" /> {longDate(session.date)} · {timeRangeLabel(session.startTime, session.endTime)} ({durationLabel(session.startTime, session.endTime)})</span>
                {session.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" /> {session.location}</span>}
              </DialogDescription>
              {session.title && <p className="text-sm font-medium">Tema: {session.title}</p>}
            </DialogHeader>

            <div role="tablist" aria-label="Secciones de la clase" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
              {tabs.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', tab === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'ROLL' && (
              <AttendanceSheet
                key={`${session.groupId}|${session.date}`}
                groupId={session.groupId}
                date={session.date}
                canWrite={canWrite}
                lockedReason={session.isCancelled ? 'Esta clase está cancelada, así que no se pasa lista. Reactívala desde «Detalles» si se hace.' : relation === 'future' ? 'Esta clase aún no ocurre. Podrás pasar lista desde el día de la clase.' : undefined}
                onSaved={changed}
                onDirtyChange={setDirty}
              />
            )}

            {tab === 'MATERIAL' && <MaterialsPanel canWrite={canWrite} groups={groups} groupId={session.groupId} sessionId={session.id} onChanged={changed} />}

            {tab === 'DETAILS' && (
              <div className="space-y-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Grupo</dt><dd className="font-medium">{session.groupName}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Alumnas activas</dt><dd className="font-medium">{session.expected}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Lista</dt><dd className="font-medium">{relation === 'future' ? 'Aún no corresponde' : `${session.marked} de ${session.expected} marcadas · ${session.present} presentes · ${session.absent} ausentes`}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Lugar</dt><dd className="font-medium">{session.location ?? 'Sin indicar'}</dd></div>
                  {session.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Notas</dt><dd className="whitespace-pre-line">{session.notes}</dd></div>}
                  {session.seriesId && <div className="sm:col-span-2"><dd className="text-xs text-muted-foreground">Esta clase es parte de una serie semanal.</dd></div>}
                </dl>
                {canWrite && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(session)}><Pencil aria-hidden="true" /> Editar clase</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void toggleCancel()}>
                      {session.isCancelled ? <RotateCcw aria-hidden="true" /> : <CalendarOff aria-hidden="true" />} {session.isCancelled ? 'Reactivar clase' : 'Cancelar clase'}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => void remove('ONE')}><Trash2 aria-hidden="true" /> Eliminar{session.seriesId ? ' solo esta' : ''}</Button>
                    {session.seriesId && <Button type="button" variant="destructive" size="sm" onClick={() => void remove('FOLLOWING')}><CalendarX2 aria-hidden="true" /> Eliminar esta y las siguientes</Button>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
