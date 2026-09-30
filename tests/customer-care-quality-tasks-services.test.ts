/**
 * Servicios de Fidelización, Calidad y Tareas.
 *
 * Reglas que estos tests protegen:
 *  - multi-tenant: toda consulta lleva `companyId`; ids ajenos no se aceptan;
 *  - la encuesta pública se contesta UNA sola vez y resuelve la empresa desde
 *    el token, nunca desde lo que manda quien contesta;
 *  - una mala respuesta abre un seguimiento (una sola vez);
 *  - el resultado de una inspección lo calcula el servidor;
 *  - completar una tarea recurrente crea la siguiente sin duplicarla.
 *
 * Prisma: se espía el cliente real; lo no simulado lanza "Consulta no prevista".
 */

jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { createInspection, listProcedures, saveSupplierProfile, updateProcedure } from '@/modules/quality/services/quality.service';
import { getPublicSurvey, setContactChannel, submitPublicSurvey, PublicSurveyError } from '@/modules/customer-care/services/customer-care.service';
import { createTask, setTaskStatus, deleteTask, updateTask, type Actor } from '@/modules/tasks/services/tasks.service';

type Row = Record<string, unknown>;
type Mocks = Record<string, jest.Mock>;
type Delegate = Record<string, (...args: never[]) => unknown>;

const MODELS = {
  customerSurvey: ['findUnique', 'findUniqueOrThrow', 'updateMany'],
  customerCareSettings: ['findUnique'],
  customerFollowUp: ['findFirst', 'create'],
  contact: ['findFirst', 'updateMany'],
  qualityTemplate: ['findFirst'],
  qualityInspection: ['create'],
  product: ['findFirst'],
  supplierProfile: ['upsert'],
  procedure: ['findFirst', 'findMany', 'updateMany'],
  procedureAck: ['findMany'],
  teamTask: ['findFirst', 'create', 'updateMany', 'deleteMany'],
  user: ['findFirst', 'findMany'],
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

let db: ReturnType<typeof installDb>;
beforeEach(() => {
  db = installDb();
});
afterEach(() => jest.restoreAllMocks());

describe('Encuesta pública', () => {
  const token = 'x'.repeat(32);
  const publicRow = (over: Row = {}) => ({ respondedAt: null, companyId: COMPANY, company: { businessName: 'Chakra', status: 'ACTIVE', features: { hasCustomerCare: true } }, ...over });

  it('no muestra la encuesta de una empresa suspendida o sin el módulo', async () => {
    db.customerSurvey.findUnique.mockResolvedValue(publicRow({ company: { businessName: 'X', status: 'SUSPENDED', features: { hasCustomerCare: true } } }));
    expect(await getPublicSurvey(token)).toBeNull();
    db.customerSurvey.findUnique.mockResolvedValue(publicRow({ company: { businessName: 'X', status: 'ACTIVE', features: { hasCustomerCare: false } } }));
    expect(await getPublicSurvey(token)).toBeNull();
    expect(await getPublicSurvey('corto')).toBeNull();
  });

  it('una encuesta ya contestada no se puede contestar de nuevo', async () => {
    db.customerSurvey.findUnique.mockResolvedValue(publicRow());
    db.customerCareSettings.findUnique.mockResolvedValue(null);
    // El UPDATE condicionado a `respondedAt: null` no afecta ninguna fila.
    db.customerSurvey.updateMany.mockResolvedValue({ count: 0 });
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
    await expect(submitPublicSurvey(token, { csat: 5, nps: 10 })).rejects.toBeInstanceOf(PublicSurveyError);
    expect(whereOf(db.customerSurvey.updateMany)).toEqual({ token, respondedAt: null });
  });

  it('una mala nota abre un seguimiento del cliente, una sola vez', async () => {
    db.customerSurvey.findUnique.mockResolvedValue(publicRow());
    db.customerCareSettings.findUnique.mockResolvedValue(null);
    db.customerSurvey.updateMany.mockResolvedValue({ count: 1 });
    db.customerSurvey.findUniqueOrThrow.mockResolvedValue({ companyId: COMPANY, contactId: 'c1', contact: { razonSocial: 'Super SA', nombreFantasia: null } });
    db.customerFollowUp.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'f1' });
    db.customerFollowUp.create.mockResolvedValue({ id: 'f1' });
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);

    const first = await submitPublicSurvey(token, { csat: 2, nps: 4, comment: 'Llegó tarde' });
    expect(first).toMatchObject({ companyId: COMPANY, contactId: 'c1', needsFollowUp: true });
    expect(db.customerFollowUp.create).toHaveBeenCalledTimes(1);
    const data = (db.customerFollowUp.create.mock.calls[0]![0] as { data: Row }).data;
    expect(data).toMatchObject({ companyId: COMPANY, contactId: 'c1', reason: 'DETRACTOR' });

    // Segunda mala respuesta del mismo cliente con un seguimiento aún abierto: no duplica.
    db.customerSurvey.findUnique.mockResolvedValue(publicRow());
    await submitPublicSurvey(token, { csat: 1, nps: 2 });
    expect(db.customerFollowUp.create).toHaveBeenCalledTimes(1);
  });

  it('una buena nota no abre seguimiento', async () => {
    db.customerSurvey.findUnique.mockResolvedValue(publicRow());
    db.customerCareSettings.findUnique.mockResolvedValue(null);
    db.customerSurvey.updateMany.mockResolvedValue({ count: 1 });
    db.customerSurvey.findUniqueOrThrow.mockResolvedValue({ companyId: COMPANY, contactId: 'c1', contact: { razonSocial: 'Super SA', nombreFantasia: null } });
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
    expect(await submitPublicSurvey(token, { csat: 5, nps: 10 })).toMatchObject({ needsFollowUp: false });
    expect(db.customerFollowUp.create).not.toHaveBeenCalled();
  });
});

