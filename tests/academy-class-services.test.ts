/**
 * Servicios del calendario y del material de la academia:
 *  - toda consulta lleva `companyId` (aislamiento entre empresas);
 *  - una clase por grupo y día, y las series se crean sin pisar lo que ya existe;
 *  - el material solo se ata a un grupo y a una clase de la misma empresa;
 *  - el envío por correo no se duplica con un doble clic y solo cuenta lo que salió de verdad.
 */

const mockPrisma = {
  academyGroup: { findFirst: jest.fn() },
  academySession: { findFirst: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
  academyAttendance: { findMany: jest.fn(), count: jest.fn() },
  academyStudent: { findMany: jest.fn(), groupBy: jest.fn(), count: jest.fn() },
  academyMaterial: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(), groupBy: jest.fn() },
  academySite: { findUnique: jest.fn() },
  company: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
const mockSendEmail = jest.fn();
jest.mock('@/lib/email/mailer', () => ({ sendEmail: (input: unknown) => mockSendEmail(input) }));
const mockDel = jest.fn();
jest.mock('@/lib/storage/blob', () => ({ del: (url: unknown) => mockDel(url) }));

import { AcademyError, saveAttendance } from '@/modules/academy/services/academy.service';
import { createSessions, deleteSession, listSessions, updateSession } from '@/modules/academy/services/academy-calendar.service';
import { createFileMaterial, deleteMaterial, getRecipients, sendMaterial } from '@/modules/academy/services/academy-material.service';

const CO = 'emp-1';

/** Los campos opcionales del esquema salen como `undefined`, no ausentes. */
const optional = { title: undefined, location: undefined, notes: undefined };
const newSession = (over: Record<string, unknown> = {}) => ({ groupId: 'g1', date: '2026-10-10', startTime: '10:00', endTime: '12:00', ...optional, ...over }) as Parameters<typeof createSessions>[1];
const sessionEdit = (over: Record<string, unknown> = {}) => ({ date: '2026-10-10', startTime: '10:00', endTime: '12:00', scope: 'ONE', ...optional, ...over }) as Parameters<typeof updateSession>[2];

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.academyStudent.groupBy.mockResolvedValue([]);
  mockPrisma.academyAttendance.findMany.mockResolvedValue([]);
  mockPrisma.academyMaterial.groupBy.mockResolvedValue([]);
});

describe('calendario: aislamiento entre empresas', () => {
  it('listar clases filtra por empresa en cada consulta', async () => {
    mockPrisma.academySession.findMany.mockResolvedValue([
      { id: 's1', groupId: 'g1', date: new Date('2026-10-10T12:00:00Z'), startTime: '10:00', endTime: '12:00', title: null, location: null, notes: null, isCancelled: false, seriesId: null, group: { name: 'Juvenil' } },
    ]);
    mockPrisma.academyStudent.groupBy.mockResolvedValue([{ groupId: 'g1', _count: { _all: 2 } }]);
    mockPrisma.academyAttendance.findMany.mockResolvedValue([
      { date: new Date('2026-10-10T12:00:00Z'), status: 'PRESENT', student: { groupId: 'g1' } },
      { date: new Date('2026-10-10T12:00:00Z'), status: 'ABSENT', student: { groupId: 'g1' } },
    ]);
    const rows = await listSessions(CO, '2026-10-01', '2026-10-31');
    expect(rows[0]).toMatchObject({ groupName: 'Juvenil', date: '2026-10-10', expected: 2, marked: 2, present: 1, absent: 1 });
    for (const call of [mockPrisma.academySession.findMany, mockPrisma.academyStudent.groupBy, mockPrisma.academyAttendance.findMany, mockPrisma.academyMaterial.groupBy]) {
      expect(call.mock.calls[0]![0].where.companyId).toBe(CO);
    }
  });

  it('no se puede programar en un grupo de otra empresa ni en uno desactivado', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValueOnce(null);
    await expect(createSessions(CO, newSession({ groupId: 'ajeno' }))).rejects.toThrow('no existe');
    expect(mockPrisma.academyGroup.findFirst.mock.calls[0]![0].where).toEqual({ id: 'ajeno', companyId: CO });
    mockPrisma.academyGroup.findFirst.mockResolvedValueOnce({ isActive: false });
    await expect(createSessions(CO, newSession())).rejects.toThrow('desactivado');
    expect(mockPrisma.academySession.createMany).not.toHaveBeenCalled();
  });

  it('editar y borrar buscan la clase dentro de la empresa', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(null);
    await expect(updateSession(CO, 'ajena', sessionEdit())).rejects.toThrow('no existe');
    await expect(deleteSession(CO, 'ajena', 'ONE')).rejects.toThrow('no existe');
    for (const call of mockPrisma.academySession.findFirst.mock.calls) expect(call[0].where).toEqual({ id: 'ajena', companyId: CO });
    expect(mockPrisma.academySession.deleteMany).not.toHaveBeenCalled();
  });
});

