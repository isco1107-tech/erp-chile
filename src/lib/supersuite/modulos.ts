import type { AuditAction, CompanyFeatures } from '@prisma/client';
import { toFeatureFlags, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import type { DatosCliente } from './cliente';
import { formatCurrency } from '@/lib/chile/tax';
import { EXTRA_USER_PRICE, PRICED_MODULES } from '@/lib/pricing/catalog';
import { isModuleContracted } from '@/lib/pricing/quote';
import { MAX_WAREHOUSES, PLAN_NAMES, PLAN_PRESETS, tenantListPrice } from '@/lib/pricing/presets';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';

/**
 * Equivalencias entre Aether y la Supersuite. Funciones puras (sin Prisma ni
 * red) para poder testearlas y para que la Supersuite reciba siempre los mismos
 * nombres de módulo que lee su conector de la fase 1
 * (supersuite: apps/worker/src/conectores/aether.consultas.ts). Si se agrega un
 * módulo aquí, agregarlo también allá.
 */

/** Flag de `CompanyFeatures` que contrata cada módulo de la Supersuite. */
export const FLAG_A_MODULO: Partial<Record<FeatureKey, string>> = {
  hasDteBilling: 'ventas',
  hasPos: 'pos',
  hasInventory: 'inventario',
  hasPurchases: 'compras',
  hasTreasury: 'tesoreria',
  hasAccounting: 'contabilidad',
  hasSalesPipeline: 'crm',
  hasPayroll: 'rrhh',
  hasExpenseReports: 'gastos',
  hasFixedAssets: 'activo_fijo',
  hasProduction: 'produccion',
  hasServiceDesk: 'servicio_tecnico',
  hasFeeDocuments: 'honorarios',
  hasEventProjects: 'certamenes',
  hasSponsorships: 'auspicios',
  hasCandidates: 'candidatas',
  hasTicketing: 'entradas',
  hasPublicVoting: 'votacion',
  hasJudging: 'jurado',
  hasInstallmentPlans: 'cuotas',
  hasPromissoryNotes: 'pagares',
  hasBudgets: 'presupuestos',
  hasCustomerCare: 'fidelizacion',
  hasQuality: 'calidad',
  hasTeamTasks: 'tareas',
  hasAcademy: 'academia',
};

/**
 * Entidad de la bitácora de auditoría → módulo cuyo uso demuestra. Las entidades
 * de configuración (usuarios, roles, ajustes, automatizaciones, contactos) no
 * cuentan como uso de un módulo y quedan fuera a propósito.
 */
const ENTIDAD_A_MODULO: Record<string, string> = {
  SalesDocument: 'ventas', SalesOrder: 'ventas', PriceList: 'ventas', SalesCommissionRate: 'ventas', historicalSales: 'ventas',
  CashShift: 'pos', CashRegister: 'pos', CashMovement: 'pos',
  Product: 'inventario', InventoryCount: 'inventario', Warehouse: 'inventario',
  PurchaseDocument: 'compras', PurchaseOrder: 'compras', PurchaseRequest: 'compras', GoodsReceipt: 'compras',
  ImportShipment: 'compras', ReceivedDte: 'compras',
  Payment: 'tesoreria', PaymentBatch: 'tesoreria',
  JournalEntry: 'contabilidad', MonthlyClosing: 'contabilidad', ChartOfAccounts: 'contabilidad',
  Opportunity: 'crm', CrmPerson: 'crm',
  Employee: 'rrhh', PayrollPeriod: 'rrhh', LeaveRequest: 'rrhh', EmployeeLoan: 'rrhh', EmployeeAdvance: 'rrhh', EmployeeSettlement: 'rrhh',
  ExpenseReport: 'gastos',
  FixedAsset: 'activo_fijo',
  ProductionOrder: 'produccion', BillOfMaterials: 'produccion',
  ServiceTicket: 'servicio_tecnico',
  FeeDocument: 'honorarios',
  Project: 'certamenes', PastWinner: 'certamenes', PosterDesign: 'certamenes', StageTimelineItem: 'certamenes', WardrobeItem: 'certamenes', StaffAccreditation: 'certamenes', BadgeTemplate: 'certamenes',
  SponsorshipContract: 'auspicios', SponsorshipPackage: 'auspicios', SponsorshipDeliverable: 'auspicios',
  Candidate: 'candidatas', CandidateDocument: 'candidatas', CandidateSession: 'candidatas',
  TicketType: 'entradas', TicketSale: 'entradas',
  VoteOrder: 'votacion',
  CompetitionRound: 'jurado', ScoreSheet: 'jurado', JudgingCategory: 'jurado', JudgeAssignment: 'jurado',
  PaymentPlan: 'cuotas', PaymentPlanInstallment: 'cuotas',
  PromissoryNote: 'pagares',
  Budget: 'presupuestos', BudgetLine: 'presupuestos',
  CustomerSurvey: 'fidelizacion', CustomerFollowUp: 'fidelizacion', CustomerCareSettings: 'fidelizacion',
  Procedure: 'calidad', QualityInspection: 'calidad', QualityTemplate: 'calidad', SupplierProfile: 'calidad',
  TeamTask: 'tareas', DelegationRule: 'tareas',
  AcademyStudent: 'academia', AcademyGroup: 'academia', AcademyAttendance: 'academia', AcademyMonthlyPayment: 'academia', AcademyApplication: 'academia', AcademySite: 'academia', AcademyEnrollmentLink: 'academia',
};

/** Módulo con que viaja lo que no es de un módulo de negocio (usuarios, roles, ajustes…): la Supersuite no lo cuenta como adopción. */
export const MODULO_PLATAFORMA = 'plataforma';

/** Entidades cuyo cambio modifica la ficha de la empresa en la Supersuite (nombre, plan, módulos, estado). */
export const ENTIDADES_DE_EMPRESA = new Set(['Company', 'CompanyFeatures', 'CompanySettings']);

export function moduloDeEntidad(entidad: string): string | null {
  return ENTIDAD_A_MODULO[entidad] ?? null;
}

/** `SalesDocument` + `ISSUE_DTE` → `sales_document_issue_dte`. Sin datos del registro: solo qué se hizo. */
export function accionDeAuditoria(entidad: string, accion: AuditAction): string {
  const snake = entidad.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return `${snake}_${accion.toLowerCase()}`.slice(0, 80);
}

/** Módulos de la Supersuite que tiene contratados una empresa, según sus flags. */
export function modulosContratados(features: Partial<Record<FeatureKey, boolean>> | null): string[] {
  if (!features) return [];
  const modulos = (Object.entries(FLAG_A_MODULO) as [FeatureKey, string][])
    .filter(([flag]) => features[flag] === true)
    .map(([, modulo]) => modulo);
  return [...new Set(modulos)];
}

/**
 * Sigue siendo cliente en la Supersuite: todo menos CANCELLED. Una empresa
 * SUSPENDED no es una baja (se puede reactivar desde la consola SaaS): viaja
 * como cliente con `suspendida: true`.
 */
export function empresaActiva(status: string): boolean {
  return status !== 'CANCELLED';
}

export const empresaSuspendida = (status: string): boolean => status === 'SUSPENDED';

// ── Órdenes de la consola SaaS (funciones puras) ─────────────────────

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * Flags que enciende o apaga la orden de un módulo. Acepta el nombre de módulo
 * de la Supersuite (`pos`, `rrhh`…) o el id del tarifario de Aether
 * (`purchases`, `payroll`…). Lo que se vende como un solo ítem (Entradas y
 * votación del público) va junto, igual que en el formulario del superadmin.
 */
export function flagsDeModulo(modulo: string): FeatureKey[] {
  const clave = normalizar(modulo);
  const delTarifario = PRICED_MODULES.find((m) => m.id === clave);
  if (delTarifario) return [...delTarifario.grants];
  const flag = (Object.entries(FLAG_A_MODULO) as [FeatureKey, string][]).find(([, m]) => m === clave)?.[0];
  if (!flag) return [];
  return [...(PRICED_MODULES.find((m) => m.grants.includes(flag))?.grants ?? [flag])];
}

/** Nombre del plan de Aether que corresponde (sin importar tildes ni mayúsculas), o null si no existe. */
export function planDeAether(plan: string): string | null {
  return PLAN_NAMES.find((nombre) => normalizar(nombre) === normalizar(plan)) ?? null;
}

/**
 * Cambio de plan pedido por la Supersuite: el plan nuevo con sus módulos y
 * límites, SIN quitar nada de lo que la empresa ya tenía (quitar un módulo es
 * una orden aparte, explícita). Los límites nunca bajan.
 */
export function cuentaConPlan(
  plan: string,
  actual: { features: CompanyFeatureFlags; maxUsers: number; maxWarehouses: number }
): { features: CompanyFeatureFlags; maxUsers: number; maxWarehouses: number } | null {
  const preset = PLAN_PRESETS[plan];
  if (!preset) return null;
  const features = { ...actual.features };
  for (const [flag, valor] of Object.entries(preset.features) as [FeatureKey, boolean][]) if (valor) features[flag] = true;
  return {
    features,
    maxUsers: Math.max(actual.maxUsers, preset.maxUsers),
    maxWarehouses: Math.min(MAX_WAREHOUSES, Math.max(actual.maxWarehouses, preset.maxWarehouses)),
  };
}

/**
 * Folios del SII por agotarse → alerta de la Supersuite. Con 0 folios la empresa
 * ya no puede emitir: crítica. La clave permite cerrarla cuando se cargue un CAF nuevo.
 */
export function alertaDeFolios(dteType: string, restantes: number): { severidad: 'critica' | 'alta'; mensaje: string; clave: string } {
  const documento = (DTE_TYPE_LABELS as Record<string, string>)[dteType] ?? dteType;
  return {
    severidad: restantes <= 0 ? 'critica' : 'alta',
    mensaje: restantes <= 0
      ? `Sin folios autorizados de ${documento}: no puede emitir hasta cargar un CAF nuevo.`
      : `Quedan ${restantes} folios autorizados de ${documento}. Hay que pedir un CAF nuevo al SII.`,
    clave: `folios:${dteType}`,
  };
}

/**
 * Lo que la empresa le paga a Aether, para la ficha de la Supersuite. Montos en
 * CLP netos (sin IVA) por mes, a precio de lista. `tarifaMensual` es el plan más
 * los módulos que el plan no trae; los usuarios por sobre los que incluye el plan
 * van aparte, porque el tope de usuarios de las empresas con un plan anterior es
 * heredado y no algo contratado. Un plan que ya no se ofrece NO lleva tarifa: no
 * se inventa una (la Supersuite conserva la que ya tenía).
 */
export function fichaComercial(input: {
  planName: string;
  features: CompanyFeatureFlags;
  maxUsers: number;
  maxWarehouses: number;
}): { tarifaMensual?: number; metadata: Record<string, unknown> } {
  const modulos = tenantListPrice(input.planName, input.features, 0);
  const conUsuarios = tenantListPrice(input.planName, input.features, input.maxUsers);
  const usuariosAdicionales = conUsuarios?.extraUsers ?? 0;
  return {
    tarifaMensual: modulos?.net,
    metadata: {
      planVigente: modulos !== null,
      // Todo lo que tiene contratado según el tarifario (incluye módulos que la Supersuite aún no mide como uso).
      modulosAether: PRICED_MODULES.filter((m) => isModuleContracted(m, input.features)).map((m) => m.id),
      tarifaIncluyeIva: false,
      modulosExtra: modulos?.extras.map((m) => m.id) ?? [],
      modulosDelPlanApagados: modulos?.missingFromPlan.map((m) => m.id) ?? [],
      usuariosMax: input.maxUsers,
      usuariosAdicionales,
      tarifaUsuariosAdicionales: usuariosAdicionales * EXTRA_USER_PRICE,
      bodegasMax: input.maxWarehouses,
    },
  };
}

/** Clave de la solicitud de módulos abierta de una empresa: una por empresa, la última reemplaza a la anterior. */
export const CLAVE_SOLICITUD_MODULOS = 'solicitud-modulos';

/**
 * Una empresa pide contratar módulos o cambiar de plan → alerta accionable en la
 * Supersuite. Solo viaja qué pide y cuánto cuesta (sin datos de la persona que lo
 * pidió: el correo con su contacto va aparte al equipo de ventas).
 */
export function alertaDeSolicitud(solicitud: {
  planLabel: string | null;
  modulos: string[];
  net: number;
  total: number;
}): { severidad: 'media'; mensaje: string; clave: string } {
  const partes = [...(solicitud.planLabel ? [`plan ${solicitud.planLabel}`] : []), ...solicitud.modulos];
  const mensaje = `Solicita contratar ${partes.join(' + ')}: ${formatCurrency(solicitud.net)} + IVA al mes (${formatCurrency(solicitud.total)} con IVA). Se activa desde el panel de plataforma de Aether.`;
  return { severidad: 'media', mensaje: mensaje.length > 500 ? `${mensaje.slice(0, 497)}...` : mensaje, clave: CLAVE_SOLICITUD_MODULOS };
}

/** Ficha de una empresa tal como la lee la Supersuite (armada igual al sincronizar y desde los scripts). */
export function fichaDeEmpresa(empresa: {
  businessName: string;
  rut: string;
  ciudad: string | null;
  comuna: string | null;
  planName: string;
  status: string;
  createdAt: Date;
  maxUsers: number;
  maxWarehouses: number;
  features: CompanyFeatures | null;
}): DatosCliente {
  const comercial = fichaComercial({
    planName: empresa.planName,
    features: toFeatureFlags(empresa.features),
    maxUsers: empresa.maxUsers,
    maxWarehouses: empresa.maxWarehouses,
  });
  return {
    nombre: empresa.businessName,
    ciudad: empresa.comuna ?? empresa.ciudad ?? undefined,
    plan: empresa.planName,
    tarifaMensual: comercial.tarifaMensual,
    clienteDesde: empresa.createdAt,
    activo: empresaActiva(empresa.status),
    suspendida: empresaSuspendida(empresa.status),
    modulos: modulosContratados(empresa.features),
    metadata: { rut: empresa.rut, estadoAether: empresa.status, ...comercial.metadata },
  };
}
