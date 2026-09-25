import 'server-only';

import ExcelJS from 'exceljs';
import type { Employee, PayrollPeriod, Payslip, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { santiagoMidnightUtc } from '@/lib/chile/timezone';
import {
  AFP_INSTITUTIONS,
  AFP_LABELS,
  computePayslip,
  suggestedWorkedDays,
  REFERENCE_AFP_COMMISSION_BPS,
  REFERENCE_PAYROLL_PARAMETERS,
  type AfpInstitutionKey,
  type PayrollParameters,
} from '@/lib/chile/payroll';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { contributionSummary, loanDeductionFor, mutualLabel, type ContributionLine } from '@/lib/chile/payroll-deductions';
import { CONTRACT_TYPE_LABELS, periodLabel, type PayrollPeriodInput, type PayslipVariablesInput } from '../schema';

/**
 * Remuneraciones por período. Un período en borrador se puede recalcular
 * cuantas veces haga falta; al cerrarlo las liquidaciones quedan congeladas
 * (el cálculo ya no se repite aunque cambien los parámetros o la ficha).
 */

export type PeriodSummary = PayrollPeriod & { employeeCount: number; totalNetPay: number; totalEmployerCost: number; totalTaxable: number };

export type PayslipWithEmployee = Payslip & {
  employee: Pick<Employee, 'id' | 'fullName' | 'rut' | 'position' | 'contractType' | 'afp' | 'healthInsurance' | 'isapreName'>;
  /** Anticipos tecleados a mano en la planilla (sin los registrados en la ficha). */
  manualAdvances: number;
};

/** Anticipos y cuotas registrados en la ficha que se aplican en una liquidación. */
export interface DeductionDetail {
  advances: { id: string; amount: number }[];
  loans: { id: string; amount: number }[];
}

export function parseDeductionDetail(value: Prisma.JsonValue | null): DeductionDetail {
  const source = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const list = (raw: unknown) =>
    Array.isArray(raw)
      ? raw.flatMap((item) => {
          const entry = item as { id?: unknown; amount?: unknown };
          return typeof entry.id === 'string' && typeof entry.amount === 'number' ? [{ id: entry.id, amount: entry.amount }] : [];
        })
      : [];
  return { advances: list(source.advances), loans: list(source.loans) };
}

const sumAmounts = (items: readonly { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);

/**
 * Anticipos pendientes del mes y cuotas de préstamo vigentes que corresponde
 * descontar a cada trabajador en el período.
 */
async function registeredDeductions(companyId: string, year: number, month: number, employeeIds: readonly string[]): Promise<Map<string, DeductionDetail>> {
  const result = new Map<string, DeductionDetail>();
  if (employeeIds.length === 0) return result;
  const [advances, loans] = await Promise.all([
    prisma.employeeAdvance.findMany({ where: { companyId, year, month, status: 'PENDING', employeeId: { in: [...employeeIds] } }, select: { id: true, employeeId: true, amount: true } }),
    prisma.employeeLoan.findMany({ where: { companyId, status: 'ACTIVE', employeeId: { in: [...employeeIds] } } }),
  ]);
  const entry = (employeeId: string) => {
    const current = result.get(employeeId) ?? { advances: [], loans: [] };
    result.set(employeeId, current);
    return current;
  };
  for (const advance of advances) entry(advance.employeeId).advances.push({ id: advance.id, amount: advance.amount });
  for (const loan of loans) {
    const amount = loanDeductionFor(loan, year, month);
    if (amount > 0) entry(loan.employeeId).loans.push({ id: loan.id, amount });
  }
  return result;
}

export interface PeriodDetail {
  period: PayrollPeriod;
  payslips: PayslipWithEmployee[];
  /** Anticipos y cuotas registrados que se descontarán (período abierto) o se descontaron (cerrado). */
  registered: Record<string, { advances: number; loans: number }>;
  /** Lo que hay que pagar el mes, por institución (AFP, salud, AFC, mutual, impuesto). */
  contributions: ContributionLine[];
  /** Trabajadores vigentes en el mes sin liquidación todavía (para precargar la planilla). */
  pendingEmployees: Array<Pick<Employee, 'id' | 'fullName' | 'rut' | 'position' | 'baseSalary' | 'hireDate' | 'terminationDate'> & { suggestedWorkedDays: number }>;
}

function parseCommissions(value: Prisma.JsonValue): Record<AfpInstitutionKey, number> {
  const source = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(
    AFP_INSTITUTIONS.map((afp) => [afp, typeof source[afp] === 'number' ? (source[afp] as number) : REFERENCE_AFP_COMMISSION_BPS[afp]])
  ) as Record<AfpInstitutionKey, number>;
}

export function periodParameters(period: PayrollPeriod): PayrollParameters {
  return {
    ufValue: period.ufValue,
    utmValue: period.utmValue,
    minimumWage: period.minimumWage,
    taxableCapUf: period.taxableCapUf,
    unemploymentCapUf: period.unemploymentCapUf,
    sisRateBps: period.sisRateBps,
    mutualRateBps: period.mutualRateBps,
    employerPensionRateBps: period.employerPensionRateBps,
    afpCommissionBps: parseCommissions(period.afpCommissionBps),
  };
}

async function findPeriod(companyId: string, id: string): Promise<PayrollPeriod> {
  const period = await prisma.payrollPeriod.findFirst({ where: { id, companyId } });
  if (!period) throw new Error('El período no existe o fue eliminado');
  return period;
}

async function findDraftPeriod(companyId: string, id: string): Promise<PayrollPeriod> {
  const period = await findPeriod(companyId, id);
  if (period.status !== 'DRAFT') throw new Error('El período está cerrado: sus liquidaciones ya no se pueden modificar');
  return period;
}

export async function listPeriods(companyId: string): Promise<PeriodSummary[]> {
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { payslips: { select: { netPay: true, employerCost: true, taxableIncome: true } } },
    take: 36,
  });
  return periods.map(({ payslips, ...period }) => ({
    ...period,
    employeeCount: payslips.length,
    totalNetPay: payslips.reduce((s, p) => s + p.netPay, 0),
    totalEmployerCost: payslips.reduce((s, p) => s + p.employerCost, 0),
    totalTaxable: payslips.reduce((s, p) => s + p.taxableIncome, 0),
  }));
}

