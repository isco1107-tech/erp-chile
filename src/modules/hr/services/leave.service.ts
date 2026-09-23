import 'server-only';

import type { Employee, LeaveRequest } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { accruedVacationDays, businessDaysBetween } from '@/lib/chile/payroll';
import type { LeaveRequestInput, LeaveReviewInput } from '../schema';

/**
 * Vacaciones y permisos con flujo de aprobación:
 *   PENDING → APPROVED | REJECTED, y PENDING/APPROVED → CANCELLED.
 * Solo las vacaciones aprobadas descuentan del saldo de feriado legal.
 */

export type LeaveRow = LeaveRequest & {
  employee: Pick<Employee, 'id' | 'fullName' | 'position'>;
  reviewedBy: { name: string } | null;
};

export interface VacationBalance {
  employeeId: string;
  fullName: string;
  hireDate: Date;
  accrued: number;
  taken: number;
  pending: number;
  available: number;
}

export async function listLeaveRequests(companyId: string): Promise<LeaveRow[]> {
  return prisma.leaveRequest.findMany({
    where: { companyId },
    include: { employee: { select: { id: true, fullName: true, position: true } }, reviewedBy: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    take: 300,
  });
}

export async function createLeaveRequest(companyId: string, input: LeaveRequestInput): Promise<LeaveRow> {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId }, select: { id: true, status: true } });
  if (!employee) throw new Error('El trabajador no existe en tu empresa');
  if (employee.status !== 'ACTIVE') throw new Error('El trabajador ya no está activo');

  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      companyId,
      employeeId: input.employeeId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
    select: { id: true },
  });
  if (overlapping) throw new Error('Ya existe una solicitud pendiente o aprobada que se cruza con esas fechas');

  const businessDays = input.businessDays ?? businessDaysBetween(input.startDate, input.endDate);
  const created = await prisma.leaveRequest.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      businessDays,
      reason: input.reason ?? null,
    },
  });
  return prisma.leaveRequest.findFirstOrThrow({
    where: { id: created.id, companyId },
    include: { employee: { select: { id: true, fullName: true, position: true } }, reviewedBy: { select: { name: true } } },
  });
}

export async function reviewLeaveRequest(companyId: string, id: string, reviewerId: string, input: LeaveReviewInput): Promise<LeaveRequest> {
  const result = await prisma.leaveRequest.updateMany({
    where: { id, companyId, status: 'PENDING' },
    data: { status: input.decision, reviewedByUserId: reviewerId, reviewedAt: new Date(), reviewNotes: input.notes ?? null },
  });
  if (result.count === 0) throw new Error('La solicitud no existe o ya fue revisada');
  return prisma.leaveRequest.findFirstOrThrow({ where: { id, companyId } });
}

export async function cancelLeaveRequest(companyId: string, id: string): Promise<void> {
  const result = await prisma.leaveRequest.updateMany({
    where: { id, companyId, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'CANCELLED' },
  });
  if (result.count === 0) throw new Error('La solicitud no existe o ya no se puede anular');
}

export async function getVacationBalances(companyId: string): Promise<VacationBalance[]> {
  const now = new Date();
  const [employees, vacations] = await Promise.all([
    prisma.employee.findMany({ where: { companyId, status: 'ACTIVE' }, select: { id: true, fullName: true, hireDate: true, terminationDate: true }, orderBy: { fullName: 'asc' } }),
    prisma.leaveRequest.groupBy({
      by: ['employeeId', 'status'],
      where: { companyId, type: 'VACATION', status: { in: ['APPROVED', 'PENDING'] } },
      _sum: { businessDays: true },
    }),
  ]);
  return employees.map((employee) => {
    const approved = vacations.find((v) => v.employeeId === employee.id && v.status === 'APPROVED')?._sum.businessDays ?? 0;
    const pending = vacations.find((v) => v.employeeId === employee.id && v.status === 'PENDING')?._sum.businessDays ?? 0;
    const accrued = accruedVacationDays(employee.hireDate, now, employee.terminationDate);
    return { employeeId: employee.id, fullName: employee.fullName, hireDate: employee.hireDate, accrued, taken: approved, pending, available: accrued - approved };
  });
}
