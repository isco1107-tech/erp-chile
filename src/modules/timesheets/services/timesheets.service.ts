import 'server-only';

import crypto from 'crypto';
import type { Prisma, TimeEntry } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { formatCurrency } from '@/lib/chile/tax';
import { captureException } from '@/lib/observability';
import { createSalesDocument, deleteDraftSalesDocument } from '@/modules/sales/services/sales.service';
import { salesDocumentCreateSchema } from '@/modules/sales/schema';
import { entryAmount, formatMinutes, type BillTimeEntriesInput, type TimeEntryFilter, type TimeEntryInput } from '../schema';

/**
 * Control de horas. Reglas:
 *  - Cada persona registra y edita SUS horas; quien tiene `timesheets:manage`
 *    ve y corrige las de todos.
 *  - Una hora ya facturada (BILLED) no se edita ni se borra: está en un
 *    documento de venta.
 *  - Facturar convierte horas facturables de UN cliente en un borrador de
 *    venta; las horas quedan marcadas con ese documento.
 */

export interface TimesheetViewer {
  userId: string;
  canManage: boolean;
}

const entryInclude = {
  user: { select: { id: true, name: true } },
  contact: { select: { id: true, razonSocial: true } },
  project: { select: { id: true, name: true } },
  salesDocument: { select: { id: true, folio: true, status: true, dteType: true } },
} satisfies Prisma.TimeEntryInclude;

export type TimeEntryRow = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

export async function listEntries(companyId: string, viewer: TimesheetViewer, filter: TimeEntryFilter): Promise<TimeEntryRow[]> {
  const userId = viewer.canManage ? filter.userId : viewer.userId;
  return prisma.timeEntry.findMany({
    where: {
      companyId,
      date: { gte: filter.from, lte: filter.to },
      ...(userId ? { userId } : {}),
      ...(filter.contactId ? { contactId: filter.contactId } : {}),
      ...(filter.onlyUnbilled ? { status: 'OPEN', billable: true } : {}),
    },
    include: entryInclude,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 1000,
  });
}

async function assertReferences(companyId: string, input: TimeEntryInput): Promise<void> {
  const checks: Array<Promise<unknown>> = [];
  if (input.contactId) checks.push(prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } }).then((r) => r ?? Promise.reject(new Error('El cliente no existe en tu empresa'))));
  if (input.projectId) checks.push(prisma.project.findFirst({ where: { id: input.projectId, companyId }, select: { id: true } }).then((r) => r ?? Promise.reject(new Error('El proyecto no existe en tu empresa'))));
  if (input.serviceContractId) {
    checks.push(
      prisma.serviceContract
        .findFirst({ where: { id: input.serviceContractId, companyId }, select: { contactId: true } })
        .then((contract) => {
          if (!contract) throw new Error('El contrato no existe en tu empresa');
          if (input.contactId && contract.contactId !== input.contactId) throw new Error('El contrato elegido es de otro cliente');
        })
    );
  }
  if (input.userId) checks.push(prisma.user.findFirst({ where: { id: input.userId, companyId }, select: { id: true } }).then((r) => r ?? Promise.reject(new Error('La persona no pertenece a tu empresa'))));
  await Promise.all(checks);
}

function ownerFor(viewer: TimesheetViewer, input: TimeEntryInput): string {
  if (input.userId && input.userId !== viewer.userId) {
    if (!viewer.canManage) throw new Error('Solo puedes registrar tus propias horas');
    return input.userId;
  }
  return viewer.userId;
}

export async function createEntry(companyId: string, viewer: TimesheetViewer, input: TimeEntryInput): Promise<TimeEntry> {
  await assertReferences(companyId, input);
  if (input.billable && !input.contactId) throw new Error('Una hora facturable necesita un cliente');
  return prisma.timeEntry.create({
    data: {
      companyId,
      userId: ownerFor(viewer, input),
      date: input.date,
      minutes: input.minutes,
      description: input.description,
      contactId: input.contactId ?? null,
      projectId: input.projectId ?? null,
      serviceContractId: input.serviceContractId ?? null,
      billable: input.billable,
      hourlyRate: input.hourlyRate,
    },
  });
}

/** Lo que el visor puede tocar: sus horas (o todas si gestiona), y solo abiertas. */
function editableWhere(companyId: string, viewer: TimesheetViewer, id: string): Prisma.TimeEntryWhereInput {
  return { id, companyId, status: 'OPEN', ...(viewer.canManage ? {} : { userId: viewer.userId }) };
}

