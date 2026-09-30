import type { DelegatedDecision, Role, TeamTaskPriority, TeamTaskRecurrence, TeamTaskStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { delegatedDecisionCount, type DelegatedDecisionKey } from '@/lib/tasks/delegation';
import { isOverdue, nextDueDate } from '@/lib/tasks/recurrence';
import { STARTER_TASKS } from '@/lib/tasks/starter';
import type { DelegationRuleInput, TaskInput } from '../schema';

/**
 * Tareas del equipo y reglas de delegación. Quien no gestiona ve y mueve solo
 * lo suyo (asignado a esa persona o creado por ella); quien gestiona
 * (`tasks:manage`) ve todo y puede asignar a otros.
 */

export class TaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskError';
  }
}

export interface Actor {
  companyId: string;
  userId: string;
  canManage: boolean;
}

function day(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TeamTaskStatus;
  priority: TeamTaskPriority;
  dueDate: Date | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  recurrence: TeamTaskRecurrence;
  completedAt: Date | null;
  overdue: boolean;
  /** ¿Quien consulta puede modificarla? */
  editable: boolean;
}

function visibleTo(actor: Actor) {
  return actor.canManage ? {} : { OR: [{ assigneeId: actor.userId }, { createdById: actor.userId }] };
}

export type TaskScope = 'MINE' | 'ALL' | 'DONE';

export async function listTasks(actor: Actor, scope: TaskScope, now: Date = new Date()): Promise<TaskRow[]> {
  const where =
    scope === 'DONE'
      ? { companyId: actor.companyId, status: { in: ['DONE', 'CANCELLED'] as TeamTaskStatus[] }, ...visibleTo(actor) }
      : scope === 'MINE'
        ? { companyId: actor.companyId, status: { in: ['TODO', 'DOING'] as TeamTaskStatus[] }, assigneeId: actor.userId }
        : { companyId: actor.companyId, status: { in: ['TODO', 'DOING'] as TeamTaskStatus[] }, ...visibleTo(actor) };
  const rows = await prisma.teamTask.findMany({
    where,
    orderBy: scope === 'DONE' ? [{ completedAt: 'desc' }] : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 300,
  });
  const assigneeIds = [...new Set(rows.flatMap((r) => (r.assigneeId ? [r.assigneeId] : [])))];
  const users = assigneeIds.length ? await prisma.user.findMany({ where: { companyId: actor.companyId, id: { in: assigneeIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null,
    createdById: r.createdById,
    recurrence: r.recurrence,
    completedAt: r.completedAt,
    overdue: isOverdue(r, now),
    editable: actor.canManage || r.assigneeId === actor.userId || r.createdById === actor.userId,
  }));
}

export async function listTeam(companyId: string): Promise<Array<{ id: string; name: string; role: Role }>> {
  return prisma.user.findMany({ where: { companyId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } });
}

async function resolveAssignee(actor: Actor, requested: string | null | undefined, currentAssigneeId?: string | null): Promise<string> {
  const assigneeId = requested || actor.userId;
  // Quien no gestiona no reasigna, pero puede editar una tarea que ya tenía otro responsable sin cambiarlo.
  if (assigneeId !== actor.userId && assigneeId !== currentAssigneeId && !actor.canManage) throw new TaskError('Solo el dueño o un administrador puede asignar tareas a otras personas');
  const user = await prisma.user.findFirst({ where: { id: assigneeId, companyId: actor.companyId, isActive: true }, select: { id: true } });
  if (!user) throw new TaskError('Responsable no encontrado');
  return assigneeId;
}

export async function createTask(actor: Actor, input: TaskInput): Promise<{ id: string }> {
  const assigneeId = await resolveAssignee(actor, input.assigneeId);
  return prisma.teamTask.create({
    data: {
      companyId: actor.companyId,
      title: input.title,
      description: input.description || null,
      priority: input.priority,
      dueDate: day(input.dueDate),
      assigneeId,
      createdById: actor.userId,
      recurrence: input.recurrence,
    },
    select: { id: true },
  });
}

export async function updateTask(actor: Actor, id: string, input: TaskInput): Promise<void> {
  const existing = await prisma.teamTask.findFirst({ where: { id, companyId: actor.companyId, ...visibleTo(actor) }, select: { assigneeId: true } });
  if (!existing) throw new TaskError('La tarea no existe, ya está cerrada o no es tuya');
  const assigneeId = await resolveAssignee(actor, input.assigneeId, existing.assigneeId);
  const result = await prisma.teamTask.updateMany({
    where: { id, companyId: actor.companyId, status: { in: ['TODO', 'DOING'] }, ...visibleTo(actor) },
    data: { title: input.title, description: input.description || null, priority: input.priority, dueDate: day(input.dueDate), assigneeId, recurrence: input.recurrence },
  });
  if (result.count === 0) throw new TaskError('La tarea no existe, ya está cerrada o no es tuya');
}

/**
 * Cambia el estado. Al completar una tarea que se repite se crea la siguiente
 * en la misma transacción; el UPDATE solo prospera si la tarea seguía abierta,
 * así un doble clic no genera dos tareas nuevas.
 */
export async function setTaskStatus(actor: Actor, id: string, status: TeamTaskStatus, now: Date = new Date()): Promise<{ nextDueDate: Date | null }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.teamTask.findFirst({ where: { id, companyId: actor.companyId, ...visibleTo(actor) } });
    if (!current) throw new TaskError('Tarea no encontrada');
    const closing = status === 'DONE' || status === 'CANCELLED';
    const result = await tx.teamTask.updateMany({
      where: { id, companyId: actor.companyId, status: current.status },
      data: { status, completedAt: closing ? now : null },
    });
    if (result.count === 0) throw new TaskError('La tarea cambió mientras la editabas. Recarga e inténtalo de nuevo');
    if (status !== 'DONE' || current.status === 'DONE' || current.status === 'CANCELLED' || current.recurrence === 'NONE') return { nextDueDate: null };
    const next = nextDueDate(current.dueDate, current.recurrence, now);
    if (!next) return { nextDueDate: null };
    await tx.teamTask.create({
      data: { companyId: actor.companyId, title: current.title, description: current.description, priority: current.priority, dueDate: next, assigneeId: current.assigneeId, createdById: current.createdById, recurrence: current.recurrence },
    });
    return { nextDueDate: next };
  });
}