/** Parámetros para precargar un período nuevo: los del último período, o los de referencia. */
export async function suggestedParameters(companyId: string): Promise<Omit<PayrollPeriodInput, 'year' | 'month'> & { fromPreviousPeriod: boolean }> {
  const last = await prisma.payrollPeriod.findFirst({ where: { companyId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] });
  if (last) {
    return { ...periodParameters(last), fromPreviousPeriod: true };
  }
  return {
    ufValue: 0,
    utmValue: 0,
    ...REFERENCE_PAYROLL_PARAMETERS,
    afpCommissionBps: { ...REFERENCE_AFP_COMMISSION_BPS },
    fromPreviousPeriod: false,
  };
}

export async function createPeriod(companyId: string, input: PayrollPeriodInput): Promise<PayrollPeriod> {
  try {
    return await prisma.payrollPeriod.create({ data: { companyId, ...input, afpCommissionBps: input.afpCommissionBps } });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error(`Ya existe el período ${periodLabel(input.year, input.month)}`);
    throw error;
  }
}

export async function updatePeriodParameters(companyId: string, id: string, input: PayrollPeriodInput): Promise<void> {
  await findDraftPeriod(companyId, id);
  // Año y mes identifican al período: no se editan, solo los parámetros.
  await prisma.payrollPeriod.updateMany({
    where: { id, companyId },
    data: {
      ufValue: input.ufValue,
      utmValue: input.utmValue,
      minimumWage: input.minimumWage,
      taxableCapUf: input.taxableCapUf,
      unemploymentCapUf: input.unemploymentCapUf,
      sisRateBps: input.sisRateBps,
      mutualRateBps: input.mutualRateBps,
      employerPensionRateBps: input.employerPensionRateBps,
      afpCommissionBps: input.afpCommissionBps,
    },
  });
}

