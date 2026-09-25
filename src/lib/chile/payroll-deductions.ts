import { AFP_LABELS, type AfpInstitutionKey } from './payroll';

/**
 * Préstamos y anticipos al trabajador, y el resumen de cotizaciones del mes
 * por institución, como funciones puras.
 */

export interface LoanTerms {
  principal: number;
  installments: number;
  installmentAmount: number;
  startYear: number;
  startMonth: number;
  paidInstallments: number;
  status: 'ACTIVE' | 'PAID' | 'CANCELLED';
}

/** Cuota base (entera): la última absorbe el resto, para que sumen exacto el capital. */
export function loanInstallmentAmount(principal: number, installments: number): number {
  if (installments <= 0) throw new Error('El número de cuotas debe ser mayor a cero');
  return Math.floor(principal / installments);
}

/** Monto de la cuota N° `number` (1-based). */
export function installmentValue(loan: Pick<LoanTerms, 'principal' | 'installments' | 'installmentAmount'>, number: number): number {
  if (number < 1 || number > loan.installments) return 0;
  if (number < loan.installments) return loan.installmentAmount;
  return loan.principal - loan.installmentAmount * (loan.installments - 1);
}

/** Saldo por pagar del préstamo. */
export function loanBalance(loan: Pick<LoanTerms, 'principal' | 'installments' | 'installmentAmount' | 'paidInstallments' | 'status'>): number {
  if (loan.status !== 'ACTIVE') return 0;
  let paid = 0;
  for (let n = 1; n <= Math.min(loan.paidInstallments, loan.installments); n += 1) paid += installmentValue(loan, n);
  return Math.max(0, loan.principal - paid);
}

/**
 * Cuota a descontar en la liquidación de `year`/`month`: la siguiente impaga,
 * si el préstamo ya empezó. Un mes sin liquidación cerrada no adelanta cuotas:
 * se descuenta de a una.
 */
export function loanDeductionFor(loan: LoanTerms, year: number, month: number): number {
  if (loan.status !== 'ACTIVE' || loan.paidInstallments >= loan.installments) return 0;
  if (year * 12 + month < loan.startYear * 12 + loan.startMonth) return 0;
  return installmentValue(loan, loan.paidInstallments + 1);
}

/** Datos del mes con los que se arma el resumen por institución. */
export interface ContributionPayslip {
  afp: AfpInstitutionKey;
  healthInsurance: 'FONASA' | 'ISAPRE';
  isapreName: string | null;
  contractType: 'INDEFINIDO' | 'PLAZO_FIJO' | 'POR_OBRA';
  taxableIncome: number;
  pensionAmount: number;
  healthAmount: number;
  unemploymentEmployee: number;
  incomeTax: number;
  employerSis: number;
  employerUnemployment: number;
  employerMutual: number;
  employerPension: number;
}

export interface ContributionLine {
  institution: string;
  kind: 'AFP' | 'SALUD' | 'AFC' | 'MUTUAL' | 'IMPUESTO';
  workers: number;
  /** Cargo del trabajador (descontado en la liquidación). */
  employee: number;
  /** Cargo del empleador (costo de la empresa). */
  employer: number;
  total: number;
  detail: string;
}

/**
 * Lo que hay que pagar el mes, agrupado como se paga: cada AFP (cotización +
 * SIS + aporte del empleador), cada institución de salud, el seguro de
 * cesantía (AFC), la mutual o ISL, y el impuesto único (va en el F29).
 */
export function contributionSummary(payslips: readonly ContributionPayslip[], mutualLabel: string): ContributionLine[] {
  const lines = new Map<string, ContributionLine>();
  const add = (key: string, base: Omit<ContributionLine, 'workers' | 'employee' | 'employer' | 'total'>, employee: number, employer: number) => {
    const line = lines.get(key) ?? { ...base, workers: 0, employee: 0, employer: 0, total: 0 };
    line.workers += 1;
    line.employee += employee;
    line.employer += employer;
    line.total = line.employee + line.employer;
    lines.set(key, line);
  };
  for (const slip of payslips) {
    add(`AFP:${slip.afp}`, { institution: `AFP ${AFP_LABELS[slip.afp]}`, kind: 'AFP', detail: 'Cotización obligatoria + comisión, SIS y aporte del empleador' }, slip.pensionAmount, slip.employerSis + slip.employerPension);
    const health = slip.healthInsurance === 'FONASA' ? 'FONASA' : `Isapre ${slip.isapreName?.trim() || 'sin nombre'}`;
    add(`SALUD:${health}`, { institution: health, kind: 'SALUD', detail: slip.healthInsurance === 'FONASA' ? 'Cotización legal 7%' : 'Plan pactado (mínimo 7%)' }, slip.healthAmount, 0);
    if (slip.unemploymentEmployee + slip.employerUnemployment > 0) {
      add('AFC', { institution: 'Seguro de cesantía (AFC)', kind: 'AFC', detail: 'Aporte del trabajador y del empleador' }, slip.unemploymentEmployee, slip.employerUnemployment);
    }
    if (slip.employerMutual > 0) add('MUTUAL', { institution: mutualLabel, kind: 'MUTUAL', detail: 'Seguro de accidentes del trabajo (Ley 16.744)' }, 0, slip.employerMutual);
    if (slip.incomeTax > 0) add('IMPUESTO', { institution: 'Impuesto único (SII)', kind: 'IMPUESTO', detail: 'Se declara y paga en el F29 del mes siguiente' }, slip.incomeTax, 0);
  }
  const order: ContributionLine['kind'][] = ['AFP', 'SALUD', 'AFC', 'MUTUAL', 'IMPUESTO'];
  return [...lines.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.institution.localeCompare(b.institution, 'es'));
}

export const MUTUAL_OPTIONS = [
  { code: 'ISL', label: 'ISL (Instituto de Seguridad Laboral)' },
  { code: 'ACHS', label: 'ACHS' },
  { code: 'MUSEG', label: 'Mutual de Seguridad CChC' },
  { code: 'IST', label: 'IST' },
] as const;

export function mutualLabel(code: string | null | undefined): string {
  return MUTUAL_OPTIONS.find((option) => option.code === code)?.label ?? 'ISL (Instituto de Seguridad Laboral)';
}