export async function updateEntry(companyId: string, viewer: TimesheetViewer, id: string, input: TimeEntryInput): Promise<void> {
  await assertReferences(companyId, input);
  if (input.billable && !input.contactId) throw new Error('Una hora facturable necesita un cliente');
  const result = await prisma.timeEntry.updateMany({
    where: editableWhere(companyId, viewer, id),
    data: {
      userId: ownerFor(viewer, input),
      date: input.date,
      minutes: input.minutes,
      description: input.description,
      contactId: input.contactId ?? null,
      projectId: input.projectId ?? null,
      serviceContractId: input.serviceContractId ?? null,
      billable: input.billable,
      hourlyRate: input.hourlyRate,
    },
  });
  if (result.count === 0) throw new Error('El registro no existe, no es tuyo o ya fue facturado');
}

export async function deleteEntry(companyId: string, viewer: TimesheetViewer, id: string): Promise<void> {
  const result = await prisma.timeEntry.deleteMany({ where: editableWhere(companyId, viewer, id) });
  if (result.count === 0) throw new Error('El registro no existe, no es tuyo o ya fue facturado');
}

export interface TimesheetSummary {
  totalMinutes: number;
  billableMinutes: number;
  unbilledAmount: number;
  unbilledByClient: Array<{ contactId: string; razonSocial: string; minutes: number; amount: number; entries: number }>;
  /** Tarifa del último registro del visor, para precargar el formulario. */
  lastRate: number;
}

export async function getSummary(companyId: string, viewer: TimesheetViewer, filter: TimeEntryFilter): Promise<TimesheetSummary> {
  const scopeUser = viewer.canManage ? filter.userId : viewer.userId;
  const [inRange, unbilled, last] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { companyId, date: { gte: filter.from, lte: filter.to }, ...(scopeUser ? { userId: scopeUser } : {}) },
      select: { minutes: true, billable: true },
    }),
    prisma.timeEntry.findMany({
      where: { companyId, status: 'OPEN', billable: true, contactId: { not: null }, ...(viewer.canManage ? {} : { userId: viewer.userId }) },
      select: { minutes: true, hourlyRate: true, contactId: true, contact: { select: { razonSocial: true } } },
    }),
    prisma.timeEntry.findFirst({ where: { companyId, userId: viewer.userId, hourlyRate: { gt: 0 } }, orderBy: { createdAt: 'desc' }, select: { hourlyRate: true } }),
  ]);

  const byClient = new Map<string, { contactId: string; razonSocial: string; minutes: number; amount: number; entries: number }>();
  for (const entry of unbilled) {
    if (!entry.contactId || !entry.contact) continue;
    const row = byClient.get(entry.contactId) ?? { contactId: entry.contactId, razonSocial: entry.contact.razonSocial, minutes: 0, amount: 0, entries: 0 };
    row.minutes += entry.minutes;
    row.amount += entryAmount(entry.minutes, entry.hourlyRate);
    row.entries++;
    byClient.set(entry.contactId, row);
  }
  const unbilledByClient = [...byClient.values()].sort((a, b) => b.amount - a.amount);
  return {
    totalMinutes: inRange.reduce((sum, e) => sum + e.minutes, 0),
    billableMinutes: inRange.filter((e) => e.billable).reduce((sum, e) => sum + e.minutes, 0),
    unbilledAmount: unbilledByClient.reduce((sum, row) => sum + row.amount, 0),
    unbilledByClient,
    lastRate: last?.hourlyRate ?? 0,
  };
}

/** Una línea por registro: cantidad 1 al monto exacto del registro, para que la línea cuadre con lo que muestra la pantalla. */
function entryLineDescription(entry: { date: Date; minutes: number; hourlyRate: number; description: string; user: { name: string } | null }): string {
  const who = entry.user ? ` (${entry.user.name})` : '';
  return `${entry.date.toISOString().slice(0, 10)} · ${entry.description}${who} · ${formatMinutes(entry.minutes)} a ${formatCurrency(entry.hourlyRate)}/h`.slice(0, 300);
}

/**
 * Convierte horas facturables de un cliente en un BORRADOR de venta (para
 * revisar y emitir con "Emitir documento"). La llave de idempotencia sale de
 * los ids de las horas: reintentar el mismo pedido no duplica el borrador.
 * Si entre medio alguien facturó o editó alguna de esas horas, se deshace el
 * borrador (solo si nada quedó ligado a él) y se avisa.
 */
