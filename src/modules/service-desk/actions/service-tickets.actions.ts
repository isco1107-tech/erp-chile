'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { getAppUrl } from '@/lib/email/mailer';
import { SERVICE_STATUS_LABELS, SERVICE_STATUSES } from '@/lib/service/tickets';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { PAYMENT_METHODS } from '@/modules/sales/schema';
import { serviceBillingSchema, serviceDiagnosisSchema, serviceLinesSchema, serviceNoteSchema, serviceStatusSchema, serviceTicketSchema } from '../schema';
import * as service from '../services/service-tickets.service';
import type { ServiceFilter, ServiceTicketDetail, ServiceTicketRow } from '../services/service-tickets.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.ServiceTicketError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'servicio-tecnico', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateTicket(id?: string): void {
  revalidatePath('/dashboard/service');
  if (id) revalidatePath(`/dashboard/service/${id}`);
}

const FILTERS = ['OPEN', 'ALL', ...SERVICE_STATUSES] as const;

export async function listServiceTicketsAction(filter: string = 'OPEN', q?: string): Promise<ActionResult<{ rows: ServiceTicketRow[]; counts: Record<string, number> }>> {
  try {
    const session = await requireAuthWithPermission('service:read');
    const safe = (FILTERS as readonly string[]).includes(filter) ? (filter as ServiceFilter) : 'OPEN';
    return { success: true, data: await service.listServiceTickets(session.companyId, { filter: safe, q: q?.slice(0, 100) }) };
  } catch (error) {
    return fail(error);
  }
}

export async function getServiceTicketAction(id: string): Promise<ActionResult<ServiceTicketDetail>> {
  try {
    const session = await requireAuthWithPermission('service:read');
    const ticket = await service.getServiceTicket(session.companyId, id);
    if (!ticket) return { success: false, error: 'Orden no encontrada' };
    return { success: true, data: ticket };
  } catch (error) {
    return fail(error);
  }
}

export async function listTechniciansAction(): Promise<ActionResult<{ id: string; name: string }[]>> {
  try {
    const session = await requireAuthWithPermission('service:read');
    return { success: true, data: await service.listTechnicians(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function createServiceTicketAction(input: unknown): Promise<ActionResult<{ id: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('service:write');
    companyId = session.companyId;
    const parsed = serviceTicketSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await service.createServiceTicket(session.companyId, { name: session.name }, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'ServiceTicket', entityId: created.id, metadata: { folio: created.folio, equipment: parsed.data.equipment } });
    revalidateTicket();
    return { success: true, data: created, message: `Orden de servicio N° ${created.folio} recibida` };
  } catch (error) {
    return fail(error, companyId, { action: 'createServiceTicket' });
  }
}

export async function updateServiceTicketAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('service:write');
    companyId = session.companyId;
    const parsed = serviceTicketSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.updateServiceTicket(session.companyId, id, parsed.data);
    revalidateTicket(id);
    return { success: true, data: null, message: 'Orden actualizada' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateServiceTicket', id });
  }
}

export async function saveDiagnosisAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('service:write');
    const parsed = serviceDiagnosisSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.saveDiagnosis(session.companyId, id, parsed.data);
    revalidateTicket(id);
    return { success: true, data: null, message: 'Diagnóstico guardado' };
  } catch (error) {
    return fail(error);
  }
}

export async function saveServiceLinesAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('service:write');
    const parsed = serviceLinesSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.saveServiceLines(session.companyId, id, parsed.data);
    revalidateTicket(id);
    return { success: true, data: null, message: 'Presupuesto guardado' };
  } catch (error) {
    return fail(error);
  }
}

export async function changeServiceStatusAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('service:write');
    companyId = session.companyId;
    const parsed = serviceStatusSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.changeServiceStatus(session.companyId, { name: session.name }, id, parsed.data.status, parsed.data.note, parsed.data.visibleToCustomer);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ServiceTicket', entityId: id, metadata: { status: parsed.data.status } });
    const ticket = await service.getServiceTicket(session.companyId, id);
    if (ticket) {
      void emitWorkflowEvent(session.companyId, 'SERVICE_TICKET_STATUS_CHANGED', {
        ticketId: id,
        folio: ticket.folio,
        status: ticket.status,
        statusLabel: SERVICE_STATUS_LABELS[ticket.status],
        customerName: ticket.customer.name,
        customerEmail: ticket.customer.email ?? '',
        equipment: ticket.equipment,
        trackingUrl: `${getAppUrl()}/servicio/${ticket.trackingToken}`,
      });
    }
    revalidateTicket(id);
    return { success: true, data: null, message: `Orden en "${SERVICE_STATUS_LABELS[parsed.data.status]}"` };
  } catch (error) {
    return fail(error, companyId, { action: 'changeServiceStatus', id });
  }
}

export async function addServiceNoteAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('service:write');
    const parsed = serviceNoteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.addServiceNote(session.companyId, { name: session.name }, id, parsed.data.note, parsed.data.visibleToCustomer);
    revalidateTicket(id);
    return { success: true, data: null, message: 'Nota agregada' };
  } catch (error) {
    return fail(error);
  }
}

/** Genera la nota de venta de la orden. Además del servicio técnico, exige poder vender. */
export async function createServiceSalesOrderAction(id: string, input: unknown): Promise<ActionResult<{ salesOrderId: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('service:write');
    companyId = session.companyId;
    if (!can(session, 'sales:write')) return { success: false, error: 'Tu rol no puede crear notas de venta: pide a Ventas que facture la orden' };
    const parsed = serviceBillingSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    if (!(PAYMENT_METHODS as readonly string[]).includes(parsed.data.paymentMethod)) return { success: false, error: 'Forma de pago inválida' };
    const result = await service.createSalesOrderForTicket(session.companyId, session.id, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'SalesOrder', entityId: result.salesOrderId, metadata: { source: 'ServiceTicket', ticketId: id } });
    revalidateTicket(id);
    revalidatePath('/dashboard/sales/orders');
    return { success: true, data: result, message: `Nota de venta N° ${result.folio} creada: emite la boleta o factura desde ahí` };
  } catch (error) {
    return fail(error, companyId, { action: 'createServiceSalesOrder', id });
  }
}
