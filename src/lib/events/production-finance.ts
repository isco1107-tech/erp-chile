/**
 * Análisis financiero de una productora de eventos, en funciones puras: lo
 * usan los agentes "Finanzas de producción" y "Cobranza de eventos"
 * (`src/modules/agents/roles/event-*.ts`). Todo sale de datos reales que el
 * servicio lee de la base; aquí no se inventa ninguna cifra.
 *
 * Las alertas se calculan acá, de forma determinista, y no las decide el
 * modelo de IA: así el agente entrega algo útil aunque Gemini no esté
 * configurado, y el modelo solo redacta recomendaciones sobre hechos ya
 * verificados. Regla del proyecto: una métrica sin datos se omite, nunca
 * se rellena con un valor inventado.
 */

import { formatCurrency } from '@/lib/chile/tax';

const DAY_MS = 86_400_000;
const clp = formatCurrency;

export type Severity = 'critical' | 'warning' | 'info';

export interface FinanceAlert {
  severity: Severity;
  title: string;
  detail: string;
  projectId: string | null;
}

// ─── Rentabilidad y presupuesto por certamen ────────────────────────────────

export interface ProjectFinanceInput {
  projectId: string;
  name: string;
  /** Fecha del evento (gala). */
  startDate: Date;
  budgetedIncome: number;
  budgetedExpense: number;
  /** Ingreso en efectivo ya recibido (ventas, auspicios, entradas, votos). */
  incomeCash: number;
  incomeBySource: { sales: number; sponsorships: number; tickets: number; votes: number };
  /** Valorización de canjes (no es caja). */
  incomeBarter: number;
  /** Gasto real (compras emitidas + honorarios pagados). */
  expense: number;
  /** Efectivo comprometido por auspicios confirmados/completados. */
  sponsorCashCommitted: number;
  /** De eso, lo ya cobrado. */
  sponsorCashCollected: number;
  /** Entregables de auspicio vencidos sin cumplir (riesgo de no cobrar). */
  overdueDeliverables: number;
  /** Cuotas de candidatas del certamen aún por cobrar (vencidas o no). */
  installmentsPending: number;
  /** De eso, lo ya vencido. */
  installmentsOverdue: number;
}

