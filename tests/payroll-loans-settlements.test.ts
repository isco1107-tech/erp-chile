import { computePayslip, REFERENCE_AFP_COMMISSION_BPS, type PayrollEmployeeInput, type PayrollParameters } from '@/lib/chile/payroll';
import { computeSettlement, severanceBase, severanceYears, terminationCause, vacationCalendarDays } from '@/lib/chile/settlement';
import { contributionSummary, installmentValue, loanBalance, loanDeductionFor, loanInstallmentAmount, mutualLabel, type ContributionPayslip, type LoanTerms } from '@/lib/chile/payroll-deductions';
import { numberToWords, pesosInWords } from '@/lib/chile/number-words';
import { employeeAdvanceSchema, employeeLoanSchema, portalLeaveSchema, settlementSchema } from '@/modules/hr/schema';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('finiquito: años de servicio (art. 163)', () => {
  it('cuenta años completos y suma uno si la fracción supera seis meses', () => {
    expect(severanceYears(day('2020-03-15'), day('2024-09-15'))).toBe(4);
    expect(severanceYears(day('2020-03-15'), day('2024-09-16'))).toBe(5);
    expect(severanceYears(day('2020-03-15'), day('2021-03-15'))).toBe(1);
  });

  it('no indemniza con menos de un año y topa en 11', () => {
    expect(severanceYears(day('2024-01-10'), day('2024-12-31'))).toBe(0);
    expect(severanceYears(day('2005-01-01'), day('2026-06-30'))).toBe(11);
  });

  it('la remuneración para indemnizar tiene tope de 90 UF', () => {
    expect(severanceBase(1_200_000, 39_000)).toBe(1_200_000);
    expect(severanceBase(5_000_000, 39_000)).toBe(3_510_000);
  });
});

describe('finiquito: feriado en días corridos (art. 73)', () => {
  it('suma los fines de semana que caen dentro del período', () => {
    // 25-09-2026 es viernes: 5 hábiles = lunes a viernes siguientes = 7 corridos.
    expect(vacationCalendarDays(5, day('2026-09-25'))).toBe(7);
    // 7,5 hábiles: dos semanas parciales → 11 corridos + 0,5.
    expect(vacationCalendarDays(7.5, day('2026-09-25'))).toBe(11.5);
    expect(vacationCalendarDays(0, day('2026-09-25'))).toBe(0);
    // Término un miércoles: 2 hábiles = jueves y viernes.
    expect(vacationCalendarDays(2, day('2026-09-23'))).toBe(2);
  });
});

describe('finiquito: cálculo completo', () => {
  const base = {
    hireDate: day('2019-02-01'),
    terminationDate: day('2026-09-25'),
    noticeGiven: false,
    monthlySalary: 1_500_000,
    baseSalary: 1_200_000,
    ufValue: 39_000,
    vacationBusinessDays: 5,
    pendingSalary: 0,
    otherEarnings: 0,
    loanBalance: 100_000,
    otherDeductions: 0,
  };

  it('necesidades de la empresa sin aviso: años de servicio + mes de aviso + feriado − préstamos', () => {
    const result = computeSettlement({ ...base, cause: 'ART_161_1' });
    // 7 años y ~8 meses → 8 años.
    expect(result.yearsOfService).toBe(8);
    expect(result.severanceAmount).toBe(8 * 1_500_000);
    expect(result.noticeIndemnity).toBe(1_500_000);
    expect(result.vacationCalendarDays).toBe(7);
    expect(result.vacationAmount).toBe(Math.round((1_200_000 / 30) * 7));
    expect(result.totalAmount).toBe(12_000_000 + 1_500_000 + 280_000 - 100_000);
  });

  it('con aviso previo no se paga la sustitutiva; en una renuncia no hay indemnizaciones', () => {
    expect(computeSettlement({ ...base, cause: 'ART_161_1', noticeGiven: true }).noticeIndemnity).toBe(0);
    const resignation = computeSettlement({ ...base, cause: 'ART_159_2' });
    expect(resignation.severanceAmount).toBe(0);
    expect(resignation.noticeIndemnity).toBe(0);
    expect(resignation.totalAmount).toBe(280_000 - 100_000);
  });

  it('conoce las causales legales', () => {
    expect(terminationCause('ART_161_2')).toMatchObject({ severance: true, notice: true });
    expect(terminationCause('ART_160')).toMatchObject({ severance: false });
    expect(terminationCause('X')).toBeNull();
  });
});

