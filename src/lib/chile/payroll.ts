/**
 * Cálculo de liquidaciones de sueldo en Chile. Puro y determinístico: todo
 * parámetro legal que cambia en el tiempo (UF, UTM, ingreso mínimo, topes,
 * tasas) ENTRA como argumento y queda guardado en el `PayrollPeriod`, así una
 * liquidación cerrada se puede reproducir años después.
 *
 * Reglas implementadas:
 *  - Sueldo base proporcional a días trabajados (base 30).
 *  - Horas extra: valor hora = sueldo / 30 × 28 / (jornada semanal × 4), con
 *    recargo del 50% (art. 32 Código del Trabajo).
 *  - Gratificación art. 50: 25% de lo devengado con tope mensual de
 *    4,75 ingresos mínimos / 12.
 *  - AFP: 10% + comisión de la administradora, sobre la renta imponible con
 *    tope en UF.
 *  - Salud: 7% (Fonasa) o el mayor entre el 7% y el plan pactado en UF (Isapre).
 *  - Seguro de cesantía: trabajador 0,6% (solo contrato indefinido);
 *    empleador 2,4% indefinido / 3,0% plazo fijo u obra. Tope propio en UF.
 *  - Impuesto único de segunda categoría por tramos en UTM (art. 43 LIR).
 *  - Aportes del empleador: SIS, mutual (Ley 16.744) y aporte previsional
 *    del empleador (Ley 21.735), todos como tasa parametrizada.
 *
 * Fuera de alcance (se informan como descuentos/haberes manuales): APV,
 * asignación familiar, cargas, licencias médicas con subsidio, semana corrida.
 */

export const AFP_INSTITUTIONS = ['CAPITAL', 'CUPRUM', 'HABITAT', 'MODELO', 'PLANVITAL', 'PROVIDA', 'UNO'] as const;
export type AfpInstitutionKey = (typeof AFP_INSTITUTIONS)[number];

export const AFP_LABELS: Record<AfpInstitutionKey, string> = {
  CAPITAL: 'Capital',
  CUPRUM: 'Cuprum',
  HABITAT: 'Habitat',
  MODELO: 'Modelo',
  PLANVITAL: 'PlanVital',
  PROVIDA: 'Provida',
  UNO: 'Uno',
};

/**
 * Comisiones de referencia en basis points (1,27% = 127). Cambian por
 * licitación y decisión de cada AFP: se copian al abrir cada período y se
 * deben confirmar contra la tabla vigente de Previred.
 */
export const REFERENCE_AFP_COMMISSION_BPS: Record<AfpInstitutionKey, number> = {
  CAPITAL: 144,
  CUPRUM: 144,
  HABITAT: 127,
  MODELO: 58,
  PLANVITAL: 116,
  PROVIDA: 145,
  UNO: 49,
};

/** Cotización obligatoria de pensión (10%), en basis points. */
export const MANDATORY_PENSION_BPS = 1000;
export const HEALTH_BPS = 700;
export const UNEMPLOYMENT_WORKER_INDEFINITE_BPS = 60;
export const UNEMPLOYMENT_EMPLOYER_INDEFINITE_BPS = 240;
export const UNEMPLOYMENT_EMPLOYER_FIXED_TERM_BPS = 300;

/**
 * Valores de referencia para precargar el primer período. NO son fuente
 * oficial: la pantalla obliga a confirmarlos antes de calcular.
 */
export const REFERENCE_PAYROLL_PARAMETERS = {
  minimumWage: 539_000,
  taxableCapUf: 89.9,
  unemploymentCapUf: 135.1,
  sisRateBps: 188,
  /** Cotización básica 0,90% + 0,03% Ley SANNA, sin cotización adicional por actividad. */
  mutualRateBps: 93,
  employerPensionRateBps: 100,
} as const;

/** Tramos mensuales del impuesto único de segunda categoría, en UTM. */
export const INCOME_TAX_BRACKETS: ReadonlyArray<{ upToUtm: number; rate: number; rebateUtm: number }> = [
  { upToUtm: 13.5, rate: 0, rebateUtm: 0 },
  { upToUtm: 30, rate: 0.04, rebateUtm: 0.54 },
  { upToUtm: 50, rate: 0.08, rebateUtm: 1.74 },
  { upToUtm: 70, rate: 0.135, rebateUtm: 4.49 },
  { upToUtm: 90, rate: 0.23, rebateUtm: 11.14 },
  { upToUtm: 120, rate: 0.304, rebateUtm: 17.8 },
  { upToUtm: 310, rate: 0.35, rebateUtm: 23.32 },
  { upToUtm: Number.POSITIVE_INFINITY, rate: 0.4, rebateUtm: 38.82 },
];

