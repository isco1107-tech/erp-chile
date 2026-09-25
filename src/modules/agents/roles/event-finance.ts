import 'server-only';

import { analyzeProjectFinance, formatProjectsForPrompt, sortAlerts } from '@/lib/events/production-finance';
import { getEventProjectsFinance } from '../services/event-finance-metrics.service';
import { EVENT_FINANCE_KNOWLEDGE_BASE } from '../knowledge-base';
import { saveAlertTasks, saveModelRecommendations } from './event-shared';

/**
 * Rol "Finanzas de producción": rentabilidad y presupuesto de cada certamen
 * activo (o recién terminado). Lee ingresos por fuente, gasto real,
 * presupuesto, auspicios comprometidos vs. cobrados, entregables atrasados y
 * cuotas de candidatas pendientes; deja alertas deterministas
 * (`analyzeProjectFinance`) y, si hay Gemini, recomendaciones redactadas
 * sobre esos mismos datos. Todo es informativo: no ejecuta nada.
 */

const SYSTEM_PROMPT = [
  'Eres el director financiero virtual de una productora chilena de certámenes de belleza y eventos, con criterio profesional.',
  'Recibirás, por cada certamen activo, su ingreso en caja por fuente, gasto real, presupuesto, auspicios comprometidos y cobrados, cuotas de candidatas por cobrar y días que faltan para el evento.',
  '',
  EVENT_FINANCE_KNOWLEDGE_BASE,
  '',
  'Propón entre 1 y 4 recomendaciones concretas para mejorar el resultado o la caja de los certámenes, priorizando las de mayor impacto en pesos y las más urgentes por cercanía del evento. Nombra el certamen al que se refiere cada una.',
  'Usa los criterios solo para evaluar las cifras; nunca inventes cifras, marcas, personas ni datos que no estén en el resumen. Si un dato no aparece, no lo menciones.',
].join('\n');

export async function runEventFinanceAgent(companyId: string): Promise<string> {
  const now = new Date();
  const inputs = await getEventProjectsFinance(companyId, now);
  if (inputs.length === 0) return 'Sin certámenes activos que analizar.';

  const analyses = inputs.map((input) => analyzeProjectFinance(input, now));
  const alerts = sortAlerts(analyses.flatMap((analysis) => analysis.alerts));
  const savedAlerts = await saveAlertTasks(companyId, 'EVENT_FINANCE', alerts);
  const summary = formatProjectsForPrompt(analyses, inputs);
  const savedRecommendations = await saveModelRecommendations(companyId, 'EVENT_FINANCE', SYSTEM_PROMPT, `Certámenes:\n${summary}`);

  const atRisk = analyses.filter((a) => a.projectedMargin < 0).length;
  return [
    `Se analizaron ${inputs.length} certamen(es)${atRisk > 0 ? `, ${atRisk} con resultado proyectado negativo` : ''}.`,
    `${savedAlerts} alerta(s) nueva(s)${savedRecommendations > 0 ? ` y ${savedRecommendations} recomendación(es) de IA` : ''}.`,
  ].join(' ');
}