describe('programar clases', () => {
  beforeEach(() => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ isActive: true });
    mockPrisma.academySession.findFirst.mockResolvedValue({ id: 'primera' });
  });

  it('una clase suelta guarda su tema y notas', async () => {
    mockPrisma.academySession.createMany.mockResolvedValue({ count: 1 });
    const result = await createSessions(CO, newSession({ title: 'Postura', notes: 'Traer tacos' }));
    expect(result).toEqual({ created: 1, skipped: 0, firstSessionId: 'primera' });
    const { data } = mockPrisma.academySession.createMany.mock.calls[0]![0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ companyId: CO, groupId: 'g1', title: 'Postura', notes: 'Traer tacos', seriesId: null });
  });

  it('una clase que ya existe ese día avisa en vez de duplicarla', async () => {
    mockPrisma.academySession.createMany.mockResolvedValue({ count: 0 });
    await expect(createSessions(CO, newSession())).rejects.toThrow(AcademyError);
  });

  it('una serie semanal comparte seriesId, parte sin tema y cuenta las fechas que ya existían', async () => {
    mockPrisma.academySession.createMany.mockResolvedValue({ count: 3 });
    const result = await createSessions(CO, newSession({ title: 'No va en la serie', repeat: { weeks: 4, weekdays: [5] } }));
    expect(result).toMatchObject({ created: 3, skipped: 1 });
    const call = mockPrisma.academySession.createMany.mock.calls[0]![0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((d: { date: Date }) => d.date.toISOString().slice(0, 10))).toEqual(['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
    expect(new Set(call.data.map((d: { seriesId: string }) => d.seriesId)).size).toBe(1);
    expect(call.data[0].seriesId).toEqual(expect.any(String));
    expect(call.data.every((d: { title: string | null; companyId: string }) => d.title === null && d.companyId === CO)).toBe(true);
  });
});

describe('editar y borrar una clase', () => {
  const current = { groupId: 'g1', date: new Date('2026-10-10T12:00:00Z'), seriesId: 'serie-1' };

  it('no deja cambiar el día de una clase a la que ya se le pasó lista', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(current);
    mockPrisma.academyAttendance.count.mockResolvedValue(4);
    await expect(updateSession(CO, 's1', sessionEdit({ date: '2026-10-11' }))).rejects.toThrow('Ya se pasó lista');
    expect(mockPrisma.academySession.updateMany).not.toHaveBeenCalled();
  });

  it('cambiar la hora de las siguientes solo toca la misma serie y empresa, desde esta clase', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(current);
    mockPrisma.academySession.updateMany.mockResolvedValueOnce({ count: 5 }).mockResolvedValueOnce({ count: 1 });
    const result = await updateSession(CO, 's1', sessionEdit({ startTime: '11:00', endTime: '13:00', location: 'Sala 3', scope: 'FOLLOWING' }));
    expect(result).toEqual({ updated: 6 });
    const [rest, own] = mockPrisma.academySession.updateMany.mock.calls.map((c) => c[0]);
    expect(rest.where).toEqual({ companyId: CO, seriesId: 'serie-1', date: { gt: current.date } });
    expect(rest.data).toEqual({ startTime: '11:00', endTime: '13:00', location: 'Sala 3' });
    expect(own.where).toEqual({ id: 's1', companyId: CO });
  });

  it('borrar esta y las siguientes se limita a su serie y empresa', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue(current);
    mockPrisma.academySession.deleteMany.mockResolvedValue({ count: 7 });
    await deleteSession(CO, 's1', 'FOLLOWING');
    expect(mockPrisma.academySession.deleteMany.mock.calls[0]![0].where).toEqual({ companyId: CO, seriesId: 'serie-1', date: { gte: current.date } });
  });

  it('una clase sin serie se borra sola aunque se pida "las siguientes"', async () => {
    mockPrisma.academySession.findFirst.mockResolvedValue({ ...current, seriesId: null });
    mockPrisma.academySession.deleteMany.mockResolvedValue({ count: 1 });
    await deleteSession(CO, 's1', 'FOLLOWING');
    expect(mockPrisma.academySession.deleteMany.mock.calls[0]![0].where).toEqual({ id: 's1', companyId: CO });
  });
});

