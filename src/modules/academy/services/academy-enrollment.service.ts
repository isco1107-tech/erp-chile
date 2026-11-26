import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { cleanRut, formatRut } from '@/lib/chile/rut';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { dayToDate, monthStart } from '@/lib/academy/billing';
import { santiagoIsoDay } from '@/lib/academy/check-in';
import { AcademyError } from './academy.service';
import type { PublicApplicationInput } from '../schema';

/**
 * Inscripción pública a la academia. El enlace lleva un token por empresa
 * (`CompanySettings.academyEnrollmentToken`): la empresa sale SIEMPRE del
 * token, nunca del cuerpo. Una inscripción queda `PENDING` hasta que el
 * equipo la aprueba; solo entonces se crea la ficha de alumna. Si la empresa
 * activó la aprobación automática (`academyAutoApproveEnrollments`), la ficha
 * se crea al instante y la inscripción queda en el historial como aprobada.
 */

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export async function getEnrollmentToken(companyId: string): Promise<string | null> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { academyEnrollmentToken: true } });
  return settings?.academyEnrollmentToken ?? null;
}

/** Idempotente: compartir el link varias veces no invalida uno que ya circula. */
export async function getOrCreateEnrollmentToken(companyId: string): Promise<string> {
  return (await getEnrollmentToken(companyId)) ?? regenerateEnrollmentToken(companyId);
}

/** Invalida el link anterior (p. ej. si se difundió donde no debía). */
export async function regenerateEnrollmentToken(companyId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { academyEnrollmentToken: token },
    create: { companyId, academyEnrollmentToken: token },
  });
  return token;
}

/** ¿Las inscripciones crean la ficha al instante? Por defecto, no: se revisan antes. */
export async function getAutoApproveEnrollments(companyId: string): Promise<boolean> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { academyAutoApproveEnrollments: true } });
  return settings?.academyAutoApproveEnrollments === true;
}

export async function setAutoApproveEnrollments(companyId: string, value: boolean): Promise<void> {
  await prisma.companySettings.upsert({
    where: { companyId },
    update: { academyAutoApproveEnrollments: value },
    create: { companyId, academyAutoApproveEnrollments: value },
  });
}

export interface ResolvedEnrollment {
  companyId: string;
  companyName: string;
}

/** Empresa suspendida, cancelada o sin el módulo: el enlace se comporta como inexistente. */
export async function resolveEnrollment(token: string): Promise<ResolvedEnrollment | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const settings = await prisma.companySettings.findUnique({
    where: { academyEnrollmentToken: token },
    select: { companyId: true, company: { select: { businessName: true, status: true, features: { select: { hasAcademy: true } } } } },
  });
  if (!settings) return null;
  const { company } = settings;
  if (company.status !== 'ACTIVE' && company.status !== 'TRIAL') return null;
  if (!company.features?.hasAcademy) return null;
  return { companyId: settings.companyId, companyName: company.businessName };
}

export interface PublicEnrollmentInfo {
  companyName: string;
  /** La ficha se crea al instante (cambia solo los textos de la página). */
  autoApprove: boolean;
  /** Solo nombre y horario: la mensualidad no se publica. */
  groups: Array<{ id: string; name: string; schedule: string | null }>;
}

export async function getPublicEnrollmentInfo(token: string): Promise<PublicEnrollmentInfo | null> {
  const resolved = await resolveEnrollment(token);
  if (!resolved) return null;
  const [groups, autoApprove] = await Promise.all([
    prisma.academyGroup.findMany({
      where: { companyId: resolved.companyId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, schedule: true },
    }),
    getAutoApproveEnrollments(resolved.companyId),
  ]);
  return { companyName: resolved.companyName, autoApprove, groups };
}

export async function countRecentApplications(companyId: string, minutes: number): Promise<number> {
  return prisma.academyApplication.count({ where: { companyId, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } });
}

