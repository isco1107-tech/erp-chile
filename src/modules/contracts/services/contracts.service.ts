import 'server-only';

import type { Prisma, ServiceContract, ServiceContractStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isExemptDocument } from '@/lib/chile/dte/codes';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
import { contractPeriodNet, monthlyRecurringRevenue, nextBillingDate } from '@/lib/services/recurring-billing';
import type { ServiceContractInput } from '../schema';

/**
 * Contratos de servicio con facturación recurrente. La facturación en sí
 * (generar el documento del período) vive en `billing.service.ts`.
 */

const listInclude = {
  contact: { select: { id: true, razonSocial: true, rut: true } },
  project: { select: { id: true, name: true } },
  lines: { select: { quantity: true, unitPrice: true } },
  billings: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, periodKey: true, createdAt: true } },
} satisfies Prisma.ServiceContractInclude;

export type ContractListRow = Prisma.ServiceContractGetPayload<{ include: typeof listInclude }> & {
  periodNet: number;
  mrr: number;
};

export async function listContracts(companyId: string): Promise<ContractListRow[]> {
  const contracts = await prisma.serviceContract.findMany({
    where: { companyId },
    include: listInclude,
    orderBy: [{ status: 'asc' }, { nextBillingDate: 'asc' }],
    take: 500,
  });
  return contracts.map((contract) => ({
    ...contract,
    periodNet: contractPeriodNet(contract.lines),
    mrr: contract.status === 'ACTIVE' ? monthlyRecurringRevenue(contract.lines, contract.frequency) : 0,
  }));
}

const detailInclude = {
  contact: { select: { id: true, razonSocial: true, rut: true, email: true } },
  project: { select: { id: true, name: true } },
  lines: { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, name: true, sku: true, isExempt: true } } } },
  billings: {
    orderBy: { createdAt: 'desc' },
    take: 36,
    include: { salesDocument: { select: { id: true, folio: true, dteType: true, status: true, totalAmount: true, paymentStatus: true } } },
  },
} satisfies Prisma.ServiceContractInclude;

export type ContractDetail = Prisma.ServiceContractGetPayload<{ include: typeof detailInclude }>;

export async function getContract(companyId: string, id: string): Promise<ContractDetail | null> {
  return prisma.serviceContract.findFirst({ where: { id, companyId }, include: detailInclude });
}

/**
 * Primera fecha del calendario del contrato que no está en el pasado: al
 * crear un contrato con inicio hace meses no se facturan en bloque todos los
 * períodos atrasados (si se quiere cobrar el actual, se usa "Facturar ahora").
 */
export function firstUpcomingBillingDate(startDate: Date, frequency: ServiceContract['frequency'], today: Date): Date {
  let candidate = startDate;
  // Tope de iteraciones: 100 años de períodos mensuales, de sobra.
  for (let i = 0; i < 1200 && candidate.getTime() < today.getTime(); i++) {
    candidate = nextBillingDate(candidate, frequency, startDate);
  }
  return candidate;
}

async function validateReferences(companyId: string, input: ServiceContractInput): Promise<Map<string, { isExempt: boolean; name: string }>> {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
  if (!contact) throw new Error('El cliente no existe en tu empresa');
  if (input.projectId) {
    const project = await prisma.project.findFirst({ where: { id: input.projectId, companyId }, select: { id: true } });
    if (!project) throw new Error('El proyecto no existe en tu empresa');
  }
  if (input.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId }, select: { id: true } });
    if (!warehouse) throw new Error('La bodega no existe en tu empresa');
  }
  const productIds = [...new Set(input.lines.map((line) => line.productId).filter((id): id is string => Boolean(id)))];
  const products = await prisma.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true, isExempt: true, name: true } });
  if (products.length !== productIds.length) throw new Error('Uno de los productos del contrato no existe en tu catálogo');
  const byId = new Map(products.map((product) => [product.id, product]));

  // Mismo chequeo que la emisión: un documento exento no puede llevar líneas
  // afectas. Mejor avisarlo al guardar el contrato que en el cron de mañana.
  if (isExemptDocument(input.dteType)) {
    const affected = input.lines.find((line) => (line.productId ? !byId.get(line.productId)?.isExempt : !line.isExempt));
    if (affected) throw new Error(`"${affected.description}" es afecta a IVA: un documento exento solo puede llevar líneas exentas`);
  }
  return byId;
}

function lineRows(companyId: string, contractId: string, input: ServiceContractInput) {
  return input.lines.map((line, index) => ({
    companyId,
    contractId,
    productId: line.productId ?? null,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    // Con producto, la exención la decide el catálogo al facturar.
    isExempt: line.productId ? false : line.isExempt,
    sortOrder: index,
  }));
}

