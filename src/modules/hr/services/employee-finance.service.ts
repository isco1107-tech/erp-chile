import 'server-only';

import type { EmployeeAdvance, EmployeeLoan, EmployeeSettlement, LeaveRequest, Payslip, PayrollPeriod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { accruedVacationDays, gratificationMonthlyCap } from '@/lib/chile/payroll';
import { loanBalance, loanInstallmentAmount } from '@/lib/chile/payroll-deductions';
import { computeSettlement, terminationCause, type SettlementComputation, type TerminationCauseCode } from '@/lib/chile/settlement';
import type { EmployeeRecord } from './employees.service';

/**
 * Ficha extendida del trabajador: préstamos, anticipos, finiquitos, feriado y
 * liquidaciones. Todo acotado por `companyId`.
 */

export type LoanRow = EmployeeLoan & { balance: number };

export interface EmployeeProfile {
  employee: EmployeeRecord;
  hasPortal: boolean;
  loans: LoanRow[];
  advances: EmployeeAdvance[];
  settlements: EmployeeSettlement[];
  vacation: { accrued: number; taken: number; pending: number; available: number };
  leaves: LeaveRequest[];
  payslips: Array<Pick<Payslip, 'id' | 'netPay' | 'taxableIncome' | 'incomeTax' | 'totalDeductions'> & { period: Pick<PayrollPeriod, 'id' | 'year' | 'month' | 'status'> }>;
}

export async function getEmployeeProfile(companyId: string, id: string): Promise<EmployeeProfile | null> {
  const employee = await prisma.employee.findFirst({ where: { id, companyId } });
  if (!employee) return null;
  const [loans, advances, settlements, leaves, payslips] = await Promise.all([
    prisma.employeeLoan.findMany({ where: { companyId, employeeId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.employeeAdvance.findMany({ where: { companyId, employeeId: id }, orderBy: { paidDate: 'desc' }, take: 60 }),
    prisma.employeeSettlement.findMany({ where: { companyId, employeeId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.leaveRequest.findMany({ where: { companyId, employeeId: id }, orderBy: { startDate: 'desc' }, take: 50 }),
    prisma.payslip.findMany({
      where: { companyId, employeeId: id },
      select: { id: true, netPay: true, taxableIncome: true, incomeTax: true, totalDeductions: true, period: { select: { id: true, year: true, month: true, status: true } } },
      orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
      take: 36,
    }),
  ]);
  const taken = leaves.filter((leave) => leave.type === 'VACATION' && leave.status === 'APPROVED').reduce((sum, leave) => sum + leave.businessDays, 0);
  const pending = leaves.filter((leave) => leave.type === 'VACATION' && leave.status === 'PENDING').reduce((sum, leave) => sum + leave.businessDays, 0);
  const accrued = accruedVacationDays(employee.hireDate, new Date(), employee.terminationDate);
  const { portalTokenHash, ...record } = employee;
  return {
    employee: record,
    hasPortal: !!portalTokenHash,
    loans: loans.map((loan) => ({ ...loan, balance: loanBalance(loan) })),
    advances,
    settlements,
    vacation: { accrued, taken, pending, available: accrued - taken },
    leaves,
    payslips,
  };
}

async function assertEmployee(companyId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new Error('El trabajador no existe o fue eliminado');
  return employee;
}

async function assertPeriodOpen(companyId: string, year: number, month: number): Promise<void> {
  const period = await prisma.payrollPeriod.findFirst({ where: { companyId, year, month }, select: { status: true } });
  if (period?.status === 'CLOSED') throw new Error(`Las remuneraciones de ${String(month).padStart(2, '0')}/${year} ya están cerradas: descuéntalo en el mes siguiente`);
}

export async function createLoan(
  companyId: string,
  userId: string,
  input: { employeeId: string; description: string; principal: number; installments: number; startYear: number; startMonth: number }
): Promise<EmployeeLoan> {
  const employee = await assertEmployee(companyId, input.employeeId);
  if (employee.status !== 'ACTIVE') throw new Error('Solo se otorgan préstamos a trabajadores vigentes');
  await assertPeriodOpen(companyId, input.startYear, input.startMonth);
  return prisma.employeeLoan.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      description: input.description,
      principal: input.principal,
      installments: input.installments,
      installmentAmount: loanInstallmentAmount(input.principal, input.installments),
      startYear: input.startYear,
      startMonth: input.startMonth,
      createdById: userId,
    },
  });
}

/** Anula un préstamo sin cuotas descontadas, o da por pagado el saldo si ya tiene alguna. */
export async function closeLoan(companyId: string, id: string): Promise<'CANCELLED' | 'PAID'> {
  const loan = await prisma.employeeLoan.findFirst({ where: { id, companyId, status: 'ACTIVE' } });
  if (!loan) throw new Error('El préstamo no existe o ya está cerrado');
  const status = loan.paidInstallments === 0 ? 'CANCELLED' : 'PAID';
  await prisma.employeeLoan.updateMany({ where: { id, companyId, status: 'ACTIVE' }, data: { status } });
  return status;
}

export async function createAdvance(
  companyId: string,
  userId: string,
  input: { employeeId: string; amount: number; paidDate: string; year: number; month: number; notes?: string }
): Promise<EmployeeAdvance> {
  const employee = await assertEmployee(companyId, input.employeeId);
  if (employee.status !== 'ACTIVE') throw new Error('Solo se registran anticipos de trabajadores vigentes');
  await assertPeriodOpen(companyId, input.year, input.month);
  if (input.amount > employee.baseSalary) throw new Error('El anticipo no puede superar el sueldo base del trabajador');
  return prisma.employeeAdvance.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      amount: input.amount,
      paidDate: new Date(`${input.paidDate}T12:00:00Z`),
      year: input.year,
      month: input.month,
      notes: input.notes || null,
      createdById: userId,
    },
  });
}

export async function cancelAdvance(companyId: string, id: string): Promise<void> {
  const result = await prisma.employeeAdvance.updateMany({ where: { id, companyId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (result.count === 0) throw new Error('Solo se anula un anticipo que aún no se descuenta');
}

// ─── Finiquito ───────────────────────────────────────────────────────────────

export interface SettlementDraftInput {
  employeeId: string;
  terminationDate: string;
  cause: TerminationCauseCode;
  noticeGiven: boolean;
  monthlySalary: number;
  ufValue: number;
  vacationBusinessDays: number;
  pendingSalary: number;
  otherEarnings: number;
  otherDeductions: number;
  notes?: string;
}

export interface SettlementSuggestion {
  monthlySalary: number;
  vacationBusinessDays: number;
  loanBalance: number;
  ufValue: number;
}

/**
 * Valores para precargar el finiquito: última remuneración mensual (sueldo +
 * gratificación mensual con tope + colación + movilización), feriado
 * pendiente, saldo de préstamos y la UF del último período de remuneraciones.
 */
export async function suggestSettlement(companyId: string, employeeId: string, terminationDate: Date): Promise<SettlementSuggestion> {
  const employee = await assertEmployee(companyId, employeeId);
  const [lastPeriod, vacations, loans] = await Promise.all([
    prisma.payrollPeriod.findFirst({ where: { companyId }, orderBy: [{ year: 'desc' }, { month: 'desc' }], select: { ufValue: true, minimumWage: true } }),
    prisma.leaveRequest.aggregate({ where: { companyId, employeeId, type: 'VACATION', status: 'APPROVED' }, _sum: { businessDays: true } }),
    prisma.employeeLoan.findMany({ where: { companyId, employeeId, status: 'ACTIVE' } }),
  ]);
  const gratification =
    employee.gratificationMode === 'ART_50' && lastPeriod ? Math.min(Math.round(employee.baseSalary * 0.25), gratificationMonthlyCap(lastPeriod.minimumWage)) : 0;
  const accrued = accruedVacationDays(employee.hireDate, terminationDate);
  return {
    monthlySalary: employee.baseSalary + gratification + employee.mealAllowance + employee.transportAllowance,
    vacationBusinessDays: Math.max(0, Math.round((accrued - (vacations._sum.businessDays ?? 0)) * 100) / 100),
    loanBalance: loans.reduce((sum, loan) => sum + loanBalance(loan), 0),
    ufValue: lastPeriod?.ufValue ?? 0,
  };
}

export async function previewSettlement(companyId: string, input: SettlementDraftInput): Promise<SettlementComputation> {
  const employee = await assertEmployee(companyId, input.employeeId);
  const suggestion = await suggestSettlement(companyId, input.employeeId, new Date(`${input.terminationDate}T12:00:00Z`));
  return computeSettlement({
    hireDate: employee.hireDate,
    terminationDate: new Date(`${input.terminationDate}T12:00:00Z`),
    cause: input.cause,
    noticeGiven: input.noticeGiven,
    monthlySalary: input.monthlySalary,
    baseSalary: employee.baseSalary,
    ufValue: input.ufValue,
    vacationBusinessDays: input.vacationBusinessDays,
    pendingSalary: input.pendingSalary,
    otherEarnings: input.otherEarnings,
    loanBalance: suggestion.loanBalance,
    otherDeductions: input.otherDeductions,
  });
}

export async function saveSettlement(companyId: string, userId: string, input: SettlementDraftInput): Promise<EmployeeSettlement> {
  const employee = await assertEmployee(companyId, input.employeeId);
  const terminationDate = new Date(`${input.terminationDate}T12:00:00Z`);
  if (terminationDate < employee.hireDate) throw new Error('La fecha de término no puede ser anterior a la de ingreso');
  if (!terminationCause(input.cause)) throw new Error('Causal de término no válida');
  const computed = await previewSettlement(companyId, input);
  return prisma.employeeSettlement.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      terminationDate,
      cause: input.cause,
      noticeGiven: input.noticeGiven,
      monthlySalary: input.monthlySalary,
      yearsOfService: computed.yearsOfService,
      severanceAmount: computed.severanceAmount,
      noticeIndemnity: computed.noticeIndemnity,
      vacationBusinessDays: computed.vacationBusinessDays,
      vacationCalendarDays: computed.vacationCalendarDays,
      vacationAmount: computed.vacationAmount,
      pendingSalary: computed.pendingSalary,
      otherEarnings: computed.otherEarnings,
      loanBalance: computed.loanBalance,
      otherDeductions: computed.otherDeductions,
      totalAmount: computed.totalAmount,
      notes: input.notes || null,
      createdById: userId,
    },
  });
}

/**
 * Deja el finiquito como definitivo: registra el término del trabajador y da
 * por pagados sus préstamos (el saldo se descontó en el finiquito).
 */
export async function finalizeSettlement(companyId: string, id: string): Promise<EmployeeSettlement> {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.employeeSettlement.findFirst({ where: { id, companyId } });
    if (!settlement) throw new Error('Finiquito no encontrado');
    if (settlement.status !== 'DRAFT') throw new Error('Este finiquito ya no está en borrador');
    const others = await tx.employeeSettlement.count({ where: { companyId, employeeId: settlement.employeeId, status: 'FINAL' } });
    if (others > 0) throw new Error('El trabajador ya tiene un finiquito definitivo');
    await tx.employeeSettlement.updateMany({ where: { id, companyId }, data: { status: 'FINAL', finalizedAt: new Date() } });
    await tx.employee.updateMany({ where: { id: settlement.employeeId, companyId }, data: { status: 'TERMINATED', terminationDate: settlement.terminationDate } });
    if (settlement.loanBalance > 0) {
      await tx.employeeLoan.updateMany({ where: { companyId, employeeId: settlement.employeeId, status: 'ACTIVE' }, data: { status: 'PAID' } });
    }
    await tx.employeeAdvance.updateMany({ where: { companyId, employeeId: settlement.employeeId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    return tx.employeeSettlement.findFirstOrThrow({ where: { id, companyId } });
  });
}

export async function cancelSettlement(companyId: string, id: string): Promise<void> {
  const result = await prisma.employeeSettlement.updateMany({ where: { id, companyId, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
  if (result.count === 0) throw new Error('Solo se anula un finiquito en borrador');
}

export type SettlementDocument = EmployeeSettlement & {
  employee: EmployeeRecord;
  company: { businessName: string; rut: string; address: string | null; comuna: string | null; logoUrl: string | null };
};

export async function getSettlementDocument(companyId: string, id: string): Promise<SettlementDocument | null> {
  const settlement = await prisma.employeeSettlement.findFirst({
    where: { id, companyId },
    include: {
      employee: { omit: { portalTokenHash: true } },
      company: { select: { businessName: true, rut: true, address: true, comuna: true, logoUrl: true } },
    },
  });
  return settlement;
}

export interface EmployeeDocumentData {
  employee: EmployeeRecord;
  company: { businessName: string; rut: string; address: string | null; comuna: string | null; ciudad: string | null; giro: string | null; logoUrl: string | null };
  /** Liquidaciones cerradas del año pedido (certificado de remuneraciones). */
  payslips: Array<Pick<Payslip, 'taxableIncome' | 'pensionAmount' | 'healthAmount' | 'unemploymentEmployee' | 'taxBase' | 'incomeTax' | 'netPay'> & { month: number }>;
}

export async function getEmployeeDocumentData(companyId: string, employeeId: string, year: number): Promise<EmployeeDocumentData | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    omit: { portalTokenHash: true },
    include: { company: { select: { businessName: true, rut: true, address: true, comuna: true, ciudad: true, giro: true, logoUrl: true } } },
  });
  if (!employee) return null;
  const payslips = await prisma.payslip.findMany({
    where: { companyId, employeeId, period: { year, status: 'CLOSED' } },
    select: { taxableIncome: true, pensionAmount: true, healthAmount: true, unemploymentEmployee: true, taxBase: true, incomeTax: true, netPay: true, period: { select: { month: true } } },
  });
  const { company, ...record } = employee;
  return {
    employee: record,
    company,
    payslips: payslips.map(({ period, ...slip }) => ({ ...slip, month: period.month })).sort((a, b) => a.month - b.month),
  };
}
