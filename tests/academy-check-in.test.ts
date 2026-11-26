/**
 * Asistencia con QR de la academia:
 *  - el QR solo sirve para la clase de HOY (día de Santiago) y vence antes de medianoche;
 *  - solo llena una marca vacía: nunca pisa lo que marcó la profesora;
 *  - desde la hora que elige la profesora, quien escanea queda «Atrasada»;
 *  - la empresa, el grupo y el día salen del token; toda consulta lleva `companyId`;
 *  - un RUT de otro grupo responde igual que uno inexistente;
 *  - con aprobación automática, la inscripción pública crea la ficha en la misma transacción.
 */

const mockPrisma = {
  academyGroup: { findFirst: jest.fn() },
  academySession: { findFirst: jest.fn() },
  academyCheckInLink: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  academyStudent: { findFirst: jest.fn(), create: jest.fn() },
  academyAttendance: { createMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  academyApplication: { findFirst: jest.fn(), create: jest.fn() },
  companySettings: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

import {
  CHECK_IN_TOKEN_PATTERN,
  checkInExpiry,
  checkInState,
  checkInStatus,
  classDayLabel,
  decideCheckIn,
  firstName,
  isCheckInDuration,
  rutLookupKeys,
  santiagoIsoDay,
  santiagoTimeLabel,
} from '@/lib/academy/check-in';
import { academySlugProblem } from '@/lib/academy/site';
import { checkInLateSchema, checkInOpenSchema, publicCheckInSchema } from '@/modules/academy/schema';
import { AcademyError } from '@/modules/academy/services/academy.service';
import { closeCheckIn, getClassStartTime, openCheckIn, resolveCheckIn, setCheckInLateAfter, submitCheckIn, type PublicCheckInInfo } from '@/modules/academy/services/academy-check-in.service';
import { submitApplication } from '@/modules/academy/services/academy-enrollment.service';

const CO = 'emp-1';
/** 26-nov-2026 a las 10:00 en Santiago (UTC-3 en verano). */
const NOW = new Date('2026-11-26T13:00:00Z');
const TODAY = '2026-11-26';
const TOKEN = 'a'.repeat(48);

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
});

