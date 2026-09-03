'use server';

import type { AgentRun } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

/**
 * Última corrida de cada rol para esta empresa (una fila por `AgentRole`),
 * para las 4 tarjetas de "Surface Area" en /dashboard/agents. `distinct` +
 * `orderBy: startedAt desc` le pide a Prisma la fila más reciente por rol.
 */
export async function listLatestAgentRunsAction(): Promise<ActionResult<AgentRun[]>> {
  try {
    const session = await requireAuthWithPermission('agents:view');
    const data = await prisma.agentRun.findMany({
      where: { companyId: session.companyId },
      orderBy: { startedAt: 'desc' },
      distinct: ['role'],
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
