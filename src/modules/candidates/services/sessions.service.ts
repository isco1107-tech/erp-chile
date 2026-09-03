import { prisma } from '@/lib/prisma';
import type { CandidateSession } from '@prisma/client';
import type { SessionAttendanceBulkInput, SessionSeriesCreateInput } from '../schema';

async function assertProjectOwnership(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('Proyecto no encontrado');
}

/** Un solo día en `startDate === endDate` genera una sesión puntual (evento);
 * un rango con `daysOfWeek` genera una fila por cada fecha coincidente. */
function buildSessionDates(startDate: Date, endDate: Date, daysOfWeek: number[]): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (cursor <= last) {
    if (daysOfWeek.includes(cursor.getUTCDay())) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function createSessionSeries(companyId: string, data: SessionSeriesCreateInput): Promise<CandidateSession[]> {
  await assertProjectOwnership(companyId, data.projectId);
  const dates = buildSessionDates(data.startDate, data.endDate, data.daysOfWeek);
  if (dates.length === 0) throw new Error('El rango de fechas no contiene ningún día de la semana seleccionado');

  await prisma.candidateSession.createMany({
    data: dates.map((date) => ({
      companyId,
      projectId: data.projectId,
      activityType: data.activityType,
      title: data.title || undefined,
      location: data.location || undefined,
      notes: data.notes || undefined,
      time: data.time || undefined,
      date,
    })),
  });

  return prisma.candidateSession.findMany({
    where: { companyId, projectId: data.projectId, date: { in: dates } },
    orderBy: { date: 'asc' },
  });
}

export async function listSessions(companyId: string, projectId: string): Promise<CandidateSession[]> {
  await assertProjectOwnership(companyId, projectId);
  return prisma.candidateSession.findMany({
    where: { companyId, projectId },
    orderBy: { date: 'desc' },
  });
}

export interface SessionRosterRow {
  candidateId: string;
  fullName: string;
  stageName: string | null;
  attended: boolean | null;
  notes: string | null;
}

export interface SessionWithRoster extends CandidateSession {
  project: { id: string; name: string; code: string };
  roster: SessionRosterRow[];
}

export async function getSession(companyId: string, sessionId: string): Promise<SessionWithRoster> {
  const session = await prisma.candidateSession.findFirst({
    where: { id: sessionId, companyId },
    include: { project: { select: { id: true, name: true, code: true } } },
  });
  if (!session) throw new Error('Sesión no encontrada');

  const [candidates, attendance] = await Promise.all([
    prisma.candidate.findMany({
      where: { companyId, projectId: session.projectId, status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
      select: { id: true, fullName: true, stageName: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.candidateAttendance.findMany({
      where: { companyId, sessionId },
      select: { candidateId: true, attended: true, notes: true },
    }),
  ]);

  const attendanceByCandidate = new Map(attendance.map((a) => [a.candidateId, a]));

  return {
    ...session,
    roster: candidates.map((c) => ({
      candidateId: c.id,
      fullName: c.fullName,
      stageName: c.stageName,
      attended: attendanceByCandidate.get(c.id)?.attended ?? null,
      notes: attendanceByCandidate.get(c.id)?.notes ?? null,
    })),
  };
}

export async function deleteSession(companyId: string, sessionId: string): Promise<void> {
  const result = await prisma.candidateSession.deleteMany({ where: { id: sessionId, companyId } });
  if (result.count === 0) throw new Error('Sesión no encontrada');
}

export async function saveSessionAttendance(companyId: string, sessionId: string, data: SessionAttendanceBulkInput): Promise<void> {
  const session = await prisma.candidateSession.findFirst({ where: { id: sessionId, companyId } });
  if (!session) throw new Error('Sesión no encontrada');

  // `entry.candidateId` viene del cliente sin validar — sin este chequeo, un
  // usuario podría marcar asistencia sobre el id de una candidata de OTRA
  // empresa (o de otro proyecto) con solo adivinarlo.
  const validCandidates = await prisma.candidate.findMany({
    where: { companyId, projectId: session.projectId, id: { in: data.entries.map((e) => e.candidateId) } },
    select: { id: true },
  });
  const validIds = new Set(validCandidates.map((c) => c.id));
  const invalidEntry = data.entries.find((e) => !validIds.has(e.candidateId));
  if (invalidEntry) throw new Error('Una o más candidatas no pertenecen a este proyecto');

  await prisma.$transaction(
    data.entries.map((entry) =>
      prisma.candidateAttendance.upsert({
        where: { sessionId_candidateId: { sessionId, candidateId: entry.candidateId } },
        create: {
          companyId,
          sessionId,
          candidateId: entry.candidateId,
          activityType: session.activityType,
          activityDate: session.date,
          attended: entry.attended,
          notes: entry.notes || undefined,
        },
        update: {
          attended: entry.attended,
          notes: entry.notes || undefined,
        },
      })
    )
  );
}
