'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Contact } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { contactCreateSchema, contactUpdateSchema } from '../schema';
import * as contactsService from '../services/contacts.service';
import type { ListContactsResult } from '../services/contacts.service';
import { lookupCompaniesByName, type CompanyLookupCandidate } from '../services/company-lookup.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe un contacto con ese RUT en esta empresa';
  }
  return toFriendlyErrorMessage(error);
}

export async function listContactsAction(query?: string): Promise<ActionResult<Contact[]>> {
  try {
    const session = await requireAuthWithPermission('contacts:read');
    const data = await contactsService.listContacts(session.companyId, query);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Versión paginada server-side, exclusiva de `ContactsClient`. Ver el
 * comentario en `contacts.service.ts::listContactsPage` sobre por qué
 * `listContactsAction` (arriba) se dejó intacta para el resto de pantallas.
 */
export async function listContactsPageAction(
  query?: string,
  type?: 'customers' | 'suppliers',
  page = 1,
  pageSize = 25
): Promise<ActionResult<ListContactsResult>> {
  try {
    const session = await requireAuthWithPermission('contacts:read');
    const data = await contactsService.listContactsPage(session.companyId, { query, type, page, pageSize });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getContactAction(id: string): Promise<ActionResult<Contact>> {
  try {
    const session = await requireAuthWithPermission('contacts:read');
    const contact = await contactsService.getContact(session.companyId, id);
    if (!contact) return { success: false, error: 'Contacto no encontrado' };
    return { success: true, data: contact };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Busca en internet (Gemini + Google Search, con DuckDuckGo de respaldo; ver
 * company-lookup.service.ts) datos públicos de una empresa por nombre, para precargar el formulario de contacto y evitar
 * tipearlo desde cero. Nunca crea el contacto — solo devuelve candidatos para
 * que el usuario revise y confirme antes de guardar, porque un RUT o
 * dirección mal buscados terminarían en un contacto real usado para facturar.
 */
export async function lookupCompanyInfoAction(query: string): Promise<ActionResult<CompanyLookupCandidate[]>> {
  try {
    await requireAuthWithPermission('contacts:write');
    const data = await lookupCompaniesByName(query);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createContactAction(input: unknown): Promise<ActionResult<Contact>> {
  try {
    const session = await requireAuthWithPermission('contacts:write');
    const parsed = contactCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const data = await contactsService.createContact(session.companyId, parsed.data);
    revalidatePath('/dashboard/contacts');
    return { success: true, data, message: 'Contacto creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateContactAction(id: string, input: unknown): Promise<ActionResult<Contact>> {
  try {
    const session = await requireAuthWithPermission('contacts:write');
    const parsed = contactUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }
    const data = await contactsService.updateContact(session.companyId, id, parsed.data);
    revalidatePath('/dashboard/contacts');
    return { success: true, data, message: 'Contacto actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteContactAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('contacts:write');
    await contactsService.deleteContact(session.companyId, id);
    revalidatePath('/dashboard/contacts');
    return { success: true, data: null, message: 'Contacto eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
