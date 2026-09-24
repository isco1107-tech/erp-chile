'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type SponsorshipContract, type SponsorshipDeliverable } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  deliverableCreateSchema,
  sponsorshipContractCreateSchema,
  sponsorshipContractUpdateSchema,
  sponsorshipPaymentSchema,
} from '../schema';
import * as sponsorshipsService from '../services/sponsorships.service';
import type { ProjectSelectOption, SponsorshipComplianceRow, SponsorshipContractWithRelations } from '../services/sponsorships.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al guardar el contrato de auspicio';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

function revalidateSponsorships(id?: string) {
  revalidatePath('/dashboard/sponsorships');
  if (id) revalidatePath(`/dashboard/sponsorships/${id}`);
}

export async function listSponsorshipContractsAction(
  projectId?: string,
  contactId?: string
): Promise<ActionResult<SponsorshipContractWithRelations[]>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:read');
    const data = await sponsorshipsService.listSponsorshipContracts(session.companyId, projectId, contactId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getSponsorshipContractAction(id: string): Promise<ActionResult<SponsorshipContractWithRelations>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:read');
    const contract = await sponsorshipsService.getSponsorshipContract(session.companyId, id);
    if (!contract) return { success: false, error: 'Contrato de auspicio no encontrado' };
    return { success: true, data: contract };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createSponsorshipContractAction(input: unknown): Promise<ActionResult<SponsorshipContract>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipContractCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await sponsorshipsService.createSponsorshipContract(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SponsorshipContract',
      entityId: data.id,
      metadata: { projectId: data.projectId, contactId: data.contactId, tier: data.tier, isBarter: data.isBarter },
    });
    revalidateSponsorships();
    return { success: true, data, message: 'Contrato de auspicio creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateSponsorshipContractAction(
  id: string,
  input: unknown
): Promise<ActionResult<SponsorshipContract>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipContractUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await sponsorshipsService.updateSponsorshipContract(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipContract',
      entityId: data.id,
      metadata: { status: data.status, tier: data.tier },
    });
    revalidateSponsorships(id);
    return { success: true, data, message: 'Contrato de auspicio actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteSponsorshipContractAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    await sponsorshipsService.deleteSponsorshipContract(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'SponsorshipContract',
      entityId: id,
      metadata: {},
    });
    revalidateSponsorships();
    return { success: true, data: null, message: 'Contrato de auspicio eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateSponsorshipPaymentAction(
  id: string,
  input: unknown
): Promise<ActionResult<SponsorshipContract>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await sponsorshipsService.updateSponsorshipPayment(session.companyId, id, parsed.data, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipContract',
      entityId: data.id,
      metadata: { paidAmount: data.paidAmount, paymentStatus: data.paymentStatus },
    });
    revalidateSponsorships(id);
    return { success: true, data, message: 'Pago actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addDeliverableAction(
  contractId: string,
  input: unknown
): Promise<ActionResult<SponsorshipDeliverable>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = deliverableCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await sponsorshipsService.addDeliverable(session.companyId, contractId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SponsorshipDeliverable',
      entityId: data.id,
      metadata: { contractId, title: data.title },
    });
    revalidateSponsorships(contractId);
    return { success: true, data, message: 'Entregable agregado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function toggleDeliverableAction(
  deliverableId: string,
  contractId: string
): Promise<ActionResult<SponsorshipDeliverable>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const data = await sponsorshipsService.toggleDeliverable(session.companyId, deliverableId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipDeliverable',
      entityId: data.id,
      metadata: { isCompleted: data.isCompleted },
    });
    revalidateSponsorships(contractId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteDeliverableAction(
  deliverableId: string,
  contractId: string
): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    await sponsorshipsService.deleteDeliverable(session.companyId, deliverableId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'SponsorshipDeliverable',
      entityId: deliverableId,
      metadata: { contractId },
    });
    revalidateSponsorships(contractId);
    return { success: true, data: null, message: 'Entregable eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function markAgreementSignedAction(id: string): Promise<ActionResult<SponsorshipContract>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const data = await sponsorshipsService.markAgreementSigned(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipContract',
      entityId: id,
      metadata: { agreementSigned: true },
    });
    revalidateSponsorships(id);
    return { success: true, data, message: 'Carta de compromiso marcada como firmada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getSponsorshipComplianceBoardAction(projectId?: string): Promise<ActionResult<SponsorshipComplianceRow[]>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:read');
    const data = await sponsorshipsService.getSponsorshipComplianceBoard(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getOrCreatePortalLinkAction(id: string): Promise<ActionResult<{ portalToken: string }>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const portalToken = await sponsorshipsService.getOrCreatePortalToken(session.companyId, id);
    return { success: true, data: { portalToken } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function regeneratePortalLinkAction(id: string): Promise<ActionResult<{ portalToken: string }>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const portalToken = await sponsorshipsService.regeneratePortalToken(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipContract',
      entityId: id,
      metadata: { portalTokenRegenerated: true },
    });
    revalidateSponsorships(id);
    return { success: true, data: { portalToken }, message: 'Link del portal regenerado — el anterior dejó de funcionar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listProjectsForSelectAction(): Promise<ActionResult<ProjectSelectOption[]>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const data = await sponsorshipsService.listProjectsForSelect(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
