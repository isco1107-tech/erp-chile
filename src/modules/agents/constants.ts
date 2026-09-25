import type { AgentRole } from '@prisma/client';
import { MODULES, type CompanyFeatureFlags } from '@/lib/auth/modules';

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

/**
 * Qué datos puede mirar un agente según los módulos contratados de la
 * empresa. Un agente nunca analiza ni menciona datos de un módulo apagado:
 * aunque haya filas viejas en la base (un módulo que se usó y después se
 * apagó), no entran al resumen que recibe el modelo.
 */
export interface AgentDataScope {
  /** Documentos de venta: facturación electrónica o POS. */
  sales: boolean;
  /** Margen sobre costo PMP. */
  margins: boolean;
  /** Cuentas por cobrar/pagar y flujo de caja. */
  treasury: boolean;
  inventory: boolean;
  /** Precio de catálogo vs. costo: requiere catálogo y costeo. */
  catalogPricing: boolean;
  sponsorships: boolean;
  installments: boolean;
  promissoryNotes: boolean;
  ticketing: boolean;
  publicVoting: boolean;
}

export function agentDataScope(features: CompanyFeatureFlags): AgentDataScope {
  const sales = features.hasDteBilling || features.hasPos;
  return {
    sales,
    margins: sales && features.hasPmpCosting,
    treasury: features.hasTreasury,
    inventory: features.hasInventory,
    catalogPricing: features.hasInventory && features.hasPmpCosting,
    sponsorships: features.hasSponsorships,
    installments: features.hasInstallmentPlans,
    promissoryNotes: features.hasPromissoryNotes,
    ticketing: features.hasTicketing,
    publicVoting: features.hasPublicVoting,
  };
}

/** Si el rol tiene al menos un módulo activo con datos que analizar (sin mirar el CEO, que depende de los demás). */
function roleHasData(role: AgentRole, scope: AgentDataScope): boolean {
  switch (role) {
    case 'CFO':
      return scope.sales || scope.treasury;
    case 'COO':
      return scope.inventory;
    case 'SALES':
      return scope.sales;
    case 'EVENT_FINANCE':
      return true;
    case 'EVENT_COLLECTIONS':
      return scope.sponsorships || scope.installments || scope.promissoryNotes;
    case 'CEO':
      return true;
  }
}

/**
 * Roles que ve y corre una empresa: el módulo que habilita el rol (CRM para
 * el equipo ejecutivo, Certámenes para los de eventos) y, además, algún
 * módulo activo con datos para ese rol — un COO sin Inventario solo hablaría
 * de algo que la empresa no usa. El CEO solo aparece si tiene a quién
 * resumir.
 */
export function visibleAgentRoles(features: CompanyFeatureFlags): AgentRole[] {
  const scope = agentDataScope(features);
  const base = AGENT_ROLES.filter(
    (role) => role !== 'CEO' && (EVENT_AGENT_ROLES.includes(role) ? features.hasEventProjects : features.hasCrm) && roleHasData(role, scope)
  );
  return features.hasCrm && base.length > 0 ? ['CEO', ...base] : base;
}

/**
 * Línea para el prompt de todo agente: qué módulos tiene activos la empresa y
 * la prohibición de hablar de los demás. Complementa el filtrado de datos
 * (que ya deja fuera lo de módulos apagados): evita que el modelo recomiende
 * "vender entradas" o "revisar el inventario" por conocimiento general.
 */
export function agentModuleGuard(features: CompanyFeatureFlags): string {
  const active = MODULES.filter((module) => features[module.key]).map((module) => module.label);
  const inactive = MODULES.filter((module) => !features[module.key]).map((module) => module.label);
  return [
    `Módulos que esta empresa tiene activos: ${active.length ? active.join(', ') : 'ninguno'}.`,
    inactive.length
      ? `La empresa NO usa estos módulos: ${inactive.join(', ')}. Nunca menciones, recomiendes ni supongas nada relacionado con ellos.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