export async function deleteTask(actor: Actor, id: string): Promise<void> {
  const result = await prisma.teamTask.deleteMany({ where: { id, companyId: actor.companyId, ...(actor.canManage ? {} : { createdById: actor.userId }) } });
  if (result.count === 0) throw new TaskError('La tarea no existe o solo quien la creó puede borrarla');
}

/** Crea las rutinas recomendadas que aún no existan abiertas (por título), asignadas a quien las pide. */
export async function installStarterTasks(actor: Actor, now: Date = new Date()): Promise<number> {
  const open = await prisma.teamTask.findMany({ where: { companyId: actor.companyId, status: { in: ['TODO', 'DOING'] } }, select: { title: true } });
  const have = new Set(open.map((t) => t.title));
  const fresh = STARTER_TASKS.filter((t) => !have.has(t.title));
  if (fresh.length === 0) return 0;
  const result = await prisma.teamTask.createMany({
    data: fresh.map((t) => ({
      companyId: actor.companyId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      recurrence: t.recurrence,
      dueDate: new Date(now.getTime() + t.dueInDays * 24 * 60 * 60 * 1000),
      assigneeId: actor.userId,
      createdById: actor.userId,
    })),
  });
  return result.count;
}

// ── Delegación ───────────────────────────────────────────────────────────────

export interface DelegationRuleRow {
  id: string;
  decision: DelegatedDecisionKey;
  title: string;
  delegateeId: string | null;
  delegateeName: string | null;
  delegateRole: Role | null;
  maxAmount: number | null;
  maxPercent: number | null;
  conditions: string | null;
  isActive: boolean;
}

export async function listDelegationRules(companyId: string): Promise<DelegationRuleRow[]> {
  const rules = await prisma.delegationRule.findMany({ where: { companyId }, orderBy: [{ isActive: 'desc' }, { decision: 'asc' }, { createdAt: 'asc' }] });
  const ids = [...new Set(rules.flatMap((r) => (r.delegateeId ? [r.delegateeId] : [])))];
  const users = ids.length ? await prisma.user.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rules.map((r) => ({
    id: r.id,
    decision: r.decision as DelegatedDecisionKey,
    title: r.title,
    delegateeId: r.delegateeId,
    delegateeName: r.delegateeId ? (names.get(r.delegateeId) ?? null) : null,
    delegateRole: r.delegateRole,
    maxAmount: r.maxAmount,
    maxPercent: r.maxPercent,
    conditions: r.conditions,
    isActive: r.isActive,
  }));
}

export async function saveDelegationRule(companyId: string, id: string | null, input: DelegationRuleInput): Promise<{ id: string }> {
  if (input.delegateeId) {
    const user = await prisma.user.findFirst({ where: { id: input.delegateeId, companyId, isActive: true }, select: { id: true } });
    if (!user) throw new TaskError('Persona no encontrada');
  }
  const data = {
    decision: input.decision as DelegatedDecision,
    title: input.title,
    delegateeId: input.delegateeId ?? null,
    delegateRole: input.delegateRole ?? null,
    maxAmount: input.maxAmount ?? null,
    maxPercent: input.maxPercent ?? null,
    conditions: input.conditions || null,
    isActive: input.isActive,
  };
  if (!id) return prisma.delegationRule.create({ data: { companyId, ...data }, select: { id: true } });
  const result = await prisma.delegationRule.updateMany({ where: { id, companyId }, data });
  if (result.count === 0) throw new TaskError('Regla no encontrada');
  return { id };
}

export async function deleteDelegationRule(companyId: string, id: string): Promise<void> {
  const result = await prisma.delegationRule.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new TaskError('Regla no encontrada');
}

// ── Panel ────────────────────────────────────────────────────────────────────

export interface TasksOverview {
  mine: number;
  mineOverdue: number;
  overdueTotal: number | null;
  doneLast7d: number;
  delegatedDecisions: number;
}

export async function getOverview(actor: Actor, now: Date = new Date()): Promise<TasksOverview> {
  const open = { companyId: actor.companyId, status: { in: ['TODO', 'DOING'] as TeamTaskStatus[] } };
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [mine, mineOverdue, overdueAll, done, rules] = await Promise.all([
    prisma.teamTask.count({ where: { ...open, assigneeId: actor.userId } }),
    prisma.teamTask.count({ where: { ...open, assigneeId: actor.userId, dueDate: { lt: now } } }),
    actor.canManage ? prisma.teamTask.count({ where: { ...open, dueDate: { lt: now } } }) : Promise.resolve(null),
    prisma.teamTask.count({ where: { companyId: actor.companyId, status: 'DONE', completedAt: { gte: since }, ...visibleTo(actor) } }),
    prisma.delegationRule.findMany({ where: { companyId: actor.companyId }, select: { decision: true, delegateeId: true, delegateRole: true, maxAmount: true, maxPercent: true, isActive: true } }),
  ]);
  return { mine, mineOverdue: mineOverdue, overdueTotal: overdueAll, doneLast7d: done, delegatedDecisions: delegatedDecisionCount(rules.map((r) => ({ ...r, decision: r.decision as DelegatedDecisionKey }))) };
}