describe('Canal de origen', () => {
  it('solo modifica clientes de la propia empresa', async () => {
    db.contact.updateMany.mockResolvedValue({ count: 0 });
    await expect(setContactChannel(COMPANY, 'contacto-de-otra-empresa', 'FERIA', undefined)).rejects.toThrow('Cliente no encontrado');
    expect(whereOf(db.contact.updateMany)).toEqual({ id: 'contacto-de-otra-empresa', companyId: COMPANY });
  });
});

describe('Calidad', () => {
  const template = { id: 't1', name: 'Recepción de fruta', kind: 'INCOMING', isActive: true, parameters: [{ key: 'brix', name: 'Brix', type: 'NUMBER', min: 3, max: 4.5, required: true }] };

  it('el servidor calcula el resultado: fuera de rango exige acción correctiva', async () => {
    db.qualityTemplate.findFirst.mockResolvedValue(template);
    await expect(createInspection(COMPANY, 'u1', { templateId: 't1', values: { brix: 9 } })).rejects.toThrow('acción correctiva');
    expect(db.qualityInspection.create).not.toHaveBeenCalled();
    expect(whereOf(db.qualityTemplate.findFirst)).toMatchObject({ id: 't1', companyId: COMPANY });
  });

  it('guarda una inspección aprobada con el estado calculado, copia de parámetros y lote', async () => {
    db.qualityTemplate.findFirst.mockResolvedValue(template);
    db.contact.findFirst.mockResolvedValue({ id: 'prod1' });
    db.qualityInspection.create.mockResolvedValue({ id: 'i1' });
    const result = await createInspection(COMPANY, 'u1', { templateId: 't1', contactId: 'prod1', lotNumber: 'L-1', values: { brix: 4 } });
    expect(result).toMatchObject({ id: 'i1', status: 'PASSED', failed: [], lotNumber: 'L-1' });
    const data = (db.qualityInspection.create.mock.calls[0]![0] as { data: Row }).data;
    expect(data).toMatchObject({ companyId: COMPANY, status: 'PASSED', contactId: 'prod1', inspectorId: 'u1', templateName: 'Recepción de fruta' });
    expect(whereOf(db.contact.findFirst)).toMatchObject({ id: 'prod1', companyId: COMPANY });
  });

  it('rechaza una inspección con obligatorios sin medir y productor de otra empresa', async () => {
    db.qualityTemplate.findFirst.mockResolvedValue(template);
    db.contact.findFirst.mockResolvedValue(null);
    await expect(createInspection(COMPANY, 'u1', { templateId: 't1', contactId: 'ajeno', values: { brix: 4 } })).rejects.toThrow('no encontrado');
    db.contact.findFirst.mockResolvedValue({ id: 'prod1' });
    await expect(createInspection(COMPANY, 'u1', { templateId: 't1', contactId: 'prod1', values: {} })).rejects.toThrow('Falta completar');
  });

  it('la ficha solo se completa para contactos proveedores de la empresa', async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(saveSupplierProfile(COMPANY, { contactId: 'c9', supplierType: 'PRODUCTOR', isLocalProducer: true, isActive: true })).rejects.toThrow('proveedor');
    expect(whereOf(db.contact.findFirst)).toEqual({ id: 'c9', companyId: COMPANY, isSupplier: true });
    expect(db.supplierProfile.upsert).not.toHaveBeenCalled();
  });

  it('editar un procedimiento vigente sube la versión; un borrador no', async () => {
    const input = { title: 'Recepción', category: 'OPERACION' as const, content: '1. Pesar la fruta y anotarla.' };
    db.procedure.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', version: 2, title: 'Recepción', content: 'antes', summary: null });
    db.procedure.updateMany.mockResolvedValue({ count: 1 });
    expect(await updateProcedure(COMPANY, 'p1', input)).toEqual({ version: 3 });
    expect(whereOf(db.procedure.updateMany)).toEqual({ id: 'p1', companyId: COMPANY, version: 2 });
    db.procedure.findFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', version: 1, title: 'Recepción', content: 'antes', summary: null });
    expect(await updateProcedure(COMPANY, 'p1', input)).toEqual({ version: 1 });
    // Edición concurrente: el UPDATE ya no encuentra esa versión.
    db.procedure.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', version: 2, title: 'Recepción', content: 'antes', summary: null });
    db.procedure.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateProcedure(COMPANY, 'p1', input)).rejects.toThrow('cambió');
  });
});