export async function createContract(companyId: string, input: ServiceContractInput): Promise<ServiceContract> {
  await validateReferences(companyId, input);
  const today = startOfTodaySantiago();
  return prisma.$transaction(async (tx) => {
    const contract = await tx.serviceContract.create({
      data: {
        companyId,
        contactId: input.contactId,
        projectId: input.projectId ?? null,
        name: input.name,
        dteType: input.dteType,
        paymentMethod: input.paymentMethod,
        paymentTermDays: input.paymentTermDays,
        frequency: input.frequency,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextBillingDate: firstUpcomingBillingDate(input.startDate, input.frequency, today),
        autoIssue: input.autoIssue,
        warehouseId: input.warehouseId ?? null,
        notes: input.notes ?? null,
      },
    });
    await tx.serviceContractLine.createMany({ data: lineRows(companyId, contract.id, input) });
    return contract;
  });
}

export async function updateContract(companyId: string, id: string, input: ServiceContractInput): Promise<ServiceContract> {
  const current = await prisma.serviceContract.findFirst({ where: { id, companyId } });
  if (!current) throw new Error('El contrato no existe');
  if (current.status === 'ENDED') throw new Error('Un contrato terminado no se edita: crea uno nuevo');
  await validateReferences(companyId, input);

  // Si cambió el calendario (inicio o frecuencia), la próxima fecha se
  // recalcula sin volver a facturar lo ya facturado ni períodos pasados.
  const calendarChanged = current.startDate.getTime() !== input.startDate.getTime() || current.frequency !== input.frequency;
  const nextDate = calendarChanged
    ? firstUpcomingBillingDate(input.startDate, input.frequency, new Date(Math.max(startOfTodaySantiago().getTime(), current.nextBillingDate.getTime())))
    : current.nextBillingDate;

  return prisma.$transaction(async (tx) => {
    await tx.serviceContract.updateMany({
      where: { id, companyId },
      data: {
        contactId: input.contactId,
        projectId: input.projectId ?? null,
        name: input.name,
        dteType: input.dteType,
        paymentMethod: input.paymentMethod,
        paymentTermDays: input.paymentTermDays,
        frequency: input.frequency,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextBillingDate: nextDate,
        autoIssue: input.autoIssue,
        warehouseId: input.warehouseId ?? null,
        notes: input.notes ?? null,
      },
    });
    await tx.serviceContractLine.deleteMany({ where: { companyId, contractId: id } });
    await tx.serviceContractLine.createMany({ data: lineRows(companyId, id, input) });
    return tx.serviceContract.findFirstOrThrow({ where: { id, companyId } });
  });
}

/**
 * Pausar, reanudar o terminar. Al reanudar, la próxima facturación salta al
 * siguiente período desde hoy: los meses en pausa no se facturan en bloque.
 */
export async function setContractStatus(companyId: string, id: string, status: ServiceContractStatus): Promise<void> {
  const current = await prisma.serviceContract.findFirst({ where: { id, companyId } });
  if (!current) throw new Error('El contrato no existe');
  if (current.status === 'ENDED' && status !== 'ENDED') throw new Error('Un contrato terminado no se puede reactivar: crea uno nuevo');
  const data: Prisma.ServiceContractUpdateManyMutationInput = { status };
  if (status === 'ACTIVE' && current.status === 'PAUSED') {
    const today = startOfTodaySantiago();
    if (current.nextBillingDate.getTime() < today.getTime()) {
      let candidate = current.nextBillingDate;
      for (let i = 0; i < 1200 && candidate.getTime() < today.getTime(); i++) {
        candidate = nextBillingDate(candidate, current.frequency, current.startDate);
      }
      data.nextBillingDate = candidate;
    }
  }
  const result = await prisma.serviceContract.updateMany({ where: { id, companyId, status: current.status }, data });
  if (result.count === 0) throw new Error('El contrato cambió mientras lo editabas. Recarga e inténtalo de nuevo.');
}

export async function isAutoIssue(companyId: string, id: string): Promise<boolean> {
  const contract = await prisma.serviceContract.findFirst({ where: { id, companyId }, select: { autoIssue: true } });
  return contract?.autoIssue ?? false;
}

/** Solo se borra un contrato que nunca facturó; si ya facturó, se termina. */
export async function deleteContract(companyId: string, id: string): Promise<void> {
  const billed = await prisma.serviceContractBilling.count({ where: { companyId, contractId: id, status: 'GENERATED' } });
  if (billed > 0) throw new Error('Este contrato ya facturó: termínalo en vez de eliminarlo, así conservas su historial');
  const result = await prisma.serviceContract.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('El contrato no existe');
}

export interface ContractLookups {
  products: Array<{ id: string; name: string; sku: string; netPrice: number; isExempt: boolean }>;
  projects: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; isDefault: boolean }>;
}

export async function getContractLookups(companyId: string, withProjects: boolean): Promise<ContractLookups> {
  const [products, projects, warehouses] = await Promise.all([
    prisma.product.findMany({ where: { companyId }, select: { id: true, name: true, sku: true, netPrice: true, isExempt: true }, orderBy: { name: 'asc' }, take: 1000 }),
    withProjects ? prisma.project.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    prisma.warehouse.findMany({ where: { companyId }, select: { id: true, name: true, isDefault: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
  ]);
  return { products, projects, warehouses };
}