describe('préstamos al trabajador', () => {
  const loan = (overrides: Partial<LoanTerms> = {}): LoanTerms => ({
    principal: 100_000,
    installments: 3,
    installmentAmount: loanInstallmentAmount(100_000, 3),
    startYear: 2026,
    startMonth: 9,
    paidInstallments: 0,
    status: 'ACTIVE',
    ...overrides,
  });

  it('las cuotas suman exacto el capital (la última absorbe el resto)', () => {
    const terms = loan();
    expect(terms.installmentAmount).toBe(33_333);
    expect([1, 2, 3].map((n) => installmentValue(terms, n))).toEqual([33_333, 33_333, 33_334]);
    expect(loanBalance({ ...terms, paidInstallments: 1 })).toBe(66_667);
    expect(loanBalance({ ...terms, paidInstallments: 3 })).toBe(0);
    expect(loanBalance({ ...terms, status: 'CANCELLED' })).toBe(0);
  });

  it('descuenta la siguiente cuota solo desde el mes de inicio', () => {
    expect(loanDeductionFor(loan(), 2026, 8)).toBe(0);
    expect(loanDeductionFor(loan(), 2026, 9)).toBe(33_333);
    expect(loanDeductionFor(loan({ paidInstallments: 2 }), 2026, 11)).toBe(33_334);
    expect(loanDeductionFor(loan({ paidInstallments: 3 }), 2026, 12)).toBe(0);
    expect(loanDeductionFor(loan(), 2027, 1)).toBe(33_333);
  });
});

describe('liquidación con cuota de préstamo', () => {
  const PARAMS: PayrollParameters = {
    ufValue: 39_500,
    utmValue: 69_000,
    minimumWage: 539_000,
    taxableCapUf: 89.9,
    unemploymentCapUf: 135.1,
    sisRateBps: 188,
    mutualRateBps: 93,
    employerPensionRateBps: 100,
    afpCommissionBps: { ...REFERENCE_AFP_COMMISSION_BPS },
  };
  const EMPLOYEE: PayrollEmployeeInput = {
    baseSalary: 1_000_000,
    contractType: 'INDEFINIDO',
    weeklyHours: 44,
    gratificationMode: 'ART_50',
    mealAllowance: 0,
    transportAllowance: 0,
    afp: 'HABITAT',
    healthInsurance: 'FONASA',
    isaprePlanUf: null,
  };
  const FULL_MONTH = { workedDays: 30, overtimeHours: 0, bonuses: 0, advances: 0, otherDeductions: 0 };

  it('la cuota rebaja el líquido pero no la base imponible ni el impuesto', () => {
    const without = computePayslip(EMPLOYEE, FULL_MONTH, PARAMS);
    const withLoan = computePayslip(EMPLOYEE, { ...FULL_MONTH, loanDeduction: 50_000 }, PARAMS);
    expect(withLoan.loanDeduction).toBe(50_000);
    expect(withLoan.taxableIncome).toBe(without.taxableIncome);
    expect(withLoan.incomeTax).toBe(without.incomeTax);
    expect(withLoan.totalDeductions).toBe(without.totalDeductions + 50_000);
    expect(withLoan.netPay).toBe(without.netPay - 50_000);
    expect(without.loanDeduction).toBe(0);
  });
});

