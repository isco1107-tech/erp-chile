import 'server-only';

import type { AgentRole } from '@prisma/client';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { runCeoAgent } from './roles/ceo';
import { runCfoAgent } from './roles/cfo';
import { runCooAgent } from './roles/coo';
import { runSalesAgent } from './roles/sales';
import { runEventFinanceAgent } from './roles/event-finance';
import { runEventCollectionsAgent } from './roles/event-collections';

/**
 * Qué función ejecuta cada rol y qué módulo contratado lo habilita. Lo usan
 * el cron (`/api/agents/run`) y el botón "Analizar ahora" del panel, para que
 * ambos corran exactamente lo mismo.
 */
export const ROLE_RUNNERS: Record<AgentRole, (companyId: string) => Promise<string>> = {
  CEO: runCeoAgent,
  CFO: runCfoAgent,
  COO: runCooAgent,
  SALES: runSalesAgent,
  EVENT_FINANCE: runEventFinanceAgent,
  EVENT_COLLECTIONS: runEventCollectionsAgent,
};

/** Módulo que habilita cada rol: el equipo ejecutivo va con CRM, los de eventos con Certámenes. */
export const ROLE_FEATURE: Record<AgentRole, keyof CompanyFeatureFlags> = {
  CEO: 'hasCrm',
  CFO: 'hasCrm',
  COO: 'hasCrm',
  SALES: 'hasCrm',
  EVENT_FINANCE: 'hasEventProjects',
  EVENT_COLLECTIONS: 'hasEventProjects',
};

export function isAgentRole(value: string): value is AgentRole {
  return Object.prototype.hasOwnProperty.call(ROLE_RUNNERS, value);
}
