'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type PromissoryNote } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  promissoryNoteCreateSchema,
  promissoryNotePaymentSchema,
  promissoryNoteUpdateSchema,
} from '../schema';
import * as promissoryNotesService from '../services/promissory-notes.service';
import { emitPaymentEvent } from '@/modules/treasury/services/movements.service';
import type {
  OverduePromissoryNote,
  PromissoryNoteWithRelations,
} from '../services/promissory-notes.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al guardar el pagaré';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

function revalidatePromissoryNotes(id?: string) {
  revalidatePath('/dashboard/promissory-notes');
  if (id) revalidatePath(`/dashboard/promissory-notes/${id}`);
}

export async function listPromissoryNotesAction(contactId?: string): Promise<ActionResult<PromissoryNoteWithRelations[]>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:read');
    const data = await promissoryNotesService.listPromissoryNotes(session.companyId, contactId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPromissoryNoteAction(id: string): Promise<ActionResult<PromissoryNoteWithRelations>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:read');
    const note = await promissoryNotesService.getPromissoryNote(session.companyId, id);
    if (!note) return { success: false, error: 'Pagaré no encontrado' };
    return { success: true, data: note };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPromissoryNoteAction(input: unknown): Promise<ActionResult<PromissoryNote>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:write');
    const parsed = promissoryNoteCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await promissoryNotesService.createPromissoryNote(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PromissoryNote',
      entityId: data.id,
      metadata: { contactId: data.contactId, candidateId: data.candidateId, amount: data.amount },
    });
    revalidatePromissoryNotes();
    return { success: true, data, message: 'Pagaré creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePromissoryNoteAction(id: string, input: unknown): Promise<ActionResult<PromissoryNote>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:write');
    const parsed = promissoryNoteUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await promissoryNotesService.updatePromissoryNote(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PromissoryNote',
      entityId: data.id,
      metadata: { status: data.status },
    });
    revalidatePromissoryNotes(id);
    return { success: true, data, message: 'Pagaré actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deletePromissoryNoteAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:write');
    await promissoryNotesService.deletePromissoryNote(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'PromissoryNote',
      entityId: id,
      metadata: {},
    });
    revalidatePromissoryNotes();
    return { success: true, data: null, message: 'Pagaré eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function registerPromissoryNotePaymentAction(id: string, input: unknown): Promise<ActionResult<PromissoryNote>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:write');
    const parsed = promissoryNotePaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const { note: data, payment } = await promissoryNotesService.registerPromissoryNotePayment(session.companyId, id, parsed.data, session.id);
    if (payment) emitPaymentEvent(session.companyId, payment);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PromissoryNote',
      entityId: data.id,
      metadata: { paidAmount: data.paidAmount, paymentStatus: data.paymentStatus, paymentId: payment?.id ?? null },
    });
    revalidatePromissoryNotes(id);
    return { success: true, data, message: 'Pago actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listOverduePromissoryNotesAction(): Promise<ActionResult<OverduePromissoryNote[]>> {
  try {
    const session = await requireAuthWithPermission('promissorynotes:read');
    const data = await promissoryNotesService.listOverduePromissoryNotes(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