describe('reglas puras', () => {
  it('el día y la hora son los de Santiago, no los del servidor', () => {
    // 01:30 UTC del 27 = 22:30 del 26 en Santiago.
    expect(santiagoIsoDay(new Date('2026-11-27T01:30:00Z'))).toBe('2026-11-26');
    expect(santiagoTimeLabel(new Date('2026-11-27T01:30:00Z'))).toBe('22:30');
    expect(classDayLabel('2026-11-26')).toBe('jueves 26 de noviembre');
  });

  it('vence a la hora elegida, pero nunca pasada la medianoche de Santiago', () => {
    expect(checkInExpiry(NOW, 60).toISOString()).toBe('2026-11-26T14:00:00.000Z');
    const late = new Date('2026-11-27T02:30:00Z'); // 23:30 en Santiago
    const capped = checkInExpiry(late, 180);
    expect(santiagoIsoDay(capped)).toBe('2026-11-26');
    expect(capped.getTime()).toBeGreaterThan(late.getTime());
  });

  it('estado del QR: cerrado manda sobre vencido', () => {
    const future = new Date(NOW.getTime() + 60_000);
    const past = new Date(NOW.getTime() - 60_000);
    expect(checkInState({ expiresAt: future, closedAt: null }, NOW)).toBe('OPEN');
    expect(checkInState({ expiresAt: past, closedAt: null }, NOW)).toBe('EXPIRED');
    expect(checkInState({ expiresAt: future, closedAt: NOW }, NOW)).toBe('CLOSED');
  });

  it('el QR solo llena una marca vacía', () => {
    expect(decideCheckIn(null)).toBe('CREATE');
    expect(decideCheckIn('PRESENT')).toBe('ALREADY_PRESENT');
    expect(decideCheckIn('LATE')).toBe('ALREADY_PRESENT');
    expect(decideCheckIn('ABSENT')).toBe('MARKED_BY_TEACHER');
    expect(decideCheckIn('JUSTIFIED')).toBe('MARKED_BY_TEACHER');
  });

  it('atrasada desde la hora elegida (esa hora incluida), con la hora de Santiago', () => {
    // NOW = 10:00 en Santiago.
    expect(checkInStatus(NOW, '10:00')).toBe('LATE');
    expect(checkInStatus(NOW, '10:01')).toBe('PRESENT');
    expect(checkInStatus(NOW, '09:59')).toBe('LATE');
    expect(checkInStatus(new Date('2026-11-26T13:09:59Z'), '10:10')).toBe('PRESENT');
    expect(checkInStatus(new Date('2026-11-26T13:10:00Z'), '10:10')).toBe('LATE');
    // Sin hora, o una mal formada, nadie queda atrasada.
    expect(checkInStatus(NOW, null)).toBe('PRESENT');
    expect(checkInStatus(NOW, '25:00')).toBe('PRESENT');
  });

  it('la hora de atraso: vacía = ninguna; mal escrita se rechaza; al abrir, sin ella se deja como estaba', () => {
    expect(checkInLateSchema.parse({ groupId: 'g1', date: TODAY, lateAfter: '' }).lateAfter).toBeNull();
    expect(checkInLateSchema.parse({ groupId: 'g1', date: TODAY, lateAfter: null }).lateAfter).toBeNull();
    expect(checkInLateSchema.parse({ groupId: 'g1', date: TODAY, lateAfter: '10:15' }).lateAfter).toBe('10:15');
    expect(checkInLateSchema.safeParse({ groupId: 'g1', date: TODAY, lateAfter: '10.15' }).success).toBe(false);
    expect(checkInOpenSchema.parse({ groupId: 'g1', date: TODAY }).lateAfter).toBeUndefined();
    expect(checkInOpenSchema.parse({ groupId: 'g1', date: TODAY, lateAfter: '' }).lateAfter).toBeNull();
  });

  it('busca el RUT con y sin ceros a la izquierda, y muestra solo el primer nombre', () => {
    expect(rutLookupKeys('09.876.543-2')).toEqual(['098765432', '98765432']);
    expect(rutLookupKeys('12.345.678-5')).toEqual(['123456785']);
    expect(firstName('  Camila Andrea Rojas Soto ')).toBe('Camila');
  });

  it('duraciones de lista cerrada y token con forma fija', () => {
    expect(isCheckInDuration(60)).toBe(true);
    expect(isCheckInDuration(45)).toBe(false);
    expect(checkInOpenSchema.safeParse({ groupId: 'g1', date: TODAY, minutes: 45 }).success).toBe(false);
    expect(checkInOpenSchema.safeParse({ groupId: 'g1', date: TODAY }).success).toBe(true);
    expect(CHECK_IN_TOKEN_PATTERN.test(TOKEN)).toBe(true);
    expect(CHECK_IN_TOKEN_PATTERN.test('../x')).toBe(false);
  });

  it('la página pública solo acepta un RUT válido', () => {
    expect(publicCheckInSchema.safeParse({ rut: '12.345.678-5' }).success).toBe(true);
    expect(publicCheckInSchema.safeParse({ rut: '12.345.678-9' }).success).toBe(false);
    expect(publicCheckInSchema.safeParse({ rut: '' }).success).toBe(false);
  });

  it('la dirección «asistencia» queda reservada para el sistema', () => {
    expect(academySlugProblem('asistencia')).not.toBeNull();
    expect(academySlugProblem('inscripcion')).not.toBeNull();
  });
});

