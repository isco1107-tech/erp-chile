import 'server-only';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateAgentJson } from '../services/gemini-agent';
import { getFinancialSnapshot, formatFinancialSnapshotForPrompt } from '../services/business-metrics.service';
import { CFO_KNOWLEDGE_BASE } from '../knowledge-base';
import { agentDataScope, agentModuleGuard } from '../constants';
import { getCompanyFeatures } from '@/lib/auth/guards';

/**
 * Rol CFO: salud financiera. Lee métricas REALES del ERP (ventas del mes vs
 * mes anterior, margen PMP, IVA débito, cuentas por cobrar y por pagar,
 * concentración de cartera, flujo de caja de 30 días — ver
 * business-metrics.service.ts, que reutiliza
 * src/modules/treasury/services/treasury.service.ts en vez de duplicar esa
 * lógica) y le pide a Gemini alertas/recomendaciones financieras concretas
 * basadas SOLO en esos datos, usando `CFO_KNOWLEDGE_BASE` (rangos de
 * referencia generales de finanzas pyme) como lente profesional para
 * interpretarlos — nunca como datos de la empresa. Cada recomendación es
 * puramente informativa: `requiresApproval: false`, no dispara ninguna acción
 * externa.
 */
const recommendationSchema = z.object({ title: z.string().min(1), detail: z.string().min(1) });
const recommendationsSchema = z.object({ recommendations: z.array(recommendationSchema).min(2).max(5) });

const RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título corto de la alerta/recomendación (máximo 8 palabras), en español.' },
          detail: {
            type: 'string',
            description:
              'Explicación concreta y accionable (1-3 frases), en español simple, basada SOLO en los datos entregados. Si corresponde, indica contra qué criterio de referencia se está evaluando (ej. "por sobre el rango saludable de X-Y%").',
          },
        },
        required: ['title', 'detail'],
      },
    },
  },
  required: ['recommendations'],
} as const;

const systemPrompt = (moduleGuard: string) => [
  'Eres el CFO virtual de una pyme chilena, con criterio financiero profesional.',
  'Recibirás un resumen de métricas financieras REALES, solo de los módulos que la empresa usa: según el caso, ventas del mes y del mes anterior, margen, IVA débito, cuentas por cobrar (totales, vencidas, por vencer pronto, concentración en los principales deudores), cuentas por pagar y flujo de caja de los últimos 30 días.',
  moduleGuard,
  '',
  CFO_KNOWLEDGE_BASE,
  'Aplica solo los criterios de referencia de las métricas que vienen en el resumen; ignora los que hablan de datos ausentes.',
  '',
  'Analiza TODAS las variables del resumen en conjunto (no solo una) para proponer entre 2 y 5 alertas o recomendaciones financieras concretas y accionables — más cuando los datos lo justifiquen, sin rellenar con alertas débiles solo por llegar a un número — en español simple, priorizando las de mayor impacto en pesos o mayor riesgo de caja.',
  'Usa los criterios de referencia solo para EVALUAR si una cifra real es saludable o preocupante — nunca los presentes como si fueran un dato de esta empresa, y nunca inventes cifras, nombres de clientes ni datos que no estén en el resumen. Si un dato no aparece, no lo menciones.',
].join('\n');

export async function runCfoAgent(companyId: string): Promise<string> {
  const features = await getCompanyFeatures(companyId);
  const scope = agentDataScope(features);
  if (!scope.sales && !scope.treasury) return 'Sin módulos de ventas ni tesorería activos: nada financiero que analizar.';

  const snapshot = await getFinancialSnapshot(companyId);
  const summary = formatFinancialSnapshotForPrompt(snapshot, scope);

  const { recommendations } = await generateAgentJson(
    systemPrompt(agentModuleGuard(features)),
    `Métricas financieras del período:\n${summary}`,
    RECOMMENDATIONS_JSON_SCHEMA,
    (raw) => recommendationsSchema.parse(raw)
  );

  await prisma.agentTask.createMany({
    data: recommendations.map((rec) => ({
      companyId,
      role: 'CFO',
      title: rec.title,
      description: rec.detail,
      requiresApproval: false,
      payload: { basedOnSnapshot: summary },
    })),
  });

  return `Se generaron ${recommendations.length} alerta(s)/recomendación(es) financiera(s) a partir de las métricas reales del período.`;
}