export async function billEntries(companyId: string, input: BillTimeEntriesInput): Promise<{ salesDocumentId: string; minutes: number; amount: number }> {
  const ids = [...new Set(input.entryIds)].sort();
  const entries = await prisma.timeEntry.findMany({
    where: { companyId, id: { in: ids } },
    include: { user: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });
  if (entries.length !== ids.length) throw new Error('Alguno de los registros no existe en tu empresa');
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalAmount = entries.reduce((sum, e) => sum + entryAmount(e.minutes, e.hourlyRate), 0);

  // Doble clic o reintento de un pedido que ya se completó: todas las horas
  // están en el mismo documento. Se responde con ese documento, sin error.
  const billedTo = new Set(entries.map((entry) => (entry.status === 'BILLED' ? entry.salesDocumentId : null)));
  const [onlyDocument] = [...billedTo];
  if (billedTo.size === 1 && onlyDocument) return { salesDocumentId: onlyDocument, minutes: totalMinutes, amount: totalAmount };

  for (const entry of entries) {
    if (entry.status !== 'OPEN') throw new Error('Alguno de los registros ya fue facturado');
    if (!entry.billable) throw new Error('Alguno de los registros no es facturable');
    if (entry.contactId !== input.contactId) throw new Error('Todos los registros deben ser del mismo cliente');
  }

  const warehouse = await prisma.warehouse.findFirst({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
  if (!warehouse) throw new Error('La empresa no tiene bodegas: crea una en Inventario antes de facturar');

  const items =
    input.grouping === 'SINGLE_LINE'
      ? [{ description: `Servicios profesionales (${formatMinutes(totalMinutes)})`, quantity: 1, unitPrice: totalAmount, isExempt: input.isExempt }]
      : entries.map((entry) => ({
          description: entryLineDescription(entry),
          quantity: 1,
          unitPrice: entryAmount(entry.minutes, entry.hourlyRate),
          isExempt: input.isExempt,
        }));

  const parsed = salesDocumentCreateSchema.safeParse({
    contactId: input.contactId,
    warehouseId: warehouse.id,
    dteType: input.dteType,
    paymentMethod: input.paymentMethod,
    notes: `Horas trabajadas: ${formatMinutes(totalMinutes)} en ${entries.length} registro(s)`,
    idempotencyKey: `timesheet:${crypto.createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 40)}`,
    items,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'No se pudo armar el documento');

  const document = await createSalesDocument(companyId, parsed.data, 'DRAFT');

  // Con las horas bloqueadas se revisa que sigan exactamente como cuando se
  // armó el borrador. Una solicitud concurrente con las mismas horas recibe
  // el mismo borrador (misma llave de idempotencia): si ya las ligó, está bien.
  const snapshot = new Map(entries.map((entry) => [entry.id, entry]));
  const linked = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TimeEntry" WHERE id = ANY(${ids}) AND "companyId" = ${companyId} ORDER BY id FOR UPDATE`;
    const current = await tx.timeEntry.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, status: true, salesDocumentId: true, billable: true, contactId: true, minutes: true, hourlyRate: true },
    });
    const unchanged = current.length === ids.length && current.every((entry) => {
      if (entry.status === 'BILLED') return entry.salesDocumentId === document.id;
      const before = snapshot.get(entry.id);
      return entry.billable && entry.contactId === input.contactId && entry.minutes === before?.minutes && entry.hourlyRate === before.hourlyRate;
    });
    if (!unchanged) return false;
    await tx.timeEntry.updateMany({
      where: { companyId, id: { in: ids }, status: 'OPEN' },
      data: { status: 'BILLED', salesDocumentId: document.id },
    });
    return true;
  }, LOCKING_TX_OPTIONS);

  if (!linked) {
    // Alguien facturó o editó parte de estas horas mientras tanto: el
    // borrador cobraría algo distinto de lo registrado. Se deshace, salvo que
    // otra solicitud ya le haya ligado horas.
    await deleteDraftSalesDocument(companyId, document.id, { onlyIfUnreferenced: true }).catch((error: unknown) => {
      captureException(error, { module: 'horas', companyId, extra: { salesDocumentId: document.id, step: 'deshacer-borrador' } });
    });
    throw new Error('Algunas horas se facturaron o editaron mientras preparabas este documento. Recarga e inténtalo de nuevo.');
  }
  return { salesDocumentId: document.id, minutes: totalMinutes, amount: totalAmount };
}

export async function getLookups(companyId: string, viewer: TimesheetViewer, withProjects: boolean) {
  const [projects, contracts, users] = await Promise.all([
    withProjects ? prisma.project.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    prisma.serviceContract.findMany({ where: { companyId, status: 'ACTIVE' }, select: { id: true, name: true, contactId: true }, orderBy: { name: 'asc' } }),
    viewer.canManage ? prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
  ]);
  return { projects, contracts, users };
}
