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
 * sus módulos y sus límites hasta que la Supersuite la cambie de plan.
 */

export const BASE_PLAN_NAME = 'Base';

/**
 * Plataforma base más los módulos que la empresa contrata uno a uno, sin
 * calzar con ningún plan. Parte con los mismos módulos y límites que `Base`.
 */
export const CUSTOM_PLAN_NAME = 'Personalizado';

/**
 * Tope de bodegas de cualquier empresa. Los planes con Multibodega traen
 * exactamente este máximo y los demás una sola bodega; ninguna empresa puede
 * pasar de aquí (lo exige el esquema de la plataforma).
 */
export const MAX_WAREHOUSES = 5;

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
  return { maxUsers, maxWarehouses: features.hasMultipleWarehouses ? MAX_WAREHOUSES : 1, features };
}

export const PLAN_PRESETS = {
  [BASE_PLAN_NAME]: buildPreset(BASE_PLATFORM.includedUsers, []),
  [CUSTOM_PLAN_NAME]: buildPreset(BASE_PLATFORM.includedUsers, []),
  ...Object.fromEntries(PRICING_PLANS.map((plan) => [plan.label, buildPreset(plan.includedUsers, plan.moduleIds)])),
} as Record<string, PlanPreset>;

/** Nombres ofrecidos, en orden de menor a mayor. */
export const PLAN_NAMES: readonly string[] = [BASE_PLAN_NAME, ...PRICING_PLANS.map((p) => p.label), CUSTOM_PLAN_NAME];

/** Precio mensual (CLP, sin IVA) de la plataforma sola o de un plan; `null` si el nombre no es de un plan vigente. */
export function planListPrice(planName: string): number | null {
  if (planName === BASE_PLAN_NAME || planName === CUSTOM_PLAN_NAME) return BASE_PLATFORM.price;
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

export interface PlanFit {
  planName: string;
  price: TenantListPrice;
}

/**
 * Plan que le corresponde a una empresa según los módulos que tiene
 * encendidos. Entre los planes cuyos módulos TODOS tiene (así nunca se le
 * cobraría un módulo que no usa) elige el de menor precio de lista contando
 * los módulos extra; a igual precio gana el plan mayor, que deja menos módulos
 * sueltos. La elección NO depende del tope de usuarios: es un límite heredado
 * del plan anterior, no algo contratado. Si lo mejor es la plataforma base con
 * módulos sueltos, el plan es `Personalizado`; si no tiene ninguno, `Base`.
 * El precio devuelto sí cuenta los usuarios sobre lo que incluye el plan.
 */
export function inferPlanName(features: CompanyFeatureFlags, maxUsers: number): PlanFit {
  let best: { planName: string; net: number } | null = null;
  for (const planName of PLAN_NAMES) {
    if (planName === CUSTOM_PLAN_NAME) continue;
    const price = tenantListPrice(planName, features, 0);
    if (!price || price.missingFromPlan.length > 0) continue;
    if (!best || price.net <= best.net) best = { planName, net: price.net };
  }
  // `Base` nunca tiene módulos faltantes, así que siempre hay candidato.
  let planName = (best as { planName: string }).planName;
  const chosen = tenantListPrice(planName, features, maxUsers) as TenantListPrice;
  if (planName === BASE_PLAN_NAME && chosen.extras.length > 0) planName = CUSTOM_PLAN_NAME;
  return { planName, price: chosen };
}