export type ContractTypeKey = 'INDEFINIDO' | 'PLAZO_FIJO' | 'POR_OBRA';
export type HealthInsuranceKey = 'FONASA' | 'ISAPRE';
export type GratificationModeKey = 'ART_50' | 'NONE';

export interface PayrollParameters {
  ufValue: number;
  utmValue: number;
  minimumWage: number;
  taxableCapUf: number;
  unemploymentCapUf: number;
  sisRateBps: number;
  mutualRateBps: number;
  employerPensionRateBps: number;
  afpCommissionBps: Record<AfpInstitutionKey, number>;
}

export interface PayrollEmployeeInput {
  baseSalary: number;
  contractType: ContractTypeKey;
  weeklyHours: number;
  gratificationMode: GratificationModeKey;
  mealAllowance: number;
  transportAllowance: number;
  afp: AfpInstitutionKey;
  healthInsurance: HealthInsuranceKey;
  isaprePlanUf: number | null;
}

export interface PayrollVariables {
  workedDays: number;
  overtimeHours: number;
  bonuses: number;
  advances: number;
  otherDeductions: number;
}

export interface PayslipComputation {
  workedDays: number;
  overtimeHours: number;
  bonuses: number;
  advances: number;
  otherDeductions: number;
  baseSalary: number;
  gratification: number;
  overtimeAmount: number;
  taxableIncome: number;
  mealAllowance: number;
  transportAllowance: number;
  pensionAmount: number;
  healthAmount: number;
  unemploymentEmployee: number;
  taxBase: number;
  incomeTax: number;
  totalDeductions: number;
  netPay: number;
  employerSis: number;
  employerUnemployment: number;
  employerMutual: number;
  employerPension: number;
  employerCost: number;
}

const bps = (amount: number, rateBps: number) => Math.round((amount * rateBps) / 10_000);

/** Impuesto único mensual sobre la base tributable (CLP), redondeado a entero y nunca negativo. */
export function incomeTax(taxBase: number, utmValue: number): number {
  if (taxBase <= 0 || utmValue <= 0) return 0;
  const inUtm = taxBase / utmValue;
  const bracket = INCOME_TAX_BRACKETS.find((b) => inUtm <= b.upToUtm) ?? INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
  return Math.max(0, Math.round(taxBase * bracket.rate - bracket.rebateUtm * utmValue));
}

/** Valor de la hora ordinaria según la fórmula de la Dirección del Trabajo. */
export function hourlyValue(monthlySalary: number, weeklyHours: number): number {
  if (weeklyHours <= 0) return 0;
  return ((monthlySalary / 30) * 28) / (weeklyHours * 4);
}

export function gratificationMonthlyCap(minimumWage: number): number {
  return Math.round((4.75 * minimumWage) / 12);
}

