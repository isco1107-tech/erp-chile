import { prisma } from '@/lib/prisma';
import type { Account, AccountNature, AccountType, CashFlowCategory } from '@prisma/client';
import { getTrialBalance, type TrialBalanceRow } from './ledger.service';

/**
 * Capa de presentación sobre `getTrialBalance`: arma Balance General, Estado
 * de Resultados y Flujo de Efectivo (método indirecto). No recalcula saldos
 * — todo sale de `ledger.service.ts`, esto solo clasifica y agrupa.
 */

/** Signo "normal" de cada tipo de cuenta, para orientar los saldos a un valor positivo cuando el saldo es el esperado. */
function canonicalNature(type: AccountType): AccountNature {
  return type === 'ASSET' || type === 'COST' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

/**
 * Orienta un neto (debe − haber) según el signo normal de su `type`, sin
 * importar la `nature` propia de la cuenta. Así una cuenta contra-activo
 * (nature CREDIT bajo un type ASSET, p.ej. Depreciación acumulada) se resta
 * sola del total del grupo en vez de sumarse, sin lógica especial por cuenta.
 */
function toCanonical(type: AccountType, net: number): number {
  return canonicalNature(type) === 'DEBIT' ? net : -net;
}

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface StatementSection {
  label: string;
  lines: StatementLine[];
  subtotal: number;
}

export interface BalanceSheetResult {
  companyId: string;
  year: number;
  month: number;
  assetsCurrent: StatementSection;
  assetsNonCurrent: StatementSection;
  totalAssets: number;
  liabilitiesCurrent: StatementSection;
  liabilitiesNonCurrent: StatementSection;
  totalLiabilities: number;
  /** Incluye las cuentas de patrimonio reales más la línea calculada de resultado acumulado no cerrado. */
  equity: StatementSection;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  /** Activo − (Pasivo + Patrimonio). Debe ser 0; si no lo es, hay un bug en el motor contable. */
  difference: number;
  isBalanced: boolean;
}

export interface IncomeStatementResult {
  companyId: string;
  year: number;
  month: number;
  revenue: StatementSection;
  totalRevenue: number;
  costOfSales: StatementSection;
  totalCostOfSales: number;
  grossProfit: number;
  expenses: StatementSection;
  totalExpenses: number;
  netIncome: number;
}

export interface CashFlowLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface CashFlowCategoryGroup {
  category: Exclude<CashFlowCategory, 'NONE'>;
  label: string;
  lines: CashFlowLine[];
  subtotal: number;
}

export interface CashFlowStatementResult {
  companyId: string;
  year: number;
  month: number;
  netIncome: number;
  categories: CashFlowCategoryGroup[];
  /** Suma de las 3 categorías (incluye la utilidad del ejercicio dentro de Operación). */
  netCashChange: number;
  openingCash: number;
  closingCash: number;
  /** Variación real de Caja + Banco en el período, para contrastar contra `netCashChange`. */
  actualCashChange: number;
  /** `netCashChange` y `actualCashChange` deben coincidir por identidad contable (Activo = Pasivo + Patrimonio + Resultado). */
  reconciled: boolean;
}

const CATEGORY_LABELS: Record<Exclude<CashFlowCategory, 'NONE'>, string> = {
  OPERATING: 'Actividades de Operación',
  INVESTING: 'Actividades de Inversión',
  FINANCING: 'Actividades de Financiamiento',
};

type AccountRow = Pick<
  Account,
  'id' | 'code' | 'name' | 'type' | 'nature' | 'isCurrent' | 'isPostable' | 'cashFlowCategory'
> & { isCashAccount: boolean };

async function loadLeafAccounts(companyId: string): Promise<AccountRow[]> {
  const [accounts, cashMappings] = await Promise.all([
    prisma.account.findMany({
      where: { companyId, isPostable: true },
      select: { id: true, code: true, name: true, type: true, nature: true, isCurrent: true, isPostable: true, cashFlowCategory: true },
      orderBy: { code: 'asc' },
    }),
    // `mappingKey` no es un campo de `Account` — la relación semántica vive en
    // `AccountMapping` (companyId, key) -> accountId. CAJA/BANCO identifican
    // las cuentas monetarias que el flujo de efectivo excluye del ajuste
    // indirecto y usa para calcular la variación real de caja.
    prisma.accountMapping.findMany({
      where: { companyId, key: { in: ['CAJA', 'BANCO'] } },
      select: { accountId: true },
    }),
  ]);

  const cashAccountIds = new Set(cashMappings.map((mapping) => mapping.accountId));
  return accounts.map((account) => ({ ...account, isCashAccount: cashAccountIds.has(account.id) }));
}

function toLine(account: AccountRow, amount: number): StatementLine {
  return { accountId: account.id, code: account.code, name: account.name, amount };
}

function buildSection(label: string, lines: StatementLine[]): StatementSection {
  return { label, lines, subtotal: lines.reduce((sum, line) => sum + line.amount, 0) };
}

/**
 * Balance General a la fecha de cierre del período (`year`/`month`). Usa el
 * saldo de cierre acumulado desde el inicio de la empresa (no solo el mes),
 * porque un balance es una foto al instante, no un movimiento del período.
 *
 * El patrimonio incluye una línea calculada "Resultado acumulado no
 * distribuido": la suma de Ingresos − Costos − Gastos desde el inicio de la
 * empresa hasta la fecha, tal como las devuelve el propio saldo de cierre. No
 * existe todavía un proceso de cierre de ejercicio que traspase ese resultado
 * a `Resultados acumulados` (3102) o `Resultado del ejercicio` (3103), así que
 * sin esta línea el balance nunca cuadraría: Activo = Pasivo + Patrimonio se
 * cumple sólo si el resultado acumulado de Ingresos/Costos/Gastos se refleja
 * en algún lado del patrimonio.
 */
export async function getBalanceSheet(companyId: string, year: number, month: number): Promise<BalanceSheetResult> {
  const [accounts, trialBalance] = await Promise.all([loadLeafAccounts(companyId), getTrialBalance(companyId, year, month)]);
  const closingByAccount = new Map(trialBalance.map((row) => [row.accountId, row.closingDebit - row.closingCredit]));

  const assetsCurrentLines: StatementLine[] = [];
  const assetsNonCurrentLines: StatementLine[] = [];
  const liabilitiesCurrentLines: StatementLine[] = [];
  const liabilitiesNonCurrentLines: StatementLine[] = [];
  const equityLines: StatementLine[] = [];

  let cumulativeNetIncome = 0;

  for (const account of accounts) {
    const closingNet = closingByAccount.get(account.id) ?? 0;
    const amount = toCanonical(account.type, closingNet);

    if (account.type === 'ASSET') {
      (account.isCurrent === true ? assetsCurrentLines : assetsNonCurrentLines).push(toLine(account, amount));
    } else if (account.type === 'LIABILITY') {
      (account.isCurrent === true ? liabilitiesCurrentLines : liabilitiesNonCurrentLines).push(toLine(account, amount));
    } else if (account.type === 'EQUITY') {
      equityLines.push(toLine(account, amount));
    } else if (account.type === 'REVENUE') {
      // No va directo al balance: se acumula en el resultado no distribuido.
      // `amount` ya viene orientado en positivo para un ingreso normal (ver `toCanonical`).
      cumulativeNetIncome += amount;
    } else {
      // COST / EXPENSE: `amount` también viene positivo (gasto normal), así que
      // se resta — sumarlo tal cual duplicaría el efecto de costos/gastos como
      // si fueran ingreso en vez de neutralizar el resultado acumulado.
      cumulativeNetIncome -= amount;
    }
  }

  if (cumulativeNetIncome !== 0) {
    equityLines.push({
      accountId: 'computed:net-income-to-date',
      code: '3199',
      name: 'Resultado acumulado no distribuido (calculado)',
      amount: cumulativeNetIncome,
    });
  }

  const assetsCurrent = buildSection('Activo Corriente', assetsCurrentLines);
  const assetsNonCurrent = buildSection('Activo No Corriente', assetsNonCurrentLines);
  const liabilitiesCurrent = buildSection('Pasivo Corriente', liabilitiesCurrentLines);
  const liabilitiesNonCurrent = buildSection('Pasivo No Corriente', liabilitiesNonCurrentLines);
  const equity = buildSection('Patrimonio', equityLines);

  const totalAssets = assetsCurrent.subtotal + assetsNonCurrent.subtotal;
  const totalLiabilities = liabilitiesCurrent.subtotal + liabilitiesNonCurrent.subtotal;
  const totalEquity = equity.subtotal;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;

  return {
    companyId,
    year,
    month,
    assetsCurrent,
    assetsNonCurrent,
    totalAssets,
    liabilitiesCurrent,
    liabilitiesNonCurrent,
    totalLiabilities,
    equity,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference,
    isBalanced: difference === 0,
  };
}

/**
 * Estado de Resultados del período seleccionado (solo el mes/año indicado,
 * no acumulado): usa el movimiento del período de `getTrialBalance`, no el
 * saldo de cierre.
 */
export async function getIncomeStatement(companyId: string, year: number, month: number): Promise<IncomeStatementResult> {
  const [accounts, trialBalance] = await Promise.all([loadLeafAccounts(companyId), getTrialBalance(companyId, year, month)]);
  const periodByAccount = new Map(trialBalance.map((row) => [row.accountId, row.periodDebit - row.periodCredit]));

  const revenueLines: StatementLine[] = [];
  const costLines: StatementLine[] = [];
  const expenseLines: StatementLine[] = [];

  for (const account of accounts) {
    const periodNet = periodByAccount.get(account.id) ?? 0;
    const amount = toCanonical(account.type, periodNet);

    if (account.type === 'REVENUE') revenueLines.push(toLine(account, amount));
    else if (account.type === 'COST') costLines.push(toLine(account, amount));
    else if (account.type === 'EXPENSE') expenseLines.push(toLine(account, amount));
  }

  const revenue = buildSection('Ingresos', revenueLines);
  const costOfSales = buildSection('Costos', costLines);
  const expenses = buildSection('Gastos', expenseLines);

  const totalRevenue = revenue.subtotal;
  const totalCostOfSales = costOfSales.subtotal;
  const grossProfit = totalRevenue - totalCostOfSales;
  const totalExpenses = expenses.subtotal;
  const netIncome = grossProfit - totalExpenses;

  return {
    companyId,
    year,
    month,
    revenue,
    totalRevenue,
    costOfSales,
    totalCostOfSales,
    grossProfit,
    expenses,
    totalExpenses,
    netIncome,
  };
}

/**
 * Flujo de Efectivo por método indirecto, del mes/año seleccionado.
 *
 * Parte de la utilidad del ejercicio y ajusta por la variación del período de
 * cada cuenta que no es Caja/Banco: un aumento de activo no-monetario es un
 * uso de caja (se resta), un aumento de pasivo o patrimonio es una fuente de
 * caja (se suma). Cada ajuste se clasifica en Operación/Inversión/
 * Financiamiento según `Account.cashFlowCategory` (las cuentas sin categoría
 * asignada, NONE, caen a Operación por defecto en vez de perderse, porque un
 * movimiento real de esas cuentas sí movió caja).
 *
 * Por identidad contable (Activo = Pasivo + Patrimonio + Resultado, aplicada
 * a la variación del período), la suma de las 3 categorías debe coincidir
 * exactamente con la variación real de Caja + Banco del período — no es una
 * aproximación, es la misma partida doble vista desde el otro lado. `reconciled`
 * expone esa comprobación en vez de asumirla.
 */
export async function getCashFlowStatement(companyId: string, year: number, month: number): Promise<CashFlowStatementResult> {
  const [accounts, trialBalance] = await Promise.all([loadLeafAccounts(companyId), getTrialBalance(companyId, year, month)]);
  const rowsByAccount = new Map<string, TrialBalanceRow>(trialBalance.map((row) => [row.accountId, row]));

  let netIncome = 0;
  const operating: CashFlowLine[] = [];
  const investing: CashFlowLine[] = [];
  const financing: CashFlowLine[] = [];

  let cashOpening = 0;
  let cashPeriodMovement = 0;

  for (const account of accounts) {
    const row = rowsByAccount.get(account.id);
    const periodNet = row ? row.periodDebit - row.periodCredit : 0;

    if (account.isCashAccount) {
      cashOpening += row ? row.openingDebit - row.openingCredit : 0;
      cashPeriodMovement += periodNet;
      continue;
    }

    if (account.type === 'REVENUE' || account.type === 'COST' || account.type === 'EXPENSE') {
      // Mismo criterio de signo que `getBalanceSheet`: `toCanonical` ya orienta el
      // monto en positivo para el saldo normal de cada tipo, así que Costo y
      // Gasto se restan del Ingreso — sumarlos tal cual duplicaría su efecto.
      const canonicalAmount = toCanonical(account.type, periodNet);
      netIncome += account.type === 'REVENUE' ? canonicalAmount : -canonicalAmount;
      continue;
    }

    if (periodNet === 0) continue;

    // Activo no monetario: un aumento (más saldo deudor, `periodNet` positivo)
    // consume caja → efecto negativo. Pasivo/Patrimonio: un aumento (más saldo
    // acreedor, `periodNet` negativo porque son cuentas de naturaleza CREDIT)
    // aporta caja → también da positivo al invertir el signo. Por eso el
    // ajuste es `-periodNet` para AMBOS casos, sin condicional por tipo: el
    // cambio de signo de `periodNet` entre débito/crédito ya lo resuelve solo
    // (ver la prueba algebraica en el docstring de esta función).
    const adjustment = -periodNet;
    const category = account.cashFlowCategory === 'NONE' ? 'OPERATING' : account.cashFlowCategory;
    const line: CashFlowLine = { accountId: account.id, code: account.code, name: account.name, amount: adjustment };

    if (category === 'INVESTING') investing.push(line);
    else if (category === 'FINANCING') financing.push(line);
    else operating.push(line);
  }

  operating.unshift({ accountId: 'computed:net-income', code: '0000', name: 'Utilidad del ejercicio', amount: netIncome });

  const categories: CashFlowCategoryGroup[] = (['OPERATING', 'INVESTING', 'FINANCING'] as const).map((category) => {
    const lines = category === 'OPERATING' ? operating : category === 'INVESTING' ? investing : financing;
    return { category, label: CATEGORY_LABELS[category], lines, subtotal: lines.reduce((sum, l) => sum + l.amount, 0) };
  });

  const netCashChange = categories.reduce((sum, group) => sum + group.subtotal, 0);
  const openingCash = cashOpening;
  const actualCashChange = cashPeriodMovement;
  const closingCash = openingCash + actualCashChange;

  return {
    companyId,
    year,
    month,
    netIncome,
    categories,
    netCashChange,
    openingCash,
    closingCash,
    actualCashChange,
    reconciled: netCashChange === actualCashChange,
  };
}
