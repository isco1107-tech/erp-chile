import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { calculateIva } from '@/lib/chile/tax';
import {
  BASE_PLATFORM,
  EXTRA_USER_PRICE,
  PRICED_MODULES,
  PRICING_PLANS,
  type PlanId,
  type PricedModule,
  type PricingPlan,
} from './catalog';

/**
 * Cálculos puros del tarifario: qué ya tiene la empresa, cuánto cuesta lo que
 * le falta y cuánto ahorra con un plan. Corren igual en el navegador (para el
 * resumen en vivo) y en el servidor (que recalcula SIEMPRE antes de avisar a
 * ventas: el cliente nunca dicta los montos).
 */

const MODULES_BY_ID = new Map(PRICED_MODULES.map((m) => [m.id, m]));
const PLANS_BY_ID = new Map(PRICING_PLANS.map((p) => [p.id, p]));

export function findPricedModule(id: string): PricedModule | undefined {
  return MODULES_BY_ID.get(id);
}

export function findPlan(id: string): PricingPlan | undefined {
  return PLANS_BY_ID.get(id as PlanId);
}

/** Un ítem está contratado cuando TODOS los módulos que activa ya están encendidos. */
export function isModuleContracted(item: PricedModule, features: CompanyFeatureFlags): boolean {
  return item.grants.every((key) => features[key]);
}

/** Ítems cotizables que la empresa todavía no tiene. */
export function availableModules(features: CompanyFeatureFlags): PricedModule[] {
  return PRICED_MODULES.filter((m) => !isModuleContracted(m, features));
}

export interface PlanComparison {
  plan: PricingPlan;
  /** Plataforma base + módulos + usuarios extra, comprados uno a uno. */
  separateTotal: number;
  /** Fracción 0–1 que se ahorra con el plan (0 si no conviene). */
  savings: number;
  /** Módulos del plan que la empresa aún no tiene. */
  missing: PricedModule[];
  /** Cuántos de los módulos del plan ya tiene. */
  owned: number;
}

export function comparePlan(plan: PricingPlan, features: CompanyFeatureFlags): PlanComparison {
  const items = plan.moduleIds.map((id) => MODULES_BY_ID.get(id)).filter((m): m is PricedModule => m !== undefined);
  const extraUsers = Math.max(0, plan.includedUsers - BASE_PLATFORM.includedUsers);
  const separateTotal = BASE_PLATFORM.price + items.reduce((sum, m) => sum + m.price, 0) + extraUsers * EXTRA_USER_PRICE;
  const savings = separateTotal > 0 ? Math.max(0, 1 - plan.price / separateTotal) : 0;
  const missing = items.filter((m) => !isModuleContracted(m, features));
  return { plan, separateTotal, savings, missing, owned: items.length - missing.length };
}

export interface Quote {
  /** Ítems sueltos que se cotizan (ya sin los que la empresa tiene). */
  items: PricedModule[];
  /** Plan elegido, si lo hay. */
  plan: PricingPlan | null;
  /** Neto mensual en CLP, entero. */
  net: number;
  iva: number;
  total: number;
}

/**
 * Cotización de una selección. Si hay plan, cuesta el precio del plan y los
 * ítems sueltos que el plan ya incluye no se cobran dos veces. Ids
 * desconocidos se descartan (no se pueden cotizar).
 */
export function buildQuote(
  itemIds: readonly string[],
  planId: string | null | undefined,
  features: CompanyFeatureFlags
): Quote {
  const plan = planId ? (findPlan(planId) ?? null) : null;
  const inPlan = new Set(plan?.moduleIds ?? []);
  const seen = new Set<string>();
  const items: PricedModule[] = [];
  for (const id of itemIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = MODULES_BY_ID.get(id);
    if (!item || isModuleContracted(item, features) || inPlan.has(id)) continue;
    items.push(item);
  }
  const net = (plan?.price ?? 0) + items.reduce((sum, m) => sum + m.price, 0);
  const iva = calculateIva(net);
  return { items, plan, net, iva, total: net + iva };
}
