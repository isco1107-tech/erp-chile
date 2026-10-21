'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { listGroupsAction, listStudentsAction, moveStudentToGroupAction, saveGroupAction, setGroupActiveAction } from '@/modules/academy/actions/academy.actions';
import type { GroupRow, StudentRow } from '@/modules/academy/services/academy.service';
import { fieldClass } from './shared';

interface Draft { id: string | null; name: string; schedule: string; monthlyFee: string }

export default function GroupsPanel({ canManage, canWrite }: { canManage: boolean; canWrite: boolean }) {
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const [groups, list] = await Promise.all([listGroupsAction(), listStudentsAction({})]);
    if (groups.success) setRows(groups.data);
    else toast.error(groups.error);
    if (list.success) setStudents(list.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    const fee = draft.monthlyFee.trim();
    const result = await saveGroupAction(draft.id, { name: draft.name, schedule: draft.schedule, monthlyFee: fee === '' ? null : Number(fee) });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
    setDraft(null);
    await load();
  }

  /** `''` = columna «Sin grupo». */
  async function move(studentId: string, column: string) {
    setDragOver(null);
    const student = students.find((x) => x.id === studentId);
    const target = column || null;
    if (!student || student.groupId === target) return;
    // Optimista: la alumna cambia de columna al instante; si el servidor rechaza, se recarga.
    setStudents((prev) => prev.map((x) => (x.id === studentId ? { ...x, groupId: target, groupName: rows.find((g) => g.id === target)?.name ?? null } : x)));
    const result = await moveStudentToGroupAction({ studentId, groupId: target });
    if (!result.success) toast.error(result.error);
    await load();
  }

  async function toggle(row: GroupRow) {
    const result = await setGroupActiveAction(row.id, !row.isActive);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Listo');
    await load();
  }

  return (
    <div className="space-y-4">
      {canManage && !draft && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDraft({ id: null, name: '', schedule: '', monthlyFee: '' })}><Plus aria-hidden="true" /> Nuevo grupo</Button>
        </div>
      )}
      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{draft.id ? 'Editar grupo' : 'Nuevo grupo'}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">Nombre<Input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Horario (opcional)<Input maxLength={120} placeholder="Sábados 10:00–12:00" value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Mensualidad en pesos (opcional)<Input type="number" min={0} step={1} value={draft.monthlyFee} onChange={(e) => setDraft({ ...draft, monthlyFee: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Guardar grupo</Button>
          </div>
        </form>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 && students.length === 0 ? (
        <section className="rounded-lg border border-border bg-card" aria-label="Grupos">
          <EmptyState title="Aún no hay grupos" description="Crea un grupo (por ejemplo «Modelaje juvenil») para organizar a las alumnas y pasar lista." />
        </section>
      ) : (
        <section aria-label="Tablero de grupos" className="overflow-x-auto pb-2">
          {canWrite && <p className="mb-2 text-xs text-muted-foreground">Arrastra a cada alumna a su grupo, o usa el selector de la tarjeta.</p>}
          <div className="flex min-w-max gap-3">
            {[{ id: '', name: 'Sin grupo', schedule: null, monthlyFee: null, isActive: true, students: 0 } as GroupRow, ...rows.filter((g) => g.isActive || students.some((x) => x.groupId === g.id)), ].map((column) => {
              const members = students.filter((x) => (x.groupId ?? '') === column.id);
              const real = column.id !== '';
              return (
                <div
                  key={column.id || 'none'}
                  onDragOver={(event) => {
                    if (!canWrite) return;
                    event.preventDefault();
                    setDragOver(column.id || 'none');
                  }}
                  onDragLeave={() => setDragOver((current) => (current === (column.id || 'none') ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData('text/plain');
                    if (canWrite && id) void move(id, column.id);
                  }}
                  className={cn('flex min-h-[220px] w-64 shrink-0 flex-col rounded-lg border bg-muted/40 p-2 transition-colors', dragOver === (column.id || 'none') ? 'border-primary bg-accent' : 'border-border')}
                >
                  <div className="mb-2 space-y-1 px-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">{column.name}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{members.length}</span>
                    </div>
                    {real && <p className="text-xs text-muted-foreground">{[column.schedule, column.monthlyFee !== null ? `$${column.monthlyFee.toLocaleString('es-CL')}/mes` : null].filter(Boolean).join(' · ') || ' '}</p>}
                    {real && (
                      <div className="flex items-center gap-1">
                        {!column.isActive && <StatusBadge tone="neutral">Inactivo</StatusBadge>}
                        {canManage && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setDraft({ id: column.id, name: column.name, schedule: column.schedule ?? '', monthlyFee: column.monthlyFee !== null ? String(column.monthlyFee) : '' })}>Editar</Button>
                            <Button size="sm" variant="ghost" onClick={() => toggle(column)}>{column.isActive ? 'Desactivar' : 'Reactivar'}</Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <ul className="flex flex-1 flex-col gap-2">
                    {members.map((student) => (
                      <li
                        key={student.id}
                        draggable={canWrite}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', student.id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        className={cn('rounded-md border border-border bg-card p-2 shadow-card', canWrite && 'cursor-grab active:cursor-grabbing')}
                      >
                        <p className="truncate text-sm font-medium">{student.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">{student.rut}</p>
                        {student.pendingMonths > 0 && <div className="mt-1"><StatusBadge tone="danger">Debe {student.pendingMonths} {student.pendingMonths === 1 ? 'mes' : 'meses'}</StatusBadge></div>}
                        {canWrite && (
                          <select aria-label={`Grupo de ${student.fullName}`} className={cn(fieldClass, 'mt-2 py-1 text-xs')} value={student.groupId ?? ''} onChange={(e) => void move(student.id, e.target.value)}>
                            <option value="">Sin grupo</option>
                            {rows.filter((g) => g.isActive || g.id === student.groupId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
