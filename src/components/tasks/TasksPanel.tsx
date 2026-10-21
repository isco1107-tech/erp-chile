'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Repeat, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import { createTaskAction, deleteTaskAction, installStarterTasksAction, listTasksAction, listTeamAction, setTaskStatusAction, updateTaskAction } from '@/modules/tasks/actions/tasks.actions';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_RECURRENCES, TASK_RECURRENCE_LABELS } from '@/modules/tasks/schema';
import type { TaskRow } from '@/modules/tasks/services/tasks.service';

type Scope = 'MINE' | 'ALL' | 'DONE';
type Priority = (typeof TASK_PRIORITIES)[number];
type Recurrence = (typeof TASK_RECURRENCES)[number];
interface Draft { id: string | null; title: string; description: string; priority: Priority; dueDate: string; assigneeId: string; recurrence: Recurrence }
const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
const PRIORITY_TONE = { LOW: 'neutral', NORMAL: 'info', HIGH: 'warning' } as const;

function formatDay(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : 'Sin fecha';
}

export default function TasksPanel({ scope, canManage, onChanged }: { scope: Scope; canManage: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const [tasks, people] = await Promise.all([listTasksAction(scope), listTeamAction()]);
    if (tasks.success) setRows(tasks.data);
    else toast.error(tasks.error);
    if (people.success) setTeam(people.data);
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>): Promise<boolean> {
    setBusy(key);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      if (result.message) toast.success(result.message);
      await load();
      onChanged();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const payload = { title: draft.title, description: draft.description.trim() || undefined, priority: draft.priority, dueDate: draft.dueDate || null, assigneeId: draft.assigneeId || null, recurrence: draft.recurrence };
    const ok = await run('save', () => (draft.id ? updateTaskAction(draft.id, payload) : createTaskAction(payload)));
    if (ok) setDraft(null);
  }

  async function remove(row: TaskRow) {
    if (!(await confirm({ title: `¿Eliminar "${row.title}"?`, description: row.recurrence !== 'NONE' ? 'Esta tarea se repite: al eliminarla dejará de repetirse.' : undefined, confirmLabel: 'Eliminar' }))) return;
    await run(`del-${row.id}`, () => deleteTaskAction(row.id));
  }

  const newDraft = (): Draft => ({ id: null, title: '', description: '', priority: 'NORMAL', dueDate: '', assigneeId: '', recurrence: 'NONE' });

  return (
    <div className="space-y-4">
      {scope !== 'DONE' && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy === 'starter'} onClick={() => run('starter', installStarterTasksAction)}>
            <Sparkles aria-hidden="true" /> Cargar rutinas recomendadas
          </Button>
          {!draft && (
            <Button size="sm" onClick={() => setDraft(newDraft())}>
              <Plus aria-hidden="true" /> Nueva tarea
            </Button>
          )}
        </div>
      )}

      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{draft.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <label className="block space-y-1 text-sm font-medium">¿Qué hay que hacer?<Input required maxLength={140} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="block space-y-1 text-sm font-medium">Detalle (opcional)<textarea rows={2} maxLength={1000} className={fieldClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="space-y-1 text-sm font-medium">Para el<Input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Prioridad
              <select className={fieldClass} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Se repite
              <select className={fieldClass} value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as Recurrence })}>
                {TASK_RECURRENCES.map((r) => <option key={r} value={r}>{TASK_RECURRENCE_LABELS[r]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Responsable
              <select className={fieldClass} value={draft.assigneeId} disabled={!canManage} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}>
                <option value="">Yo</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy === 'save'}>Guardar tarea</Button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Tareas">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title={scope === 'DONE' ? 'Aún no hay tareas cerradas' : 'No tienes tareas pendientes'} description={scope === 'DONE' ? undefined : 'Crea una, o carga las rutinas recomendadas (cierre semanal, stock, clientes inactivos).'} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className={cn('text-sm font-medium', row.status === 'DONE' && 'text-muted-foreground line-through')}>{row.title}</p>
                  {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <StatusBadge tone={row.overdue ? 'danger' : 'neutral'}>{row.status === 'DONE' || row.status === 'CANCELLED' ? (row.status === 'DONE' ? 'Hecha' : 'Cancelada') : `${row.overdue ? 'Vencida · ' : ''}${formatDay(row.dueDate)}`}</StatusBadge>
                    <StatusBadge tone={PRIORITY_TONE[row.priority]}>{TASK_PRIORITY_LABELS[row.priority]}</StatusBadge>
                    {row.recurrence !== 'NONE' && <span className="inline-flex items-center gap-1 text-muted-foreground"><Repeat className="size-3" aria-hidden="true" />{TASK_RECURRENCE_LABELS[row.recurrence]}</span>}
                    {row.assigneeName && scope !== 'MINE' && <span className="text-muted-foreground">· {row.assigneeName}</span>}
                  </div>
                </div>
                {row.editable && row.status !== 'DONE' && row.status !== 'CANCELLED' && (
                  <div className="flex flex-wrap gap-2">
                    {row.status === 'TODO' && <Button size="sm" variant="outline" disabled={busy === `s-${row.id}`} onClick={() => run(`s-${row.id}`, () => setTaskStatusAction(row.id, 'DOING'))}>Empezar</Button>}
                    <Button size="sm" disabled={busy === `d-${row.id}`} onClick={() => run(`d-${row.id}`, () => setTaskStatusAction(row.id, 'DONE'))}>Hecha</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ id: row.id, title: row.title, description: row.description ?? '', priority: row.priority, dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : '', assigneeId: row.assigneeId ?? '', recurrence: row.recurrence })}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(row)}>Eliminar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