export interface ProjectFinanceAnalysis {
  projectId: string;
  name: string;
  /** Días al evento (negativo si ya pasó). */
  daysToEvent: number;
  margin: number;
  /** Margen sobre ingreso en efectivo (null sin ingresos). */
  marginPercent: number | null;
  /** % del presupuesto de gasto ya ejecutado (null sin presupuesto). */
  expenseExecution: number | null;
  /** % del ingreso presupuestado ya recibido (null sin presupuesto). */
  incomeExecution: number | null;
  /** Ingreso aún por entrar que ya está comprometido (auspicios + cuotas). */
  committedPending: number;
  /** Resultado proyectado si entra todo lo comprometido y no hay más gasto. */
  projectedMargin: number;
  /** % cobrado del efectivo comprometido por auspicios (null sin compromiso). */
  sponsorCollection: number | null;
  alerts: FinanceAlert[];
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Umbrales de alerta. Juntos acá para poder revisarlos de una vez. */
export const FINANCE_THRESHOLDS = {
  /** Gasto ejecutado sobre el presupuesto desde el que se alerta. */
  expenseOverrun: 100,
  /** Gasto alto mientras el ingreso va atrasado. */
  expenseHigh: 80,
  incomeLow: 50,
  /** Ventana antes del evento en que la cobranza de auspicios importa. */
  sponsorWindowDays: 30,
  sponsorCollectionLow: 60,
} as const;

export function analyzeProjectFinance(input: ProjectFinanceInput, now: Date): ProjectFinanceAnalysis {
  const daysToEvent = daysBetween(now, input.startDate);
  const margin = input.incomeCash - input.expense;
  const marginPercent = percent(margin, input.incomeCash);
  const expenseExecution = percent(input.expense, input.budgetedExpense);
  const incomeExecution = percent(input.incomeCash, input.budgetedIncome);
  const sponsorPending = Math.max(0, input.sponsorCashCommitted - input.sponsorCashCollected);
  const committedPending = sponsorPending + input.installmentsPending;
  const projectedMargin = margin + committedPending;
  const sponsorCollection = percent(input.sponsorCashCollected, input.sponsorCashCommitted);

  const alerts: FinanceAlert[] = [];
  const alert = (severity: Severity, title: string, detail: string) => alerts.push({ severity, title, detail, projectId: input.projectId });
  const T = FINANCE_THRESHOLDS;

  if (expenseExecution !== null && expenseExecution > T.expenseOverrun) {
    alert('critical', `${input.name}: gasto sobre presupuesto`, `El gasto real (${clp(input.expense)}) va en ${expenseExecution}% del presupuesto de gasto (${clp(input.budgetedExpense)}).`);
  } else if (expenseExecution !== null && incomeExecution !== null && expenseExecution >= T.expenseHigh && incomeExecution < T.incomeLow) {
    alert(
      'warning',
      `${input.name}: gasto adelantado al ingreso`,
      `Se ejecutó el ${expenseExecution}% del gasto presupuestado pero solo ha entrado el ${incomeExecution}% del ingreso presupuestado.`
    );
  }

  if (projectedMargin < 0) {
    alert(
      'critical',
      `${input.name}: resultado proyectado negativo`,
      `Aun cobrando todo lo comprometido (${clp(committedPending)}), el certamen cerraría en ${clp(projectedMargin)}. Faltan ingresos nuevos o recortar gasto.`
    );
  } else if (margin < 0 && committedPending > 0) {
    alert(
      'warning',
      `${input.name}: caja negativa hoy`,
      `Hoy el certamen va en ${clp(margin)}; se recupera solo si se cobra lo comprometido (${clp(committedPending)}).`
    );
  }

  if (daysToEvent >= 0 && daysToEvent <= T.sponsorWindowDays && sponsorCollection !== null && sponsorCollection < T.sponsorCollectionLow) {
    alert(
      'warning',
      `${input.name}: auspicios por cobrar antes de la gala`,
      `Faltan ${daysToEvent} días para el evento y se ha cobrado el ${sponsorCollection}% del efectivo comprometido por auspicios (quedan ${clp(sponsorPending)}).`
    );
  }

  if (input.overdueDeliverables > 0) {
    alert(
      'warning',
      `${input.name}: entregables de auspicio atrasados`,
      `${input.overdueDeliverables} entregable(s) comprometido(s) con marcas están vencidos sin cumplir: es la primera razón para que una marca no pague.`
    );
  }

  if (input.installmentsOverdue > 0) {
    alert('info', `${input.name}: cuotas de candidatas vencidas`, `Hay ${clp(input.installmentsOverdue)} en cuotas de candidatas vencidas sin pagar en este certamen.`);
  }

  return { projectId: input.projectId, name: input.name, daysToEvent, margin, marginPercent, expenseExecution, incomeExecution, committedPending, projectedMargin, sponsorCollection, alerts };
}

// ─── Cobranza ───────────────────────────────────────────────────────────────

export type ReceivableKind = 'INSTALLMENT' | 'PROMISSORY_NOTE' | 'SPONSORSHIP';

export interface ReceivableInput {
  kind: ReceivableKind;
  /** Deudor (contacto). */
  debtorId: string;
  debtorName: string;
  /** Saldo por cobrar (monto - pagado). */
  balance: number;
  dueDate: Date | null;
  projectName: string | null;
}

export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucket(dueDate: Date | null, now: Date): AgingBucket {
  if (!dueDate) return 'current';
  const late = daysBetween(dueDate, now);
  if (late <= 0) return 'current';
  if (late <= 30) return '1-30';
  if (late <= 60) return '31-60';
  if (late <= 90) return '61-90';
  return '90+';
}

export interface CollectionsAnalysis {
  totalBalance: number;
  overdueBalance: number;
  byBucket: Record<AgingBucket, number>;
  byKind: Record<ReceivableKind, { balance: number; overdue: number; count: number }>;
  /** Deudores con más saldo vencido, de mayor a menor. */
  topDebtors: Array<{ debtorId: string; debtorName: string; overdue: number; oldestDays: number; items: number }>;
  /** % del saldo vencido que concentran los 3 principales deudores (null sin vencidos). */
  top3Concentration: number | null;
  alerts: FinanceAlert[];
}

const KIND_LABEL: Record<ReceivableKind, string> = {
  INSTALLMENT: 'cuotas de candidatas',
  PROMISSORY_NOTE: 'pagarés',
  SPONSORSHIP: 'auspicios',
};

export function analyzeCollections(receivables: readonly ReceivableInput[], now: Date): CollectionsAnalysis {
  const byBucket = Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0])) as Record<AgingBucket, number>;
  const byKind: CollectionsAnalysis['byKind'] = {
    INSTALLMENT: { balance: 0, overdue: 0, count: 0 },
    PROMISSORY_NOTE: { balance: 0, overdue: 0, count: 0 },
    SPONSORSHIP: { balance: 0, overdue: 0, count: 0 },
  };
  const debtors = new Map<string, { debtorId: string; debtorName: string; overdue: number; oldestDays: number; items: number }>();

  let totalBalance = 0;
  let overdueBalance = 0;
  for (const item of receivables) {
    if (item.balance <= 0) continue;
    const bucket = agingBucket(item.dueDate, now);
    totalBalance += item.balance;
    byBucket[bucket] += item.balance;
    byKind[item.kind].balance += item.balance;
    byKind[item.kind].count += 1;
    if (bucket === 'current') continue;
    overdueBalance += item.balance;
    byKind[item.kind].overdue += item.balance;
    const late = item.dueDate ? daysBetween(item.dueDate, now) : 0;
    const debtor = debtors.get(item.debtorId) ?? { debtorId: item.debtorId, debtorName: item.debtorName, overdue: 0, oldestDays: 0, items: 0 };
    debtor.overdue += item.balance;
    debtor.oldestDays = Math.max(debtor.oldestDays, late);
    debtor.items += 1;
    debtors.set(item.debtorId, debtor);
  }

  const topDebtors = [...debtors.values()].sort((a, b) => b.overdue - a.overdue || b.oldestDays - a.oldestDays);
  const top3 = topDebtors.slice(0, 3).reduce((sum, d) => sum + d.overdue, 0);
  const top3Concentration = overdueBalance > 0 ? Math.round((top3 / overdueBalance) * 100) : null;

  const alerts: FinanceAlert[] = [];
  const severe = byBucket['61-90'] + byBucket['90+'];
  if (severe > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Deuda con más de 60 días de atraso',
      detail: `${clp(severe)} llevan más de 60 días vencidos (${clp(byBucket['90+'])} sobre 90 días). A esa altura la probabilidad de cobro cae fuerte: conviene gestión directa o repactar.`,
      projectId: null,
    });
  }
  if (topDebtors.length > 0) {
    const names = topDebtors
      .slice(0, 3)
      .map((d) => `${d.debtorName} (${clp(d.overdue)}, ${d.oldestDays} d)`)
      .join('; ');
    alerts.push({
      severity: overdueBalance > 0 && (top3Concentration ?? 0) >= 50 ? 'warning' : 'info',
      title: 'A quién cobrar primero',
      detail: `Vencido total ${clp(overdueBalance)}. Los principales deudores concentran el ${top3Concentration ?? 0}%: ${names}.`,
      projectId: null,
    });
  }
  for (const kind of ['SPONSORSHIP', 'PROMISSORY_NOTE'] as const) {
    if (byKind[kind].overdue > 0) {
      alerts.push({
        severity: 'warning',
        title: `Vencido en ${KIND_LABEL[kind]}`,
        detail: `${clp(byKind[kind].overdue)} vencidos en ${KIND_LABEL[kind]} (${byKind[kind].count} documento(s) con saldo).`,
        projectId: null,
      });
    }
  }

  return { totalBalance, overdueBalance, byBucket, byKind, topDebtors: topDebtors.slice(0, 10), top3Concentration, alerts };
}

