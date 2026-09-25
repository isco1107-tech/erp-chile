import crypto from 'crypto';
import type { Prisma, ServiceTicketStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { canEditEstimate, canTransition, daysOpen, estimateTotals, SERVICE_STATUS_LABELS } from '@/lib/service/tickets';
import { createSalesOrder } from '@/modules/sales/services/sales-orders.service';
import type { ServiceTicketInput } from '../schema';

/**
 * Servicio técnico: el cliente deja un equipo, se diagnostica, se envía un
 * presupuesto que el cliente aprueba desde su enlace de seguimiento, se
 * repara y se entrega. La facturación reutiliza las notas de venta: la orden
 * genera una nota con repuestos y mano de obra (los repuestos quedan
 * reservados) y desde ahí se emite la boleta o factura.
 *
 * `trackingToken` se guarda en claro a propósito (a diferencia del portal del
 * trabajador): va impreso en el comprobante de recepción y hay que poder
 * reimprimirlo. Solo da acceso al estado de ESE equipo y a su presupuesto.
 */

export class ServiceTicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceTicketError';
  }
}

type Tx = Prisma.TransactionClient;

function day(value: string | undefined): Date | null {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

export function newTrackingToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

async function assertTechnician(tx: Tx | typeof prisma, companyId: string, technicianId: string | null | undefined) {
  if (!technicianId) return;
  const user = await tx.user.findFirst({ where: { id: technicianId, companyId }, select: { id: true } });
  if (!user) throw new ServiceTicketError('Técnico no encontrado');
}

export async function createServiceTicket(companyId: string, user: { name: string }, input: ServiceTicketInput): Promise<{ id: string; folio: number }> {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
    if (!contact) throw new ServiceTicketError('Cliente no encontrado');
    await assertTechnician(tx, companyId, input.technicianId);
    const seq = await tx.internalDocumentSequence.upsert({
      where: { companyId_kind: { companyId, kind: 'SERVICE_TICKET' } },
      update: { currentFolio: { increment: 1 } },
      create: { companyId, kind: 'SERVICE_TICKET', currentFolio: 1 },
    });
    const ticket = await tx.serviceTicket.create({
      data: {
        companyId,
        folio: seq.currentFolio,
        contactId: input.contactId,
        equipment: input.equipment,
        brand: input.brand || null,
        model: input.model || null,
        serialNumber: input.serialNumber || null,
        accessories: input.accessories || null,
        reportedIssue: input.reportedIssue,
        priority: input.priority,
        promisedDate: day(input.promisedDate),
        warranty: input.warranty,
        technicianId: input.technicianId || null,
        notes: input.notes || null,
        trackingToken: newTrackingToken(),
        receivedByName: user.name,
        events: { create: { companyId, status: 'RECEIVED', note: 'Equipo recibido', createdByName: user.name } },
      },
      select: { id: true, folio: true },
    });
    return ticket;
  }, LOCKING_TX_OPTIONS);
}

