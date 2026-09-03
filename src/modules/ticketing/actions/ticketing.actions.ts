'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type TicketSale, type TicketType } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { confirmTicketPaymentSchema, ticketTypeCreateSchema, ticketTypeUpdateSchema } from '../schema';
import * as ticketingService from '../services/ticketing.service';
import type {
  ProjectSelectOption,
  TicketingSummaryRow,
  TicketSaleListFilters,
  TicketSaleWithType,
} from '../services/ticketing.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al guardar los datos de venta de entradas';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

function revalidateTicketing() {
  revalidatePath('/dashboard/ticketing');
}

export async function listProjectsForSelectAction(): Promise<ActionResult<ProjectSelectOption[]>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const data = await ticketingService.listProjectsForSelect(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getOrCreateTicketSalesLinkAction(projectId: string): Promise<ActionResult<{ token: string }>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const token = await ticketingService.getOrCreateTicketSalesToken(session.companyId, projectId);
    return { success: true, data: { token } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function regenerateTicketSalesLinkAction(projectId: string): Promise<ActionResult<{ token: string }>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const token = await ticketingService.regenerateTicketSalesToken(session.companyId, projectId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      metadata: { ticketSalesTokenRegenerated: true },
    });
    return { success: true, data: { token }, message: 'Link regenerado — el anterior dejó de funcionar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listTicketTypesAction(projectId?: string): Promise<ActionResult<TicketType[]>> {
  try {
    const session = await requireAuthWithPermission('ticketing:read');
    const data = await ticketingService.listTicketTypes(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createTicketTypeAction(input: unknown): Promise<ActionResult<TicketType>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const parsed = ticketTypeCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await ticketingService.createTicketType(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'TicketType',
      entityId: data.id,
      metadata: { projectId: data.projectId, name: data.name, price: data.price },
    });
    revalidateTicketing();
    return { success: true, data, message: 'Tipo de entrada creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateTicketTypeAction(id: string, input: unknown): Promise<ActionResult<TicketType>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const parsed = ticketTypeUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await ticketingService.updateTicketType(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'TicketType',
      entityId: data.id,
      metadata: { name: data.name, salesOpen: data.salesOpen },
    });
    revalidateTicketing();
    return { success: true, data, message: 'Tipo de entrada actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteTicketTypeAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    await ticketingService.deleteTicketType(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'TicketType',
      entityId: id,
      metadata: {},
    });
    revalidateTicketing();
    return { success: true, data: null, message: 'Tipo de entrada eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listTicketSalesAction(filters: TicketSaleListFilters = {}): Promise<ActionResult<TicketSaleWithType[]>> {
  try {
    const session = await requireAuthWithPermission('ticketing:read');
    const data = await ticketingService.listTicketSales(session.companyId, filters);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getTicketingSummaryAction(projectId: string): Promise<ActionResult<TicketingSummaryRow[]>> {
  try {
    const session = await requireAuthWithPermission('ticketing:read');
    const data = await ticketingService.getTicketingSummary(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function confirmTicketPaymentAction(id: string, input: unknown): Promise<ActionResult<TicketSale>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const parsed = confirmTicketPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await ticketingService.confirmTicketPayment(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'TicketSale',
      entityId: data.id,
      metadata: { paidAmount: data.paidAmount, paymentStatus: data.paymentStatus },
    });
    revalidateTicketing();
    return { success: true, data, message: 'Pago actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function checkInTicketAction(qrCode: string): Promise<ActionResult<{ sale: TicketSale; alreadyCheckedIn: boolean }>> {
  try {
    const session = await requireAuthWithPermission('ticketing:write');
    const data = await ticketingService.checkInTicket(session.companyId, qrCode);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'TicketSale',
      entityId: data.sale.id,
      metadata: { checkedIn: true, alreadyCheckedIn: data.alreadyCheckedIn },
    });
    revalidateTicketing();
    return { success: true, data, message: data.alreadyCheckedIn ? 'Esta entrada ya había hecho check-in' : 'Check-in registrado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
