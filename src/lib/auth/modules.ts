import type { CompanyFeatures } from '@prisma/client';
import { CORE_PERMISSION_GROUP, PERMISSION_LABELS, type Permission } from './permissions';

/**
 * Registro de módulos comercializables.
 *
 * Es la fuente única que conecta las tres capas del feature gating:
 * el flag contratado en `CompanyFeatures`, los permisos que el módulo habilita
 * y las rutas que deben bloquearse si el plan no lo incluye. Agregar un módulo
 * nuevo significa agregar una entrada aquí; el sidebar, los guards y el panel
 * de superadmin se derivan de este objeto y no necesitan tocarse.
 */

/** Claves booleanas de `CompanyFeatures`, sin los campos de metadatos. */
export type FeatureKey = keyof Pick<
  CompanyFeatures,
  | 'hasInventory'
  | 'hasPmpCosting'
  | 'hasDteBilling'
  | 'hasPurchases'
  | 'hasTreasury'
  | 'hasAdvancedReports'
  | 'hasMultipleWarehouses'
  | 'hasPos'
  | 'hasAccounting'
  | 'hasCrm'
  | 'hasEventProjects'
  | 'hasSponsorships'
  | 'hasFeeDocuments'
  | 'hasCandidates'
  | 'hasOrgChart'
  | 'hasLiveProduction'
  | 'hasJudging'
  | 'hasMultiCompany'
  | 'hasBudgets'
  | 'hasPromissoryNotes'
  | 'hasInstallmentPlans'
  | 'hasTicketing'
  | 'hasPublicVoting'
>;

export type CompanyFeatureFlags = Record<FeatureKey, boolean>;

export interface ModuleDefinition {
  key: FeatureKey;
  label: string;
  description: string;
  /** Permisos que dejan de estar disponibles si el módulo no está contratado. */
  permissions: Permission[];
  /** Prefijos de ruta bloqueados cuando el módulo no está contratado. */
  routes: string[];
}

