import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import type { LeaveRequest, LeaveType, Payslip, PayrollPeriod } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { accruedVacationDays, businessDaysBetween } from '@/lib/chile/payroll';
import type { EmployeeRecord } from './employees.service';

/**
 * Portal del trabajador: un enlace personal (`/trabajador/[token]`) para ver
 * sus liquidaciones cerradas, su saldo de vacaciones y pedir días. El token
 * solo se guarda como hash SHA-256: si se filtra la base, los enlaces no.
 * Quien terminó su relación laboral conserva el acceso 90 días (para bajar
 * sus liquidaciones y su finiquito).
 */

const ACCESS_AFTER_TERMINATION_DAYS = 90;

/** Error de negocio pensado para mostrarse tal cual en el portal público. */
export class PortalInputError extends Error {}

export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createPortalLink(companyId: string, employeeId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const result = await prisma.employee.updateMany({
    where: { id: employeeId, companyId },
    data: { portalTokenHash: hashPortalToken(token), portalTokenCreatedAt: new Date() },
  });
  if (result.count === 0) throw new Error('El trabajador no existe o fue eliminado');
  return token;
}

export async function revokePortalLink(companyId: string, employeeId: string): Promise<void> {
  const result = await prisma.employee.updateMany({ where: { id: employeeId, companyId }, data: { portalTokenHash: null, portalTokenCreatedAt: null } });
  if (result.count === 0) throw new Error('El trabajador no existe o fue eliminado');
}

async function employeeByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const employee = await prisma.employee.findFirst({
    where: { portalTokenHash: hashPortalToken(token), company: { status: { in: ['ACTIVE', 'TRIAL'] } } },
    include: { company: { select: { id: true, businessName: true, logoUrl: true } } },
  });
  if (!employee) return null;
  if (employee.status === 'TERMINATED' && employee.terminationDate) {
    const limit = employee.terminationDate.getTime() + ACCESS_AFTER_TERMINATION_DAYS * 86_400_000;
    if (Date.now() > limit) return null;
  }
  return employee;
}

export interface EmployeePortalView {
  company: { businessName: string; logoUrl: string | null };
  employee: Pick<EmployeeRecord, 'fullName' | 'rut' | 'position' | 'hireDate' | 'status'>;
  vacation: { accrued: number; taken: number; pending: number; available: number };
  payslips: Array<Pick<Payslip, 'id' | 'netPay' | 'taxableIncome'> & { period: Pick<PayrollPeriod, 'year' | 'month'> }>;
  leaves: Array<Pick<LeaveRequest, 'id' | 'type' | 'startDate' | 'endDate' | 'businessDays' | 'status' | 'reviewNotes'>>;
  canRequest: boolean;
}

export async function getPortalView(token: string): Promise<EmployeePortalView | null> {
  const employee = await employeeByToken(token);
  if (!employee) return null;
  const [payslips, leaves] = await Promise.all([
    // Solo períodos cerrados: una liquidación en borrador todavía puede cambiar.
    prisma.payslip.findMany({
      where: { companyId: employee.companyId, employeeId: employee.id, period: { status: 'CLOSED' } },
      select: { id: true, netPay: true, taxableIncome: true, period: { select: { year: true, month: true } } },
      orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
      take: 24,
    }),
    prisma.leaveRequest.findMany({
      where: { companyId: employee.companyId, employeeId: employee.id },
      select: { id: true, type: true, startDate: true, endDate: true, businessDays: true, status: true, reviewNotes: true },
      orderBy: { startDate: 'desc' },
      take: 20,
    }),
  ]);
  const all = await prisma.leaveRequest.groupBy({
    by: ['status'],
    where: { companyId: employee.companyId, employeeId: employee.id, type: 'VACATION', status: { in: ['APPROVED', 'PENDING'] } },
    _sum: { businessDays: true },
  });
  const taken = all.find((row) => row.status === 'APPROVED')?._sum.businessDays ?? 0;
  const pending = all.find((row) => row.status === 'PENDING')?._sum.businessDays ?? 0;
  const accrued = accruedVacationDays(employee.hireDate, new Date(), employee.terminationDate);
  return {
    company: { businessName: employee.company.businessName, logoUrl: employee.company.logoUrl },
    employee: { fullName: employee.fullName, rut: employee.rut, position: employee.position, hireDate: employee.hireDate, status: employee.status },
    vacation: { accrued, taken, pending, available: accrued - taken },
    payslips,
    leaves,
    canRequest: employee.status === 'ACTIVE',
  };
}

export async function getPortalPayslip(token: string, payslipId: string) {
  const employee = await employeeByToken(token);
  if (!employee) return null;
  return prisma.payslip.findFirst({
    where: { id: payslipId, companyId: employee.companyId, employeeId: employee.id, period: { status: 'CLOSED' } },
    include: {
      employee: { omit: { portalTokenHash: true } },
      period: true,
      company: { select: { businessName: true, rut: true, address: true, comuna: true, logoUrl: true } },
    },
  });
}

const PORTAL_LEAVE_TYPES: readonly LeaveType[] = ['VACATION', 'PERSONAL', 'UNPAID'];

/** Solicitud desde el portal: queda pendiente para que RR.HH. la apruebe. */
export async function requestLeaveFromPortal(
  token: string,
  input: { type: LeaveType; startDate: string; endDate: string; reason?: string }
): Promise<{ companyId: string; request: LeaveRequest; employeeName: string } | null> {
  const employee = await employeeByToken(token);
  if (!employee || employee.status !== 'ACTIVE') return null;
  if (!PORTAL_LEAVE_TYPES.includes(input.type)) throw new PortalInputError('Tipo de solicitud no permitido');
  const startDate = new Date(`${input.startDate}T12:00:00Z`);
  const endDate = new Date(`${input.endDate}T12:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) throw new PortalInputError('Revisa las fechas: el término debe ser igual o posterior al inicio');
  const businessDays = businessDaysBetween(startDate, endDate);
  if (businessDays === 0) throw new PortalInputError('El período elegido no tiene días hábiles');
  if (businessDays > 60) throw new PortalInputError('Para más de 60 días hábiles, conversa directamente con RR.HH.');
  const pendingCount = await prisma.leaveRequest.count({ where: { companyId: employee.companyId, employeeId: employee.id, status: 'PENDING' } });
  if (pendingCount >= 5) throw new PortalInputError('Ya tienes varias solicitudes pendientes: espera a que RR.HH. las revise');
  const request = await prisma.leaveRequest.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      type: input.type,
      startDate,
      endDate,
      businessDays,
      reason: input.reason ? `[Portal] ${input.reason}` : '[Portal] Solicitud del trabajador',
    },
  });
  return { companyId: employee.companyId, request, employeeName: employee.fullName };
}
