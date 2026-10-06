import { prisma } from '@/lib/prisma';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import {
  attendanceRate,
  consecutiveAbsences,
  dayToDate,
  monthKey,
  monthStart,
  pendingMonths,
  type AttendanceStatus,
} from '@/lib/academy/billing';
import type { AttendanceInput, GroupInput, MonthPaymentInput, StudentInput } from '../schema';

/**
 * Academia: fichas de alumnas, lista de asistencia y mensualidad pagada.
 * Toda consulta lleva `companyId`; los ids que llegan del cliente (grupo,
 * alumna) se verifican contra la empresa antes de usarlos.
 */

export class AcademyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcademyError';
  }
}

export interface GroupRow {
  id: string;
  name: string;
  schedule: string | null;
  monthlyFee: number | null;
  isActive: boolean;
  students: number;
}

export async function listGroups(companyId: string): Promise<GroupRow[]> {
  const groups = await prisma.academyGroup.findMany({
    where: { companyId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { students: { where: { isActive: true } } } } },
  });
  return groups.map((g) => ({ id: g.id, name: g.name, schedule: g.schedule, monthlyFee: g.monthlyFee, isActive: g.isActive, students: g._count.students }));
}

export async function saveGroup(companyId: string, id: string | null, data: GroupInput): Promise<{ id: string }> {
  const values = { name: data.name, schedule: data.schedule ?? null, monthlyFee: data.monthlyFee ?? null };
  if (!id) {
    const created = await prisma.academyGroup.create({ data: { companyId, ...values }, select: { id: true } });
    return created;
  }
  const updated = await prisma.academyGroup.updateMany({ where: { id, companyId }, data: values });
  if (updated.count === 0) throw new AcademyError('El grupo no existe');
  return { id };
}

export async function setGroupActive(companyId: string, id: string, isActive: boolean): Promise<void> {
  const updated = await prisma.academyGroup.updateMany({ where: { id, companyId }, data: { isActive } });
  if (updated.count === 0) throw new AcademyError('El grupo no existe');
}

async function assertGroup(companyId: string, groupId: string | null | undefined): Promise<void> {
  if (!groupId) return;
  const group = await prisma.academyGroup.findFirst({ where: { id: groupId, companyId }, select: { id: true } });
  if (!group) throw new AcademyError('El grupo seleccionado no existe');
}

export interface StudentRow {
  id: string;
  rut: string;
  fullName: string;
  groupId: string | null;
  groupName: string | null;
  isActive: boolean;
  phone: string | null;
  guardianName: string | null;
  photoConsent: boolean;
  /** Meses que debe hasta el actual. */
  pendingMonths: number;
  /** % de asistencia; `null` si todavía no hay clases. */
  attendanceRate: number | null;
  /** Ausencias injustificadas seguidas desde la última clase. */
  absenceStreak: number;
}

export async function listStudents(companyId: string, filter: { groupId?: string; search?: string; includeInactive?: boolean }, now: Date = new Date()): Promise<StudentRow[]> {
  const search = filter.search?.trim();
  const students = await prisma.academyStudent.findMany({
    where: {
      companyId,
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' as const } }, { rutClean: { contains: cleanRut(search), mode: 'insensitive' as const } }] } : {}),
    },
    orderBy: { fullName: 'asc' },
    take: 500,
    include: {
      group: { select: { name: true } },
      payments: { select: { period: true } },
      attendance: { select: { status: true }, orderBy: { date: 'desc' }, take: 200 },
    },
  });
  return students.map((s) => {
    const statuses = s.attendance.map((a) => a.status as AttendanceStatus);
    return {
      id: s.id,
      rut: s.rut,
      fullName: s.fullName,
      groupId: s.groupId,
      groupName: s.group?.name ?? null,
      isActive: s.isActive,
      phone: s.phone,
      guardianName: s.guardianName,
      photoConsent: s.photoConsent,
      pendingMonths: s.isActive ? pendingMonths(s.startMonth, s.payments.map((p) => p.period), now).length : 0,
      attendanceRate: attendanceRate(statuses),
      absenceStreak: consecutiveAbsences(statuses),
    };
  });
}

export interface StudentDetail {
  id: string;
  rut: string;
  fullName: string;
  groupId: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  pantsSize: string | null;
  shirtSize: string | null;
  shoeSize: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  photoConsent: boolean;
  notes: string | null;
  startMonth: string;
  isActive: boolean;
  paidPeriods: Array<{ period: string; amount: number; paidAt: Date }>;
  pending: string[];
  recentAttendance: Array<{ date: string; status: AttendanceStatus }>;
  attendanceRate: number | null;
}

