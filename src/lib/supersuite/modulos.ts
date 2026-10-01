import type { AuditAction } from '@prisma/client';
import type { FeatureKey } from '@/lib/auth/modules';
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
};

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

/** Aether marca ACTIVE y TRIAL como operativas; SUSPENDED y CANCELLED quedan como bajas en la Supersuite. */
export function empresaActiva(status: string): boolean {
  return status === 'ACTIVE' || status === 'TRIAL';
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
