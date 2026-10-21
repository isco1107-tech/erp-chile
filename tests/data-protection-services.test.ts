/**
 * Servicios de protección de datos (Ley 21.719).
 *
 * Reglas que estos tests protegen:
 *  - multi-tenant: toda consulta lleva `companyId`; un id ajeno no se acepta;
 *  - el plazo lo calcula el servidor, y una solicitud "recibida en el futuro" no lo estira;
 *  - no se resuelve una solicitud sin verificar la identidad ni sin dejar constancia;
 *  - la prórroga respeta el tope;
 *  - el portal público resuelve la empresa SOLO por el token y no existe para empresas suspendidas;
 *  - la búsqueda de datos de una persona nunca sale del tenant de la sesión.
 */

jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));

import { prisma } from '@/lib/prisma';
import {
  DataProtectionError,
  createDataSubjectRequest,
  extendDataSubjectRequest,
  getOrCreatePrivacyPortalToken,
  resolvePrivacyPortal,
  updateDataSubjectRequest,
  updatePrivacyIncident,
} from '@/modules/data-protection/services/requests.service';
import { buildPersonalDataExport, findPersonalData } from '@/modules/data-protection/services/personal-data.service';
import { addDays, computeDueDate } from '@/lib/privacy/deadlines';

type Row = Record<string, unknown>;
type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: never[]) => unknown>;

const MODELS = {
  dataSubjectRequest: ['create', 'findFirst', 'findMany', 'updateMany'],
  privacyIncident: ['findFirst', 'updateMany'],
  companySettings: ['findUnique', 'upsert'],
  candidate: ['findMany'],
  contact: ['findMany'],
  employee: ['findMany', 'count'],
  ticketSale: ['findMany'],
  voteOrder: ['findMany'],
  installmentPaymentOrder: ['findMany'],
  user: ['findMany'],
} as const;

function installDb(): Record<keyof typeof MODELS, Mocks> {
  const db: Record<string, Mocks> = {};
  for (const [model, methods] of Object.entries(MODELS)) {
    db[model] = {};
    for (const method of methods) {
      db[model]![method] = jest.spyOn((prisma as unknown as Record<string, Delegate>)[model]!, method).mockImplementation(() => {
        throw new Error(`Consulta no prevista: ${model}.${method}`);
      }) as unknown as jest.Mock;
    }
  }
  return db as Record<keyof typeof MODELS, Mocks>;
}

const whereOf = (mock: jest.Mock, call = 0) => (mock.mock.calls[call]![0] as { where: Row }).where;
const COMPANY = 'company-a';
const FULL_ACCESS = { candidatesSensitive: true, payroll: true };
const FIXED_NOW = new Date('2026-12-10T12:00:00Z');

let db: ReturnType<typeof installDb>;
beforeEach(() => {
  db = installDb();
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const baseRequest = (over: Row = {}) => ({
  id: 'r1', companyId: COMPANY, type: 'ACCESS', status: 'RECEIVED', requesterName: 'Ana', requesterEmail: 'ana@test.cl', requesterRutClean: null,
  details: null, source: 'PUBLIC_FORM', receivedAt: FIXED_NOW, dueAt: computeDueDate(FIXED_NOW), extendedUntil: null, extensionReason: null,
  identityVerifiedAt: null, resolvedAt: null, resolutionNote: null, handledById: null, createdAt: FIXED_NOW, updatedAt: FIXED_NOW, ...over,
});

describe('crear solicitudes', () => {
  it('el plazo lo calcula el servidor desde la recepción', async () => {
    db.dataSubjectRequest.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'r1', ...data }));
    const created = await createDataSubjectRequest(COMPANY, { type: 'ACCESS', requesterName: 'Ana', requesterEmail: 'ana@test.cl' }, 'PUBLIC_FORM');
    expect(created.companyId).toBe(COMPANY);
    expect(created.dueAt).toEqual(computeDueDate(FIXED_NOW));
  });

  it('una solicitud manual puede traer una fecha pasada, pero no una futura', async () => {
    db.dataSubjectRequest.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'r1', ...data }));
    const past = addDays(FIXED_NOW, -10);
    expect((await createDataSubjectRequest(COMPANY, { type: 'ERASURE', requesterName: 'Ana', requesterEmail: 'a@t.cl', receivedAt: past }, 'MANUAL')).receivedAt).toEqual(past);
    const future = addDays(FIXED_NOW, 5);
    expect((await createDataSubjectRequest(COMPANY, { type: 'ERASURE', requesterName: 'Ana', requesterEmail: 'a@t.cl', receivedAt: future }, 'MANUAL')).receivedAt).toEqual(FIXED_NOW);
  });
});