export interface SubmittedApplication {
  /** `false` si no se creó nada (ya era alumna o ya tenía una pendiente): la persona ve igual el éxito, para no revelar quién está inscrita. */
  created: boolean;
  id: string | null;
  /** Ficha creada al instante (aprobación automática); `null` si quedó pendiente de revisión. */
  studentId: string | null;
}

/** Datos de la ficha de alumna a partir de una inscripción (al aprobarla o, con aprobación automática, al recibirla). */
interface ApplicationFields {
  rut: string;
  rutClean: string;
  fullName: string;
  birthDate: Date;
  email: string | null;
  phone: string;
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
  message: string | null;
}

function studentData(companyId: string, app: ApplicationFields, groupId: string | null, startMonth: string) {
  return {
    companyId,
    groupId,
    rut: app.rut,
    rutClean: app.rutClean,
    fullName: app.fullName,
    birthDate: app.birthDate,
    email: app.email,
    phone: app.phone,
    address: app.address,
    emergencyContactName: app.emergencyContactName,
    emergencyContactPhone: app.emergencyContactPhone,
    pantsSize: app.pantsSize,
    shirtSize: app.shirtSize,
    shoeSize: app.shoeSize,
    guardianName: app.guardianName,
    guardianPhone: app.guardianPhone,
    guardianEmail: app.guardianEmail,
    photoConsent: app.photoConsent,
    notes: app.message ? `Mensaje al inscribirse: ${app.message}` : null,
    startMonth: monthStart(startMonth),
  };
}

export async function submitApplication(resolved: ResolvedEnrollment, data: PublicApplicationInput, now: Date = new Date()): Promise<SubmittedApplication> {
  const rutClean = cleanRut(data.rut);
  const alreadyStudent = await prisma.academyStudent.findFirst({ where: { companyId: resolved.companyId, rutClean }, select: { id: true } });
  if (alreadyStudent) return { created: false, id: null, studentId: null };
  const pending = await prisma.academyApplication.findFirst({ where: { companyId: resolved.companyId, rutClean, status: 'PENDING' }, select: { id: true } });
  if (pending) return { created: false, id: null, studentId: null };

  // El grupo se valida contra la empresa del token: un id de otra empresa se descarta.
  let preferredGroupId: string | null = null;
  if (data.preferredGroupId) {
    const group = await prisma.academyGroup.findFirst({ where: { id: data.preferredGroupId, companyId: resolved.companyId, isActive: true }, select: { id: true } });
    preferredGroupId = group?.id ?? null;
  }

  const fields: ApplicationFields = {
    fullName: data.fullName,
    rut: formatRut(data.rut),
    rutClean,
    birthDate: dayToDate(data.birthDate),
    phone: data.phone,
    address: data.address ?? null,
    emergencyContactName: data.emergencyContactName ?? null,
    emergencyContactPhone: data.emergencyContactPhone ?? null,
    pantsSize: data.pantsSize ?? null,
    shirtSize: data.shirtSize ?? null,
    shoeSize: data.shoeSize ?? null,
    email: data.email || null,
    guardianName: data.guardianName ?? null,
    guardianPhone: data.guardianPhone ?? null,
    guardianEmail: data.guardianEmail || null,
    photoConsent: data.photoConsent,
    message: data.message ?? null,
  };
  const applicationData = { companyId: resolved.companyId, ...fields, consentAt: now, preferredGroupId };

  if (!(await getAutoApproveEnrollments(resolved.companyId))) {
    const created = await prisma.academyApplication.create({ data: applicationData, select: { id: true } });
    return { created: true, id: created.id, studentId: null };
  }

  // Aprobación automática: la ficha (en el grupo que eligió, cobrando desde el
  // mes en curso) y la inscripción ya aprobada, en una sola transacción.
  try {
    return await prisma.$transaction(async (tx) => {
      const student = await tx.academyStudent.create({
        data: studentData(resolved.companyId, fields, preferredGroupId, santiagoIsoDay(now).slice(0, 7)),
        select: { id: true },
      });
      const application = await tx.academyApplication.create({
        data: { ...applicationData, status: 'APPROVED', reviewedAt: now, studentId: student.id },
        select: { id: true },
      });
      return { created: true, id: application.id, studentId: student.id };
    });
  } catch (error) {
    // Dos envíos simultáneos con el mismo RUT: la ficha ya existe, no se duplica.
    if (isUniqueConstraintError(error)) return { created: false, id: null, studentId: null };
    throw error;
  }
}

