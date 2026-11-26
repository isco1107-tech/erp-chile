import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { dayToDate, type AttendanceStatus } from '@/lib/academy/billing';
import {
  CHECK_IN_TOKEN_BYTES,
  CHECK_IN_TOKEN_PATTERN,
  checkInExpiry,
  checkInState,
  decideCheckIn,
  firstName,
  rutLookupKeys,
  santiagoIsoDay,
  santiagoTimeLabel,
  type CheckInDuration,
  type CheckInOutcome,
  type CheckInState,
} from '@/lib/academy/check-in';
import { AcademyError } from './academy.service';

/**
 * Registro de asistencia con QR. La profesora abre una ventana por grupo y
 * día (solo el de hoy en Santiago); la alumna escanea el QR y escribe su RUT
 * en `/academia/asistencia/[token]`. La empresa, el grupo y el día salen
 * SIEMPRE del token; del navegador solo llega el RUT. El QR solo llena una
 * marca vacía: nunca pisa lo que ya marcó la profesora.
 */

function newToken(): string {
  return crypto.randomBytes(CHECK_IN_TOKEN_BYTES).toString('hex');
}

export interface CheckInLinkView {
  token: string;
  /** "YYYY-MM-DD". */
  date: string;
  expiresAt: Date;
  closedAt: Date | null;
  state: CheckInState;
}

type LinkRow = { token: string; date: Date; expiresAt: Date; closedAt: Date | null };

function toView(link: LinkRow, now: Date): CheckInLinkView {
  return { token: link.token, date: link.date.toISOString().slice(0, 10), expiresAt: link.expiresAt, closedAt: link.closedAt, state: checkInState(link, now) };
}

const LINK_SELECT = { token: true, date: true, expiresAt: true, closedAt: true } as const;

async function assertActiveGroup(companyId: string, groupId: string): Promise<{ name: string }> {
  const group = await prisma.academyGroup.findFirst({ where: { id: groupId, companyId }, select: { name: true, isActive: true } });
  if (!group) throw new AcademyError('El grupo seleccionado no existe');
  if (!group.isActive) throw new AcademyError('Ese grupo está desactivado. Reactívalo en la pestaña Grupos para pasar lista');
  return { name: group.name };
}

/** El QR de un grupo y día, si alguna vez se abrió (vigente, vencido o cerrado). */
export async function getCheckInLink(companyId: string, groupId: string, date: string, now: Date = new Date()): Promise<CheckInLinkView | null> {
  const link = await prisma.academyCheckInLink.findFirst({ where: { companyId, groupId, date: dayToDate(date) }, select: LINK_SELECT });
  return link ? toView(link, now) : null;
}

/**
 * Abre (o reabre y extiende) el registro con QR de la clase de hoy. Reabrir
 * conserva el mismo QR, así el que ya está proyectado sigue sirviendo; con
 * `renew` se genera uno nuevo y el anterior deja de funcionar al instante
 * (por si alguien lo mandó por WhatsApp a quien no vino).
 */
export async function openCheckIn(
  companyId: string,
  userId: string,
  input: { groupId: string; date: string; minutes: CheckInDuration; renew: boolean },
  now: Date = new Date()
): Promise<CheckInLinkView> {
  await assertActiveGroup(companyId, input.groupId);
  if (input.date !== santiagoIsoDay(now)) throw new AcademyError('El QR de asistencia solo sirve para la clase de hoy. Para otro día, marca la lista a mano');
  const date = dayToDate(input.date);
  const cancelled = await prisma.academySession.findFirst({ where: { companyId, groupId: input.groupId, date, isCancelled: true }, select: { id: true } });
  if (cancelled) throw new AcademyError('La clase de hoy está cancelada, así que no se pasa lista. Reactívala en el calendario si se hace');

  const expiresAt = checkInExpiry(now, input.minutes);
  const where = { companyId, groupId: input.groupId, date };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await prisma.academyCheckInLink.findFirst({ where, select: { id: true } });
    if (existing) {
      await prisma.academyCheckInLink.updateMany({
        where: { id: existing.id, companyId },
        data: { expiresAt, closedAt: null, ...(input.renew ? { token: newToken() } : {}) },
      });
    } else {
      try {
        await prisma.academyCheckInLink.create({ data: { ...where, token: newToken(), expiresAt, createdById: userId } });
      } catch (error) {
        // Dos personas abrieron el QR a la vez: la otra ya lo creó; se reabre el suyo.
        if (isUniqueConstraintError(error) && attempt === 0) continue;
        throw error;
      }
    }
    const link = await prisma.academyCheckInLink.findFirst({ where, select: LINK_SELECT });
    if (link) return toView(link, now);
  }
  throw new AcademyError('No se pudo abrir el registro con QR. Intenta de nuevo');
}