// ─── Utilidades compartidas ─────────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function sortAlerts(alerts: readonly FinanceAlert[]): FinanceAlert[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Resumen en texto de los certámenes para el prompt del agente. */
export function formatProjectsForPrompt(analyses: readonly ProjectFinanceAnalysis[], inputs: readonly ProjectFinanceInput[]): string {
  const byId = new Map(inputs.map((input) => [input.projectId, input]));
  return analyses
    .map((a) => {
      const input = byId.get(a.projectId);
      if (!input) return '';
      const lines = [
        `Certamen "${a.name}" — ${a.daysToEvent >= 0 ? `faltan ${a.daysToEvent} días para el evento` : `evento hace ${-a.daysToEvent} días`}`,
        `  Ingreso en caja: ${clp(input.incomeCash)} (auspicios ${clp(input.incomeBySource.sponsorships)}, entradas ${clp(input.incomeBySource.tickets)}, votos ${clp(input.incomeBySource.votes)}, ventas ${clp(input.incomeBySource.sales)})`,
        input.incomeBarter > 0 ? `  Canjes valorizados (no es caja): ${clp(input.incomeBarter)}` : '',
        `  Gasto real: ${clp(input.expense)} · Resultado hoy: ${clp(a.margin)}${a.marginPercent !== null ? ` (${a.marginPercent}%)` : ''}`,
        input.budgetedIncome > 0 || input.budgetedExpense > 0
          ? `  Presupuesto: ingreso ${clp(input.budgetedIncome)} (${a.incomeExecution ?? '—'}% recibido), gasto ${clp(input.budgetedExpense)} (${a.expenseExecution ?? '—'}% ejecutado)`
          : '  Sin presupuesto cargado',
        input.sponsorCashCommitted > 0 ? `  Auspicios en efectivo: comprometido ${clp(input.sponsorCashCommitted)}, cobrado ${a.sponsorCollection}%` : '',
        input.installmentsPending > 0 ? `  Cuotas de candidatas por cobrar: ${clp(input.installmentsPending)} (vencidas ${clp(input.installmentsOverdue)})` : '',
        input.overdueDeliverables > 0 ? `  Entregables de auspicio vencidos: ${input.overdueDeliverables}` : '',
        `  Resultado proyectado cobrando lo comprometido: ${clp(a.projectedMargin)}`,
      ];
      return lines.filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Resumen de cobranza para el prompt. Sin nombres de deudores a propósito:
 * muchos son candidatas (personas, a veces menores de edad) y el modelo no
 * los necesita para recomendar; los nombres quedan solo en las alertas
 * internas que arma `analyzeCollections`.
 */
export function formatCollectionsForPrompt(analysis: CollectionsAnalysis): string {
  const b = analysis.byBucket;
  const k = analysis.byKind;
  return [
    `Saldo total por cobrar: ${clp(analysis.totalBalance)} · vencido: ${clp(analysis.overdueBalance)}`,
    `Antigüedad del saldo: al día ${clp(b.current)}, 1-30 d ${clp(b['1-30'])}, 31-60 d ${clp(b['31-60'])}, 61-90 d ${clp(b['61-90'])}, +90 d ${clp(b['90+'])}`,
    `Por tipo: cuotas de candidatas ${clp(k.INSTALLMENT.balance)} (vencido ${clp(k.INSTALLMENT.overdue)}); pagarés ${clp(k.PROMISSORY_NOTE.balance)} (vencido ${clp(k.PROMISSORY_NOTE.overdue)}); auspicios ${clp(k.SPONSORSHIP.balance)} (vencido ${clp(k.SPONSORSHIP.overdue)})`,
    `Deudores con saldo vencido: ${analysis.topDebtors.length}${analysis.top3Concentration !== null ? `; los 3 mayores concentran el ${analysis.top3Concentration}% de lo vencido` : ''}`,
    analysis.topDebtors.length > 0 ? `Mayor atraso individual: ${Math.max(...analysis.topDebtors.map((d) => d.oldestDays))} días` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