export function computePayslip(employee: PayrollEmployeeInput, variables: PayrollVariables, params: PayrollParameters): PayslipComputation {
  const workedDays = Math.min(30, Math.max(0, Math.round(variables.workedDays)));
  const dayFactor = workedDays / 30;

  const baseSalary = Math.round(employee.baseSalary * dayFactor);
  const overtimeAmount = Math.round(hourlyValue(employee.baseSalary, employee.weeklyHours) * 1.5 * Math.max(0, variables.overtimeHours));
  const bonuses = Math.max(0, Math.round(variables.bonuses));
  const gratification =
    employee.gratificationMode === 'ART_50'
      ? Math.min(Math.round(0.25 * (baseSalary + overtimeAmount + bonuses)), gratificationMonthlyCap(params.minimumWage))
      : 0;

  const taxableIncome = baseSalary + overtimeAmount + bonuses + gratification;
  const cappedTaxable = Math.min(taxableIncome, Math.round(params.taxableCapUf * params.ufValue));
  const cappedUnemployment = Math.min(taxableIncome, Math.round(params.unemploymentCapUf * params.ufValue));

  const commission = params.afpCommissionBps[employee.afp] ?? 0;
  const pensionAmount = bps(cappedTaxable, MANDATORY_PENSION_BPS + commission);

  const legalHealth = bps(cappedTaxable, HEALTH_BPS);
  const isapreAmount = employee.healthInsurance === 'ISAPRE' && employee.isaprePlanUf ? Math.round(employee.isaprePlanUf * params.ufValue) : 0;
  const healthAmount = employee.healthInsurance === 'ISAPRE' ? Math.max(legalHealth, isapreAmount) : legalHealth;

  const indefinite = employee.contractType === 'INDEFINIDO';
  const unemploymentEmployee = indefinite ? bps(cappedUnemployment, UNEMPLOYMENT_WORKER_INDEFINITE_BPS) : 0;

  // Rebaja de salud en la base del impuesto único: lo efectivamente cotizado
  // (plan de Isapre incluido), con tope en el 7% calculado sobre el tope
  // imponible vigente del período (art. 42 N°1 LIR; criterio SII, Oficio
  // 2406/2016). Las "4,2 UF" que se citan a veces son ese 7% cuando el tope
  // imponible era 60 UF: el límite se mueve con el tope, no es fijo. Antes se
  // rebajaba solo el 7% del sueldo y un plan de Isapre sobre el 7% pagaba más
  // impuesto del que corresponde.
  const healthTaxCap = bps(Math.round(params.taxableCapUf * params.ufValue), HEALTH_BPS);
  const deductibleHealth = Math.max(legalHealth, Math.min(healthAmount, healthTaxCap));
  const taxBase = Math.max(0, taxableIncome - pensionAmount - deductibleHealth - unemploymentEmployee);
  const tax = incomeTax(taxBase, params.utmValue);

  const mealAllowance = Math.round(employee.mealAllowance * dayFactor);
  const transportAllowance = Math.round(employee.transportAllowance * dayFactor);
  const advances = Math.max(0, Math.round(variables.advances));
  const otherDeductions = Math.max(0, Math.round(variables.otherDeductions));

  const totalDeductions = pensionAmount + healthAmount + unemploymentEmployee + tax + advances + otherDeductions;
  const netPay = taxableIncome + mealAllowance + transportAllowance - totalDeductions;

  const employerSis = bps(cappedTaxable, params.sisRateBps);
  const employerUnemployment = bps(cappedUnemployment, indefinite ? UNEMPLOYMENT_EMPLOYER_INDEFINITE_BPS : UNEMPLOYMENT_EMPLOYER_FIXED_TERM_BPS);
  const employerMutual = bps(cappedTaxable, params.mutualRateBps);
  const employerPension = bps(cappedTaxable, params.employerPensionRateBps);
  const employerCost = taxableIncome + mealAllowance + transportAllowance + employerSis + employerUnemployment + employerMutual + employerPension;

  return {
    workedDays,
    overtimeHours: Math.max(0, variables.overtimeHours),
    bonuses,
    advances,
    otherDeductions,
    baseSalary,
    gratification,
    overtimeAmount,
    taxableIncome,
    mealAllowance,
    transportAllowance,
    pensionAmount,
    healthAmount,
    unemploymentEmployee,
    taxBase,
    incomeTax: tax,
    totalDeductions,
    netPay,
    employerSis,
    employerUnemployment,
    employerMutual,
    employerPension,
    employerCost,
  };
}

/**
 * Días trabajados sugeridos (base 30): completos, salvo que el trabajador
 * haya ingresado o terminado dentro del mismo mes.
 */
export function suggestedWorkedDays(year: number, month: number, hireDate: Date, terminationDate: Date | null): number {
  let first = 1;
  let last = 30;
  if (hireDate.getUTCFullYear() === year && hireDate.getUTCMonth() + 1 === month) first = Math.min(30, hireDate.getUTCDate());
  if (terminationDate && terminationDate.getUTCFullYear() === year && terminationDate.getUTCMonth() + 1 === month) {
    last = Math.min(30, terminationDate.getUTCDate());
  }
  return Math.max(0, last - first + 1);
}

// ── Vacaciones ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días hábiles (lunes a viernes) entre dos fechas, ambas inclusive. No descuenta feriados. */
export function businessDaysBetween(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return count;
}

/**
 * Feriado legal devengado: 15 días hábiles por año de servicio (art. 67),
 * acumulado a razón de 1,25 días por mes completo trabajado.
 */
export function accruedVacationDays(hireDate: Date, asOf: Date, terminationDate?: Date | null): number {
  const end = terminationDate && terminationDate < asOf ? terminationDate : asOf;
  if (end <= hireDate) return 0;
  const months =
    (end.getUTCFullYear() - hireDate.getUTCFullYear()) * 12 + (end.getUTCMonth() - hireDate.getUTCMonth()) - (end.getUTCDate() < hireDate.getUTCDate() ? 1 : 0);
  return Math.max(0, months) * 1.25;
}