describe('Procedimientos: borradores', () => {
  it('el equipo solo ve los vigentes; quien gestiona ve también los borradores', async () => {
    db.procedure.findMany.mockResolvedValue([]);
    db.procedureAck.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    await listProcedures(COMPANY, 'u1', false);
    expect(whereOf(db.procedure.findMany)).toEqual({ companyId: COMPANY, status: 'ACTIVE' });
    await listProcedures(COMPANY, 'boss', true);
    expect(whereOf(db.procedure.findMany, 1)).toEqual({ companyId: COMPANY, status: { not: 'ARCHIVED' } });
  });
});

describe('Tareas', () => {
  const member: Actor = { companyId: COMPANY, userId: 'u1', canManage: false };
  const manager: Actor = { companyId: COMPANY, userId: 'boss', canManage: true };
  const weekly = { id: 't1', title: 'Cierre semanal', description: null, status: 'TODO', priority: 'HIGH', dueDate: new Date('2026-09-25T12:00:00Z'), assigneeId: 'u1', createdById: 'boss', recurrence: 'WEEKLY' };

  beforeEach(() => {
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
  });

  it('quien no gestiona no puede asignar tareas a otras personas', async () => {
    await expect(createTask(member, { title: 'Pedir envases', priority: 'NORMAL', recurrence: 'NONE', assigneeId: 'otro' })).rejects.toThrow('asignar');
    expect(db.teamTask.create).not.toHaveBeenCalled();
  });

  it('quien no gestiona puede editar una tarea sin cambiar a su responsable, pero no reasignarla', async () => {
    db.teamTask.findFirst.mockResolvedValue({ assigneeId: 'u2' });
    db.teamTask.updateMany.mockResolvedValue({ count: 1 });
    db.user.findFirst.mockResolvedValue({ id: 'u2' });
    const base = { title: 'Pedir envases', priority: 'NORMAL' as const, recurrence: 'NONE' as const };
    await expect(updateTask(member, 't1', { ...base, assigneeId: 'u2' })).resolves.toBeUndefined();
    await expect(updateTask(member, 't1', { ...base, assigneeId: 'u3' })).rejects.toThrow('asignar');
  });

  it('el dueño asigna a un usuario activo de su empresa', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u1' });
    db.teamTask.create.mockResolvedValue({ id: 'n1' });
    await createTask(manager, { title: 'Pedir envases', priority: 'NORMAL', recurrence: 'NONE', assigneeId: 'u1', dueDate: '2026-10-05' });
    expect(whereOf(db.user.findFirst)).toEqual({ id: 'u1', companyId: COMPANY, isActive: true });
    const data = (db.teamTask.create.mock.calls[0]![0] as { data: Row }).data;
    expect(data).toMatchObject({ companyId: COMPANY, assigneeId: 'u1', createdById: 'boss', dueDate: new Date('2026-10-05T12:00:00Z') });
  });

  it('completar una tarea semanal crea la siguiente', async () => {
    db.teamTask.findFirst.mockResolvedValue(weekly);
    db.teamTask.updateMany.mockResolvedValue({ count: 1 });
    db.teamTask.create.mockResolvedValue({ id: 'n2' });
    const result = await setTaskStatus(member, 't1', 'DONE', new Date('2026-09-26T12:00:00Z'));
    expect(result.nextDueDate).toEqual(new Date('2026-10-02T12:00:00Z'));
    const next = (db.teamTask.create.mock.calls[0]![0] as { data: Row }).data;
    expect(next).toMatchObject({ companyId: COMPANY, title: 'Cierre semanal', assigneeId: 'u1', recurrence: 'WEEKLY', dueDate: new Date('2026-10-02T12:00:00Z') });
    // El UPDATE solo prospera si la tarea seguía en el estado que se leyó.
    expect(whereOf(db.teamTask.updateMany)).toEqual({ id: 't1', companyId: COMPANY, status: 'TODO' });
  });

  it('un doble clic en "Hecha" no crea dos tareas nuevas', async () => {
    db.teamTask.findFirst.mockResolvedValue(weekly);
    db.teamTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(setTaskStatus(member, 't1', 'DONE')).rejects.toThrow('cambió');
    expect(db.teamTask.create).not.toHaveBeenCalled();
  });

  it('una tarea cerrada no se reabre ni se vuelve a cerrar: no puede multiplicar la recurrente', async () => {
    db.teamTask.findFirst.mockResolvedValue({ ...weekly, status: 'DONE' });
    for (const status of ['TODO', 'DOING', 'DONE'] as const) await expect(setTaskStatus(member, 't1', status)).rejects.toThrow('ya está cerrada');
    expect(db.teamTask.updateMany).not.toHaveBeenCalled();
    expect(db.teamTask.create).not.toHaveBeenCalled();
  });

  it('quien no gestiona solo ve y mueve lo suyo; un ajeno no se encuentra', async () => {
    db.teamTask.findFirst.mockResolvedValue(null);
    await expect(setTaskStatus(member, 'de-otro', 'DONE')).rejects.toThrow('no encontrada');
    expect(whereOf(db.teamTask.findFirst)).toEqual({ id: 'de-otro', companyId: COMPANY, OR: [{ assigneeId: 'u1' }, { createdById: 'u1' }] });
    db.teamTask.findFirst.mockResolvedValue(weekly);
    db.teamTask.updateMany.mockResolvedValue({ count: 1 });
    db.teamTask.create.mockResolvedValue({ id: 'x' });
    await setTaskStatus(manager, 't1', 'DONE');
    expect(whereOf(db.teamTask.findFirst, 1)).toEqual({ id: 't1', companyId: COMPANY });
  });

  it('borrar filtra por empresa y, sin gestión, solo lo creado por la persona', async () => {
    db.teamTask.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteTask(member, 't1')).rejects.toThrow('solo quien la creó');
    expect(whereOf(db.teamTask.deleteMany)).toEqual({ id: 't1', companyId: COMPANY, createdById: 'u1' });
  });
});