export const MODULES: ModuleDefinition[] = [
  {
    key: 'hasInventory',
    label: 'Inventario y Catálogo',
    description: 'Productos, bodegas, stock y movimientos de Kardex.',
    permissions: ['products:read', 'products:write', 'inventory:write'],
    routes: ['/dashboard/products', '/dashboard/inventory'],
  },
  {
    key: 'hasPmpCosting',
    label: 'Costeo PMP',
    description: 'Precio Medio Ponderado, costos de compra y márgenes por producto.',
    permissions: ['products:costs'],
    routes: [],
  },
  {
    key: 'hasDteBilling',
    label: 'Facturación Electrónica (DTE)',
    // La descripción decía "con folio SII" cuando el folio era un contador
    // interno sin respaldo del SII. Ahora los folios sí salen de un CAF
    // autorizado y los documentos se timbran (TED), pero el envío al SII
    // todavía no está: la descripción dice exactamente hasta dónde llega hoy,
    // porque prometer emisión ante el SII y no cumplirla es un problema
    // legal para el cliente, no una imprecisión de marketing.
    description:
      'Boletas, facturas y notas con folios autorizados del SII (CAF) y timbre electrónico. El envío automático al SII aún no está disponible.',
    permissions: ['sales:read', 'sales:write', 'sales:cancel', 'dte:manage_caf'],
    routes: ['/dashboard/sales', '/dashboard/settings/folios'],
  },
  {
    key: 'hasPurchases',
    label: 'Compras y Proveedores',
    description: 'Facturas de proveedor, recepción de mercadería y costeo de compras.',
    permissions: [
      'purchases:read',
      'purchases:write',
      'purchases:cancel',
      'purchases:approve',
      'purchases:orders',
      'purchases:override_match',
    ],
    routes: ['/dashboard/purchases'],
  },
  {
    key: 'hasTreasury',
    label: 'Tesorería y Cobranzas',
    description: 'Cuentas por cobrar y pagar, pagos y flujo de caja.',
    permissions: ['treasury:read', 'treasury:write'],
    routes: ['/dashboard/treasury'],
  },
  {
    key: 'hasAdvancedReports',
    label: 'Reportes Avanzados',
    description: 'Libro Excel con F29 estimado, márgenes analíticos y Kardex valorizado.',
    permissions: ['reports:read'],
    routes: ['/dashboard/reports'],
  },
  {
    key: 'hasMultipleWarehouses',
    label: 'Multibodega',
    description: 'Permite crear más de una bodega y transferencias entre ellas.',
    permissions: [],
    routes: [],
  },
  {
    key: 'hasPos',
    label: 'Punto de Venta (POS)',
    description: 'Terminal de mostrador, arqueo de caja por turno y ticket térmico 80mm.',
    permissions: ['pos:operate', 'pos:close'],
    routes: ['/dashboard/pos'],
  },
  {
    key: 'hasAccounting',
    label: 'Contabilidad',
    description: 'Plan de cuentas, asientos, libro mayor, estados financieros y ratios.',
    permissions: [
      'accounting:view',
      'accounting:post',
      'accounting:manual_entry',
      'accounting:close_period',
      'accounting:manage_accounts',
      'reports:financial',
    ],
    routes: ['/dashboard/accounting', '/dashboard/financial-statements'],
  },
  {
    key: 'hasCrm',
    label: 'Inteligencia de Negocio (Agentes)',
    description: 'Equipo ejecutivo virtual (CEO/CFO/COO/Ventas) que analiza tus datos reales de ventas, compras, inventario y tesorería, y propone recomendaciones para que las revises.',
    permissions: ['agents:view', 'agents:approve'],
    routes: ['/dashboard/agents'],
  },
  {
    key: 'hasEventProjects',
    label: 'Eventos & Proyectos',
    description: 'Centros de costo por certamen: presupuesto, ingresos y gastos vinculados.',
    permissions: ['projects:read', 'projects:write'],
    routes: ['/dashboard/projects'],
  },
  {
    key: 'hasSponsorships',
    label: 'Auspicios & Marcas',
    description: 'Contratos de auspicio en efectivo o canje, con checklist de entregables por marca.',
    permissions: ['sponsorships:read', 'sponsorships:write'],
    routes: ['/dashboard/sponsorships'],
  },
  {
    key: 'hasFeeDocuments',
    label: 'Boletas de Honorarios',
    description: 'Registro de boletas de honorarios de staff freelance, con retención de 2ª categoría.',
    permissions: ['fees:read', 'fees:write'],
    routes: ['/dashboard/fees'],
  },
  {
    key: 'hasCandidates',
    label: 'Candidatas & Staff',
    description: 'Ficha de candidatas y staff de producción por certamen.',
    permissions: ['candidates:read', 'candidates:write', 'candidates:sensitive'],
    routes: ['/dashboard/candidates'],
  },
  {
    key: 'hasOrgChart',
    label: 'Organigrama',
    description: 'Ficha de staff con foto, cargo y jerarquía de reporte, con sugerencia de IA.',
    permissions: ['orgchart:read', 'orgchart:write', 'orgchart:ai'],
    routes: ['/dashboard/org-chart'],
  },
  {
    key: 'hasLiveProduction',
    label: 'Acreditaciones',
    description: 'Acreditación de staff y proveedores con código QR y control de acceso por certamen.',
    permissions: ['production:read', 'production:write', 'production:design'],
    routes: ['/dashboard/production'],
  },
  {
    key: 'hasJudging',
    label: 'Votación & Escrutinio',
    description: 'Categorías de evaluación, jurados por link y planillas de puntuación con bloqueo anti-edición.',
    permissions: ['judging:read', 'judging:write'],
    routes: ['/dashboard/judging'],
  },
  {
    key: 'hasMultiCompany',
    label: 'Administración Multiempresa',
    description: 'Permite que un mismo usuario administre esta empresa y otra(s) con un solo login, cambiando de empresa activa.',
    permissions: [],
    routes: [],
  },
  {
    key: 'hasBudgets',
    label: 'Presupuestos',
    description: 'Presupuesto operativo general por categoría (arriendo, sueldos, insumos), con seguimiento de real vs. planificado.',
    permissions: ['budgets:read', 'budgets:write'],
    routes: ['/dashboard/budgets'],
  },
  {
    key: 'hasPromissoryNotes',
    label: 'Pagarés',
    description: 'Registro de pagarés firmados por clientes o candidatas, con seguimiento de pago y vencimiento.',
    permissions: ['promissorynotes:read', 'promissorynotes:write'],
    routes: ['/dashboard/promissory-notes'],
  },
  {
    key: 'hasInstallmentPlans',
    label: 'Cuotas & Mensualidades',
    description: 'Planes de pago en cuotas con vencimientos, multa por atraso y recordatorio automático por correo.',
    permissions: ['paymentplans:read', 'paymentplans:write'],
    routes: ['/dashboard/payment-plans'],
  },
  {
    key: 'hasTicketing',
    label: 'Venta de Entradas',
    description: 'Venta de entradas a la gala final con pago manual confirmado por el equipo y control de acceso por QR.',
    permissions: ['ticketing:read', 'ticketing:write'],
    routes: ['/dashboard/ticketing'],
  },
  {
    key: 'hasPublicVoting',
    label: 'Votación Pagada del Público',
    description: 'El público paga por votar a su candidata favorita, con confirmación manual de pago y ranking en vivo.',
    permissions: ['publicvoting:read', 'publicvoting:write'],
    routes: ['/dashboard/voting'],
  },
];