export async function getStudent(companyId: string, id: string, now: Date = new Date()): Promise<StudentDetail | null> {
  const s = await prisma.academyStudent.findFirst({
    where: { id, companyId },
    include: {
      payments: { orderBy: { period: 'desc' }, select: { period: true, amount: true, paidAt: true } },
      attendance: { orderBy: { date: 'desc' }, take: 200, select: { date: true, status: true } },
    },
  });
  if (!s) return null;
  const statuses = s.attendance.map((a) => a.status as AttendanceStatus);
  return {
    id: s.id,
    rut: s.rut,
    fullName: s.fullName,
    groupId: s.groupId,
    birthDate: s.birthDate ? s.birthDate.toISOString().slice(0, 10) : null,
    email: s.email,
    phone: s.phone,
    address: s.address,
    emergencyContactName: s.emergencyContactName,
    emergencyContactPhone: s.emergencyContactPhone,
    pantsSize: s.pantsSize,
    shirtSize: s.shirtSize,
    shoeSize: s.shoeSize,
    guardianName: s.guardianName,
    guardianPhone: s.guardianPhone,
    guardianEmail: s.guardianEmail,
    photoConsent: s.photoConsent,
    notes: s.notes,
    startMonth: monthKey(s.startMonth),
    isActive: s.isActive,
    paidPeriods: s.payments,
    pending: pendingMonths(s.startMonth, s.payments.map((p) => p.period), now),
    recentAttendance: s.attendance.slice(0, 30).map((a) => ({ date: a.date.toISOString().slice(0, 10), status: a.status as AttendanceStatus })),
    attendanceRate: attendanceRate(statuses),
  };
}

function studentValues(data: StudentInput) {
  return {
    rut: formatRut(data.rut),
    rutClean: cleanRut(data.rut),
    fullName: data.fullName,
    groupId: data.groupId ?? null,
    birthDate: data.birthDate ? dayToDate(data.birthDate) : null,
    email: data.email || null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    emergencyContactName: data.emergencyContactName ?? null,
    emergencyContactPhone: data.emergencyContactPhone ?? null,
    pantsSize: data.pantsSize ?? null,
    shirtSize: data.shirtSize ?? null,
    shoeSize: data.shoeSize ?? null,
    guardianName: data.guardianName ?? null,
    guardianPhone: data.guardianPhone ?? null,
    guardianEmail: data.guardianEmail || null,
    photoConsent: data.photoConsent,
    notes: data.notes ?? null,
    startMonth: monthStart(data.startMonth),
  };
}

const DUPLICATE_RUT = 'Ya existe una alumna con ese RUT';

export async function createStudent(companyId: string, data: StudentInput): Promise<{ id: string }> {
  await assertGroup(companyId, data.groupId);
  try {
    return await prisma.academyStudent.create({ data: { companyId, ...studentValues(data) }, select: { id: true } });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AcademyError(DUPLICATE_RUT);
    throw error;
  }
}

export async function updateStudent(companyId: string, id: string, data: StudentInput): Promise<void> {
  await assertGroup(companyId, data.groupId);
  try {
    const updated = await prisma.academyStudent.updateMany({ where: { id, companyId }, data: studentValues(data) });
    if (updated.count === 0) throw new AcademyError('La alumna no existe');
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AcademyError(DUPLICATE_RUT);
    throw error;
  }
}

export async function setStudentActive(companyId: string, id: string, isActive: boolean): Promise<void> {
  const updated = await prisma.academyStudent.updateMany({ where: { id, companyId }, data: { isActive } });
  if (updated.count === 0) throw new AcademyError('La alumna no existe');
}

export async function moveStudentToGroup(companyId: string, studentId: string, groupId: string | null): Promise<void> {
  await assertGroup(companyId, groupId);
  const updated = await prisma.academyStudent.updateMany({ where: { id: studentId, companyId }, data: { groupId } });
  if (updated.count === 0) throw new AcademyError('La alumna no existe');
}

/**
 * Elimina la ficha de la alumna (y su asistencia). Sus mensualidades se
 * conservan: el pago ya guarda la copia de su nombre y RUT y solo pierde el
 * vínculo con la ficha (`onDelete: SetNull`).
 */
