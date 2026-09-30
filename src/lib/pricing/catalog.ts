import { MODULE_KEYS, type FeatureKey } from '@/lib/auth/modules';

/**
 * Catálogo comercial: precio de cada módulo, extras y paquetes, en UF + IVA al mes.
 *
 * Es la única fuente de precios: la landing y los planes precargados del panel
 * de plataforma salen de aquí. Los precios se cobran en UF (se facturan en
 * pesos al valor de la UF del día), así que NO se guardan montos en CLP.
 * `REFERENCE_UF_CLP` solo sirve para comparar contra la competencia y revisar
 * el catálogo a mano; nunca para cobrar ni para mostrar en pantalla.
 */

/** UF de referencia (se despeja de 3,5 UF ≈ $142.000). Actualizar al revisar precios. */
export const REFERENCE_UF_CLP = 40_500;

export type PriceTier = 'incluido' | 'liviano' | 'medio' | 'pesado' | 'eventos';

export interface ModulePrice {
  /** UF + IVA al mes. `0` = incluido en otro concepto (ver `note`). */
  priceUf: number;
  tier: PriceTier;
  /** Falso mientras el módulo no se pueda vender (hoy: facturación electrónica). */
  sellable: boolean;
  note?: string;
}

const INCLUDED_CORE = 'Incluido en el Core';

/**
 * Precio de TODOS los módulos vendibles. Es un `Record<FeatureKey, …>`: si se
 * agrega un flag a `CompanyFeatures` y a `MODULES` sin ponerle precio aquí, el
 * typecheck falla. Así ningún módulo queda sin precio.
 */
export const MODULE_PRICES: Record<FeatureKey, ModulePrice> = {
  // Incluidos en el Core
  hasInventory: { priceUf: 0, tier: 'incluido', sellable: true, note: INCLUDED_CORE },
  hasPmpCosting: { priceUf: 0, tier: 'incluido', sellable: true, note: INCLUDED_CORE },
  hasPurchases: { priceUf: 0, tier: 'incluido', sellable: true, note: INCLUDED_CORE },
  hasTeamTasks: { priceUf: 0, tier: 'incluido', sellable: true, note: INCLUDED_CORE },
  hasMultiCompany: { priceUf: 0, tier: 'incluido', sellable: true, note: 'Se cobra como "Empresa (RUT) adicional"' },
  // Livianos
  hasBudgets: { priceUf: 0.17, tier: 'liviano', sellable: true },
  hasExpenseReports: { priceUf: 0.17, tier: 'liviano', sellable: true },
  hasAdvancedReports: { priceUf: 0.17, tier: 'liviano', sellable: true },
  hasMultipleWarehouses: { priceUf: 0.17, tier: 'liviano', sellable: true, note: 'Hasta 5 bodegas' },
  hasFeeDocuments: { priceUf: 0.12, tier: 'liviano', sellable: true },
  hasPromissoryNotes: { priceUf: 0.12, tier: 'liviano', sellable: true },
  hasOrgChart: { priceUf: 0.12, tier: 'liviano', sellable: true },
  // Medios
  hasQuality: { priceUf: 0.24, tier: 'medio', sellable: true },
  hasCustomerCare: { priceUf: 0.24, tier: 'medio', sellable: true },
  hasSalesPipeline: { priceUf: 0.24, tier: 'medio', sellable: true },
  hasFixedAssets: { priceUf: 0.24, tier: 'medio', sellable: true },
  hasInstallmentPlans: { priceUf: 0.24, tier: 'medio', sellable: true },
  hasProduction: { priceUf: 0.37, tier: 'medio', sellable: true },
  hasTreasury: { priceUf: 0.37, tier: 'medio', sellable: true },
  hasPos: { priceUf: 0.37, tier: 'medio', sellable: true, note: '1 caja; caja extra 0,20 UF' },
  hasServiceDesk: { priceUf: 0.32, tier: 'medio', sellable: true },
  hasWebSites: { priceUf: 0.37, tier: 'medio', sellable: true, note: 'Hasta 3 sitios, con dominio propio' },
  // Pesados
  hasIntelligence: { priceUf: 0.49, tier: 'pesado', sellable: true },
  hasCrm: { priceUf: 0.49, tier: 'pesado', sellable: true, note: 'Agentes de IA, con tope de uso; el exceso se cobra' },
  hasDteBilling: {
    priceUf: 0.49,
    tier: 'pesado',
    sellable: false,
    note: 'No se vende hasta que exista el envío al SII; más bolsa de documentos',
  },
  hasPayroll: { priceUf: 0.61, tier: 'pesado', sellable: true, note: 'Hasta 10 trabajadores; 0,04 UF por trabajador extra' },
  hasAccounting: { priceUf: 0.74, tier: 'pesado', sellable: true, note: 'Con F29' },
  // Certámenes y eventos (precio suelto propuesto: las tarifas de los paquetes lo implican)
  hasEventProjects: { priceUf: 0.49, tier: 'eventos', sellable: true },
  hasLiveProduction: { priceUf: 0.49, tier: 'eventos', sellable: true },
  hasSponsorships: { priceUf: 0.37, tier: 'eventos', sellable: true },
  hasCandidates: { priceUf: 0.37, tier: 'eventos', sellable: true },
  hasTicketing: { priceUf: 0.24, tier: 'eventos', sellable: true },
  hasPublicVoting: { priceUf: 0.24, tier: 'eventos', sellable: true },
  hasJudging: { priceUf: 0.24, tier: 'eventos', sellable: true },
};