export async function deletePeriod(companyId: string, id: string): Promise<void> {
  await findDraftPeriod(companyId, id);
  await prisma.payrollPeriod.deleteMany({ where: { id, companyId, status: 'DRAFT' } });
}

export async function getPeriodDetail(companyId: string, id: string): Promise<PeriodDetail> {
  const period = await findPeriod(companyId, id);
  const monthStart = santiagoMidnightUtc(period.year, period.month, 1);
  const nextMonth = period.month === 12 ? santiagoMidnightUtc(period.year + 1, 1, 1) : santiagoMidnightUtc(period.year, period.month + 1, 1);

  const [payslips, employees] = await Promise.all([
    prisma.payslip.findMany({
      where: { companyId, periodId: id },
      include: { employee: { select: { id: true, fullName: true, rut: true, position: true, contractType: true, afp: true, healthInsurance: true, isapreName: true } } },
      orderBy: { employee: { fullName: 'asc' } },
    }),
    // Vigentes en el mes: ingresaron antes de que termine y no terminaron antes de que empiece.
    prisma.employee.findMany({
      where: { companyId, hireDate: { lt: nextMonth }, OR: [{ terminationDate: null }, { terminationDate: { gte: monthStart } }] },
      select: { id: true, fullName: true, rut: true, position: true, baseSalary: true, hireDate: true, terminationDate: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);
  const withSlip = new Set(payslips.map((p) => p.employeeId));
  const registered: PeriodDetail['registered'] = {};
  if (period.status === 'DRAFT') {
    const current = await registeredDeductions(companyId, period.year, period.month, employees.map((e) => e.id));
    for (const [employeeId, detail] of current) registered[employeeId] = { advances: sumAmounts(detail.advances), loans: sumAmounts(detail.loans) };
  } else {
    for (const slip of payslips) {
      const detail = parseDeductionDetail(slip.deductionDetail);
      registered[slip.employeeId] = { advances: sumAmounts(detail.advances), loans: sumAmounts(detail.loans) };
    }
  }
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { payrollMutualCode: true } });
  const contributions = contributionSummary(
    payslips.map((slip) => ({ ...slip, afp: slip.employee.afp, healthInsurance: slip.employee.healthInsurance, isapreName: slip.employee.isapreName, contractType: slip.employee.contractType })),
    mutualLabel(settings?.payrollMutualCode)
  );
  return {
    period,
    registered,
    contributions,
    payslips: payslips.map((slip) => ({ ...slip, manualAdvances: Math.max(0, slip.advances - sumAmounts(parseDeductionDetail(slip.deductionDetail).advances)) })),
    pendingEmployees: employees
      .filter((e) => !withSlip.has(e.id))
      .map((e) => ({ ...e, suggestedWorkedDays: suggestedWorkedDays(period.year, period.month, e.hireDate, e.terminationDate) })),
  };
}

/**
 * Calcula (o recalcula) las liquidaciones del período con las variables del
 * mes. Las filas enviadas son el conjunto completo: un trabajador que se
 * quita de la planilla pierde su liquidación en borrador.
 */
export async function calculatePeriod(companyId: string, periodId: string, input: PayslipVariablesInput): Promise<number> {
  const period = await findDraftPeriod(companyId, periodId);
  if (period.ufValue <= 0 || period.utmValue <= 0) throw new Error('Completa el valor de la UF y la UTM del período antes de calcular');
  const params = periodParameters(period);

  const ids = [...new Set(input.rows.map((row) => row.employeeId))];
  const employees = await prisma.employee.findMany({ where: { companyId, id: { in: ids } } });
  if (employees.length !== ids.length) throw new Error('Uno de los trabajadores de la planilla no pertenece a tu empresa');
  const byId = new Map(employees.map((e) => [e.id, e]));
  const registered = await registeredDeductions(companyId, period.year, period.month, ids);

  await prisma.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { companyId, periodId, employeeId: { notIn: ids } } });
    for (const row of input.rows) {
      const employee = byId.get(row.employeeId) as Employee;
      // La planilla trae solo los anticipos tecleados a mano; los registrados en
      // la ficha (anticipos del mes y cuotas de préstamo) se suman acá.
      const detail = registered.get(employee.id) ?? { advances: [], loans: [] };
      const computed = computePayslip(
        {
          baseSalary: employee.baseSalary,
          contractType: employee.contractType,
          weeklyHours: employee.weeklyHours,
          gratificationMode: employee.gratificationMode,
          mealAllowance: employee.mealAllowance,
          transportAllowance: employee.transportAllowance,
          afp: employee.afp,
          healthInsurance: employee.healthInsurance,
          isaprePlanUf: employee.isaprePlanUf,
        },
        { ...row, advances: row.advances + sumAmounts(detail.advances), loanDeduction: sumAmounts(detail.loans) },
        params
      );
      const deductionDetail = { advances: detail.advances, loans: detail.loans };
      await tx.payslip.upsert({
        where: { periodId_employeeId: { periodId, employeeId: employee.id } },
        create: { companyId, periodId, employeeId: employee.id, ...computed, deductionDetail },
        update: { ...computed, deductionDetail },
      });
    }
  });
  return input.rows.length;
}

