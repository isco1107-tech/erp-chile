import {
  buildExpenseReportLines,
  buildFeeDocumentLines,
  buildPayrollLines,
  payrollEntryDate,
  sumPayroll,
  type KeyedLine,
} from '@/modules/accounting/posting-rules/people-posting';
import { payrollPaymentAmount } from '@/modules/hr/services/payroll.service';
import { calculateFeeAmounts } from '@/lib/services/fees';
import { computePayslip, REFERENCE_AFP_COMMISSION_BPS, type PayrollParameters } from '@/lib/chile/payroll';
import { movementOriginOf } from '@/modules/treasury/labels';
import { CHART_OF_ACCOUNTS } from '@/modules/accounting/chart-of-accounts';
import { MAPPING_DEFINITIONS, mappingDefinition } from '@/modules/accounting/mapping-definitions';

/**
 * Integración contable de los módulos de personas y de cobros sin documento:
 * remuneraciones, honorarios y rendiciones generan asiento, y Tesorería sabe
 * de qué módulo viene cada movimiento. Lo que se prueba acá es lo que NO
 * puede fallar en silencio: que cada asiento cuadre, en pesos enteros, con
 * los mismos números que la liquidación o la boleta.
 */

function totals(lines: KeyedLine[]) {
  return {
    debit: lines.reduce((sum, line) => sum + line.debit, 0),
    credit: lines.reduce((sum, line) => sum + line.credit, 0),
  };
}

function byKey(lines: KeyedLine[], key: string): KeyedLine | undefined {
  return lines.find((line) => line.key === key);
}

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

function payslip(baseSalary: number, variables: Partial<{ bonuses: number; advances: number; otherDeductions: number; mealAllowance: number }> = {}) {
  return computePayslip(
    {
      baseSalary,
      contractType: 'INDEFINIDO',
      weeklyHours: 44,
      gratificationMode: 'ART_50',
      mealAllowance: variables.mealAllowance ?? 0,
      transportAllowance: 0,
      afp: 'HABITAT',
      healthInsurance: 'FONASA',
      isaprePlanUf: null,
    },
    { workedDays: 30, overtimeHours: 0, bonuses: variables.bonuses ?? 0, advances: variables.advances ?? 0, otherDeductions: variables.otherDeductions ?? 0 },
    PARAMS
  );
}

describe('centralización de remuneraciones', () => {
  it('cuadra debe y haber con liquidaciones reales del motor de sueldos', () => {
    const slips = [payslip(600_000), payslip(1_800_000, { bonuses: 150_000, mealAllowance: 60_000 }), payslip(3_500_000, { advances: 200_000, otherDeductions: 35_000 })];
    const lines = buildPayrollLines(sumPayroll(slips), 'marzo 2026');
    const { debit, credit } = totals(lines);
    expect(debit).toBe(credit);
    for (const line of lines) {
      expect(Number.isInteger(line.debit)).toBe(true);
      expect(Number.isInteger(line.credit)).toBe(true);
    }
  });

  it('el líquido por pagar es exactamente la suma de los líquidos de las liquidaciones', () => {
    const slips = [payslip(900_000), payslip(1_200_000, { advances: 100_000 })];
    const lines = buildPayrollLines(sumPayroll(slips), 'abril 2026');
    expect(byKey(lines, 'REMUNERACIONES_POR_PAGAR')?.credit).toBe(slips.reduce((sum, s) => sum + s.netPay, 0));
    expect(byKey(lines, 'ANTICIPOS_PERSONAL')?.credit).toBe(100_000);
    expect(byKey(lines, 'IMPUESTO_UNICO_POR_PAGAR')?.credit ?? 0).toBe(slips.reduce((sum, s) => sum + s.incomeTax, 0));
  });

  it('las cotizaciones por pagar incluyen trabajador y empleador (lo que se paga en Previred)', () => {
    const slips = [payslip(1_000_000)];
    const lines = buildPayrollLines(sumPayroll(slips), 'mayo 2026');
    const slip = slips[0];
    const expected = slip.pensionAmount + slip.healthAmount + slip.unemploymentEmployee + slip.employerSis + slip.employerUnemployment + slip.employerMutual + slip.employerPension;
    expect(byKey(lines, 'COTIZACIONES_POR_PAGAR')?.credit).toBe(expected);
    expect(payrollPaymentAmount(slips, 'CONTRIBUTIONS')).toBe(expected);
    expect(payrollPaymentAmount(slips, 'SALARIES')).toBe(slip.netPay);
  });

  it('omite las líneas en cero (sin anticipos ni otros descuentos)', () => {
    const lines = buildPayrollLines(sumPayroll([payslip(700_000)]), 'junio 2026');
    expect(byKey(lines, 'ANTICIPOS_PERSONAL')).toBeUndefined();
    expect(byKey(lines, 'DESCUENTOS_PERSONAL')).toBeUndefined();
    expect(lines.every((line) => line.debit > 0 || line.credit > 0)).toBe(true);
  });

  it('se fecha el último día del mes para caer en el período contable correcto', () => {
    const date = payrollEntryDate(2026, 2);
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(1);
    expect(date.getUTCDate()).toBe(28);
  });
});

