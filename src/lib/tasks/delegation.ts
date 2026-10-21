import type { Role } from '@prisma/client';

export const DELEGATED_DECISIONS = ['PURCHASE_APPROVAL', 'EXPENSE_APPROVAL', 'DISCOUNT', 'PRICE_CHANGE', 'REFUND', 'STOCK_ADJUSTMENT', 'SUPPLIER_PAYMENT', 'OTHER'] as const;
export type DelegatedDecisionKey = (typeof DELEGATED_DECISIONS)[number];

export const DELEGATED_DECISION_LABELS: Record<DelegatedDecisionKey, string> = {
  PURCHASE_APPROVAL: 'Aprobar una compra',
  EXPENSE_APPROVAL: 'Aprobar un gasto',
  DISCOUNT: 'Dar un descuento',
  PRICE_CHANGE: 'Cambiar un precio',
  REFUND: 'Devolver dinero o reponer producto',
  STOCK_ADJUSTMENT: 'Ajustar el inventario',
  SUPPLIER_PAYMENT: 'Pagar a un proveedor o productor',
  OTHER: 'Otra decisión',
};

export interface DelegationRuleLike {
  decision: DelegatedDecisionKey;
  delegateeId: string | null;
  delegateRole: Role | null;
  maxAmount: number | null;
  maxPercent: number | null;
  isActive: boolean;
}

export interface DelegationCheck {
  allowed: boolean;
  /** Explicación para mostrar a la persona. */
  reason: string;
}

/**
 * ¿Puede esta persona decidir esto sin consultar al dueño? Es una consulta
 * sobre las reglas escritas, no un permiso: el acceso real lo siguen dando
 * los roles (RBAC). Sirve para que el equipo lo vea, y para que una pantalla
 * de aprobación pueda advertir "esto excede lo que te delegaron".
 *
 * Sin regla que aplique, la decisión NO está delegada. Con varias, gana la más
 * generosa que cubra el caso.
 */
export function evaluateDelegation(
  rules: DelegationRuleLike[],
  request: { decision: DelegatedDecisionKey; userId: string; role: Role; amount?: number; percent?: number }
): DelegationCheck {
  if (request.role === 'OWNER') return { allowed: true, reason: 'El dueño decide sin límite' };
  const applicable = rules.filter((r) => r.isActive && r.decision === request.decision && (r.delegateeId === request.userId || (r.delegateeId === null && r.delegateRole === request.role)));
  if (applicable.length === 0) return { allowed: false, reason: 'Esta decisión no está delegada: consúltala con el dueño' };
  const covering = applicable.find((r) => (r.maxAmount === null || request.amount === undefined || request.amount <= r.maxAmount) && (r.maxPercent === null || request.percent === undefined || request.percent <= r.maxPercent));
  if (covering) return { allowed: true, reason: 'Está dentro de lo que te delegaron' };
  const limits = applicable.map((r) => [r.maxAmount !== null ? `hasta ${r.maxAmount.toLocaleString('es-CL')} pesos` : null, r.maxPercent !== null ? `hasta ${r.maxPercent}%` : null].filter(Boolean).join(' y '));
  return { allowed: false, reason: `Supera lo delegado (${limits.join(' o ')}): consúltalo con el dueño` };
}

/** Cuántas decisiones distintas tienen al menos una regla activa. El diagnóstico pedía partir con 3. */
export function delegatedDecisionCount(rules: DelegationRuleLike[]): number {
  return new Set(rules.filter((r) => r.isActive).map((r) => r.decision)).size;
}