/** Cierra el registro antes de tiempo: el QR deja de aceptar RUT. */
export async function closeCheckIn(companyId: string, groupId: string, date: string, now: Date = new Date()): Promise<CheckInLinkView | null> {
  const where = { companyId, groupId, date: dayToDate(date) };
  await prisma.academyCheckInLink.updateMany({ where: { ...where, closedAt: null }, data: { closedAt: now } });
  const link = await prisma.academyCheckInLink.findFirst({ where, select: LINK_SELECT });
  return link ? toView(link, now) : null;
}

// ── Página pública ───────────────────────────────────────────────────────────

export interface PublicCheckInInfo {
  linkId: string;
  companyId: string;
  companyName: string;
  groupId: string;
  groupName: string;
  /** "YYYY-MM-DD". */
  date: string;
  expiresAt: Date;
  state: CheckInState;
}

/**
 * Resuelve el token. Empresa suspendida o sin el módulo, o grupo desactivado:
 * el enlace se comporta como inexistente (`null`). Un QR vencido o cerrado sí
 * se resuelve, para explicarle a la alumna qué pasó.
 */
export async function resolveCheckIn(token: string, now: Date = new Date()): Promise<PublicCheckInInfo | null> {
  if (!CHECK_IN_TOKEN_PATTERN.test(token)) return null;
  const link = await prisma.academyCheckInLink.findUnique({
    where: { token },
    select: {
      id: true,
      companyId: true,
      groupId: true,
      date: true,
      expiresAt: true,
      closedAt: true,
      group: { select: { name: true, isActive: true, companyId: true } },
      company: { select: { businessName: true, status: true, features: { select: { hasAcademy: true } } } },
    },
  });
  if (!link) return null;
  if (link.company.status !== 'ACTIVE' && link.company.status !== 'TRIAL') return null;
  if (!link.company.features?.hasAcademy) return null;
  if (!link.group.isActive || link.group.companyId !== link.companyId) return null;
  const day = link.date.toISOString().slice(0, 10);
  // Un QR de otro día ya no sirve aunque la hora de vencimiento diga otra cosa.
  const state = day === santiagoIsoDay(now) ? checkInState(link, now) : link.closedAt ? 'CLOSED' : 'EXPIRED';
  return {
    linkId: link.id,
    companyId: link.companyId,
    companyName: link.company.businessName,
    groupId: link.groupId,
    groupName: link.group.name,
    date: day,
    expiresAt: link.expiresAt,
    state,
  };
}

/**
 * La alumna escribe su RUT. Solo alumnas ACTIVAS de ESE grupo; una marca que
 * ya existe no se cambia (se deja constancia de que se registró con el QR en
 * `selfCheckInAt`). Un RUT que no está en el grupo responde igual que uno que
 * no existe: no se revela en qué otro grupo está.
 */
export async function submitCheckIn(info: PublicCheckInInfo, rut: string, now: Date = new Date()): Promise<CheckInOutcome> {
  if (info.state !== 'OPEN') return { kind: 'CLOSED' };
  const date = dayToDate(info.date);
  const cancelled = await prisma.academySession.findFirst({ where: { companyId: info.companyId, groupId: info.groupId, date, isCancelled: true }, select: { id: true } });
  if (cancelled) return { kind: 'CANCELLED' };

  const student = await prisma.academyStudent.findFirst({
    where: { companyId: info.companyId, groupId: info.groupId, isActive: true, rutClean: { in: rutLookupKeys(rut) } },
    select: { id: true, fullName: true },
  });
  if (!student) return { kind: 'NOT_FOUND' };
  const name = firstName(student.fullName);

  // `skipDuplicates` sobre (alumna, día): dos envíos a la vez dejan una sola marca.
  const created = await prisma.academyAttendance.createMany({
    data: [{ companyId: info.companyId, studentId: student.id, date, status: 'PRESENT', selfCheckInAt: now }],
    skipDuplicates: true,
  });
  if (created.count === 1) return { kind: 'CREATED', firstName: name, at: santiagoTimeLabel(now) };

  const existing = await prisma.academyAttendance.findFirst({ where: { companyId: info.companyId, studentId: student.id, date }, select: { status: true } });
  const decision = decideCheckIn((existing?.status as AttendanceStatus | undefined) ?? null);
  if (decision === 'CREATE') {
    // La profesora borró la marca justo entremedio: se vuelve a intentar una vez.
    const retried = await prisma.academyAttendance.createMany({
      data: [{ companyId: info.companyId, studentId: student.id, date, status: 'PRESENT', selfCheckInAt: now }],
      skipDuplicates: true,
    });
    return retried.count === 1 ? { kind: 'CREATED', firstName: name, at: santiagoTimeLabel(now) } : { kind: 'ALREADY_PRESENT', firstName: name };
  }
  // Constancia para la profesora: se registró con el QR aunque ya tuviera marca.
  await prisma.academyAttendance.updateMany({ where: { companyId: info.companyId, studentId: student.id, date, selfCheckInAt: null }, data: { selfCheckInAt: now } });
  return decision === 'MARKED_BY_TEACHER' ? { kind: 'MARKED_BY_TEACHER', firstName: name } : { kind: 'ALREADY_PRESENT', firstName: name };
}
