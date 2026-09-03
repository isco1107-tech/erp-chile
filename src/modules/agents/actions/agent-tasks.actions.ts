'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type AgentTask, type AgentTaskStatus } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe un registro con esos datos';
  }
  return toFriendlyErrorMessage(error);
}

export async function listAgentTasksAction(status?: AgentTaskStatus): Promise<ActionResult<AgentTask[]>> {
  try {
    const session = await requireAuthWithPermission('agents:view');
    const data = await prisma.agentTask.findMany({
      where: { companyId: session.companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Marca una recomendación como revisada. Todas las tareas de este módulo son
 * puramente informativas (ningún rol dispara una acción externa real) — a
 * diferencia de un flujo de aprobación clásico, esto no ejecuta nada más que
 * el propio cambio de estado.
 */
export async function approveAgentTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('agents:approve');
    const result = await prisma.agentTask.updateMany({
      where: { id: taskId, companyId: session.companyId, status: 'PENDING' },
      data: { status: 'DONE', approvedByUserId: session.id },
    });
    if (result.count === 0) return { success: false, error: 'Tarea no encontrada o ya fue procesada' };

    revalidatePath('/dashboard/agents');
    return { success: true, data: null, message: 'Marcada como revisada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function rejectAgentTaskAction(taskId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('agents:approve');
    const result = await prisma.agentTask.updateMany({
      where: { id: taskId, companyId: session.companyId, status: 'PENDING' },
      data: { status: 'REJECTED', approvedByUserId: session.id },
    });
    if (result.count === 0) return { success: false, error: 'Tarea no encontrada o ya fue procesada' };

    revalidatePath('/dashboard/agents');
    return { success: true, data: null, message: 'Descartada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