export const MODULE_KEYS: FeatureKey[] = MODULES.map((m) => m.key);

/**
 * Plan mínimo. Se usa cuando una empresa todavía no tiene fila en
 * `CompanyFeatures`: es preferible fallar cerrado (sin módulos de pago) que
 * abrir por omisión lo que nadie contrató.
 */
export const DEFAULT_FEATURES: CompanyFeatureFlags = {
  hasInventory: true,
  hasPmpCosting: true,
  hasDteBilling: false,
  hasPurchases: false,
  hasTreasury: false,
  hasAdvancedReports: false,
  hasMultipleWarehouses: false,
  hasPos: false,
  hasAccounting: false,
  hasCrm: false,
  hasEventProjects: false,
  hasSponsorships: false,
  hasFeeDocuments: false,
  hasCandidates: false,
  hasOrgChart: false,
  hasLiveProduction: false,
  hasJudging: false,
  hasMultiCompany: false,
  hasBudgets: false,
  hasPromissoryNotes: false,
  hasInstallmentPlans: false,
  hasTicketing: false,
  hasPublicVoting: false,
};

/** Índice inverso permiso → módulo, construido una vez al cargar el módulo. */
const PERMISSION_TO_MODULE = new Map<Permission, FeatureKey>();
for (const mod of MODULES) {
  for (const permission of mod.permissions) PERMISSION_TO_MODULE.set(permission, mod.key);
}

/** Módulo que habilita un permiso, o `undefined` si el permiso es transversal. */
export function moduleForPermission(permission: Permission): FeatureKey | undefined {
  return PERMISSION_TO_MODULE.get(permission);
}

export function getModule(key: FeatureKey): ModuleDefinition {
  const found = MODULES.find((m) => m.key === key);
  if (!found) throw new Error(`Módulo desconocido: ${key}`);
  return found;
}

/** Normaliza la fila de features (o su ausencia) a un objeto de flags plano. */
export function toFeatureFlags(features: CompanyFeatures | null): CompanyFeatureFlags {
  if (!features) return { ...DEFAULT_FEATURES };
  return {
    hasInventory: features.hasInventory,
    hasPmpCosting: features.hasPmpCosting,
    hasDteBilling: features.hasDteBilling,
    hasPurchases: features.hasPurchases,
    hasTreasury: features.hasTreasury,
    hasAdvancedReports: features.hasAdvancedReports,
    hasMultipleWarehouses: features.hasMultipleWarehouses,
    hasPos: features.hasPos,
    hasAccounting: features.hasAccounting,
    hasCrm: features.hasCrm,
    hasEventProjects: features.hasEventProjects,
    hasSponsorships: features.hasSponsorships,
    hasFeeDocuments: features.hasFeeDocuments,
    hasCandidates: features.hasCandidates,
    hasOrgChart: features.hasOrgChart,
    hasLiveProduction: features.hasLiveProduction,
    hasJudging: features.hasJudging,
    hasMultiCompany: features.hasMultiCompany,
    hasBudgets: features.hasBudgets,
    hasPromissoryNotes: features.hasPromissoryNotes,
    hasInstallmentPlans: features.hasInstallmentPlans,
    hasTicketing: features.hasTicketing,
    hasPublicVoting: features.hasPublicVoting,
  };
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: Array<{ key: Permission; label: string }>;
}

/**
 * Permisos que una empresa puede repartir entre sus roles, agrupados por módulo.
 * Solo incluye módulos contratados: el dueño no debería poder marcar una casilla
 * que su plan no cubre y que el servidor va a descartar igual.
 */
export function availablePermissionGroups(features: CompanyFeatureFlags): PermissionGroup[] {
  const groups: PermissionGroup[] = [
    {
      key: 'core',
      label: CORE_PERMISSION_GROUP.label,
      permissions: CORE_PERMISSION_GROUP.permissions.map((key) => ({ key, label: PERMISSION_LABELS[key] })),
    },
  ];

  for (const mod of MODULES) {
    if (!features[mod.key] || mod.permissions.length === 0) continue;
    groups.push({
      key: mod.key,
      label: mod.label,
      permissions: mod.permissions.map((key) => ({ key, label: PERMISSION_LABELS[key] })),
    });
  }

  return groups;
}

/**
 * Módulo bloqueado que cubre una ruta, si lo hay. Se compara por prefijo para
 * que `/dashboard/sales/new` herede el bloqueo de `/dashboard/sales`.
 */
export function blockedModuleForRoute(
  pathname: string,
  features: CompanyFeatureFlags
): ModuleDefinition | undefined {
  return MODULES.find(
    (mod) => !features[mod.key] && mod.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  );
}