export async function deleteStudent(companyId: string, id: string): Promise<{ keptPayments: number }> {
  return prisma.$transaction(async (tx) => {
    const student = await tx.academyStudent.findFirst({ where: { id, companyId }, select: { fullName: true, rut: true } });
    if (!student) throw new AcademyError('La alumna no existe');
    // Respaldo del nombre en pagos antiguos que aún no lo tengan.
    await tx.academyMonthlyPayment.updateMany({ where: { companyId, studentId: id, studentName: null }, data: { studentName: student.fullName, studentRut: student.rut } });
    const keptPayments = await tx.academyMonthlyPayment.count({ where: { companyId, studentId: id } });
    await tx.academyStudent.deleteMany({ where: { id, companyId } });
    return { keptPayments };
  });
}

// ── Asistencia ───────────────────────────────────────────────────────────────

export interface AttendanceSheetRow {
  studentId: string;
  fullName: string;
  status: AttendanceStatus | null;
}

export async function getAttendanceSheet(companyId: string, groupId: string, date: string): Promise<AttendanceSheetRow[]> {
  await assertGroup(companyId, groupId);
  const students = await prisma.academyStudent.findMany({
    where: { companyId, groupId, isActive: true },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, attendance: { where: { date: dayToDate(date) }, select: { status: true } } },
  });
  return students.map((s) => ({ studentId: s.id, fullName: s.fullName, status: (s.attendance[0]?.status as AttendanceStatus | undefined) ?? null }));
}

/** Guarda la lista del día. `status: null` borra la marca de esa alumna. */
export async function saveAttendance(companyId: string, data: AttendanceInput): Promise<{ saved: number }> {
  await assertGroup(companyId, data.groupId);
  const ids = [...new Set(data.entries.map((e) => e.studentId))];
  const valid = await prisma.academyStudent.findMany({ where: { companyId, groupId: data.groupId, id: { in: ids } }, select: { id: true } });
  if (valid.length !== ids.length) throw new AcademyError('Hay alumnas que no pertenecen a este grupo. Recarga la lista');
  const date = dayToDate(data.date);
  await prisma.$transaction([
    ...data.entries.map((entry) =>
      entry.status
        ? prisma.academyAttendance.upsert({
            where: { studentId_date: { studentId: entry.studentId, date } },
            create: { companyId, studentId: entry.studentId, date, status: entry.status },
            update: { status: entry.status },
          })
        : prisma.academyAttendance.deleteMany({ where: { companyId, studentId: entry.studentId, date } })
    ),
  ]);
  return { saved: data.entries.filter((e) => e.status).length };
}

// ── Mensualidades ────────────────────────────────────────────────────────────

export interface PaymentBoardRow {
  studentId: string;
  fullName: string;
  groupName: string | null;
  /** Monto sugerido (mensualidad del grupo). */
  suggestedAmount: number | null;
  paid: { amount: number; paidAt: Date } | null;
}

/** Quién pagó y quién no en `period`: alumnas activas que ya debían ese mes. */
export async function getPaymentBoard(companyId: string, period: string, groupId?: string): Promise<PaymentBoardRow[]> {
  const students = await prisma.academyStudent.findMany({
    where: { companyId, isActive: true, startMonth: { lte: monthStart(period) }, ...(groupId ? { groupId } : {}) },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      group: { select: { name: true, monthlyFee: true } },
      payments: { where: { period }, select: { amount: true, paidAt: true } },
    },
  });
  return students.map((s) => ({
    studentId: s.id,
    fullName: s.fullName,
    groupName: s.group?.name ?? null,
    suggestedAmount: s.group?.monthlyFee ?? null,
    paid: s.payments[0] ?? null,
  }));
}

export async function setMonthPaid(companyId: string, data: MonthPaymentInput): Promise<void> {
  const student = await prisma.academyStudent.findFirst({ where: { id: data.studentId, companyId }, select: { id: true, fullName: true, rut: true, group: { select: { monthlyFee: true } } } });
  if (!student) throw new AcademyError('La alumna no existe');
  if (!data.paid) {
    await prisma.academyMonthlyPayment.deleteMany({ where: { companyId, studentId: data.studentId, period: data.period } });
    return;
  }
  const amount = data.amount ?? student.group?.monthlyFee;
  if (amount === undefined || amount === null) throw new AcademyError('Indica el monto pagado');
  await prisma.academyMonthlyPayment.upsert({
    where: { studentId_period: { studentId: data.studentId, period: data.period } },
    create: { companyId, studentId: data.studentId, studentName: student.fullName, studentRut: student.rut, period: data.period, amount, note: data.note ?? null },
    update: { amount, note: data.note ?? null, paidAt: new Date() },
  });
}
