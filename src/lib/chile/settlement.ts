/**
 * Finiquito, como funciones puras (Código del Trabajo). Calcula las
 * indemnizaciones legales al término del contrato:
 *
 * - Años de servicio (art. 163): 30 días de la última remuneración mensual por
 *   cada año y fracción superior a seis meses, con un año mínimo de antigüedad,
 *   tope de 11 años (contratos desde el 14-08-1981) y remuneración tope de 90 UF
 *   (art. 172). Procede en el art. 161 (necesidades de la empresa y desahucio).
 * - Sustitutiva del aviso previo (art. 161/162): una remuneración mensual (tope
 *   90 UF) si el despido por el art. 161 no se avisó con 30 días.
 * - Feriado (art. 73): los días hábiles pendientes se pagan como días corridos,
 *   sumando sábados y domingos que caen dentro del período que habrían cubierto.
 *
 * No descuenta feriados legales al convertir días hábiles (se indica en
 * pantalla) ni calcula recargos del art. 168, que solo fija un tribunal.
 */

export const SEVERANCE_CAP_UF = 90;
export const SEVERANCE_MAX_YEARS = 11;

export const TERMINATION_CAUSES = [
  { code: 'ART_159_1', label: 'Mutuo acuerdo de las partes', article: 'Art. 159 N°1', severance: false, notice: false },
  { code: 'ART_159_2', label: 'Renuncia voluntaria del trabajador', article: 'Art. 159 N°2', severance: false, notice: false },
  { code: 'ART_159_3', label: 'Muerte del trabajador', article: 'Art. 159 N°3', severance: false, notice: false },
  { code: 'ART_159_4', label: 'Vencimiento del plazo convenido', article: 'Art. 159 N°4', severance: false, notice: false },
  { code: 'ART_159_5', label: 'Conclusión del trabajo o servicio (obra o faena)', article: 'Art. 159 N°5', severance: false, notice: false },
  { code: 'ART_159_6', label: 'Caso fortuito o fuerza mayor', article: 'Art. 159 N°6', severance: false, notice: false },
  { code: 'ART_160', label: 'Despido por causa imputable al trabajador', article: 'Art. 160', severance: false, notice: false },
  { code: 'ART_161_1', label: 'Necesidades de la empresa', article: 'Art. 161 inc. 1°', severance: true, notice: true },
  { code: 'ART_161_2', label: 'Desahucio (cargo de exclusiva confianza)', article: 'Art. 161 inc. 2°', severance: true, notice: true },
] as const;

export type TerminationCauseCode = (typeof TERMINATION_CAUSES)[number]['code'];

export const TERMINATION_CAUSE_CODES = TERMINATION_CAUSES.map((cause) => cause.code) as [TerminationCauseCode, ...TerminationCauseCode[]];

export function terminationCause(code: string) {
  return TERMINATION_CAUSES.find((cause) => cause.code === code) ?? null;
}

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}

function dayOnly(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Años de servicio indemnizables: años completos más uno si la fracción supera
 * seis meses. Cero si la relación duró menos de un año. Tope 11.
 */
export function severanceYears(hireDate: Date, terminationDate: Date): number {
  const end = dayOnly(terminationDate);
  if (dayOnly(addUtcMonths(hireDate, 12)) > end) return 0;
  let years = 0;
  while (dayOnly(addUtcMonths(hireDate, (years + 1) * 12)) <= end) years += 1;
  const fractionStart = addUtcMonths(hireDate, years * 12);
  if (dayOnly(addUtcMonths(fractionStart, 6)) < end) years += 1;
  return Math.min(years, SEVERANCE_MAX_YEARS);
}

/** Remuneración base para indemnizar: la última mensual, con tope de 90 UF. */
export function severanceBase(monthlySalary: number, ufValue: number): number {
  if (ufValue <= 0) return Math.max(0, Math.round(monthlySalary));
  return Math.max(0, Math.min(Math.round(monthlySalary), Math.round(SEVERANCE_CAP_UF * ufValue)));
}

/**
 * Días corridos que corresponden a `businessDays` días hábiles de feriado
 * contados desde el día siguiente al término (sábados y domingos intermedios
 * se suman; la fracción de día se agrega tal cual).
 */
export function vacationCalendarDays(businessDays: number, terminationDate: Date): number {
  if (businessDays <= 0) return 0;
  const whole = Math.floor(businessDays + 1e-9);
  const fraction = Math.round((businessDays - whole) * 100) / 100;
  let consumed = 0;
  let calendar = 0;
  const cursor = new Date(dayOnly(terminationDate));
  while (consumed < whole) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    calendar += 1;
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) consumed += 1;
  }
  return calendar + fraction;
}

export interface SettlementInput {
  hireDate: Date;
  terminationDate: Date;
  cause: TerminationCauseCode;
  /** Solo relevante en el art. 161: si se avisó con 30 días de anticipación. */
  noticeGiven: boolean;
  /** Última remuneración mensual (sueldo + gratificación + asignaciones fijas). */
  monthlySalary: number;
  /** Sueldo base mensual, para valorizar el feriado. */
  baseSalary: number;
  ufValue: number;
  /** Días hábiles de feriado pendientes (devengados − tomados). */
  vacationBusinessDays: number;
  pendingSalary: number;
  otherEarnings: number;
  loanBalance: number;
  otherDeductions: number;
}

export interface SettlementComputation {
  yearsOfService: number;
  severanceBase: number;
  severanceAmount: number;
  noticeIndemnity: number;
  vacationBusinessDays: number;
  vacationCalendarDays: number;
  vacationAmount: number;
  pendingSalary: number;
  otherEarnings: number;
  totalEarnings: number;
  loanBalance: number;
  otherDeductions: number;
  totalDeductions: number;
  totalAmount: number;
}

export function computeSettlement(input: SettlementInput): SettlementComputation {
  const cause = terminationCause(input.cause);
  const base = severanceBase(input.monthlySalary, input.ufValue);
  const years = severanceYears(input.hireDate, input.terminationDate);
  const severanceAmount = cause?.severance ? base * years : 0;
  const noticeIndemnity = cause?.notice && !input.noticeGiven ? base : 0;
  const vacationBusinessDays = Math.max(0, Math.round(input.vacationBusinessDays * 100) / 100);
  const calendarDays = vacationCalendarDays(vacationBusinessDays, input.terminationDate);
  const vacationAmount = Math.round((Math.max(0, input.baseSalary) / 30) * calendarDays);
  const pendingSalary = Math.max(0, Math.round(input.pendingSalary));
  const otherEarnings = Math.max(0, Math.round(input.otherEarnings));
  const totalEarnings = severanceAmount + noticeIndemnity + vacationAmount + pendingSalary + otherEarnings;
  const loanBalance = Math.max(0, Math.round(input.loanBalance));
  const otherDeductions = Math.max(0, Math.round(input.otherDeductions));
  const totalDeductions = loanBalance + otherDeductions;
  return {
    yearsOfService: years,
    severanceBase: base,
    severanceAmount,
    noticeIndemnity,
    vacationBusinessDays,
    vacationCalendarDays: calendarDays,
    vacationAmount,
    pendingSalary,
    otherEarnings,
    totalEarnings,
    loanBalance,
    otherDeductions,
    totalDeductions,
    totalAmount: totalEarnings - totalDeductions,
  };
}