describe('abrir y cerrar el QR (panel)', () => {
  const link = { token: TOKEN, date: new Date(`${TODAY}T12:00:00Z`), expiresAt: new Date('2026-11-26T14:00:00Z'), closedAt: null, lateAfter: null };

  it('solo para la clase de hoy', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ name: 'Juvenil', isActive: true });
    await expect(openCheckIn(CO, 'u1', { groupId: 'g1', date: '2026-11-25', minutes: 60, renew: false }, NOW)).rejects.toBeInstanceOf(AcademyError);
    expect(mockPrisma.academyCheckInLink.create).not.toHaveBeenCalled();
  });

  it('un grupo de otra empresa no existe', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue(null);
    await expect(openCheckIn(CO, 'u1', { groupId: 'g-otra', date: TODAY, minutes: 60, renew: false }, NOW)).rejects.toThrow('no existe');
    expect(mockPrisma.academyGroup.findFirst.mock.calls[0]![0].where).toEqual({ id: 'g-otra', companyId: CO });
  });

  it('crea el QR la primera vez, con la empresa de la sesión', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ name: 'Juvenil', isActive: true });
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyCheckInLink.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(link);
    const view = await openCheckIn(CO, 'u1', { groupId: 'g1', date: TODAY, minutes: 60, renew: false, lateAfter: '10:10' }, NOW);
    expect(view.state).toBe('OPEN');
    const data = mockPrisma.academyCheckInLink.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ companyId: CO, groupId: 'g1', createdById: 'u1', lateAfter: '10:10' });
    expect(CHECK_IN_TOKEN_PATTERN.test(data.token)).toBe(true);
  });

  it('reabrir conserva el QR; «QR nuevo» lo cambia', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ name: 'Juvenil', isActive: true });
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyCheckInLink.findFirst.mockResolvedValue({ id: 'l1', ...link });
    await openCheckIn(CO, 'u1', { groupId: 'g1', date: TODAY, minutes: 30, renew: false }, NOW);
    const reopened = mockPrisma.academyCheckInLink.updateMany.mock.calls[0]![0];
    expect(reopened.where).toEqual({ id: 'l1', companyId: CO });
    expect(reopened.data.token).toBeUndefined();
    expect(reopened.data.closedAt).toBeNull();
    // Extender sin hora de atraso no la borra.
    expect('lateAfter' in reopened.data).toBe(false);

    await openCheckIn(CO, 'u1', { groupId: 'g1', date: TODAY, minutes: 30, renew: true }, NOW);
    expect(CHECK_IN_TOKEN_PATTERN.test(mockPrisma.academyCheckInLink.updateMany.mock.calls[1]![0].data.token)).toBe(true);
  });

  it('una clase cancelada no abre QR', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ name: 'Juvenil', isActive: true });
    mockPrisma.academySession.findFirst.mockResolvedValue({ id: 's1' });
    await expect(openCheckIn(CO, 'u1', { groupId: 'g1', date: TODAY, minutes: 60, renew: false }, NOW)).rejects.toThrow('cancelada');
  });

  it('cambiar la hora de atraso: filtra por empresa y exige un QR abierto antes', async () => {
    mockPrisma.academyCheckInLink.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.academyCheckInLink.findFirst.mockResolvedValue({ ...link, lateAfter: '10:15' });
    expect((await setCheckInLateAfter(CO, 'g1', TODAY, '10:15', NOW)).lateAfter).toBe('10:15');
    const call = mockPrisma.academyCheckInLink.updateMany.mock.calls[0]![0];
    expect(call.where).toMatchObject({ companyId: CO, groupId: 'g1' });
    expect(call.data).toEqual({ lateAfter: '10:15' });

    mockPrisma.academyCheckInLink.updateMany.mockResolvedValue({ count: 0 });
    await expect(setCheckInLateAfter(CO, 'g1', TODAY, null, NOW)).rejects.toThrow('Primero abre');
  });

  it('la hora de inicio de la clase del calendario se ofrece como hora de atraso', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue({ startTime: '10:00' });
    expect(await getClassStartTime(CO, 'g1', TODAY)).toBe('10:00');
    expect(mockPrisma.academySession.findFirst.mock.calls[0]![0].where).toMatchObject({ companyId: CO, groupId: 'g1', isCancelled: false });
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    expect(await getClassStartTime(CO, 'g1', TODAY)).toBeNull();
  });

  it('cerrar filtra por empresa', async () => {
    mockPrisma.academyCheckInLink.findFirst.mockResolvedValue({ ...link, closedAt: NOW });
    const view = await closeCheckIn(CO, 'g1', TODAY, NOW);
    expect(view?.state).toBe('CLOSED');
    expect(mockPrisma.academyCheckInLink.updateMany.mock.calls[0]![0].where).toMatchObject({ companyId: CO, groupId: 'g1', closedAt: null });
  });
});