// ── Revisión por el equipo ───────────────────────────────────────────────────

export interface ApplicationRow {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fullName: string;
  rut: string;
  birthDate: string;
  email: string | null;
  phone: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  photoConsent: boolean;
  preferredGroupId: string | null;
  preferredGroupName: string | null;
  message: string | null;
  createdAt: Date;
}

export async function listApplications(companyId: string, status: 'PENDING' | 'REVIEWED'): Promise<ApplicationRow[]> {
  const rows = await prisma.academyApplication.findMany({
    where: { companyId, status: status === 'PENDING' ? 'PENDING' : { in: ['APPROVED', 'REJECTED'] } },
    orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 200,
  });
  const groupIds = [...new Set(rows.flatMap((r) => (r.preferredGroupId ? [r.preferredGroupId] : [])))];
  const groups = groupIds.length ? await prisma.academyGroup.findMany({ where: { companyId, id: { in: groupIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(groups.map((g) => [g.id, g.name]));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    fullName: r.fullName,
    rut: r.rut,
    birthDate: r.birthDate.toISOString().slice(0, 10),
    email: r.email,
    phone: r.phone,
    guardianName: r.guardianName,
    guardianPhone: r.guardianPhone,
    guardianEmail: r.guardianEmail,
    photoConsent: r.photoConsent,
    preferredGroupId: r.preferredGroupId,
    preferredGroupName: r.preferredGroupId ? (names.get(r.preferredGroupId) ?? null) : null,
    message: r.message,
    createdAt: r.createdAt,
  }));
}

export async function countPendingApplications(companyId: string): Promise<number> {
  return prisma.academyApplication.count({ where: { companyId, status: 'PENDING' } });
}

/**
 * Aprueba y crea la ficha en una sola transacción. El `UPDATE` condicionado
 * a `PENDING` evita que un doble clic (o dos personas a la vez) cree dos
 * alumnas.
 */
export async function approveApplication(companyId: string, id: string, input: { groupId?: string | null; startMonth: string }): Promise<{ studentId: string }> {
  if (input.groupId) {
    const group = await prisma.academyGroup.findFirst({ where: { id: input.groupId, companyId }, select: { id: true } });
    if (!group) throw new AcademyError('El grupo seleccionado no existe');
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.academyApplication.updateMany({ where: { id, companyId, status: 'PENDING' }, data: { status: 'APPROVED', reviewedAt: new Date() } });
      if (claimed.count === 0) throw new AcademyError('Esta inscripción ya fue revisada');
      const app = await tx.academyApplication.findFirst({ where: { id, companyId } });
      if (!app) throw new AcademyError('La inscripción no existe');
      const student = await tx.academyStudent.create({
        data: studentData(companyId, app, input.groupId ?? null, input.startMonth),
        select: { id: true },
      });
      await tx.academyApplication.updateMany({ where: { id, companyId }, data: { studentId: student.id } });
      return { studentId: student.id };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AcademyError('Ya existe una alumna con ese RUT');
    throw error;
  }
}

export async function rejectApplication(companyId: string, id: string): Promise<void> {
  const updated = await prisma.academyApplication.updateMany({ where: { id, companyId, status: 'PENDING' }, data: { status: 'REJECTED', reviewedAt: new Date() } });
  if (updated.count === 0) throw new AcademyError('Esta inscripción ya fue revisada o no existe');
}