export async function updateServiceTicket(companyId: string, id: string, input: ServiceTicketInput): Promise<void> {
  await assertTechnician(prisma, companyId, input.technicianId);
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
  if (!contact) throw new ServiceTicketError('Cliente no encontrado');
  const { count } = await prisma.serviceTicket.updateMany({
    where: { id, companyId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
    data: {
      contactId: input.contactId,
      equipment: input.equipment,
      brand: input.brand || null,
      model: input.model || null,
      serialNumber: input.serialNumber || null,
      accessories: input.accessories || null,
      reportedIssue: input.reportedIssue,
      priority: input.priority,
      promisedDate: day(input.promisedDate),
      warranty: input.warranty,
      technicianId: input.technicianId || null,
      notes: input.notes || null,
    },
  });
  if (count === 0) throw new ServiceTicketError('Una orden entregada o anulada no se modifica');
}

export async function saveDiagnosis(
  companyId: string,
  id: string,
  input: { diagnosis: string; technicianId?: string | null; promisedDate?: string; priority: string }
): Promise<void> {
  await assertTechnician(prisma, companyId, input.technicianId);
  const { count } = await prisma.serviceTicket.updateMany({
    where: { id, companyId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
    data: { diagnosis: input.diagnosis || null, technicianId: input.technicianId || null, promisedDate: day(input.promisedDate), priority: input.priority },
  });
  if (count === 0) throw new ServiceTicketError('Una orden entregada o anulada no se modifica');
}

export async function saveServiceLines(
  companyId: string,
  id: string,
  lines: { kind: 'PART' | 'LABOR'; productId?: string | null; description: string; quantity: number; unitPrice: number }[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const ticket = await tx.serviceTicket.findFirst({ where: { id, companyId }, select: { status: true, salesOrderId: true, warranty: true } });
    if (!ticket) throw new ServiceTicketError('Orden no encontrada');
    if (ticket.status === 'DELIVERED' || ticket.status === 'CANCELLED') throw new ServiceTicketError('Una orden entregada o anulada no se modifica');
    if (ticket.salesOrderId) throw new ServiceTicketError('La orden ya tiene nota de venta: ajusta el cobro ahí');
    // Cambiar un presupuesto enviado o aprobado exige volver a pedir aprobación.
    if (!canEditEstimate(ticket.status, ticket.warranty)) {
      throw new ServiceTicketError('El presupuesto ya se envió al cliente: vuelve la orden a diagnóstico para modificarlo y reenviarlo');
    }
    const productIds = Array.from(new Set(lines.map((line) => line.productId).filter((value): value is string => Boolean(value))));
    if (productIds.length > 0) {
      const found = await tx.product.count({ where: { companyId, id: { in: productIds } } });
      if (found !== productIds.length) throw new ServiceTicketError('Uno de los repuestos no existe en tu catálogo');
    }
    await tx.serviceTicketLine.deleteMany({ where: { companyId, ticketId: id } });
    await tx.serviceTicketLine.createMany({
      data: lines.map((line, position) => ({
        companyId,
        ticketId: id,
        kind: line.kind,
        productId: line.kind === 'PART' ? line.productId || null : null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        position,
      })),
    });
  }, LOCKING_TX_OPTIONS);
}

export async function changeServiceStatus(
  companyId: string,
  user: { name: string },
  id: string,
  status: ServiceTicketStatus,
  note?: string,
  visibleToCustomer = true
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const ticket = await tx.serviceTicket.findFirst({ where: { id, companyId }, include: { _count: { select: { lines: true } } } });
    if (!ticket) throw new ServiceTicketError('Orden no encontrada');
    if (!canTransition(ticket.status, status, { warranty: ticket.warranty })) {
      throw new ServiceTicketError(`No se puede pasar de "${SERVICE_STATUS_LABELS[ticket.status]}" a "${SERVICE_STATUS_LABELS[status]}"`);
    }
    if (status === 'WAITING_APPROVAL' && ticket._count.lines === 0) throw new ServiceTicketError('Agrega repuestos o mano de obra al presupuesto antes de enviarlo');
    const data: Prisma.ServiceTicketUpdateManyMutationInput = { status };
    if (status === 'WAITING_APPROVAL') {
      data.estimateDecision = null;
      data.estimateDecidedAt = null;
      data.estimateDecidedBy = null;
    }
    if (status === 'APPROVED') {
      data.estimateDecision = 'APPROVED';
      data.estimateDecidedAt = new Date();
      data.estimateDecidedBy = 'STAFF';
    }
    if (status === 'READY' && ticket.status === 'WAITING_APPROVAL') {
      data.estimateDecision = 'REJECTED';
      data.estimateDecidedAt = new Date();
      data.estimateDecidedBy = 'STAFF';
    }
    if (status === 'DELIVERED') data.deliveredAt = new Date();
    await tx.serviceTicket.updateMany({ where: { id, companyId }, data });
    await tx.serviceTicketEvent.create({ data: { companyId, ticketId: id, status, note: note || null, visibleToCustomer, createdByName: user.name } });
  }, LOCKING_TX_OPTIONS);
}

export async function addServiceNote(companyId: string, user: { name: string }, id: string, note: string, visibleToCustomer: boolean): Promise<void> {
  const ticket = await prisma.serviceTicket.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!ticket) throw new ServiceTicketError('Orden no encontrada');
  await prisma.serviceTicketEvent.create({ data: { companyId, ticketId: id, note, visibleToCustomer, createdByName: user.name } });
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export interface ServiceTicketRow {
  id: string;
  folio: number;
  customerName: string;
  equipment: string;
  brandModel: string | null;
  status: ServiceTicketStatus;
  priority: string;
  warranty: boolean;
  technicianName: string | null;
  promisedDate: Date | null;
  createdAt: Date;
  daysOpen: number;
  estimateTotal: number;
}

