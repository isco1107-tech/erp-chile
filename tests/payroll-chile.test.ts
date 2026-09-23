import {
  accruedVacationDays,
  businessDaysBetween,
  computePayslip,
  gratificationMonthlyCap,
  hourlyValue,
  incomeTax,
  INCOME_TAX_BRACKETS,
  REFERENCE_AFP_COMMISSION_BPS,
  suggestedWorkedDays,
  type PayrollEmployeeInput,
  type PayrollParameters,
} from '@/lib/chile/payroll';

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

describe('impuesto único de segunda categoría', () => {
  it('bajo 13,5 UTM está exento', () => {
    expect(incomeTax(13.5 * 69_000, 69_000)).toBe(0);
    expect(incomeTax(500_000, 69_000)).toBe(0);
  });

  it('aplica tasa y rebaja del tramo', () => {
    // 1.500.000 / 69.000 = 21,7 UTM → 4% con rebaja 0,54 UTM.
    expect(incomeTax(1_500_000, 69_000)).toBe(Math.round(1_500_000 * 0.04 - 0.54 * 69_000));
  });

  it('los tramos son continuos: no hay saltos en los bordes', () => {
    const utm = 69_000;
    for (let i = 0; i < INCOME_TAX_BRACKETS.length - 1; i += 1) {
      const edge = INCOME_TAX_BRACKETS[i].upToUtm * utm;
      const next = INCOME_TAX_BRACKETS[i + 1];
      const fromNextBracket = Math.round(edge * next.rate - next.rebateUtm * utm);
      expect(Math.abs(incomeTax(edge, utm) - fromNextBracket)).toBeLessThanOrEqual(1);
    }
  });

  it('nunca es negativo', () => {
    expect(incomeTax(-10, 69_000)).toBe(0);
  });
});