describe('boleta de honorarios', () => {
  it('bruto = retención + líquido, con la tasa vigente', () => {
    const gross = 850_000;
    const { retentionAmount, netToPay } = calculateFeeAmounts(gross, 1525);
    const lines = buildFeeDocumentLines({ grossAmount: gross, retentionAmount, netToPay, folio: '123' });
    const { debit, credit } = totals(lines);
    expect(debit).toBe(gross);
    expect(credit).toBe(gross);
    expect(byKey(lines, 'RETENCION_HONORARIOS')?.credit).toBe(retentionAmount);
    expect(byKey(lines, 'HONORARIOS_POR_PAGAR')?.credit).toBe(netToPay);
  });

  it('rechaza una boleta que no cuadra en vez de contabilizar un asiento inventado', () => {
    expect(() => buildFeeDocumentLines({ grossAmount: 100_000, retentionAmount: 15_250, netToPay: 80_000, folio: '9' })).toThrow(/no cuadra/);
  });
});

describe('rendición de gastos', () => {
  it('reconoce el gasto contra la deuda con quien rindió', () => {
    const lines = buildExpenseReportLines({ totalAmount: 48_990, title: 'Viaje a Rancagua' });
    expect(lines).toEqual([
      expect.objectContaining({ key: 'GASTOS_RENDIDOS', debit: 48_990, credit: 0 }),
      expect.objectContaining({ key: 'RENDICIONES_POR_PAGAR', debit: 0, credit: 48_990 }),
    ]);
  });

  it('no contabiliza montos negativos', () => {
    expect(() => buildExpenseReportLines({ totalAmount: -1, title: 'x' })).toThrow(/negativo/);
  });
});

describe('cuentas del sistema', () => {
  it('toda clave del plan base tiene definición en la pantalla, y admite el tipo de la cuenta sugerida', () => {
    for (const seed of CHART_OF_ACCOUNTS.filter((account) => account.mappingKey)) {
      const definition = mappingDefinition(seed.mappingKey as string);
      expect(definition).toBeDefined();
      expect(definition?.allowedTypes).toContain(seed.type);
    }
  });

  it('toda clave de la pantalla existe en el plan base (así se puede crear sola al primer uso)', () => {
    const seeded = new Set(CHART_OF_ACCOUNTS.map((account) => account.mappingKey).filter(Boolean));
    for (const definition of MAPPING_DEFINITIONS) {
      expect(seeded.has(definition.key)).toBe(true);
    }
  });
});

describe('origen de los movimientos de Tesorería', () => {
  it('distingue ventas, compras y los módulos nuevos', () => {
    expect(movementOriginOf({ source: null, salesDocumentId: 's1', purchaseDocumentId: null })).toBe('SALES');
    expect(movementOriginOf({ source: null, salesDocumentId: null, purchaseDocumentId: 'p1' })).toBe('PURCHASES');
    expect(movementOriginOf({ source: 'PAYROLL_SALARIES', salesDocumentId: null, purchaseDocumentId: null })).toBe('PAYROLL_SALARIES');
    expect(movementOriginOf({ source: null, salesDocumentId: null, purchaseDocumentId: null })).toBe('OTHER');
  });
});