export type ServiceFilter = ServiceTicketStatus | 'OPEN' | 'ALL';

export async function listServiceTickets(companyId: string, options: { filter?: ServiceFilter; q?: string } = {}): Promise<{ rows: ServiceTicketRow[]; counts: Record<ServiceTicketStatus, number> }> {
  const where: Prisma.ServiceTicketWhereInput = { companyId };
  const filter = options.filter ?? 'OPEN';
  if (filter === 'OPEN') where.status = { notIn: ['DELIVERED', 'CANCELLED'] };
  else if (filter !== 'ALL') where.status = filter;
  const q = options.q?.trim();
  if (q) {
    const folio = Number(q);
    where.OR = [
      { equipment: { contains: q, mode: 'insensitive' } },
      { serialNumber: { contains: q, mode: 'insensitive' } },
      { contact: { razonSocial: { contains: q, mode: 'insensitive' } } },
      ...(Number.isInteger(folio) && folio > 0 ? [{ folio }] : []),
    ];
  }
  const now = new Date();
  const [tickets, grouped] = await Promise.all([
    prisma.serviceTicket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
      include: { contact: { select: { razonSocial: true } }, technician: { select: { name: true } }, lines: { select: { quantity: true, unitPrice: true } } },
    }),
    prisma.serviceTicket.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED'].map((status) => [status, 0])) as Record<ServiceTicketStatus, number>;
  for (const group of grouped) counts[group.status] = group._count._all;
  return {
    rows: tickets.map((ticket) => ({
      id: ticket.id,
      folio: ticket.folio,
      customerName: ticket.contact.razonSocial,
      equipment: ticket.equipment,
      brandModel: [ticket.brand, ticket.model].filter(Boolean).join(' ') || null,
      status: ticket.status,
      priority: ticket.priority,
      warranty: ticket.warranty,
      technicianName: ticket.technician?.name ?? null,
      promisedDate: ticket.promisedDate,
      createdAt: ticket.createdAt,
      daysOpen: daysOpen(ticket.createdAt, now),
      estimateTotal: estimateTotals(ticket.lines).total,
    })),
    counts,
  };
}

export interface ServiceTicketDetail {
  id: string;
  folio: number;
  contactId: string;
  customer: { name: string; rut: string; phone: string | null; email: string | null };
  equipment: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  accessories: string | null;
  reportedIssue: string;
  diagnosis: string | null;
  priority: string;
  status: ServiceTicketStatus;
  warranty: boolean;
  technicianId: string | null;
  technicianName: string | null;
  promisedDate: Date | null;
  estimateDecision: string | null;
  estimateDecidedAt: Date | null;
  estimateDecidedBy: string | null;
  deliveredAt: Date | null;
  trackingToken: string;
  receivedByName: string | null;
  notes: string | null;
  createdAt: Date;
  salesOrder: { id: string; folio: number; status: string } | null;
  lines: { id: string; kind: string; productId: string | null; sku: string | null; description: string; quantity: number; unitPrice: number }[];
  events: { id: string; status: ServiceTicketStatus | null; note: string | null; visibleToCustomer: boolean; createdByName: string | null; createdAt: Date }[];
  totals: { net: number; iva: number; total: number };
}

