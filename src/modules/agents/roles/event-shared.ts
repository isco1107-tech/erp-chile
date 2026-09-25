import 'server-only';

import type { AgentRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import type { FinanceAlert } from '@/lib/events/production-finance';
import { generateAgentJson } from '../services/gemini-agent';

/**
 * Pasos comunes de los agentes financieros de eventos: guardar las alertas
 * deterministas como tareas y, si Gemini está disponible, sumarle
 * recomendaciones redactadas por el modelo sobre esos mismos datos.
 */

const SEVERITY_PREFIX: Record<FinanceAlert['severity'], string> = { critical: 'Urgente', warning: 'Atención', info: 'Aviso' };

/**
 * Crea una `AgentTask` por alerta, salvo las que ya están pendientes de
 * revisión con el mismo título: el cron corre a diario y una alerta que
 * sigue vigente no debe duplicarse en la bandeja todos los días.
 */
export async function saveAlertTasks(companyId: string, role: AgentRole, alerts: readonly FinanceAlert[]): Promise<number> {
  if (alerts.length === 0) return 0;
  const titles = alerts.map((alert) => `${SEVERITY_PREFIX[alert.severity]}: ${alert.title}`);
  const existing = await prisma.agentTask.findMany({
    where: { companyId, role, status: 'PENDING', title: { in: titles } },
    select: { title: true },
  });
  const seen = new Set(existing.map((task) => task.title));
  const fresh = alerts
    .map((alert, index) => ({ alert, title: titles[index]! }))
    .filter(({ title }) => {
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    });
  if (fresh.length === 0) return 0;
  await prisma.agentTask.createMany({
    data: fresh.map(({ alert, title }) => ({
      companyId,
      role,
      title,
      description: alert.detail,
      requiresApproval: false,
      payload: { source: 'rule', severity: alert.severity, projectId: alert.projectId },
    })),
  });
  return fresh.length;
}

const recommendationsSchema = z.object({
  recommendations: z.array(z.object({ title: z.string().min(1), detail: z.string().min(1) })).min(1).max(4),
});

const RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título corto de la recomendación (máximo 8 palabras), en español.' },
          detail: { type: 'string', description: 'Acción concreta (1-3 frases), en español simple, basada SOLO en los datos entregados.' },
        },
        required: ['title', 'detail'],
      },
    },
  },
  required: ['recommendations'],
} as const;

/**
 * Pide a Gemini recomendaciones sobre el resumen. Nunca lanza: sin
 * `GEMINI_API_KEY` o con el modelo caído, el agente igual deja sus alertas
 * deterministas y la corrida cuenta como completada.
 */
export async function saveModelRecommendations(companyId: string, role: AgentRole, systemPrompt: string, summary: string): Promise<number> {
  // Sin clave no es un error que reportar a diario: el agente funciona igual con sus reglas.
  if (!process.env.GEMINI_API_KEY) return 0;
  try {
    const { recommendations } = await generateAgentJson(systemPrompt, summary, RECOMMENDATIONS_JSON_SCHEMA, (raw) => recommendationsSchema.parse(raw));
    await prisma.agentTask.createMany({
      data: recommendations.map((rec) => ({
        companyId,
        role,
        title: rec.title,
        description: rec.detail,
        requiresApproval: false,
        payload: { source: 'model', basedOnSnapshot: summary },
      })),
    });
    return recommendations.length;
  } catch (error) {
    captureException(error, { module: 'agents', companyId, extra: { role, reason: 'model-recommendations' } });
    return 0;
  }
}