describe('liquidación de sueldo', () => {
  it('calcula un contrato indefinido con Fonasa y gratificación con tope', () => {
    const slip = computePayslip(EMPLOYEE, FULL_MONTH, PARAMS);
    expect(slip.gratification).toBe(gratificationMonthlyCap(539_000));
    expect(slip.gratification).toBe(213_354);
    expect(slip.taxableIncome).toBe(1_213_354);
    expect(slip.pensionAmount).toBe(136_745);
    expect(slip.healthAmount).toBe(84_935);
    expect(slip.unemploymentEmployee).toBe(7_280);
    expect(slip.taxBase).toBe(984_394);
    expect(slip.incomeTax).toBe(2_116);
    expect(slip.netPay).toBe(982_278);
  });

  it('cuadra: líquido = haberes − descuentos', () => {
    const slip = computePayslip(
      { ...EMPLOYEE, mealAllowance: 60_000, transportAllowance: 40_000 },
      { workedDays: 30, overtimeHours: 5, bonuses: 100_000, advances: 50_000, otherDeductions: 10_000 },
      PARAMS
    );
    const haberes = slip.taxableIncome + slip.mealAllowance + slip.transportAllowance;
    expect(slip.netPay).toBe(haberes - slip.totalDeductions);
    expect(slip.totalDeductions).toBe(slip.pensionAmount + slip.healthAmount + slip.unemploymentEmployee + slip.incomeTax + 50_000 + 10_000);
  });

  it('el costo empresa suma los aportes del empleador', () => {
    const slip = computePayslip(EMPLOYEE, FULL_MONTH, PARAMS);
    expect(slip.employerCost).toBe(slip.taxableIncome + slip.employerSis + slip.employerUnemployment + slip.employerMutual + slip.employerPension);
    expect(slip.employerUnemployment).toBe(Math.round(slip.taxableIncome * 0.024));
  });

  it('plazo fijo: el trabajador no cotiza cesantía y el empleador paga 3%', () => {
    const slip = computePayslip({ ...EMPLOYEE, contractType: 'PLAZO_FIJO' }, FULL_MONTH, PARAMS);
    expect(slip.unemploymentEmployee).toBe(0);
    expect(slip.employerUnemployment).toBe(Math.round(slip.taxableIncome * 0.03));
  });

  it('Isapre cobra el plan si supera el 7%, pero solo el 7% rebaja impuesto', () => {
    const slip = computePayslip({ ...EMPLOYEE, healthInsurance: 'ISAPRE', isaprePlanUf: 4 }, FULL_MONTH, PARAMS);
    expect(slip.healthAmount).toBe(158_000);
    expect(slip.taxBase).toBe(slip.taxableIncome - slip.pensionAmount - 84_935 - slip.unemploymentEmployee);
  });

  it('proporcional a días trabajados', () => {
    const slip = computePayslip({ ...EMPLOYEE, gratificationMode: 'NONE', mealAllowance: 30_000 }, { ...FULL_MONTH, workedDays: 15 }, PARAMS);
    expect(slip.baseSalary).toBe(500_000);
    expect(slip.mealAllowance).toBe(15_000);
  });

  it('las cotizaciones respetan el tope imponible en UF', () => {
    const slip = computePayslip({ ...EMPLOYEE, baseSalary: 10_000_000, gratificationMode: 'NONE' }, FULL_MONTH, PARAMS);
    const cap = Math.round(89.9 * 39_500);
    expect(slip.pensionAmount).toBe(Math.round((cap * 1127) / 10_000));
    expect(slip.healthAmount).toBe(Math.round(cap * 0.07));
  });

  it('horas extra con recargo del 50% según la fórmula de la DT', () => {
    expect(hourlyValue(1_000_000, 44)).toBeCloseTo(5303.03, 1);
    const slip = computePayslip({ ...EMPLOYEE, gratificationMode: 'NONE' }, { ...FULL_MONTH, overtimeHours: 10 }, PARAMS);
    expect(slip.overtimeAmount).toBe(Math.round(hourlyValue(1_000_000, 44) * 1.5 * 10));
  });

  it('acota días trabajados entre 0 y 30', () => {
    expect(computePayslip(EMPLOYEE, { ...FULL_MONTH, workedDays: 45 }, PARAMS).workedDays).toBe(30);
    expect(computePayslip(EMPLOYEE, { ...FULL_MONTH, workedDays: -3 }, PARAMS).baseSalary).toBe(0);
  });
});

describe('vacaciones', () => {
  it('cuenta días hábiles sin fines de semana', () => {
    expect(businessDaysBetween(new Date('2026-09-21'), new Date('2026-09-25'))).toBe(5);
    expect(businessDaysBetween(new Date('2026-09-25'), new Date('2026-09-28'))).toBe(2);
    expect(businessDaysBetween(new Date('2026-09-28'), new Date('2026-09-25'))).toBe(0);
  });

  it('devenga 15 días hábiles por año trabajado', () => {
    expect(accruedVacationDays(new Date('2025-01-15'), new Date('2026-01-15'))).toBe(15);
    expect(accruedVacationDays(new Date('2025-01-15'), new Date('2025-07-14'))).toBe(6.25);
  });

  it('deja de devengar al término del contrato', () => {
    expect(accruedVacationDays(new Date('2024-01-01'), new Date('2026-09-01'), new Date('2025-01-01'))).toBe(15);
  });
});

describe('días trabajados sugeridos', () => {
  it('mes completo para quien estuvo todo el mes', () => {
    expect(suggestedWorkedDays(2026, 9, new Date('2024-03-01'), null)).toBe(30);
  });

  it('proporcional para un ingreso a mitad de mes', () => {
    expect(suggestedWorkedDays(2026, 9, new Date('2026-09-16'), null)).toBe(15);
  });

  it('proporcional para un término a mitad de mes', () => {
    expect(suggestedWorkedDays(2026, 9, new Date('2020-01-01'), new Date('2026-09-10'))).toBe(10);
  });
});
