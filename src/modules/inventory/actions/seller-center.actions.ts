'use server';

import { revalidatePath } from 'next/cache';
import {
  assertModuleEnabled,
  authErrorMessage,
  requireAuthWithPermission,
} from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import {
  sellerInvitationSchema,
  sellerDeliveryMessage,
  type SellerInvitationDelivery,
} from '@/lib/supplier-portal/identity';
import { SellerCenterError } from '@/lib/supplier-portal/errors';
import * as accounts from '../services/seller-center.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/**
 * Dar a una persona de un proveedor acceso a ventas y existencias es entregar datos de la empresa
 * a un tercero: lo decide quien administra la empresa (`settings:company`), como el portal con código.
 */
const PERMISSION = 'settings:company' as const;

function fail(
  error: unknown,
  companyId?: string,
): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof SellerCenterError)
    return { success: false, error: error.message };
  captureException(error, {
    module: 'portal-proveedores',
    companyId,
    extra: { reason: 'seller-center-admin' },
  });
  return {
    success: false,
    error: 'No se pudo completar la operación con el Seller Center',
  };
}

async function session() {
  const current = await requireAuthWithPermission(PERMISSION);
  assertModuleEnabled(current, 'hasSellerCenter');
  return current;
}

export async function inviteSupplierPersonAction(
  supplierId: string,
  input: unknown,
): Promise<ActionResult<SellerInvitationDelivery>> {
  let companyId: string | undefined;
  try {
    const current = await session();
    companyId = current.companyId;
    const parsed = sellerInvitationSchema.safeParse(input);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      };
    const invitation = await accounts.inviteSupplierPerson(
      current.companyId,
      String(supplierId),
      { id: current.id, name: current.name },
      parsed.data,
    );
    await createAuditLog({
      companyId: current.companyId,
      userId: current.id,
      userEmail: current.email,
      action: 'CREATE',
      entity: 'SupplierPortalMembership',
      entityId: invitation.membershipId,
      metadata: {
        supplierId,
        channel: 'email' in parsed.data ? 'email' : 'whatsapp',
      },
    });
    revalidatePath(`/dashboard/contacts/${supplierId}`);
    return {
      success: true,
      data: invitation,
      message:
        'email' in parsed.data && invitation.delivery === 'sent'
          ? `Invitación enviada a ${parsed.data.email}`
          : sellerDeliveryMessage(invitation.delivery),
    };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function resendSupplierInviteAction(
  membershipId: string,
): Promise<ActionResult<SellerInvitationDelivery>> {
  let companyId: string | undefined;
  try {
    const current = await session();
    companyId = current.companyId;
    const invitation = await accounts.resendSupplierInvite(
      current.companyId,
      String(membershipId),
      { id: current.id, name: current.name },
    );
    await createAuditLog({
      companyId: current.companyId,
      userId: current.id,
      userEmail: current.email,
      action: 'UPDATE',
      entity: 'SupplierPortalMembership',
      entityId: membershipId,
      metadata: { invite: 'resent' },
    });
    revalidatePath(`/dashboard/contacts/${invitation.supplierId}`);
    return {
      success: true,
      data: invitation,
      message: `${sellerDeliveryMessage(invitation.delivery)} El enlace anterior dejó de servir.`,
    };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function setSupplierAccountActiveAction(
  membershipId: string,
  active: boolean,
): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const current = await session();
    companyId = current.companyId;
    const { supplierId } = await accounts.setSupplierAccountActive(
      current.companyId,
      String(membershipId),
      Boolean(active),
    );
    await createAuditLog({
      companyId: current.companyId,
      userId: current.id,
      userEmail: current.email,
      action: 'UPDATE',
      entity: 'SupplierPortalMembership',
      entityId: membershipId,
      metadata: { isActive: Boolean(active) },
    });
    revalidatePath(`/dashboard/contacts/${supplierId}`);
    return {
      success: true,
      data: null,
      message: active
        ? 'Acceso reactivado'
        : 'Acceso desactivado: ya no puede entrar',
    };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function cancelSupplierInviteAction(
  membershipId: string,
): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const current = await session();
    companyId = current.companyId;
    const { supplierId } = await accounts.cancelSupplierInvite(
      current.companyId,
      String(membershipId),
    );
    await createAuditLog({
      companyId: current.companyId,
      userId: current.id,
      userEmail: current.email,
      action: 'DELETE',
      entity: 'SupplierPortalMembership',
      entityId: membershipId,
      metadata: { invite: 'cancelled' },
    });
    revalidatePath(`/dashboard/contacts/${supplierId}`);
    return { success: true, data: null, message: 'Invitación anulada' };
  } catch (error) {
    return fail(error, companyId);
  }
}
