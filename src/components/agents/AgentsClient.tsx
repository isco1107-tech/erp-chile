'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AgentRun, AgentRunStatus, AgentTask } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { listLatestAgentRunsAction } from '@/modules/agents/actions/agent-runs.actions';
import {
  approveAgentTaskAction,
  listAgentTasksAction,
  rejectAgentTaskAction,
} from '@/modules/agents/actions/agent-tasks.actions';
import { AGENT_ROLES, AGENT_ROLE_LABELS } from '@/modules/agents/constants';

const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  RUNNING: 'Ejecutando',
  COMPLETED: 'Completado',
  FAILED: 'Falló',
};

const RUN_STATUS_TONE: Record<AgentRunStatus, string> = {
  RUNNING: 'bg-amber-500/10 text-amber-300',
  COMPLETED: 'bg-emerald-500/10 text-emerald-300',
  FAILED: 'bg-rose-500/10 text-rose-300',
};

/**
 * Panel de agentes: "Surface Area" (última corrida por rol) + bandeja de
 * recomendaciones pendientes. Cada tarea es texto informativo — ningún botón
 * de acá dispara nada fuera del sistema, solo cambia el estado de la fila
 * (ver src/modules/agents/actions/agent-tasks.actions.ts).
 */
export default function AgentsClient() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [runsResult, tasksResult] = await Promise.all([listLatestAgentRunsAction(), listAgentTasksAction('PENDING')]);
    if (runsResult.success) setRuns(runsResult.data);
    else toast.error(runsResult.error);
    if (tasksResult.success) setTasks(tasksResult.data);
    else toast.error(tasksResult.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(taskId: string) {
    setBusyTaskId(taskId);
    const result = await approveAgentTaskAction(taskId);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Marcada como revisada');
    setBusyTaskId(null);
    load();
  }

  async function handleReject(taskId: string) {
    setBusyTaskId(taskId);
    const result = await rejectAgentTaskAction(taskId);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Descartada');
    setBusyTaskId(null);
    load();
  }

  const runByRole = new Map(runs.map((run) => [run.role, run]));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGENT_ROLES.map((role) => {
          const run = runByRole.get(role);
          return (
            <div key={role} className="hud-surface rounded-xl p-4">
              <p className="hud-label mb-1">{role}</p>
              <h3 className="mb-3 text-sm font-semibold text-foreground">{AGENT_ROLE_LABELS[role]}</h3>
              {run ? (
                <div className="space-y-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${RUN_STATUS_TONE[run.status]}`}
                  >
                    {RUN_STATUS_LABEL[run.status]}
                  </span>
                  <p className="font-mono text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString('es-CL')}</p>
                  <p className="text-sm text-foreground">
                    {run.status === 'FAILED' ? (run.error ?? 'Falló sin detalle') : (run.summary ?? 'Sin resumen')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin ejecuciones aún.</p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recomendaciones pendientes de revisar</h2>
        {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}
        {!loading && tasks.length === 0 && <p className="text-sm text-muted-foreground">No hay recomendaciones pendientes.</p>}
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="hud-surface rounded-xl p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="hud-label mb-1">{AGENT_ROLE_LABELS[task.role]}</p>
                  <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={busyTaskId === task.id} onClick={() => handleApprove(task.id)}>
                    Marcar como revisada
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyTaskId === task.id}
                    onClick={() => handleReject(task.id)}
                  >
                    Descartar
                  </Button>
                </div>
              </div>
              <p className="text-sm text-foreground">{task.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