describe('página pública', () => {
  const stored = {
    id: 'l1',
    companyId: CO,
    groupId: 'g1',
    date: new Date(`${TODAY}T12:00:00Z`),
    expiresAt: new Date('2026-11-26T14:00:00Z'),
    closedAt: null,
    lateAfter: '10:10',
    group: { name: 'Juvenil', isActive: true, companyId: CO },
    company: { businessName: 'Academia CR', status: 'ACTIVE', features: { hasAcademy: true } },
  };
  const info: PublicCheckInInfo = { linkId: 'l1', companyId: CO, companyName: 'Academia CR', groupId: 'g1', groupName: 'Juvenil', date: TODAY, expiresAt: stored.expiresAt, lateAfter: null, state: 'OPEN' };

  it('la empresa y el grupo salen del token', async () => {
    mockPrisma.academyCheckInLink.findUnique.mockResolvedValue(stored);
    const resolved = await resolveCheckIn(TOKEN, NOW);
    expect(resolved).toMatchObject({ companyId: CO, groupId: 'g1', groupName: 'Juvenil', state: 'OPEN', lateAfter: '10:10' });
  });

  it('token mal formado, empresa suspendida o sin el módulo: no existe', async () => {
    expect(await resolveCheckIn('nope', NOW)).toBeNull();
    expect(mockPrisma.academyCheckInLink.findUnique).not.toHaveBeenCalled();
    mockPrisma.academyCheckInLink.findUnique.mockResolvedValue({ ...stored, company: { ...stored.company, status: 'SUSPENDED' } });
    expect(await resolveCheckIn(TOKEN, NOW)).toBeNull();
    mockPrisma.academyCheckInLink.findUnique.mockResolvedValue({ ...stored, company: { ...stored.company, features: { hasAcademy: false } } });
    expect(await resolveCheckIn(TOKEN, NOW)).toBeNull();
  });

  it('un QR de ayer ya no sirve aunque su hora de vencimiento dijera otra cosa', async () => {
    mockPrisma.academyCheckInLink.findUnique.mockResolvedValue({ ...stored, date: new Date('2026-11-25T12:00:00Z'), expiresAt: new Date('2026-11-27T00:00:00Z') });
    expect((await resolveCheckIn(TOKEN, NOW))?.state).toBe('EXPIRED');
  });

  it('marca presente a una alumna activa del grupo, con la hora del QR', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyStudent.findFirst.mockResolvedValue({ id: 'st1', fullName: 'Camila Rojas' });
    mockPrisma.academyAttendance.createMany.mockResolvedValue({ count: 1 });
    const outcome = await submitCheckIn(info, '12.345.678-5', NOW);
    expect(outcome).toEqual({ kind: 'CREATED', firstName: 'Camila', at: '10:00', status: 'PRESENT' });
    expect(mockPrisma.academyStudent.findFirst.mock.calls[0]![0].where).toMatchObject({ companyId: CO, groupId: 'g1', isActive: true, rutClean: { in: ['123456785'] } });
    const created = mockPrisma.academyAttendance.createMany.mock.calls[0]![0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data[0]).toMatchObject({ companyId: CO, studentId: 'st1', status: 'PRESENT', selfCheckInAt: NOW });
  });

  it('desde la hora de atraso queda «Atrasada»; antes, «Presente»', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyStudent.findFirst.mockResolvedValue({ id: 'st1', fullName: 'Camila Rojas' });
    mockPrisma.academyAttendance.createMany.mockResolvedValue({ count: 1 });
    const late = await submitCheckIn({ ...info, lateAfter: '09:45' }, '12.345.678-5', NOW);
    expect(late).toEqual({ kind: 'CREATED', firstName: 'Camila', at: '10:00', status: 'LATE' });
    expect(mockPrisma.academyAttendance.createMany.mock.calls[0]![0].data[0].status).toBe('LATE');

    const onTime = await submitCheckIn({ ...info, lateAfter: '10:15' }, '12.345.678-5', NOW);
    expect(onTime).toMatchObject({ kind: 'CREATED', status: 'PRESENT' });
    expect(mockPrisma.academyAttendance.createMany.mock.calls[1]![0].data[0].status).toBe('PRESENT');
  });

  it('no pisa lo que marcó la profesora, pero deja constancia de que escaneó', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyStudent.findFirst.mockResolvedValue({ id: 'st1', fullName: 'Camila Rojas' });
    mockPrisma.academyAttendance.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.academyAttendance.findFirst.mockResolvedValue({ status: 'ABSENT' });
    const outcome = await submitCheckIn(info, '12.345.678-5', NOW);
    expect(outcome).toEqual({ kind: 'MARKED_BY_TEACHER', firstName: 'Camila' });
    const update = mockPrisma.academyAttendance.updateMany.mock.calls[0]![0];
    expect(update.where).toMatchObject({ companyId: CO, studentId: 'st1', selfCheckInAt: null });
    expect(update.data).toEqual({ selfCheckInAt: NOW });
  });

  it('dos escaneos de la misma alumna dejan una sola marca', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyStudent.findFirst.mockResolvedValue({ id: 'st1', fullName: 'Camila Rojas' });
    mockPrisma.academyAttendance.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.academyAttendance.findFirst.mockResolvedValue({ status: 'PRESENT' });
    expect(await submitCheckIn(info, '12.345.678-5', NOW)).toEqual({ kind: 'ALREADY_PRESENT', firstName: 'Camila' });
  });

  it('un RUT que no está en el grupo no marca nada', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    mockPrisma.academyStudent.findFirst.mockResolvedValue(null);
    expect(await submitCheckIn(info, '12.345.678-5', NOW)).toEqual({ kind: 'NOT_FOUND' });
    expect(mockPrisma.academyAttendance.createMany).not.toHaveBeenCalled();
  });

  it('con el QR cerrado o la clase cancelada no se marca', async () => {
    expect(await submitCheckIn({ ...info, state: 'CLOSED' }, '12.345.678-5', NOW)).toEqual({ kind: 'CLOSED' });
    mockPrisma.academySession.findFirst.mockResolvedValue({ id: 's1' });
    expect(await submitCheckIn(info, '12.345.678-5', NOW)).toEqual({ kind: 'CANCELLED' });
    expect(mockPrisma.academyStudent.findFirst).not.toHaveBeenCalled();
  });
});