describe('resolver solicitudes', () => {
  it('no se resuelve sin haber verificado la identidad', async () => {
    db.dataSubjectRequest.findFirst.mockResolvedValue(baseRequest());
    await expect(updateDataSubjectRequest(COMPANY, 'r1', 'u1', { status: 'RESOLVED', resolutionNote: 'Se entregó la copia' })).rejects.toBeInstanceOf(DataProtectionError);
    expect(db.dataSubjectRequest.updateMany).not.toHaveBeenCalled();
  });

  it('no se cierra sin dejar constancia', async () => {
    db.dataSubjectRequest.findFirst.mockResolvedValue(baseRequest({ identityVerifiedAt: FIXED_NOW }));
    await expect(updateDataSubjectRequest(COMPANY, 'r1', 'u1', { status: 'RESOLVED' })).rejects.toThrow(/constancia/i);
    await expect(updateDataSubjectRequest(COMPANY, 'r1', 'u1', { status: 'REJECTED' })).rejects.toThrow(/constancia/i);
  });

  it('resuelve con identidad verificada y constancia, siempre acotado a la empresa', async () => {
    db.dataSubjectRequest.findFirst
      .mockResolvedValueOnce(baseRequest({ identityVerifiedAt: FIXED_NOW }))
      .mockResolvedValueOnce(baseRequest({ status: 'RESOLVED', identityVerifiedAt: FIXED_NOW, resolvedAt: FIXED_NOW, resolutionNote: 'Copia entregada' }));
    db.dataSubjectRequest.updateMany.mockResolvedValue({ count: 1 });
    const updated = await updateDataSubjectRequest(COMPANY, 'r1', 'u1', { status: 'RESOLVED', resolutionNote: 'Copia entregada' });
    expect(updated.status).toBe('RESOLVED');
    expect(updated.deadline).toEqual({ kind: 'CLOSED' });
    expect(whereOf(db.dataSubjectRequest.updateMany)).toEqual({ id: 'r1', companyId: COMPANY });
  });

  it('una solicitud de otra empresa no existe', async () => {
    db.dataSubjectRequest.findFirst.mockResolvedValue(null);
    await expect(updateDataSubjectRequest(COMPANY, 'ajena', 'u1', { status: 'IN_PROGRESS' })).rejects.toThrow(/no encontrada/i);
    expect(whereOf(db.dataSubjectRequest.findFirst)).toEqual({ id: 'ajena', companyId: COMPANY });
  });
});