export interface ClosedPeriodTotals {
  label: string;
  employeeCount: number;
  totalNetPay: number;
  totalEmployerCost: number;
}

export async function closePeriod(companyId: string, periodId: string, userId: string): Promise<ClosedPeriodTotals> {
  const period = await findDraftPeriod(companyId, periodId);
  const payslips = await prisma.payslip.findMany({ where: { companyId, periodId }, select: { employeeId: true, netPay: true, employerCost: true, deductionDetail: true } });
  if (payslips.length === 0) throw new Error('Calcula las liquidaciones antes de cerrar el período');

  // Si después de calcular se registró un anticipo o un préstamo, la
  // liquidación quedó desactualizada: cerrar la congelaría sin ese descuento.
  const current = await registeredDeductions(companyId, period.year, period.month, payslips.map((p) => p.employeeId));
  for (const slip of payslips) {
    const applied = parseDeductionDetail(slip.deductionDetail);
    const now = current.get(slip.employeeId) ?? { advances: [], loans: [] };
    const key = (detail: DeductionDetail) => JSON.stringify([detail.advances.map((a) => `${a.id}:${a.amount}`).sort(), detail.loans.map((l) => `${l.id}:${l.amount}`).sort()]);
    if (key(applied) !== key(now)) throw new Error('Cambiaron los anticipos o préstamos desde el último cálculo: vuelve a calcular antes de cerrar');
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.payrollPeriod.updateMany({
      where: { id: periodId, companyId, status: 'DRAFT' },
      data: { status: 'CLOSED', closedAt: new Date(), closedByUserId: userId },
    });
    if (result.count === 0) throw new Error('El período ya fue cerrado');
    for (const slip of payslips) {
      const applied = parseDeductionDetail(slip.deductionDetail);
      if (applied.advances.length > 0) {
        await tx.employeeAdvance.updateMany({ where: { companyId, id: { in: applied.advances.map((a) => a.id) }, status: 'PENDING' }, data: { status: 'DEDUCTED' } });
      }
      for (const loanEntry of applied.loans) {
        const loan = await tx.employeeLoan.findFirst({ where: { id: loanEntry.id, companyId, status: 'ACTIVE' }, select: { paidInstallments: true, installments: true } });
        if (!loan) continue;
        const paidInstallments = loan.paidInstallments + 1;
        await tx.employeeLoan.updateMany({
          where: { id: loanEntry.id, companyId },
          data: { paidInstallments, status: paidInstallments >= loan.installments ? 'PAID' : 'ACTIVE' },
        });
      }
    }
  });
  return {
    label: periodLabel(period.year, period.month),
    employeeCount: payslips.length,
    totalNetPay: payslips.reduce((s, p) => s + p.netPay, 0),
    totalEmployerCost: payslips.reduce((s, p) => s + p.employerCost, 0),
  };
}

export type PayslipDocument = Payslip & {
  employee: Omit<Employee, 'portalTokenHash'>;
  period: PayrollPeriod;
  company: { businessName: string; rut: string; address: string | null; comuna: string | null; logoUrl: string | null };
};

