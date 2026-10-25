'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Contact } from '@prisma/client';
import {
  requireAuthWithPermission,
  authErrorMessage,
  can,
  assertModuleEnabled,
} from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { isEntityId } from '@/lib/security/entity-id';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { contactCreateWithAccessSchema, contactUpdateSchema } from '../schema';
import * as contactsService from '../services/contacts.service';
import { SellerCenterError } from '@/lib/supplier-portal/errors';
import {
  sellerDeliveryMessage,
  type SellerInvitationDelivery,
} from '@/lib/supplier-portal/identity';
import type { ListContactsResult } from '../services/contacts.service';
import {
  lookupCompaniesByName,
  type CompanyLookupCandidate,
} from '../services/company-lookup.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const INVALID_ID: { success: false; error: string } = {
  success: false,
  error: 'Datos inválidos',
};
const CONSIGNMENT_PERMISSION_ERROR =
  'Marcar a un contacto como seller o cambiar su comisión requiere el permiso de consignación (Dueño, Administrador o Contador)';

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof SellerCenterError) return error.message;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return 'Ya existe un contacto con ese RUT en esta empresa';
  }
  return toFriendlyErrorMessage(error);
}

export async function listContactsAction(
  query?: string,
): Promise<ActionResult<Contact[]>> {
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
  type?: 'customers' | 'suppliers' | 'consignors',
  page = 1,
  pageSize = 25,
): Promise<ActionResult<ListContactsResult>> {
  try {
    const session = await requireAuthWithPermission('contacts:read');
    const data = await contactsService.listContactsPage(session.companyId, {
      query,
      type,
      page,
      pageSize,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getContactAction(
  id: string,
): Promise<ActionResult<Contact>> {
  try {
    if (!isEntityId(id)) return INVALID_ID;
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
export async function lookupCompanyInfoAction(
  query: string,
): Promise<ActionResult<CompanyLookupCandidate[]>> {
  try {
    await requireAuthWithPermission('contacts:write');
    const data = await lookupCompaniesByName(query);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createContactAction(
  input: unknown,
): Promise<ActionResult<Contact> & { onboarding?: SellerInvitationDelivery }> {
  try {
    const session = await requireAuthWithPermission('contacts:write');
    const parsed = contactCreateWithAccessSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      };
    }
    // La comisión del seller define lo que se le paga: un vendedor que puede crear clientes no debería fijarla.
    if (parsed.data.isConsignor && !can(session, 'consignment:write'))
      return { success: false, error: CONSIGNMENT_PERMISSION_ERROR };
    if (parsed.data.sellerCenterAccess) {
      if (!parsed.data.isConsignor)
        return {
          success: false,
          error: 'Solo un seller puede tener acceso a Seller Center',
        };
      // Contact creation alone never grants access to a third party.
      await requireAuthWithPermission('settings:company');
      assertModuleEnabled(session, 'hasSellerCenter');
      const { sellerCenterAccess, ...contactInput } = parsed.data;
      const { createSellerWithInvitation } = await import(
        '../services/seller-onboarding.service'
      );
      const { contact, onboarding } = await createSellerWithInvitation(
        session.companyId,
        { id: session.id, name: session.name },
        contactInput,
        sellerCenterAccess,
      );
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'CREATE',
        entity: 'SupplierPortalMembership',
        entityId: onboarding.membershipId,
        metadata: {
          supplierId: contact.id,
          channel: 'email' in sellerCenterAccess ? 'email' : 'whatsapp',
        },
      });
      revalidatePath('/dashboard/contacts');
      revalidatePath(`/dashboard/contacts/${contact.id}`);
      return {
        success: true,
        data: contact,
        onboarding,
        message: `Seller creado. ${sellerDeliveryMessage(onboarding.delivery)}`,
      };
    }
    const data = await contactsService.createContact(
      session.companyId,
      parsed.data,
    );
    revalidatePath('/dashboard/contacts');
    return { success: true, data, message: 'Contacto creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateContactAction(
  id: string,
  input: unknown,
): Promise<ActionResult<Contact>> {
  try {
    if (!isEntityId(id)) return INVALID_ID;
    const session = await requireAuthWithPermission('contacts:write');
    const parsed = contactUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      };
    }
    // La condición de seller y su comisión definen lo que se le paga: solo cambian con permiso de consignación, y queda en la bitácora.
    // Se compara contra lo guardado: el formulario manda siempre estos campos y editar otra cosa no es un cambio.
    let consignmentChange: {
      from: { isConsignor: boolean; commissionBps: number | null };
      to: { isConsignor: boolean; commissionBps: number | null };
    } | null = null;
    if (
      parsed.data.isConsignor !== undefined ||
      parsed.data.consignmentCommissionBps !== undefined
    ) {
      const current = await contactsService.getContact(session.companyId, id);
      if (!current) return { success: false, error: 'Contacto no encontrado' };
      const from = {
        isConsignor: current.isConsignor,
        commissionBps: current.consignmentCommissionBps,
      };
      const to = {
        isConsignor: parsed.data.isConsignor ?? current.isConsignor,
        commissionBps:
          parsed.data.consignmentCommissionBps === undefined
            ? current.consignmentCommissionBps
            : parsed.data.consignmentCommissionBps,
      };
      if (
        from.isConsignor !== to.isConsignor ||
        (to.isConsignor && from.commissionBps !== to.commissionBps)
      ) {
        if (!can(session, 'consignment:write'))
          return { success: false, error: CONSIGNMENT_PERMISSION_ERROR };
        consignmentChange = { from, to };
      }
    }
    const data = await contactsService.updateContact(
      session.companyId,
      id,
      parsed.data,
    );
    if (consignmentChange) {
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'UPDATE',
        entity: 'Contact',
        entityId: id,
        metadata: { consignment: consignmentChange },
      });
    }
    revalidatePath('/dashboard/contacts');
    return {
      success: true,
      data,
      message: 'Contacto actualizado correctamente',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteContactAction(
  id: string,
): Promise<ActionResult<null>> {
  try {
    if (!isEntityId(id)) return INVALID_ID;
    const session = await requireAuthWithPermission('contacts:write');
    await contactsService.deleteContact(session.companyId, id);
    revalidatePath('/dashboard/contacts');
    return { success: true, data: null, message: 'Contacto eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