describe('pasar lista y calendario', () => {
  it('una clase cancelada no admite lista, aunque se intente por otro camino', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ id: 'g1' });
    mockPrisma.academySession.findFirst.mockResolvedValue({ id: 's1' });
    await expect(saveAttendance(CO, { groupId: 'g1', date: '2026-10-10', entries: [{ studentId: 'a1', status: 'PRESENT' }] })).rejects.toThrow('cancelada');
    expect(mockPrisma.academySession.findFirst.mock.calls[0]![0].where).toMatchObject({ companyId: CO, groupId: 'g1', isCancelled: true });
    expect(mockPrisma.academyStudent.findMany).not.toHaveBeenCalled();
  });
});

describe('material: a qué grupo y clase se ata', () => {
  it('quién recibiría el material: solo cantidades y nombres de quienes no tienen correo, nunca las direcciones', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValue({ id: 'g1' });
    mockPrisma.academyStudent.findMany.mockResolvedValue([
      { fullName: 'Ana', email: 'ana@x.cl', guardianEmail: 'mama@x.cl' },
      { fullName: 'Cata', email: null, guardianEmail: null },
    ]);
    const result = await getRecipients(CO, 'g1');
    expect(result).toEqual({ students: 2, emailCount: 2, withoutEmail: ['Cata'], truncated: false });
    expect(JSON.stringify(result)).not.toContain('@');
  });

  const file = { groupId: 'g1', sessionId: 's9', title: 'Clase 3', url: 'https://x/y.pdf', fileName: 'y.pdf', contentType: 'application/pdf', sizeBytes: 100 };

  it('rechaza un grupo o una clase que no son de la empresa', async () => {
    mockPrisma.academyGroup.findFirst.mockResolvedValueOnce(null);
    await expect(createFileMaterial(CO, 'u1', file)).rejects.toThrow('grupo');
    mockPrisma.academyGroup.findFirst.mockResolvedValueOnce({ id: 'g1' });
    mockPrisma.academySession.findFirst.mockResolvedValueOnce(null);
    await expect(createFileMaterial(CO, 'u1', file)).rejects.toThrow('clase');
    // La clase se busca en la empresa Y en el mismo grupo.
    expect(mockPrisma.academySession.findFirst.mock.calls[0]![0].where).toEqual({ id: 's9', companyId: CO, groupId: 'g1' });
    expect(mockPrisma.academyMaterial.create).not.toHaveBeenCalled();
  });

  it('borrar un material borra también su archivo, pero un enlace no toca nada externo', async () => {
    mockPrisma.academyMaterial.findFirst.mockResolvedValueOnce({ kind: 'FILE', url: 'https://x/y.pdf' });
    await deleteMaterial(CO, 'm1');
    expect(mockPrisma.academyMaterial.findFirst.mock.calls[0]![0].where).toEqual({ id: 'm1', companyId: CO });
    expect(mockPrisma.academyMaterial.deleteMany.mock.calls[0]![0].where).toEqual({ id: 'm1', companyId: CO });
    expect(mockDel).toHaveBeenCalledWith('https://x/y.pdf');

    mockDel.mockClear();
    mockPrisma.academyMaterial.findFirst.mockResolvedValueOnce({ kind: 'LINK', url: 'https://youtu.be/x' });
    await deleteMaterial(CO, 'm2');
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('si el almacenamiento falla al borrar, el material igual se elimina', async () => {
    mockPrisma.academyMaterial.findFirst.mockResolvedValueOnce({ kind: 'FILE', url: 'https://x/y.pdf' });
    mockDel.mockRejectedValueOnce(new Error('R2 caído'));
    await expect(deleteMaterial(CO, 'm1')).resolves.toBeUndefined();
    expect(mockPrisma.academyMaterial.deleteMany).toHaveBeenCalled();
  });
});

describe('enviar material por correo', () => {
  const material = {
    id: 'm1',
    groupId: 'g1',
    sessionId: null,
    kind: 'FILE',
    title: 'Postura',
    description: null,
    url: 'https://archivos.cl/postura.pdf',
    fileName: 'postura.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1000,
    createdAt: new Date('2026-10-05T12:00:00Z'),
    lastSentAt: null,
    lastSentCount: 0,
    group: { name: 'Juvenil' },
    session: null,
  };
  const students = [
    { fullName: 'Ana', email: 'ana@x.cl', guardianEmail: 'mama@x.cl' },
    { fullName: 'Bea', email: 'ANA@x.cl', guardianEmail: null },
    { fullName: 'Cata', email: null, guardianEmail: null },
  ];

  beforeEach(() => {
    mockPrisma.academyMaterial.findFirst.mockResolvedValue(material);
    mockPrisma.academyMaterial.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.academyStudent.findMany.mockResolvedValue(students);
    mockPrisma.academySite.findUnique.mockResolvedValue({ name: 'Academia CR' });
    mockPrisma.company.findUnique.mockResolvedValue({ businessName: 'CR SpA' });
    mockSendEmail.mockResolvedValue({ status: 'sent', provider: 'brevo' });
  });

  it('un material de otra empresa no existe', async () => {
    mockPrisma.academyMaterial.findFirst.mockResolvedValue(null);
    await expect(sendMaterial(CO, 'ajeno')).rejects.toThrow('no existe');
    expect(mockPrisma.academyMaterial.findFirst.mock.calls[0]![0].where).toEqual({ id: 'ajeno', companyId: CO });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('envía una vez a cada dirección distinta, por la cuenta de la empresa, y anota cuántas salieron', async () => {
    const result = await sendMaterial(CO, 'm1');
    expect(result).toEqual({ sent: 2, failed: 0, withoutEmail: ['Cata'], truncated: false });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(['ana@x.cl', 'mama@x.cl']);
    for (const [input] of mockSendEmail.mock.calls) {
      expect(input.companyId).toBe(CO);
      expect(input.subject).toBe('Academia CR · Material: Postura');
      expect(input.html).toContain('https://archivos.cl/postura.pdf');
    }
    // Los alumnos que se buscan son los activos de ESE grupo y empresa.
    expect(mockPrisma.academyStudent.findMany.mock.calls[0]![0].where).toEqual({ companyId: CO, groupId: 'g1', isActive: true });
    const last = mockPrisma.academyMaterial.updateMany.mock.calls.at(-1)![0];
    expect(last.where).toEqual({ id: 'm1', companyId: CO });
    expect(last.data.lastSentCount).toBe(2);
  });

  it('un segundo envío inmediato se rechaza sin mandar nada', async () => {
    mockPrisma.academyMaterial.updateMany.mockResolvedValue({ count: 0 });
    await expect(sendMaterial(CO, 'm1')).rejects.toThrow('Espera un minuto');
    expect(mockSendEmail).not.toHaveBeenCalled();
    // La reserva solo prospera si nunca se envió o pasó el tiempo de espera.
    const where = mockPrisma.academyMaterial.updateMany.mock.calls[0]![0].where;
    expect(where.id).toBe('m1');
    expect(where.companyId).toBe(CO);
    expect(where.OR).toHaveLength(2);
  });

  it('sin ninguna dirección avisa y devuelve la reserva', async () => {
    mockPrisma.academyStudent.findMany.mockResolvedValue([{ fullName: 'Cata', email: null, guardianEmail: null }]);
    await expect(sendMaterial(CO, 'm1')).rejects.toThrow('correo registrado');
    expect(mockSendEmail).not.toHaveBeenCalled();
    const restore = mockPrisma.academyMaterial.updateMany.mock.calls.at(-1)![0];
    expect(restore.data).toEqual({ lastSentAt: null, lastSentCount: 0 });
  });

  it('si el correo no está configurado no cuenta nada como enviado', async () => {
    mockSendEmail.mockResolvedValue({ status: 'logged', provider: 'none' });
    await expect(sendMaterial(CO, 'm1')).rejects.toThrow('no está configurado');
    expect(mockPrisma.academyMaterial.updateMany.mock.calls.at(-1)![0].data).toEqual({ lastSentAt: null, lastSentCount: 0 });
  });

  it('si algunos correos fallan, informa cuántos salieron y cuántos no', async () => {
    mockSendEmail.mockResolvedValueOnce({ status: 'sent', provider: 'brevo' }).mockResolvedValueOnce({ status: 'failed', provider: 'brevo', error: '500' });
    const result = await sendMaterial(CO, 'm1');
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('si todos fallan, devuelve la reserva para poder reintentar', async () => {
    mockSendEmail.mockResolvedValue({ status: 'failed', provider: 'brevo', error: '500' });
    await expect(sendMaterial(CO, 'm1')).rejects.toThrow('No se pudo enviar ningún correo');
    expect(mockPrisma.academyMaterial.updateMany.mock.calls.at(-1)![0].data).toEqual({ lastSentAt: null, lastSentCount: 0 });
  });
});
