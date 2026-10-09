import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { dayToDate } from '@/lib/academy/billing';
import { addDays, expandWeekly } from '@/lib/academy/calendar';
import type { SessionInput, SessionScope, SessionUpdateInput } from '../schema';
import { AcademyError } from './academy.service';

/**
 * Calendario de clases de la academia. Una clase es un grupo, un día y una
 * franja horaria; "pasar lista" de una clase es la lista de ese grupo en esa
 * fecha (`AcademyAttendance`), así que la asistencia no se duplica aquí: el
 * calendario solo la cuenta para mostrar qué clases ya tienen lista.
 *
 * Toda consulta lleva `companyId`; el grupo y los ids que llegan del cliente se
 * verifican contra la empresa antes de usarlos.
 */

export interface SessionRow {
  id: string;
  groupId: string;
  groupName: string;
  /** "YYYY-MM-DD". */
  date: string;
  startTime: string;
  endTime: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  isCancelled: boolean;
  seriesId: string | null;
  /** Alumnas activas del grupo. */
  expected: number;
  /** De ellas, con una marca de asistencia ese día. */
  marked: number;
  /** Presentes y atrasadas. */
  present: number;
  absent: number;
  /** Materiales atados a esta clase. */
  materials: number;
}

interface SessionRecord {
  id: string;
  groupId: string;
  date: Date;
  startTime: string;
  endTime: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  isCancelled: boolean;
  seriesId: string | null;
  group: { name: string };
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Suma a cada clase cuántas alumnas esperaba, cuántas marcaron y cuánto material tiene. */
async function decorate(companyId: string, sessions: SessionRecord[]): Promise<SessionRow[]> {
  if (sessions.length === 0) return [];
  const groupIds = [...new Set(sessions.map((s) => s.groupId))];
  const times = sessions.map((s) => s.date.getTime());
  const minDate = new Date(Math.min(...times));
  const maxDate = new Date(Math.max(...times));

  const [students, marks, materials] = await Promise.all([
    prisma.academyStudent.groupBy({ by: ['groupId'], where: { companyId, isActive: true, groupId: { in: groupIds } }, _count: { _all: true } }),
    prisma.academyAttendance.findMany({
      where: { companyId, date: { gte: minDate, lte: maxDate }, student: { isActive: true, groupId: { in: groupIds } } },
      select: { date: true, status: true, student: { select: { groupId: true } } },
    }),
    prisma.academyMaterial.groupBy({ by: ['sessionId'], where: { companyId, sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } }),
  ]);

  const expectedByGroup = new Map(students.map((g) => [g.groupId, g._count._all]));
  const tally = new Map<string, { marked: number; present: number; absent: number }>();
  for (const mark of marks) {
    const key = `${mark.student.groupId}|${isoDay(mark.date)}`;
    const entry = tally.get(key) ?? { marked: 0, present: 0, absent: 0 };
    entry.marked += 1;
    if (mark.status === 'PRESENT' || mark.status === 'LATE') entry.present += 1;
    if (mark.status === 'ABSENT') entry.absent += 1;
    tally.set(key, entry);
  }
  const materialsBySession = new Map(materials.map((m) => [m.sessionId, m._count._all]));

  return sessions.map((s) => {
    const day = isoDay(s.date);
    const counts = tally.get(`${s.groupId}|${day}`) ?? { marked: 0, present: 0, absent: 0 };
    return {
      id: s.id,
      groupId: s.groupId,
      groupName: s.group.name,
      date: day,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.title,
      location: s.location,
      notes: s.notes,
      isCancelled: s.isCancelled,
      seriesId: s.seriesId,
      expected: expectedByGroup.get(s.groupId) ?? 0,
      marked: counts.marked,
      present: counts.present,
      absent: counts.absent,
      materials: materialsBySession.get(s.id) ?? 0,
    };
  });
}

const sessionSelect = {
  id: true,
  groupId: true,
  date: true,
  startTime: true,
  endTime: true,
  title: true,
  location: true,
  notes: true,
  isCancelled: true,
  seriesId: true,
  group: { select: { name: true } },
} as const;

/** Clases entre dos días (ambos incluidos), en orden. */
export async function listSessions(companyId: string, from: string, to: string): Promise<SessionRow[]> {
  const sessions = await prisma.academySession.findMany({
    where: { companyId, date: { gte: dayToDate(from), lte: dayToDate(to) } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    select: sessionSelect,
    take: 600,
  });
  return decorate(companyId, sessions);
}

export interface CalendarSummary {
  /** Clases de hoy. */
  today: SessionRow[];
  /** Las próximas clases (desde mañana). */
  upcoming: SessionRow[];
  /** Clases pasadas, sin cancelar, a las que les falta pasar lista (las más recientes primero). */
  pendingRoll: SessionRow[];
  activeStudents: number;
  activeGroups: number;
}

const PENDING_ROLL_LOOKBACK_DAYS = 45;

/** Lo que se ve al abrir el calendario: hoy, lo que viene y las listas atrasadas. */
export async function getCalendarSummary(companyId: string, today: string): Promise<CalendarSummary> {
  const [todayRows, upcomingRows, pastRows, activeStudents, activeGroups] = await Promise.all([
    prisma.academySession.findMany({ where: { companyId, date: dayToDate(today) }, orderBy: { startTime: 'asc' }, select: sessionSelect, take: 50 }),
    prisma.academySession.findMany({
      where: { companyId, isCancelled: false, date: { gt: dayToDate(today) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      select: sessionSelect,
      take: 6,
    }),
    prisma.academySession.findMany({
      where: { companyId, isCancelled: false, date: { lt: dayToDate(today), gte: dayToDate(addDays(today, -PENDING_ROLL_LOOKBACK_DAYS)) } },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      select: sessionSelect,
      take: 80,
    }),
    prisma.academyStudent.count({ where: { companyId, isActive: true } }),
    prisma.academyGroup.count({ where: { companyId, isActive: true } }),
  ]);
  const [todaySessions, upcoming, past] = await Promise.all([decorate(companyId, todayRows), decorate(companyId, upcomingRows), decorate(companyId, pastRows)]);
  return {
    today: todaySessions,
    upcoming,
    pendingRoll: past.filter((s) => s.expected > 0 && s.marked < s.expected).slice(0, 6),
    activeStudents,
    activeGroups,
  };
}

export async function getSessionRow(companyId: string, id: string): Promise<SessionRow | null> {
  const record = await prisma.academySession.findFirst({ where: { id, companyId }, select: sessionSelect });
  if (!record) return null;
  return (await decorate(companyId, [record]))[0] ?? null;
}

const DUPLICATE_SESSION = 'Ese grupo ya tiene una clase ese día. Edítala o elige otra fecha';

export interface CreateSessionsResult {
  /** Clases nuevas en el calendario. */
  created: number;
  /** Fechas que ya tenían clase de ese grupo y se dejaron como estaban. */
  skipped: number;
  /** Primera clase creada (o la que ya existía), para abrirla. */
  firstSessionId: string | null;
}

export async function createSessions(companyId: string, data: SessionInput): Promise<CreateSessionsResult> {
  const group = await prisma.academyGroup.findFirst({ where: { id: data.groupId, companyId }, select: { isActive: true } });
  if (!group) throw new AcademyError('El grupo seleccionado no existe');
  if (!group.isActive) throw new AcademyError('Ese grupo está desactivado. Reactívalo para programar clases');

  const dates = expandWeekly(data.date, data.repeat ?? null);
  const single = dates.length === 1;
  const seriesId = single ? null : randomUUID();
  const created = await prisma.academySession.createMany({
    data: dates.map((day) => ({
      companyId,
      groupId: data.groupId,
      date: dayToDate(day),
      startTime: data.startTime,
      endTime: data.endTime,
      // El tema y las notas son de cada clase: una serie parte sin ellos.
      title: single ? (data.title ?? null) : null,
      location: data.location ?? null,
      notes: single ? (data.notes ?? null) : null,
      seriesId,
    })),
    skipDuplicates: true,
  });
  if (single && created.count === 0) throw new AcademyError(DUPLICATE_SESSION);

  const first = await prisma.academySession.findFirst({ where: { companyId, groupId: data.groupId, date: dayToDate(dates[0]!) }, select: { id: true } });
  return { created: created.count, skipped: dates.length - created.count, firstSessionId: first?.id ?? null };
}

export async function updateSession(companyId: string, id: string, data: SessionUpdateInput): Promise<{ updated: number }> {
  const current = await prisma.academySession.findFirst({ where: { id, companyId }, select: { groupId: true, date: true, seriesId: true } });
  if (!current) throw new AcademyError('La clase no existe');

  const newDate = dayToDate(data.date);
  if (newDate.getTime() !== current.date.getTime()) {
    // La asistencia es del día: cambiar el día de una clase con lista dejaría las marcas en el aire.
    const marks = await prisma.academyAttendance.count({ where: { companyId, date: current.date, student: { groupId: current.groupId } } });
    if (marks > 0) throw new AcademyError('Ya se pasó lista en esta clase, así que no se puede cambiar el día. Cancélala y programa otra');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      let updated = 0;
      if (data.scope === 'FOLLOWING' && current.seriesId) {
        const rest = await tx.academySession.updateMany({
          where: { companyId, seriesId: current.seriesId, date: { gt: current.date } },
          data: { startTime: data.startTime, endTime: data.endTime, location: data.location ?? null },
        });
        updated += rest.count;
      }
      const own = await tx.academySession.updateMany({
        where: { id, companyId },
        data: { date: newDate, startTime: data.startTime, endTime: data.endTime, title: data.title ?? null, location: data.location ?? null, notes: data.notes ?? null },
      });
      return { updated: updated + own.count };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AcademyError(DUPLICATE_SESSION);
    throw error;
  }
}

export async function setSessionCancelled(companyId: string, id: string, isCancelled: boolean): Promise<void> {
  const updated = await prisma.academySession.updateMany({ where: { id, companyId }, data: { isCancelled } });
  if (updated.count === 0) throw new AcademyError('La clase no existe');
}

/**
 * Borra la clase (y, con `FOLLOWING`, las siguientes de su serie). La lista ya
 * pasada no se toca: sigue en el historial de cada alumna. El material se queda
 * en el grupo.
 */
export async function deleteSession(companyId: string, id: string, scope: SessionScope): Promise<{ deleted: number }> {
  const current = await prisma.academySession.findFirst({ where: { id, companyId }, select: { date: true, seriesId: true } });
  if (!current) throw new AcademyError('La clase no existe');
  const where = scope === 'FOLLOWING' && current.seriesId ? { companyId, seriesId: current.seriesId, date: { gte: current.date } } : { id, companyId };
  const result = await prisma.academySession.deleteMany({ where });
  return { deleted: result.count };
}
