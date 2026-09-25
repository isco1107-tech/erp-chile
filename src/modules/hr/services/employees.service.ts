import 'server-only';

import type { Employee } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import type { EmployeeInput } from '../schema';

/**
 * Ficha de trabajadores. Todo acotado por `companyId`; las escrituras usan
 * `updateMany`/`deleteMany` con el filtro de empresa (CLAUDE.md §2.3).
 */

/** Ficha tal como viaja al navegador: sin el hash del token del portal. */
export type EmployeeRecord = Omit<Employee, 'portalTokenHash'>;
export type EmployeeRow = EmployeeRecord & { _count: { payslips: number } };

function toData(input: EmployeeInput) {
  const rutClean = cleanRut(input.rut);
  return {
    rut: formatRut(rutClean),
    rutClean,
    fullName: input.fullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    birthDate: input.birthDate ?? null,
    address: input.address ?? null,
    position: input.position,
    department: input.department ?? null,
    hireDate: input.hireDate,
    contractType: input.contractType,
    weeklyHours: input.weeklyHours,
    baseSalary: input.baseSalary,
    gratificationMode: input.gratificationMode,
    mealAllowance: input.mealAllowance,
    transportAllowance: input.transportAllowance,
    afp: input.afp,
    healthInsurance: input.healthInsurance,
    isapreName: input.healthInsurance === 'ISAPRE' ? (input.isapreName ?? null) : null,
    isaprePlanUf: input.healthInsurance === 'ISAPRE' ? (input.isaprePlanUf ?? null) : null,
    bankName: input.bankName ?? null,
    bankAccountType: input.bankAccountType ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    nationality: input.nationality ?? null,
    notes: input.notes ?? null,
  };
}

function duplicateRut(error: unknown): never {
  if (isUniqueConstraintError(error)) throw new Error('Ya existe un trabajador con ese RUT en tu empresa');
  throw error;
}

export async function listEmployees(companyId: string): Promise<EmployeeRow[]> {
  return prisma.employee.findMany({
    where: { companyId },
    omit: { portalTokenHash: true },
    include: { _count: { select: { payslips: true } } },
    orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
  });
}

export async function createEmployee(companyId: string, input: EmployeeInput): Promise<Employee> {
  try {
    return await prisma.employee.create({ data: { companyId, ...toData(input) } });
  } catch (error) {
    duplicateRut(error);
  }
}

export async function updateEmployee(companyId: string, id: string, input: EmployeeInput): Promise<Employee> {
  try {
    const result = await prisma.employee.updateMany({ where: { id, companyId }, data: toData(input) });
    if (result.count === 0) throw new Error('El trabajador no existe o fue eliminado');
  } catch (error) {
    duplicateRut(error);
  }
  return prisma.employee.findFirstOrThrow({ where: { id, companyId } });
}

export async function terminateEmployee(companyId: string, id: string, terminationDate: Date): Promise<void> {
  const employee = await prisma.employee.findFirst({ where: { id, companyId }, select: { hireDate: true } });
  if (!employee) throw new Error('El trabajador no existe o fue eliminado');
  if (terminationDate < employee.hireDate) throw new Error('La fecha de término no puede ser anterior a la de ingreso');
  await prisma.employee.updateMany({ where: { id, companyId }, data: { status: 'TERMINATED', terminationDate } });
}

export async function reactivateEmployee(companyId: string, id: string): Promise<void> {
  const result = await prisma.employee.updateMany({ where: { id, companyId }, data: { status: 'ACTIVE', terminationDate: null } });
  if (result.count === 0) throw new Error('El trabajador no existe o fue eliminado');
}

/**
 * Borrar solo es posible sin liquidaciones: el historial de remuneraciones es
 * un registro laboral que se debe conservar. Para quien dejó la empresa,
 * existe "registrar término".
 */
export async function deleteEmployee(companyId: string, id: string): Promise<void> {
  const payslips = await prisma.payslip.count({ where: { companyId, employeeId: id } });
  if (payslips > 0) throw new Error('Este trabajador tiene liquidaciones registradas: registra su término en vez de eliminarlo');
  const result = await prisma.employee.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('El trabajador no existe o fue eliminado');
}

export interface HrSummary {
  activeCount: number;
  monthlyBasePayroll: number;
  averageTenureMonths: number | null;
  lastPeriod: { label: string; netPay: number; employerCost: number } | null;
  pendingLeaveRequests: number;
}

export async function getHrSummary(companyId: string): Promise<HrSummary> {
  const now = Date.now();
  const [active, lastPeriod, pendingLeaveRequests] = await Promise.all([
    prisma.employee.findMany({ where: { companyId, status: 'ACTIVE' }, select: { baseSalary: true, hireDate: true } }),
    prisma.payrollPeriod.findFirst({
      where: { companyId, payslips: { some: {} } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true, payslips: { select: { netPay: true, employerCost: true } } },
    }),
    prisma.leaveRequest.count({ where: { companyId, status: 'PENDING' } }),
  ]);
  const tenures = active.map((e) => (now - e.hireDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  return {
    activeCount: active.length,
    monthlyBasePayroll: active.reduce((sum, e) => sum + e.baseSalary, 0),
    averageTenureMonths: tenures.length ? tenures.reduce((s, v) => s + v, 0) / tenures.length : null,
    lastPeriod: lastPeriod
      ? {
          label: `${lastPeriod.month}/${lastPeriod.year}`,
          netPay: lastPeriod.payslips.reduce((s, p) => s + p.netPay, 0),
          employerCost: lastPeriod.payslips.reduce((s, p) => s + p.employerCost, 0),
        }
      : null,
    pendingLeaveRequests,
  };
}
