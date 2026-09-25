'use server';

import { revalidatePath } from 'next/cache';
import type { AgentRole, AgentRun } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { runAgent } from '../engine';
import { ROLE_FEATURE, ROLE_RUNNERS } from '../runners';
import { EVENT_AGENT_ROLES, visibleAgentRoles } from '../constants';

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

/** Roles que se pueden correr a pedido desde el panel (el resto solo corre por cron). */
const ON_DEMAND_ROLES: AgentRole[] = EVENT_AGENT_ROLES;
/** Espera mínima entre dos corridas a pedido del mismo rol. */
const ON_DEMAND_COOLDOWN_MS = 10 * 60_000;

/**
 * "Analizar ahora" de los agentes financieros de eventos: corre el mismo
 * análisis del cron para esta empresa, sin esperar al día siguiente. Solo
 * para quien puede gestionar recomendaciones (`agents:approve`) y con una
 * espera de 10 minutos entre corridas, porque cada una puede llamar a Gemini.
 */
export async function runAgentNowAction(role: AgentRole): Promise<ActionResult<{ summary: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('agents:approve');
    companyId = session.companyId;
    if (!ON_DEMAND_ROLES.includes(role)) return { success: false, error: 'Este agente solo corre de forma programada cada mañana.' };
    if (!session.features[ROLE_FEATURE[role]] || !visibleAgentRoles(session.features).includes(role)) {
      return { success: false, error: 'Tu plan no incluye los módulos que usa este agente.' };
    }

    const recent = await prisma.agentRun.findFirst({
      where: { companyId, role, startedAt: { gte: new Date(Date.now() - ON_DEMAND_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) return { success: false, error: 'Este agente corrió hace menos de 10 minutos. Espera un poco antes de volver a analizar.' };

    const tenant = companyId;
    const result = await runAgent(tenant, role, () => ROLE_RUNNERS[role](tenant));
    if (result.status === 'FAILED') return { success: false, error: 'El análisis no se pudo completar. Inténtalo de nuevo en unos minutos.' };
    revalidatePath('/dashboard/agents');
    return { success: true, data: { summary: result.summary ?? '' }, message: result.summary ?? 'Análisis completado' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'agents', companyId, extra: { role, reason: 'run-now' } });
    return { success: false, error: 'No se pudo ejecutar el análisis' };
  }
}