describe('resumen de cotizaciones por institución', () => {
  const slip = (overrides: Partial<ContributionPayslip>): ContributionPayslip => ({
    afp: 'HABITAT',
    healthInsurance: 'FONASA',
    isapreName: null,
    contractType: 'INDEFINIDO',
    taxableIncome: 1_000_000,
    pensionAmount: 112_700,
    healthAmount: 70_000,
    unemploymentEmployee: 6_000,
    incomeTax: 10_000,
    employerSis: 18_800,
    employerUnemployment: 24_000,
    employerMutual: 9_300,
    employerPension: 10_000,
    ...overrides,
  });

  it('agrupa como se paga: AFP, salud, AFC, mutual e impuesto', () => {
    const lines = contributionSummary(
      [slip({}), slip({ afp: 'MODELO', healthInsurance: 'ISAPRE', isapreName: 'Colmena', healthAmount: 150_000, incomeTax: 0 }), slip({ contractType: 'PLAZO_FIJO', unemploymentEmployee: 0, employerUnemployment: 30_000 })],
      mutualLabel('ACHS')
    );
    const byName = Object.fromEntries(lines.map((line) => [line.institution, line]));
    expect(byName['AFP Habitat']).toMatchObject({ workers: 2, employee: 225_400, employer: 57_600, total: 283_000 });
    expect(byName['AFP Modelo']).toMatchObject({ workers: 1, employer: 28_800 });
    expect(byName.FONASA).toMatchObject({ workers: 2, employee: 140_000 });
    expect(byName['Isapre Colmena']).toMatchObject({ employee: 150_000 });
    expect(byName['Seguro de cesantía (AFC)']).toMatchObject({ workers: 3, employee: 12_000, employer: 78_000 });
    expect(byName.ACHS).toMatchObject({ employer: 27_900 });
    expect(byName['Impuesto único (SII)']).toMatchObject({ workers: 2, employee: 20_000 });
    expect(lines.map((line) => line.kind)).toEqual(['AFP', 'AFP', 'SALUD', 'SALUD', 'AFC', 'MUTUAL', 'IMPUESTO']);
  });

  it('sin mutual configurada se paga al ISL', () => {
    expect(mutualLabel(null)).toMatch(/ISL/);
  });
});

describe('montos en palabras', () => {
  it('escribe los montos como van en contratos y finiquitos', () => {
    expect(pesosInWords(1_250_000)).toBe('un millón doscientos cincuenta mil pesos');
    expect(pesosInWords(2_000_000)).toBe('dos millones de pesos');
    expect(pesosInWords(21_000)).toBe('veintiún mil pesos');
    expect(pesosInWords(1)).toBe('un peso');
    expect(pesosInWords(539_000)).toBe('quinientos treinta y nueve mil pesos');
    expect(numberToWords(100)).toBe('cien');
    expect(numberToWords(101)).toBe('ciento uno');
    expect(numberToWords(1_000_000_000)).toBe('mil millones');
  });
});

describe('formularios de remuneraciones', () => {
  it('valida préstamos, anticipos, finiquitos y solicitudes del portal', () => {
    expect(employeeLoanSchema.safeParse({ employeeId: 'e', description: 'Préstamo', principal: 300_000, installments: 6, startYear: 2026, startMonth: 10 }).success).toBe(true);
    expect(employeeLoanSchema.safeParse({ employeeId: 'e', description: 'Préstamo', principal: 300_000, installments: 0, startYear: 2026, startMonth: 10 }).success).toBe(false);
    expect(employeeAdvanceSchema.safeParse({ employeeId: 'e', amount: 200_000, paidDate: '2026-09-15', year: 2026, month: 9 }).success).toBe(true);
    expect(settlementSchema.safeParse({ employeeId: 'e', terminationDate: '2026-09-30', cause: 'ART_161_1', noticeGiven: true, monthlySalary: 1, ufValue: 39_000, vacationBusinessDays: 3, pendingSalary: 0, otherEarnings: 0, otherDeductions: 0 }).success).toBe(true);
    expect(settlementSchema.safeParse({ employeeId: 'e', terminationDate: '2026-09-30', cause: 'ART_999', noticeGiven: true, monthlySalary: 1, ufValue: 39_000, vacationBusinessDays: 3, pendingSalary: 0, otherEarnings: 0, otherDeductions: 0 }).success).toBe(false);
    expect(portalLeaveSchema.safeParse({ type: 'VACATION', startDate: '2026-10-05', endDate: '2026-10-09' }).success).toBe(true);
    // Desde el portal no se piden licencias médicas: esas las registra RR.HH.
    expect(portalLeaveSchema.safeParse({ type: 'SICK_LEAVE', startDate: '2026-10-05', endDate: '2026-10-09' }).success).toBe(false);
    expect(portalLeaveSchema.safeParse({ type: 'VACATION', startDate: '2026-10-09', endDate: '2026-10-05' }).success).toBe(false);
  });
});
