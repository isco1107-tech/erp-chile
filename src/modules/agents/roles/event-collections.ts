import 'server-only';

import { analyzeCollections, formatCollectionsForPrompt, sortAlerts, type ReceivableKind } from '@/lib/events/production-finance';
import { formatCurrency } from '@/lib/chile/tax';
import { getEventReceivables } from '../services/event-finance-metrics.service';
import { EVENT_COLLECTIONS_KNOWLEDGE_BASE } from '../knowledge-base';
import { saveAlertTasks, saveModelRecommendations } from './event-shared';
import { agentDataScope, agentModuleGuard } from '../constants';
import { getCompanyFeatures } from '@/lib/auth/guards';

/**
 * Rol "Cobranza de eventos": cuotas de candidatas, pagarés y auspicios en
 * efectivo por cobrar, con antigüedad de la deuda y a quién cobrar primero.
 * Los nombres de deudores quedan solo en las alertas internas; al modelo se
 * le manda el agregado sin nombres (ver `formatCollectionsForPrompt`).
 */

const SYSTEM_PROMPT = [
  'Eres el jefe de cobranza virtual de una productora chilena de certámenes y eventos.',
  'Recibirás el saldo por cobrar agregado (solo de los tipos que la empresa usa: cuotas de candidatas, pagarés y/o auspicios), su antigüedad y su concentración.',
  '',
  EVENT_COLLECTIONS_KNOWLEDGE_BASE,
  '',
  'Propón entre 1 y 4 acciones de cobranza concretas y priorizadas para esta semana, en español simple.',
  'Nunca inventes cifras, nombres ni datos que no estén en el resumen.',
].join('\n');

export async function runEventCollectionsAgent(companyId: string): Promise<string> {
  const now = new Date();
  const [allReceivables, features] = await Promise.all([getEventReceivables(companyId), getCompanyFeatures(companyId)]);
  // Solo lo que se cobra con módulos activos: un pagaré viejo de una empresa
  // que apagó Pagarés no debe aparecer en alertas ni en el resumen.
  const scope = agentDataScope(features);
  const kinds: ReceivableKind[] = [
    ...(scope.installments ? (['INSTALLMENT'] as const) : []),
    ...(scope.promissoryNotes ? (['PROMISSORY_NOTE'] as const) : []),
    ...(scope.sponsorships ? (['SPONSORSHIP'] as const) : []),
  ];
  if (kinds.length === 0) return 'Sin módulos de cuotas, pagarés ni auspicios activos: nada que cobrar.';
  const receivables = allReceivables.filter((item) => kinds.includes(item.kind));
  const analysis = analyzeCollections(receivables, now);
  if (analysis.totalBalance === 0) return 'Sin saldos por cobrar en cuotas, pagarés ni auspicios.';

  const savedAlerts = await saveAlertTasks(companyId, 'EVENT_COLLECTIONS', sortAlerts(analysis.alerts));
  const savedRecommendations =
    analysis.overdueBalance > 0
      ? await saveModelRecommendations(
          companyId,
          'EVENT_COLLECTIONS',
          `${SYSTEM_PROMPT}\n${agentModuleGuard(features)}`,
          `Cartera por cobrar:\n${formatCollectionsForPrompt(analysis, kinds)}`
        )
      : 0;

  return [
    `Por cobrar ${formatCurrency(analysis.totalBalance)}, vencido ${formatCurrency(analysis.overdueBalance)}.`,
    `${savedAlerts} alerta(s) nueva(s)${savedRecommendations > 0 ? ` y ${savedRecommendations} recomendación(es) de IA` : ''}.`,
  ].join(' ');
}
