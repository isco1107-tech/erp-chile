import type { AgentRole } from '@prisma/client';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';

/** Los roles, en el orden en que se muestran en /dashboard/agents. */
export const AGENT_ROLES: AgentRole[] = ['CEO', 'CFO', 'COO', 'SALES', 'EVENT_FINANCE', 'EVENT_COLLECTIONS'];

/** Roles de la productora de eventos (habilitados por el módulo de Certámenes). */
export const EVENT_AGENT_ROLES: AgentRole[] = ['EVENT_FINANCE', 'EVENT_COLLECTIONS'];

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  CEO: 'CEO — Resumen ejecutivo',
  CFO: 'CFO — Salud financiera',
  COO: 'COO — Operaciones e inventario',
  SALES: 'Ventas — Desempeño comercial',
  EVENT_FINANCE: 'Finanzas de producción — Rentabilidad por certamen',
  EVENT_COLLECTIONS: 'Cobranza de eventos — Cuotas, pagarés y auspicios',
};

/** Roles que ve una empresa según sus módulos (mismo criterio que `ROLE_FEATURE` en runners.ts). */
export function visibleAgentRoles(features: Pick<CompanyFeatureFlags, 'hasCrm' | 'hasEventProjects'>): AgentRole[] {
  return AGENT_ROLES.filter((role) => (EVENT_AGENT_ROLES.includes(role) ? features.hasEventProjects : features.hasCrm));
}
