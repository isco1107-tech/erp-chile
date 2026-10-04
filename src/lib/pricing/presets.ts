import { DEFAULT_FEATURES, type CompanyFeatureFlags } from '@/lib/auth/modules';
import {
  BASE_PLATFORM,
  EXTRA_USER_PRICE,
  INCLUDED_IN_BASE,
  PRICED_MODULES,
  PRICING_PLANS,
  type PricedModule,
  type PricingPlan,
} from './catalog';

/**
 * Planes contratables al crear una empresa o cambiarla de plan desde el panel
 * SaaS. NO son una lista aparte: se DERIVAN del tarifario (`catalog.ts`), así
 * lo que se activa al elegir "Gestión" es exactamente lo que el cliente ve y
 * paga en Configuración → Planes y módulos.
 *
 * `Base` es la plataforma sola (inventario y costeo PMP, 2 usuarios); los demás
 * agregan los módulos del plan. Los planes anteriores (Starter, Profesional,
 * Enterprise) ya no se ofrecen; una empresa que los tiene conserva su nombre,
 * sus módulos y sus límites hasta que el superadmin la cambie de plan.
 */

export const BASE_PLAN_NAME = 'Base';

/**
 * Tope de bodegas cuando el plan incluye Multibodega. El presupuesto no fija un
 * límite por plan; se mantiene el tope más alto que tenía el plan anterior más
 * grande (Enterprise) para no recortar a nadie. Se ajusta por empresa.
 */
export const MULTI_WAREHOUSE_LIMIT = 20;

export interface PlanPreset {
  maxUsers: number;
  maxWarehouses: number;
  features: CompanyFeatureFlags;
}

/** Flags que activa una lista de ítems del tarifario, sobre la plataforma base. */
export function featuresForModuleIds(moduleIds: readonly string[]): CompanyFeatureFlags {
  const features: CompanyFeatureFlags = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(features) as (keyof CompanyFeatureFlags)[]) features[key] = false;
  for (const included of INCLUDED_IN_BASE) for (const key of included.grants) features[key] = true;
  const wanted = new Set(moduleIds);
  for (const item of PRICED_MODULES) {
    if (wanted.has(item.id)) for (const key of item.grants) features[key] = true;
  }
  return features;
}

function buildPreset(maxUsers: number, moduleIds: readonly string[]): PlanPreset {
  const features = featuresForModuleIds(moduleIds);
  return { maxUsers, maxWarehouses: features.hasMultipleWarehouses ? MULTI_WAREHOUSE_LIMIT : 1, features };
}

export const PLAN_PRESETS = {
  [BASE_PLAN_NAME]: buildPreset(BASE_PLATFORM.includedUsers, []),
  ...Object.fromEntries(PRICING_PLANS.map((plan) => [plan.label, buildPreset(plan.includedUsers, plan.moduleIds)])),
} as Record<string, PlanPreset>;

/** Nombres ofrecidos, en orden de menor a mayor. */
export const PLAN_NAMES: readonly string[] = [BASE_PLAN_NAME, ...PRICING_PLANS.map((p) => p.label)];

/** Precio mensual (CLP, sin IVA) de la plataforma sola o de un plan; `null` si el nombre no es de un plan vigente. */
export function planListPrice(planName: string): number | null {
  if (planName === BASE_PLAN_NAME) return BASE_PLATFORM.price;
  return PRICING_PLANS.find((p) => p.label === planName)?.price ?? null;
}

export interface TenantListPrice {
  /** Precio del plan base de la empresa. */
  planPrice: number;
  /** Módulos encendidos que el plan no trae: se cobran aparte. */
  extras: PricedModule[];
  /** Usuarios por sobre los que incluye el plan. */
  extraUsers: number;
  /** Módulos del plan que la empresa tiene apagados (no se descuentan: se informan). */
  missingFromPlan: PricedModule[];
  /** Neto mensual de lista: plan + extras + usuarios adicionales. */
  net: number;
}

/**
 * Precio de lista de una empresa según su plan, sus módulos y su tope de
 * usuarios. `null` para un plan que ya no se ofrece o a medida: no hay lista
 * que aplicar y no se inventa una.
 */
export function tenantListPrice(planName: string, features: CompanyFeatureFlags, maxUsers: number): TenantListPrice | null {
  const planPrice = planListPrice(planName);
  if (planPrice === null) return null;
  const plan: PricingPlan | undefined = PRICING_PLANS.find((p) => p.label === planName);
  const inPlan = new Set(plan?.moduleIds ?? []);
  const includedUsers = plan?.includedUsers ?? BASE_PLATFORM.includedUsers;
  const on = (item: PricedModule) => item.grants.every((key) => features[key]);
  const extras = PRICED_MODULES.filter((m) => !inPlan.has(m.id) && on(m));
  const missingFromPlan = PRICED_MODULES.filter((m) => inPlan.has(m.id) && !on(m));
  const extraUsers = Math.max(0, maxUsers - includedUsers);
  const net = planPrice + extras.reduce((sum, m) => sum + m.price, 0) + extraUsers * EXTRA_USER_PRICE;
  return { planPrice, extras, extraUsers, missingFromPlan, net };
}
