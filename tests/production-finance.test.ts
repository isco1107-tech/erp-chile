import {
  agingBucket,
  analyzeCollections,
  analyzeProjectFinance,
  formatCollectionsForPrompt,
  formatProjectsForPrompt,
  sortAlerts,
  type ProjectFinanceInput,
  type ReceivableInput,
} from '@/lib/events/production-finance';
import { agentDataScope, agentModuleGuard, visibleAgentRoles } from '@/modules/agents/constants';
import { MODULES, type CompanyFeatureFlags } from '@/lib/auth/modules';

const NOW = new Date('2026-09-25T15:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

function project(overrides: Partial<ProjectFinanceInput> = {}): ProjectFinanceInput {
  return {
    projectId: 'p1',
    name: 'Miss Temuco',
    startDate: inDays(60),
    budgetedIncome: 20_000_000,
    budgetedExpense: 15_000_000,
    incomeCash: 10_000_000,
    incomeBySource: { sales: 0, sponsorships: 8_000_000, tickets: 2_000_000, votes: 0 },
    incomeBarter: 0,
    expense: 6_000_000,
    sponsorCashCommitted: 10_000_000,
    sponsorCashCollected: 8_000_000,
    overdueDeliverables: 0,
    installmentsPending: 0,
    installmentsOverdue: 0,
    ...overrides,
  };
}

describe('finanzas de producción por certamen', () => {
  it('un certamen sano no genera alertas', () => {
    const analysis = analyzeProjectFinance(project(), NOW);
    expect(analysis.alerts).toEqual([]);
    expect(analysis.margin).toBe(4_000_000);
    expect(analysis.marginPercent).toBe(40);
    expect(analysis.expenseExecution).toBe(40);
    expect(analysis.incomeExecution).toBe(50);
    expect(analysis.committedPending).toBe(2_000_000);
    expect(analysis.projectedMargin).toBe(6_000_000);
    expect(analysis.daysToEvent).toBe(60);
  });

  it('alerta gasto sobre presupuesto como crítico', () => {
    const analysis = analyzeProjectFinance(project({ expense: 16_000_000 }), NOW);
    expect(analysis.alerts.map((a) => a.severity)).toContain('critical');
    expect(analysis.alerts[0]!.title).toContain('gasto sobre presupuesto');
  });

  it('alerta gasto adelantado al ingreso', () => {
    const analysis = analyzeProjectFinance(project({ expense: 12_500_000, incomeCash: 8_000_000 }), NOW);
    expect(analysis.alerts.some((a) => a.title.includes('gasto adelantado'))).toBe(true);
  });

  it('distingue caja negativa hoy de resultado proyectado negativo', () => {
    const recoverable = analyzeProjectFinance(project({ incomeCash: 5_000_000, expense: 6_000_000, installmentsPending: 3_000_000 }), NOW);
    expect(recoverable.alerts.some((a) => a.title.includes('caja negativa hoy'))).toBe(true);
    expect(recoverable.alerts.some((a) => a.title.includes('proyectado negativo'))).toBe(false);

    const loss = analyzeProjectFinance(project({ incomeCash: 1_000_000, expense: 9_000_000, sponsorCashCollected: 10_000_000 }), NOW);
    expect(loss.projectedMargin).toBe(-8_000_000);
    expect(loss.alerts.some((a) => a.severity === 'critical' && a.title.includes('proyectado negativo'))).toBe(true);
  });

  it('alerta auspicios poco cobrados solo dentro de los 30 días previos a la gala', () => {
    const far = analyzeProjectFinance(project({ sponsorCashCollected: 2_000_000 }), NOW);
    expect(far.alerts.some((a) => a.title.includes('auspicios por cobrar'))).toBe(false);
    const near = analyzeProjectFinance(project({ startDate: inDays(20), sponsorCashCollected: 2_000_000 }), NOW);
    expect(near.alerts.some((a) => a.title.includes('auspicios por cobrar'))).toBe(true);
  });

  it('sin presupuesto no inventa porcentajes de ejecución', () => {
    const analysis = analyzeProjectFinance(project({ budgetedIncome: 0, budgetedExpense: 0, sponsorCashCommitted: 0, sponsorCashCollected: 0 }), NOW);
    expect(analysis.expenseExecution).toBeNull();
    expect(analysis.incomeExecution).toBeNull();
    expect(analysis.sponsorCollection).toBeNull();
  });

  it('avisa entregables atrasados y cuotas vencidas', () => {
    const analysis = analyzeProjectFinance(project({ overdueDeliverables: 2, installmentsPending: 500_000, installmentsOverdue: 300_000 }), NOW);
    expect(analysis.alerts.some((a) => a.title.includes('entregables'))).toBe(true);
    expect(analysis.alerts.some((a) => a.title.includes('cuotas'))).toBe(true);
  });
});

describe('cobranza de eventos', () => {
  const receivable = (overrides: Partial<ReceivableInput>): ReceivableInput => ({
    kind: 'INSTALLMENT',
    debtorId: 'd1',
    debtorName: 'Apoderado Uno',
    balance: 100_000,
    dueDate: inDays(-10),
    projectName: 'Miss Temuco',
    ...overrides,
  });

  it('clasifica la antigüedad del saldo', () => {
    expect(agingBucket(null, NOW)).toBe('current');
    expect(agingBucket(inDays(5), NOW)).toBe('current');
    expect(agingBucket(inDays(-10), NOW)).toBe('1-30');
    expect(agingBucket(inDays(-45), NOW)).toBe('31-60');
    expect(agingBucket(inDays(-75), NOW)).toBe('61-90');
    expect(agingBucket(inDays(-120), NOW)).toBe('90+');
  });

  it('suma saldos, ignora los pagados y ordena deudores por monto vencido', () => {
    const analysis = analyzeCollections(
      [
        receivable({}),
        receivable({ debtorId: 'd2', debtorName: 'Marca SpA', kind: 'SPONSORSHIP', balance: 2_000_000, dueDate: inDays(-100) }),
        receivable({ debtorId: 'd3', balance: 50_000, dueDate: inDays(10) }),
        receivable({ debtorId: 'd4', balance: 0 }),
      ],
      NOW
    );
    expect(analysis.totalBalance).toBe(2_150_000);
    expect(analysis.overdueBalance).toBe(2_100_000);
    expect(analysis.byBucket['90+']).toBe(2_000_000);
    expect(analysis.topDebtors.map((d) => d.debtorId)).toEqual(['d2', 'd1']);
    expect(analysis.byKind.SPONSORSHIP.overdue).toBe(2_000_000);
    expect(analysis.top3Concentration).toBe(100);
    const severities = sortAlerts(analysis.alerts).map((a) => a.severity);
    expect(severities[0]).toBe('critical');
  });

  it('el resumen para el modelo no incluye nombres de deudores', () => {
    const analysis = analyzeCollections([receivable({ debtorName: 'Camila Soto' })], NOW);
    expect(formatCollectionsForPrompt(analysis)).not.toContain('Camila');
    expect(analysis.alerts.some((a) => a.detail.includes('Camila Soto'))).toBe(true);
  });

  it('sin deuda no genera alertas', () => {
    expect(analyzeCollections([], NOW).alerts).toEqual([]);
  });
});

function flags(on: Partial<CompanyFeatureFlags>): CompanyFeatureFlags {
  const all = Object.fromEntries(MODULES.map((module) => [module.key, false])) as CompanyFeatureFlags;
  return { ...all, ...on };
}

const ERP = { hasDteBilling: true, hasTreasury: true, hasInventory: true, hasPmpCosting: true } as const;
const COLLECTIONS = { hasInstallmentPlans: true, hasPromissoryNotes: true, hasSponsorships: true } as const;

describe('roles de agentes visibles', () => {
  it('los de eventos van con Certámenes y el equipo ejecutivo con CRM', () => {
    expect(visibleAgentRoles(flags({ hasEventProjects: true, ...COLLECTIONS }))).toEqual(['EVENT_FINANCE', 'EVENT_COLLECTIONS']);
    expect(visibleAgentRoles(flags({ hasCrm: true, ...ERP }))).toEqual(['CEO', 'CFO', 'COO', 'SALES']);
    expect(visibleAgentRoles(flags({ hasCrm: true, hasEventProjects: true, ...ERP, ...COLLECTIONS }))).toHaveLength(6);
  });

  it('un rol sin módulos con datos no corre', () => {
    // Productora con CRM pero sin Inventario ni ventas: ni COO ni Ventas ni CFO;
    // el CEO queda porque resume a Finanzas de producción.
    expect(visibleAgentRoles(flags({ hasCrm: true, hasEventProjects: true }))).toEqual(['CEO', 'EVENT_FINANCE']);
    // Sin Inventario no hay COO; con POS (sin facturación) sí hay Ventas.
    expect(visibleAgentRoles(flags({ hasCrm: true, hasPos: true }))).toEqual(['CEO', 'CFO', 'SALES']);
    // Solo Tesorería: el CFO igual tiene qué mirar.
    expect(visibleAgentRoles(flags({ hasCrm: true, hasTreasury: true }))).toEqual(['CEO', 'CFO']);
  });

  it('sin agentes que resumir no hay CEO', () => {
    expect(visibleAgentRoles(flags({ hasCrm: true }))).toEqual([]);
  });
});

describe('alcance de datos por módulo', () => {
  it('el margen y la revisión de precios requieren Costeo PMP', () => {
    expect(agentDataScope(flags({ hasDteBilling: true })).margins).toBe(false);
    expect(agentDataScope(flags({ hasDteBilling: true, hasPmpCosting: true })).margins).toBe(true);
    expect(agentDataScope(flags({ hasInventory: true })).catalogPricing).toBe(false);
  });

  it('el prompt lista los módulos apagados como prohibidos', () => {
    const guard = agentModuleGuard(flags({ hasCrm: true, hasInventory: true }));
    expect(guard).toContain('Inventario y Catálogo');
    expect(guard).toMatch(/NO usa estos módulos: .*Punto de Venta/);
  });
});

describe('prompts de eventos sin módulos apagados', () => {
  const input = {
    projectId: 'p1',
    name: 'Miss Demo',
    startDate: new Date('2026-12-01'),
    budgetedIncome: 0,
    budgetedExpense: 0,
    incomeCash: 100_000,
    incomeBySource: { sales: 0, sponsorships: 100_000, tickets: 0, votes: 0 },
    incomeBarter: 0,
    expense: 50_000,
    sponsorCashCommitted: 200_000,
    sponsorCashCollected: 100_000,
    overdueDeliverables: 0,
    installmentsPending: 30_000,
    installmentsOverdue: 0,
  };

  it('no desglosa entradas ni votos si esos módulos están apagados', () => {
    const analysis = analyzeProjectFinance(input, NOW);
    const text = formatProjectsForPrompt([analysis], [input], { sales: false, sponsorships: true, tickets: false, votes: false, installments: false });
    expect(text).toContain('auspicios');
    expect(text).not.toMatch(/entradas|votos|Cuotas de candidatas/);
  });

  it('la cobranza solo lista los tipos activos', () => {
    const analysis = analyzeCollections([], NOW);
    expect(formatCollectionsForPrompt(analysis, ['SPONSORSHIP'])).not.toMatch(/pagarés|cuotas/);
  });
});
