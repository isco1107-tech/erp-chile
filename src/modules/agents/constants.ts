import type { AgentRole } from '@prisma/client';

/** Los 4 roles, en el orden en que se muestran en /dashboard/agents. */
export const AGENT_ROLES: AgentRole[] = ['CEO', 'CFO', 'COO', 'SALES'];

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  CEO: 'CEO — Resumen ejecutivo',
  CFO: 'CFO — Salud financiera',
  COO: 'COO — Operaciones e inventario',
  SALES: 'Ventas — Desempeño comercial',
};
