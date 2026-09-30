'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authErrorMessage, can, requireAuthWithPermission, type AuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { DELEGATED_DECISIONS, evaluateDelegation, type DelegationCheck } from '@/lib/tasks/delegation';
import { delegationRuleSchema, taskSchema, taskStatusSchema } from '../schema';
import * as service from '../services/tasks.service';
import type { DelegationRuleRow, TaskRow, TaskScope, TasksOverview } from '../services/tasks.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.TaskError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'tareas', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

const firstIssue = (issues: Array<{ message: string }>) => issues[0]?.message ?? 'Datos inválidos';

function actorOf(session: AuthContext): service.Actor {
  return { companyId: session.companyId, userId: session.id, canManage: can(session, 'tasks:manage') };
}

function revalidate(): void {
  revalidatePath('/dashboard/tasks');
}

export async function getTasksOverviewAction(): Promise<ActionResult<TasksOverview>> {
  try {
    const session = await requireAuthWithPermission('tasks:read');
    return { success: true, data: await service.getOverview(actorOf(session)) };
  } catch (error) {
    return fail(error);
  }
}

export async function listTasksAction(scope: string = 'MINE'): Promise<ActionResult<TaskRow[]>> {
  try {
    const session = await requireAuthWithPermission('tasks:read');
    const safe: TaskScope = scope === 'ALL' || scope === 'DONE' ? scope : 'MINE';
    return { success: true, data: await service.listTasks(actorOf(session), safe) };
  } catch (error) {
    return fail(error);
  }
}

export async function listTeamAction(): Promise<ActionResult<Array<{ id: string; name: string; role: string }>>> {
  try {
    const session = await requireAuthWithPermission('tasks:read');
    return { success: true, data: await service.listTeam(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:write');
    companyId = session.companyId;
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const created = await service.createTask(actorOf(session), parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'TeamTask', entityId: created.id, metadata: { title: parsed.data.title, assignee: parsed.data.assigneeId ?? session.id } });
    revalidate();
    return { success: true, data: created, message: 'Tarea creada' };
  } catch (error) {
    return fail(error, companyId, { action: 'createTask' });
  }
}

export async function updateTaskAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:write');
    companyId = session.companyId;
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    await service.updateTask(actorOf(session), String(id), parsed.data);
    revalidate();
    return { success: true, data: null, message: 'Tarea actualizada' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateTask' });
  }
}

export async function setTaskStatusAction(id: string, status: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:write');
    companyId = session.companyId;
    const parsed = taskStatusSchema.safeParse(status);
    if (!parsed.success) return { success: false, error: 'Estado inválido' };
    const result = await service.setTaskStatus(actorOf(session), String(id), parsed.data);
    revalidate();
    const message = parsed.data === 'DONE' ? (result.nextDueDate ? `¡Hecha! La próxima se creó para el ${result.nextDueDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' })}` : '¡Hecha!') : undefined;
    return { success: true, data: null, message };
  } catch (error) {
    return fail(error, companyId, { action: 'setTaskStatus' });
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:write');
    companyId = session.companyId;
    await service.deleteTask(actorOf(session), String(id));
    revalidate();
    return { success: true, data: null, message: 'Tarea eliminada' };
  } catch (error) {
    return fail(error, companyId, { action: 'deleteTask' });
  }
}

export async function installStarterTasksAction(): Promise<ActionResult<{ created: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:write');
    companyId = session.companyId;
    const created = await service.installStarterTasks(actorOf(session));
    revalidate();
    return { success: true, data: { created }, message: created === 0 ? 'Ya tienes abiertas todas las rutinas recomendadas' : `Se crearon ${created} rutinas recomendadas` };
  } catch (error) {
    return fail(error, companyId, { action: 'installStarterTasks' });
  }
}

// ── Delegación ───────────────────────────────────────────────────────────────

export async function listDelegationRulesAction(): Promise<ActionResult<DelegationRuleRow[]>> {
  try {
    const session = await requireAuthWithPermission('tasks:read');
    return { success: true, data: await service.listDelegationRules(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveDelegationRuleAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:manage');
    companyId = session.companyId;
    const parsed = delegationRuleSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const saved = await service.saveDelegationRule(session.companyId, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: id ? 'UPDATE' : 'CREATE', entity: 'DelegationRule', entityId: saved.id, metadata: { decision: parsed.data.decision, maxAmount: parsed.data.maxAmount ?? null, maxPercent: parsed.data.maxPercent ?? null } });
    revalidate();
    return { success: true, data: saved, message: 'Regla guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveDelegationRule' });
  }
}

export async function deleteDelegationRuleAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('tasks:manage');
    companyId = session.companyId;
    await service.deleteDelegationRule(session.companyId, String(id));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'DelegationRule', entityId: String(id) });
    revalidate();
    return { success: true, data: null, message: 'Regla eliminada' };
  } catch (error) {
    return fail(error, companyId, { action: 'deleteDelegationRule' });
  }
}

const checkSchema = z.object({
  decision: z.enum(DELEGATED_DECISIONS),
  amount: z.number().int().min(0).max(10_000_000_000).optional(),
  percent: z.number().int().min(0).max(100).optional(),
});

/** "¿Puedo decidir esto yo?" — consulta las reglas escritas para la persona que pregunta. */
export async function checkDelegationAction(input: unknown): Promise<ActionResult<DelegationCheck>> {
  try {
    const session = await requireAuthWithPermission('tasks:read');
    const parsed = checkSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const rules = await service.listDelegationRules(session.companyId);
    return { success: true, data: evaluateDelegation(rules, { ...parsed.data, userId: session.id, role: session.role }) };
  } catch (error) {
    return fail(error);
  }
}