describe('prórroga', () => {
  it('acepta una prórroga dentro del tope y la guarda', async () => {
    const current = baseRequest();
    db.dataSubjectRequest.findFirst.mockResolvedValueOnce(current).mockResolvedValueOnce({ ...current, extendedUntil: addDays(current.dueAt, 10) });
    db.dataSubjectRequest.updateMany.mockResolvedValue({ count: 1 });
    const updated = await extendDataSubjectRequest(COMPANY, 'r1', { extendedUntil: addDays(current.dueAt, 10), reason: 'Volumen alto de datos a revisar' });
    expect(updated.extendedUntil).toEqual(addDays(current.dueAt, 10));
    expect(whereOf(db.dataSubjectRequest.updateMany)).toEqual({ id: 'r1', companyId: COMPANY });
  });

  it('rechaza una prórroga que pasa del tope o una solicitud ya cerrada', async () => {
    const current = baseRequest();
    db.dataSubjectRequest.findFirst.mockResolvedValue(current);
    await expect(extendDataSubjectRequest(COMPANY, 'r1', { extendedUntil: addDays(current.dueAt, 90), reason: 'Volumen alto de datos a revisar' })).rejects.toBeInstanceOf(DataProtectionError);
    db.dataSubjectRequest.findFirst.mockResolvedValue(baseRequest({ status: 'RESOLVED' }));
    await expect(extendDataSubjectRequest(COMPANY, 'r1', { extendedUntil: addDays(current.dueAt, 5), reason: 'Volumen alto de datos a revisar' })).rejects.toThrow(/cerrada/i);
    expect(db.dataSubjectRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe('portal público', () => {
  const token = 'a'.repeat(64);

  it('resuelve la empresa solo por el token', async () => {
    db.companySettings.findUnique.mockResolvedValue({ companyId: COMPANY, company: { businessName: 'Chakra', email: 'c@chakra.cl', status: 'ACTIVE' } });
    expect(await resolvePrivacyPortal(token)).toEqual({ companyId: COMPANY, companyName: 'Chakra', contactEmail: 'c@chakra.cl' });
    expect(whereOf(db.companySettings.findUnique)).toEqual({ privacyPortalToken: token });
  });

  it('un enlace mal formado ni siquiera consulta la base de datos', async () => {
    expect(await resolvePrivacyPortal('corto')).toBeNull();
    expect(await resolvePrivacyPortal('Z'.repeat(64))).toBeNull();
    expect(db.companySettings.findUnique).not.toHaveBeenCalled();
  });

  it('una empresa suspendida o cancelada se comporta como un enlace inexistente', async () => {
    for (const status of ['SUSPENDED', 'CANCELLED']) {
      db.companySettings.findUnique.mockResolvedValue({ companyId: COMPANY, company: { businessName: 'X', email: null, status } });
      expect(await resolvePrivacyPortal(token)).toBeNull();
    }
  });

  it('generar el enlace es idempotente: no invalida el que ya circula', async () => {
    db.companySettings.findUnique.mockResolvedValue({ privacyPortalToken: token });
    expect(await getOrCreatePrivacyPortalToken(COMPANY)).toBe(token);
    expect(db.companySettings.upsert).not.toHaveBeenCalled();
  });
});

describe('incidentes', () => {
  it('registra la fecha del aviso solo la primera vez y dentro de la empresa', async () => {
    const existing = { id: 'i1', companyId: COMPANY, agencyNotifiedAt: null, subjectsNotifiedAt: null };
    db.privacyIncident.findFirst.mockResolvedValue(existing);
    db.privacyIncident.updateMany.mockResolvedValue({ count: 1 });
    await updatePrivacyIncident(COMPANY, 'i1', { agencyNotified: true });
    const call = db.privacyIncident.updateMany.mock.calls[0]![0] as { where: Row; data: Row };
    expect(call.where).toEqual({ id: 'i1', companyId: COMPANY });
    expect(call.data.agencyNotifiedAt).toBeInstanceOf(Date);
    expect(call.data).not.toHaveProperty('subjectsNotifiedAt');
  });
});

describe('búsqueda de datos de una persona', () => {
  it('sin correo ni RUT no consulta nada', async () => {
    const result = await findPersonalData(COMPANY, {});
    expect(result.totalRecords).toBe(0);
    expect(db.candidate.findMany).not.toHaveBeenCalled();
  });

  it('todas las consultas llevan el companyId de la sesión', async () => {
    for (const model of ['candidate', 'contact', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) {
      db[model].findMany.mockResolvedValue([]);
    }
    await findPersonalData(COMPANY, { email: ' Ana@Test.cl ', rut: '12.345.678-5' }, FULL_ACCESS);
    for (const model of ['candidate', 'contact', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) {
      expect(whereOf(db[model].findMany)).toMatchObject({ companyId: COMPANY });
    }
  });

  it('busca por correo (sin distinguir mayúsculas) y por RUT sin formato', async () => {
    for (const model of ['candidate', 'contact', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) {
      db[model].findMany.mockResolvedValue([]);
    }
    await findPersonalData(COMPANY, { email: ' Ana@Test.cl ', rut: '12.345.678-5' }, FULL_ACCESS);
    expect(whereOf(db.candidate.findMany).OR).toEqual([{ email: { equals: 'ana@test.cl', mode: 'insensitive' } }, { rutClean: '123456785' }]);
    // Las compras de entradas no tienen RUT: solo se busca por correo.
    expect(whereOf(db.ticketSale.findMany).OR).toEqual([{ buyerEmail: { equals: 'ana@test.cl', mode: 'insensitive' } }]);
  });

  it('solo devuelve las secciones con datos y arma la copia para el titular', async () => {
    for (const model of ['contact', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) db[model].findMany.mockResolvedValue([]);
    db.candidate.findMany.mockResolvedValue([{ id: 'c1', fullName: 'Ana Pérez', email: 'ana@test.cl' }]);
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl' }, FULL_ACCESS);
    expect(result.sections.map((s) => s.key)).toEqual(['candidates']);
    expect(result.sections[0]!.retention).toBe('ERASABLE');
    const exported = buildPersonalDataExport(result, { companyName: 'Chakra', generatedAt: FIXED_NOW });
    expect(exported.generadoPor).toBe('Chakra');
    // `matchedBy` es una ayuda interna: no sale en la copia que se entrega al titular.
    expect(exported.datos).toEqual({ candidates: [{ id: 'c1', fullName: 'Ana Pérez', email: 'ana@test.cl' }] });
  });

  it('los registros con obligación de conservación no se marcan como eliminables', async () => {
    for (const model of ['candidate', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) db[model].findMany.mockResolvedValue([]);
    db.contact.findMany.mockResolvedValue([{ id: 'k1', razonSocial: 'Ana' }]);
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl' }, FULL_ACCESS);
    expect(result.sections[0]!.retention).toBe('LEGAL_RETENTION');
  });
});

describe('permisos al buscar datos de una persona', () => {
  const candidate = { id: 'c1', fullName: 'Ana', email: 'ana@test.cl', rut: '12.345.678-5', condicionesMedicas: 'Alergia', guardianName: 'María', guardianRut: '1-9', birthDate: new Date('2010-01-01') };

  function seed() {
    for (const model of ['contact', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) db[model].findMany.mockResolvedValue([]);
    db.candidate.findMany.mockResolvedValue([candidate]);
    db.employee.count.mockResolvedValue(2);
  }

  it('sin candidates:sensitive no salen salud, apoderado ni fecha de nacimiento', async () => {
    seed();
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl' }, { candidatesSensitive: false, payroll: true });
    const record = result.sections[0]!.records[0]!;
    expect(record).toMatchObject({ fullName: 'Ana' });
    for (const field of ['condicionesMedicas', 'guardianName', 'guardianRut', 'birthDate']) expect(record).not.toHaveProperty(field);
  });

  it('con candidates:sensitive sí salen', async () => {
    seed();
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl' }, { candidatesSensitive: true, payroll: true });
    expect(result.sections[0]!.records[0]).toMatchObject({ condicionesMedicas: 'Alergia', guardianRut: '1-9' });
  });

  it('sin payroll:read no se consultan los trabajadores: solo se avisa que existen', async () => {
    seed();
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl' }, { candidatesSensitive: true, payroll: false });
    expect(db.employee.findMany).not.toHaveBeenCalled();
    expect(result.omitted).toEqual([expect.stringMatching(/trabajadores/i)]);
    expect(whereOf(db.employee.count)).toMatchObject({ companyId: COMPANY });
  });

  it('por defecto (sin permisos explícitos) no se ve nada sensible', async () => {
    seed();
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl' });
    expect(result.sections[0]!.records[0]).not.toHaveProperty('condicionesMedicas');
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it('cada registro dice por qué identificador apareció', async () => {
    for (const model of ['contact', 'employee', 'ticketSale', 'voteOrder', 'installmentPaymentOrder', 'user'] as const) db[model].findMany.mockResolvedValue([]);
    db.candidate.findMany.mockResolvedValue([
      { id: 'a', email: 'ana@test.cl', rut: '12.345.678-5' },
      { id: 'b', email: 'otra@test.cl', rut: '12.345.678-5' },
      { id: 'c', email: 'ANA@test.cl', rut: '9.999.999-9' },
    ]);
    const result = await findPersonalData(COMPANY, { email: 'ana@test.cl', rut: '12.345.678-5' }, FULL_ACCESS);
    expect(result.sections[0]!.records.map((r) => r.matchedBy)).toEqual([['correo', 'RUT'], ['RUT'], ['correo']]);
  });
});