describe('inscripción pública con aprobación automática', () => {
  const input = {
    fullName: 'Camila Rojas Soto',
    rut: '12.345.678-5',
    birthDate: '2000-05-10',
    phone: '+56 9 1234 5678',
    photoConsent: true,
    acceptPrivacy: true as const,
  } as Parameters<typeof submitApplication>[1];

  it('por defecto queda pendiente y no crea ficha', async () => {
    mockPrisma.academyStudent.findFirst.mockResolvedValue(null);
    mockPrisma.academyApplication.findFirst.mockResolvedValue(null);
    mockPrisma.companySettings.findUnique.mockResolvedValue({ academyAutoApproveEnrollments: false });
    mockPrisma.academyApplication.create.mockResolvedValue({ id: 'a1' });
    expect(await submitApplication({ companyId: CO, companyName: 'X' }, input, NOW)).toEqual({ created: true, id: 'a1', studentId: null });
    expect(mockPrisma.academyStudent.create).not.toHaveBeenCalled();
    expect(mockPrisma.academyApplication.create.mock.calls[0]![0].data.status).toBeUndefined();
  });

  it('activada, crea la ficha SIN grupo (mes en curso de Santiago) y la inscripción aprobada', async () => {
    mockPrisma.academyStudent.findFirst.mockResolvedValue(null);
    mockPrisma.academyApplication.findFirst.mockResolvedValue(null);
    mockPrisma.academyGroup.findFirst.mockResolvedValueOnce({ id: 'g1' }).mockResolvedValueOnce({ name: 'Juvenil' });
    mockPrisma.companySettings.findUnique.mockResolvedValue({ academyAutoApproveEnrollments: true });
    mockPrisma.academyStudent.create.mockResolvedValue({ id: 'st1' });
    mockPrisma.academyApplication.create.mockResolvedValue({ id: 'a1' });
    const result = await submitApplication({ companyId: CO, companyName: 'X' }, { ...input, preferredGroupId: 'g1' }, NOW);
    expect(result).toEqual({ created: true, id: 'a1', studentId: 'st1' });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // El link es público: sin grupo no recibe el material ni entra a una lista hasta que el equipo la asigne.
    const student = mockPrisma.academyStudent.create.mock.calls[0]![0].data;
    expect(student).toMatchObject({ companyId: CO, groupId: null, rutClean: '123456785', startMonth: new Date('2026-11-01T12:00:00Z') });
    expect(student.notes).toContain('Grupo de interés al inscribirse: Juvenil');
    expect(mockPrisma.academyGroup.findFirst.mock.calls[1]![0].where).toEqual({ id: 'g1', companyId: CO });
    expect(mockPrisma.academyApplication.create.mock.calls[0]![0].data).toMatchObject({ companyId: CO, status: 'APPROVED', studentId: 'st1', preferredGroupId: 'g1' });
  });

  it('quien ya es alumna no se duplica', async () => {
    mockPrisma.academyStudent.findFirst.mockResolvedValue({ id: 'st0' });
    expect(await submitApplication({ companyId: CO, companyName: 'X' }, input, NOW)).toEqual({ created: false, id: null, studentId: null });
    expect(mockPrisma.academyStudent.create).not.toHaveBeenCalled();
  });
});
