import 'server-only';

import type { AgentRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateAgentText } from '../services/gemini-agent';
import { CEO_PRIORITIZATION_RUBRIC } from '../knowledge-base';

/**
 * Rol CEO: resumen ejecutivo. Es el ÚNICO rol que "lee" el trabajo de los
 * demás — CFO, COO y SALES leen directo de la base (ventas, inventario,
 * tesorería) y no dependen del CEO para nada. El CEO corre DESPUÉS de esos
 * tres en el cron (ver vercel.json) y resume sus recomendaciones más
 * recientes en 2-3 prioridades de la semana.
 */
const SOURCE_ROLES: AgentRole[] = ['CFO', 'COO', 'SALES'];

/** Ventana en la que se espera que CFO/COO/SALES ya hayan corrido antes que el CEO en el mismo ciclo. */
const LOOKBACK_HOURS = 12;

const SYSTEM_PROMPT = [
  'Eres el CEO virtual de una pyme chilena que resume el trabajo de su equipo ejecutivo (CFO, COO, Ventas), con criterio ejecutivo profesional.',
  'Recibirás las recomendaciones que esos tres roles generaron. Resume las 2-3 prioridades más importantes de la semana, cada una en una frase corta, en español y en tono ejecutivo.',
  '',
  CEO_PRIORITIZATION_RUBRIC,
  '',
  'Nunca inventes cifras, nombres ni recomendaciones que no estén en la lista entregada — solo reordena y condensa lo que el equipo ya reportó.',
  'Devuelve el resultado con cada prioridad en su propia línea, numerada ("1. ...", "2. ...").',
].join('\n');

function splitLines(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[\s\-*\d.)]+/, '').trim())
    .filter((line) => line.length > 0);
  return (lines.length > 0 ? lines : [text.trim()]).slice(0, 3);
}

export async function runCeoAgent(companyId: string): Promise<string> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const recentTasks = await prisma.agentTask.findMany({
    where: { companyId, role: { in: SOURCE_ROLES }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { role: true, title: true, description: true },
    take: 30,
  });

  if (recentTasks.length === 0) {
    return 'Sin recomendaciones nuevas de CFO/COO/Ventas en las últimas horas: nada que priorizar todavía.';
  }

  const bullet = recentTasks.map((t) => `- [${t.role}] ${t.title}: ${t.description}`).join('\n');

  let priorities: string[];
  try {
    const prioritiesText = await generateAgentText(SYSTEM_PROMPT, `Recomendaciones recientes del equipo:\n${bullet}`);
    priorities = splitLines(prioritiesText);
  } catch (error) {
    console.error('[agents:CEO] Gemini falló al resumir prioridades, se aborta esta corrida sin crear tareas:', error);
    throw error;
  }

  await prisma.agentTask.createMany({
    data: priorities.map((priority) => ({
      companyId,
      role: 'CEO',
      title: 'Prioridad de la semana',
      description: priority,
      requiresApproval: false,
      payload: { basedOnTasks: bullet },
    })),
  });

  return `Se generaron ${priorities.length} prioridad(es) a partir de ${recentTasks.length} recomendación(es) de CFO/COO/Ventas.`;
}
