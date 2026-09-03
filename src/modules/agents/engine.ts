import 'server-only';

import type { AgentRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Envoltorio de ejecución para cualquier agente. Crea el `AgentRun` en
 * `RUNNING`, corre `fn()` (el trabajo real del rol, que devuelve un resumen
 * corto de texto) y cierra la corrida en `COMPLETED` o `FAILED` — nunca deja
 * una fila colgada en `RUNNING` si `fn()` lanza.
 *
 * No relanza el error: el llamador (ej. el cron de `/api/agents/run`, que
 * procesa varias empresas en secuencia) no debería cortarse porque una sola
 * empresa falló. El detalle del fallo queda en `AgentRun.error` para
 * diagnosticar, y quien necesite saber cuántas corridas fallaron puede
 * consultarlo después (ver el propio route handler).
 */
export async function runAgent(companyId: string, role: AgentRole, fn: () => Promise<string>): Promise<void> {
  const run = await prisma.agentRun.create({
    data: { companyId, role, status: 'RUNNING' },
  });

  try {
    const summary = await fn();
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', summary, finishedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`[agents:${role}] companyId=${companyId} falló:`, error);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    });
  }
}