/** Cargos que se suman al paquete (UF + IVA al mes). */
export const EXTRAS = {
  additionalUser: { label: 'Usuario adicional', priceUf: 0.12 },
  additionalCompany: { label: 'Empresa (RUT) adicional', priceUf: 0.37 },
  additionalWarehouse: { label: 'Bodega adicional (sin el módulo Multibodega)', priceUf: 0.07 },
  additionalStorage10Gb: { label: '10 GB de archivos adicionales', priceUf: 0.05 },
  additionalPosRegister: { label: 'Caja adicional del Punto de venta', priceUf: 0.2 },
  additionalPayrollWorker: { label: 'Trabajador adicional (sobre 10)', priceUf: 0.04 },
} as const;

/** Precio del Core: base de cualquier contratación. */
export const CORE_PRICE_UF = 0.86;

/** Módulos que trae el Core. Ventas y clientes/proveedores no tienen flag propio (ver `SALES_GATE_FLAG`). */
export const CORE_MODULES: readonly FeatureKey[] = ['hasInventory', 'hasPmpCosting', 'hasPurchases', 'hasTeamTasks'];

/**
 * Hoy las pantallas y permisos de Ventas cuelgan de `hasDteBilling` (ver
 * `MODULES` en modules.ts). Mientras no se separen, el Core lo enciende para
 * que Ventas funcione; NO da timbre ni envío al SII (eso depende de cargar un
 * CAF) y en la landing no se ofrece como módulo.
 */
export const SALES_GATE_FLAG: FeatureKey = 'hasDteBilling';

export const PACKAGE_NAMES = ['Core', 'Gestión', 'Completo', 'Eventos'] as const;
export type PackageName = (typeof PACKAGE_NAMES)[number];

export interface PackageDefinition {
  name: PackageName;
  priceUf: number;
  audience: string;
  maxUsers: number;
  /** Empresas (RUT). Informativo: el sistema todavía no lo hace cumplir. */
  companies: number;
  maxWarehouses: number;
  /** Informativo: el sistema todavía no mide el almacenamiento. */
  storageGb: number;
  /** Módulos además del Core. */
  modules: readonly FeatureKey[];
  featured?: boolean;
}

const GESTION_MODULES: readonly FeatureKey[] = [
  'hasProduction',
  'hasTreasury',
  'hasSalesPipeline',
  'hasBudgets',
  'hasCustomerCare',
  'hasQuality',
  'hasAdvancedReports',
  'hasIntelligence',
];

export const PACKAGES: Record<PackageName, PackageDefinition> = {
  Core: {
    name: 'Core',
    priceUf: CORE_PRICE_UF,
    audience: 'La base para ordenar ventas, inventario y compras, con el equipo trabajando sobre tareas.',
    maxUsers: 3,
    companies: 1,
    maxWarehouses: 1,
    storageGb: 5,
    modules: [],
  },
  Gestión: {
    name: 'Gestión',
    priceUf: 2.2,
    audience: 'Para la pyme que quiere producir, cobrar y decidir con datos.',
    maxUsers: 5,
    companies: 1,
    maxWarehouses: 1,
    storageGb: 5,
    modules: GESTION_MODULES,
  },
  Completo: {
    name: 'Completo',
    priceUf: 3.95,
    audience: 'Operación, finanzas, contabilidad y remuneraciones en un solo sistema.',
    maxUsers: 10,
    companies: 2,
    maxWarehouses: 5,
    storageGb: 5,
    featured: true,
    modules: [
      ...GESTION_MODULES,
      'hasAccounting',
      'hasPayroll',
      'hasFixedAssets',
      'hasExpenseReports',
      'hasCrm',
      'hasMultipleWarehouses',
      'hasFeeDocuments',
      'hasOrgChart',
      'hasMultiCompany',
    ],
  },
  Eventos: {
    name: 'Eventos',
    priceUf: 2.7,
    audience: 'Para productoras de certámenes que además tienen que rendir cuentas.',
    maxUsers: 10,
    companies: 1,
    maxWarehouses: 1,
    storageGb: 5,
    modules: [
      'hasEventProjects',
      'hasLiveProduction',
      'hasSponsorships',
      'hasCandidates',
      'hasTicketing',
      'hasPublicVoting',
      'hasJudging',
      'hasInstallmentPlans',
      'hasPromissoryNotes',
      'hasFeeDocuments',
      'hasOrgChart',
    ],
  },
};

/** Flags de un paquete: el Core, sus módulos propios y la llave de Ventas. Todo lo demás, apagado. */
export function packageFeatureFlags(name: PackageName): Record<FeatureKey, boolean> {
  const on = new Set<FeatureKey>([...CORE_MODULES, SALES_GATE_FLAG, ...PACKAGES[name].modules]);
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, on.has(key)])) as Record<FeatureKey, boolean>;
}

/** Suma a precio suelto: Core más los módulos vendibles del paquete (sin la llave de Ventas). */
export function looseTotalUf(name: PackageName): number {
  const modulesUf = PACKAGES[name].modules.reduce((sum, key) => sum + MODULE_PRICES[key].priceUf, 0);
  return Math.round((CORE_PRICE_UF + modulesUf) * 100) / 100;
}

/** Formato de UF para pantalla: `2,2 UF`, `0,86 UF` (coma decimal, sin ceros de sobra). */
export function formatUf(amount: number): string {
  const text = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  return `${text} UF`;
}

/** Módulos que la landing puede ofrecer por sí solos (vendibles y con precio). */
export function sellableModules(): FeatureKey[] {
  return MODULE_KEYS.filter((key) => MODULE_PRICES[key].sellable && MODULE_PRICES[key].priceUf > 0);
}