export async function getPayslipDocument(companyId: string, payslipId: string): Promise<PayslipDocument | null> {
  const payslip = await prisma.payslip.findFirst({
    where: { id: payslipId, companyId },
    include: { employee: { omit: { portalTokenHash: true } }, period: true, company: { select: { businessName: true, rut: true, address: true, comuna: true, logoUrl: true } } },
  });
  return payslip;
}

/** Libro de remuneraciones del período en Excel (resumen por trabajador + totales). */
export async function buildPayrollWorkbook(companyId: string, periodId: string): Promise<{ buffer: Buffer; filename: string }> {
  const detail = await getPeriodDetail(companyId, periodId);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { businessName: true, rut: true } });
  const { period, payslips } = detail;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aether ERP';
  const ws = wb.addWorksheet('Libro de remuneraciones');
  ws.addRow([`${company.businessName} · RUT ${company.rut}`]).font = { bold: true, size: 13 };
  ws.addRow([`Libro de remuneraciones · ${periodLabel(period.year, period.month)} · ${period.status === 'CLOSED' ? 'Cerrado' : 'Borrador'}`]);
  ws.addRow([`UF ${period.ufValue.toLocaleString('es-CL')} · UTM ${period.utmValue.toLocaleString('es-CL')} · Ingreso mínimo ${period.minimumWage.toLocaleString('es-CL')}`]);
  ws.addRow([]);

  const columns: Array<{ header: string; key: keyof Payslip | 'rut' | 'name' | 'position' | 'contract' | 'afp' | 'health'; money?: boolean }> = [
    { header: 'RUT', key: 'rut' },
    { header: 'Nombre', key: 'name' },
    { header: 'Cargo', key: 'position' },
    { header: 'Contrato', key: 'contract' },
    { header: 'AFP', key: 'afp' },
    { header: 'Salud', key: 'health' },
    { header: 'Días trab.', key: 'workedDays' },
    { header: 'Sueldo base', key: 'baseSalary', money: true },
    { header: 'Horas extra', key: 'overtimeAmount', money: true },
    { header: 'Bonos', key: 'bonuses', money: true },
    { header: 'Gratificación', key: 'gratification', money: true },
    { header: 'Total imponible', key: 'taxableIncome', money: true },
    { header: 'Colación', key: 'mealAllowance', money: true },
    { header: 'Movilización', key: 'transportAllowance', money: true },
    { header: 'AFP', key: 'pensionAmount', money: true },
    { header: 'Salud', key: 'healthAmount', money: true },
    { header: 'Cesantía trab.', key: 'unemploymentEmployee', money: true },
    { header: 'Base tributable', key: 'taxBase', money: true },
    { header: 'Impuesto único', key: 'incomeTax', money: true },
    { header: 'Anticipos', key: 'advances', money: true },
    { header: 'Otros desc.', key: 'otherDeductions', money: true },
    { header: 'Cuota préstamo', key: 'loanDeduction', money: true },
    { header: 'Total descuentos', key: 'totalDeductions', money: true },
    { header: 'Líquido a pagar', key: 'netPay', money: true },
    { header: 'SIS', key: 'employerSis', money: true },
    { header: 'Cesantía empl.', key: 'employerUnemployment', money: true },
    { header: 'Mutual', key: 'employerMutual', money: true },
    { header: 'Aporte empleador', key: 'employerPension', money: true },
    { header: 'Costo empresa', key: 'employerCost', money: true },
  ];

  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F0EC' } };
  });

  for (const slip of payslips) {
    ws.addRow(
      columns.map((column) => {
        switch (column.key) {
          case 'rut':
            return slip.employee.rut;
          case 'name':
            return slip.employee.fullName;
          case 'position':
            return slip.employee.position;
          case 'contract':
            return CONTRACT_TYPE_LABELS[slip.employee.contractType];
          case 'afp':
            return AFP_LABELS[slip.employee.afp];
          case 'health':
            return slip.employee.healthInsurance === 'ISAPRE' ? (slip.employee.isapreName ?? 'Isapre') : 'Fonasa';
          default:
            return slip[column.key] as number;
        }
      })
    );
  }

  const totals = ws.addRow(
    columns.map((column, index) => {
      if (index === 0) return 'TOTALES';
      if (!column.money) return null;
      return payslips.reduce((sum, slip) => sum + (slip[column.key as keyof Payslip] as number), 0);
    })
  );
  totals.font = { bold: true };

  columns.forEach((column, index) => {
    const col = ws.getColumn(index + 1);
    col.width = column.key === 'name' ? 32 : column.money ? 15 : 13;
    if (column.money) col.numFmt = '"$"#,##0';
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const rutForFile = company.rut.replace(/\./g, '');
  return { buffer, filename: `Remuneraciones_${rutForFile}_${period.year}-${String(period.month).padStart(2, '0')}.xlsx` };
}

/**
 * Planilla de cotizaciones del período: resumen por institución y detalle por
 * trabajador con las rentas imponibles topadas, para cuadrar o completar la
 * planilla de Previred.
 */
export async function buildContributionsWorkbook(companyId: string, periodId: string): Promise<{ buffer: Buffer; filename: string }> {
  const detail = await getPeriodDetail(companyId, periodId);
  const { period } = detail;
  if (detail.payslips.length === 0) throw new Error('El período aún no tiene liquidaciones calculadas');
  const pensionCap = Math.round(period.taxableCapUf * period.ufValue);
  const unemploymentCap = Math.round(period.unemploymentCapUf * period.ufValue);

  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Resumen');
  summary.addRow([`Cotizaciones ${periodLabel(period.year, period.month)}`]).font = { bold: true, size: 13 };
  summary.addRow([]);
  const summaryHeader = summary.addRow(['Institución', 'Detalle', 'Trabajadores', 'Cargo trabajador', 'Cargo empleador', 'Total a pagar']);
  summaryHeader.font = { bold: true };
  for (const line of detail.contributions) summary.addRow([line.institution, line.detail, line.workers, line.employee, line.employer, line.total]);
  const grand = detail.contributions.filter((line) => line.kind !== 'IMPUESTO').reduce((sum, line) => sum + line.total, 0);
  summary.addRow([]);
  summary.addRow(['Total Previred (sin impuesto único)', '', '', '', '', grand]).font = { bold: true };
  summary.columns = [{ width: 36 }, { width: 52 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }];
  for (const column of [4, 5, 6]) summary.getColumn(column).numFmt = '"$"#,##0';

  const sheet = workbook.addWorksheet('Detalle por trabajador');
  const header = sheet.addRow([
    'RUT',
    'Nombre',
    'Días',
    'AFP',
    'Renta imponible AFP',
    'Cotización AFP',
    'SIS',
    'Aporte empleador pensiones',
    'Salud',
    'Cotización salud',
    'Renta imponible AFC',
    'AFC trabajador',
    'AFC empleador',
    'Mutual / ISL',
    'Impuesto único',
  ]);
  header.font = { bold: true };
  for (const slip of detail.payslips) {
    sheet.addRow([
      slip.employee.rut,
      slip.employee.fullName,
      slip.workedDays,
      AFP_LABELS[slip.employee.afp],
      Math.min(slip.taxableIncome, pensionCap),
      slip.pensionAmount,
      slip.employerSis,
      slip.employerPension,
      slip.employee.healthInsurance === 'ISAPRE' ? (slip.employee.isapreName ?? 'Isapre') : 'Fonasa',
      slip.healthAmount,
      slip.employee.contractType === 'INDEFINIDO' || slip.employerUnemployment > 0 ? Math.min(slip.taxableIncome, unemploymentCap) : 0,
      slip.unemploymentEmployee,
      slip.employerUnemployment,
      slip.employerMutual,
      slip.incomeTax,
    ]);
  }
  sheet.columns.forEach((column, index) => {
    column.width = index === 1 ? 32 : 16;
    if (index >= 4 && index !== 8) column.numFmt = '"$"#,##0';
  });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `cotizaciones-${period.year}-${String(period.month).padStart(2, '0')}.xlsx` };
}