export async function getServiceTicket(companyId: string, id: string): Promise<ServiceTicketDetail | null> {
  const ticket = await prisma.serviceTicket.findFirst({
    where: { id, companyId },
    include: {
      contact: { select: { razonSocial: true, rut: true, phone: true, email: true } },
      technician: { select: { name: true } },
      salesOrder: { select: { id: true, folio: true, status: true } },
      lines: { orderBy: { position: 'asc' }, include: { product: { select: { sku: true } } } },
      events: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!ticket) return null;
  return {
    id: ticket.id,
    folio: ticket.folio,
    contactId: ticket.contactId,
    customer: { name: ticket.contact.razonSocial, rut: ticket.contact.rut, phone: ticket.contact.phone, email: ticket.contact.email },
    equipment: ticket.equipment,
    brand: ticket.brand,
    model: ticket.model,
    serialNumber: ticket.serialNumber,
    accessories: ticket.accessories,
    reportedIssue: ticket.reportedIssue,
    diagnosis: ticket.diagnosis,
    priority: ticket.priority,
    status: ticket.status,
    warranty: ticket.warranty,
    technicianId: ticket.technicianId,
    technicianName: ticket.technician?.name ?? null,
    promisedDate: ticket.promisedDate,
    estimateDecision: ticket.estimateDecision,
    estimateDecidedAt: ticket.estimateDecidedAt,
    estimateDecidedBy: ticket.estimateDecidedBy,
    deliveredAt: ticket.deliveredAt,
    trackingToken: ticket.trackingToken,
    receivedByName: ticket.receivedByName,
    notes: ticket.notes,
    createdAt: ticket.createdAt,
    salesOrder: ticket.salesOrder,
    lines: ticket.lines.map((line) => ({ id: line.id, kind: line.kind, productId: line.productId, sku: line.product?.sku ?? null, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
    events: ticket.events.map((event) => ({ id: event.id, status: event.status, note: event.note, visibleToCustomer: event.visibleToCustomer, createdByName: event.createdByName, createdAt: event.createdAt })),
    totals: estimateTotals(ticket.lines),
  };
}

/** Técnicos asignables: usuarios activos de la empresa. */
export async function listTechnicians(companyId: string): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({ where: { companyId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
}

/**
 * Genera la nota de venta de la orden (repuestos + mano de obra). Los
 * repuestos del catálogo quedan reservados en la bodega elegida; la boleta o
 * factura se emite después desde la nota, con el flujo normal de Ventas.
 */
export async function createSalesOrderForTicket(
  companyId: string,
  userId: string,
  id: string,
  input: { warehouseId: string; paymentMethod: string }
): Promise<{ salesOrderId: string; folio: number }> {
  const ticket = await prisma.serviceTicket.findFirst({ where: { id, companyId }, include: { lines: { orderBy: { position: 'asc' } } } });
  if (!ticket) throw new ServiceTicketError('Orden no encontrada');
  if (ticket.salesOrderId) throw new ServiceTicketError('La orden ya tiene su nota de venta');
  if (ticket.status === 'CANCELLED') throw new ServiceTicketError('La orden está anulada');
  // Se cobra lo que el cliente aprobó: ni un presupuesto pendiente ni uno rechazado.
  if (!ticket.warranty && ticket.estimateDecision !== 'APPROVED') {
    throw new ServiceTicketError('El cobro se genera cuando el cliente aprueba el presupuesto');
  }
  const billable = ticket.lines.filter((line) => line.unitPrice > 0 || line.productId);
  if (billable.length === 0) throw new ServiceTicketError(ticket.warranty ? 'Es una reparación en garantía sin cobro: no hay nada que facturar' : 'Agrega repuestos o mano de obra antes de facturar');

  const order = await createSalesOrder(companyId, userId, {
    contactId: ticket.contactId,
    warehouseId: input.warehouseId,
    paymentMethod: input.paymentMethod as Parameters<typeof createSalesOrder>[2]['paymentMethod'],
    notes: `Servicio técnico N° ${ticket.folio}: ${ticket.equipment}${ticket.serialNumber ? ` (S/N ${ticket.serialNumber})` : ''}`,
    items: billable.map((line) => ({
      productId: line.productId ?? undefined,
      description: line.kind === 'LABOR' ? `Mano de obra: ${line.description}` : line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  });
  const { count } = await prisma.serviceTicket.updateMany({ where: { id, companyId, salesOrderId: null }, data: { salesOrderId: order.id } });
  if (count === 0) throw new ServiceTicketError('La orden ya tiene su nota de venta');
  return { salesOrderId: order.id, folio: order.folio };
}

// ─── Enlace público de seguimiento ───────────────────────────────────────────

export interface PublicServiceView {
  company: { name: string; logoUrl: string | null; phone: string | null; email: string | null; address: string | null };
  folio: number;
  customerFirstName: string;
  equipment: string;
  brandModel: string | null;
  serialNumber: string | null;
  status: ServiceTicketStatus;
  warranty: boolean;
  reportedIssue: string;
  diagnosis: string | null;
  promisedDate: Date | null;
  receivedAt: Date;
  deliveredAt: Date | null;
  estimate: { lines: { description: string; quantity: number; unitPrice: number }[]; net: number; iva: number; total: number } | null;
  estimateDecision: string | null;
  events: { status: ServiceTicketStatus | null; note: string | null; createdAt: Date }[];
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Vista para el cliente: se arma campo por campo, nunca con la orden
 * completa — no sale el RUT, ni las notas internas, ni el técnico, ni los
 * eventos marcados como internos.
 */
export async function getPublicServiceView(token: string): Promise<PublicServiceView | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const ticket = await prisma.serviceTicket.findUnique({
    where: { trackingToken: token },
    include: {
      company: { select: { businessName: true, logoUrl: true, phone: true, email: true, address: true, status: true } },
      contact: { select: { razonSocial: true } },
      lines: { orderBy: { position: 'asc' }, select: { description: true, quantity: true, unitPrice: true, kind: true } },
      events: { where: { visibleToCustomer: true }, orderBy: { createdAt: 'desc' }, take: 30, select: { status: true, note: true, createdAt: true } },
    },
  });
  if (!ticket || ticket.company.status !== 'ACTIVE') return null;
  const showEstimate = ticket.lines.length > 0 && !['RECEIVED', 'DIAGNOSING'].includes(ticket.status);
  const totals = estimateTotals(ticket.lines);
  return {
    company: { name: ticket.company.businessName, logoUrl: ticket.company.logoUrl, phone: ticket.company.phone, email: ticket.company.email, address: ticket.company.address },
    folio: ticket.folio,
    customerFirstName: ticket.contact.razonSocial.split(' ')[0] ?? '',
    equipment: ticket.equipment,
    brandModel: [ticket.brand, ticket.model].filter(Boolean).join(' ') || null,
    serialNumber: ticket.serialNumber,
    status: ticket.status,
    warranty: ticket.warranty,
    reportedIssue: ticket.reportedIssue,
    diagnosis: ticket.status === 'RECEIVED' ? null : ticket.diagnosis,
    promisedDate: ticket.promisedDate,
    receivedAt: ticket.createdAt,
    deliveredAt: ticket.deliveredAt,
    estimate: showEstimate
      ? {
          lines: ticket.lines.map((line) => ({ description: line.kind === 'LABOR' ? `Mano de obra: ${line.description}` : line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
          ...totals,
        }
      : null,
    estimateDecision: ticket.estimateDecision,
    events: ticket.events,
  };
}

export class PublicServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicServiceError';
  }
}

/** El cliente aprueba o rechaza el presupuesto desde su enlace. */
export async function decideEstimateFromPortal(token: string, approve: boolean, comment?: string): Promise<{ companyId: string; folio: number }> {
  if (!TOKEN_PATTERN.test(token)) throw new PublicServiceError('El enlace no es válido');
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.serviceTicket.findUnique({ where: { trackingToken: token }, select: { id: true, companyId: true, folio: true, status: true, company: { select: { status: true } } } });
    if (!ticket || ticket.company.status !== 'ACTIVE') throw new PublicServiceError('El enlace no es válido');
    await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id = ${ticket.id} FOR UPDATE`;
    const { count } = await tx.serviceTicket.updateMany({
      where: { id: ticket.id, companyId: ticket.companyId, status: 'WAITING_APPROVAL' },
      data: {
        status: approve ? 'APPROVED' : 'READY',
        estimateDecision: approve ? 'APPROVED' : 'REJECTED',
        estimateDecidedAt: new Date(),
        estimateDecidedBy: 'CUSTOMER',
      },
    });
    if (count === 0) throw new PublicServiceError('Este presupuesto ya fue respondido');
    const note = approve ? 'Presupuesto aprobado por el cliente' : 'Presupuesto rechazado por el cliente: el equipo queda listo para retiro sin reparar';
    await tx.serviceTicketEvent.create({
      data: {
        companyId: ticket.companyId,
        ticketId: ticket.id,
        status: approve ? 'APPROVED' : 'READY',
        note: comment?.trim() ? `${note}. Comentario: ${comment.trim()}` : note,
        visibleToCustomer: true,
        createdByName: 'Cliente',
      },
    });
    return { companyId: ticket.companyId, folio: ticket.folio };
  }, LOCKING_TX_OPTIONS);
}
