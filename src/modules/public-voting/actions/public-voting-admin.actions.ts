'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type VoteOrder } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { confirmVotePaymentSchema, voteLinkSettingsSchema } from '../schema';
import * as publicVotingService from '../services/public-voting.service';
import type {
  ProjectSelectOption,
  VoteLeaderboardRow,
  VoteOrderListFilters,
  VoteOrderWithCandidate,
} from '../services/public-voting.service';

/**
 * Server Actions del panel interno (`publicvoting:read`/`publicvoting:write`).
 * Separado de `public-voting.actions.ts` (sin sesión) por el mismo motivo que
 * `candidates.actions.ts` está separado de `public-registration.actions.ts`:
 * son dos superficies de confianza completamente distintas.
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al guardar los datos de votación';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

function revalidateVoting() {
  revalidatePath('/dashboard/voting');
}

export async function listProjectsForSelectAction(): Promise<ActionResult<ProjectSelectOption[]>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:write');
    const data = await publicVotingService.listProjectsForSelect(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCurrentVotePriceAction(projectId: string): Promise<ActionResult<{ pricePerVote: number | null }>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:read');
    const pricePerVote = await publicVotingService.getCurrentVotePrice(session.companyId, projectId);
    return { success: true, data: { pricePerVote } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getOrCreateVoteSalesLinkAction(projectId: string, input: unknown): Promise<ActionResult<{ token: string }>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:write');
    const parsed = voteLinkSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const token = await publicVotingService.getOrCreateVoteSalesToken(session.companyId, projectId, parsed.data.pricePerVote);
    return { success: true, data: { token } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function regenerateVoteSalesLinkAction(projectId: string, input: unknown): Promise<ActionResult<{ token: string }>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:write');
    const parsed = voteLinkSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const token = await publicVotingService.regenerateVoteSalesToken(session.companyId, projectId, parsed.data.pricePerVote);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: projectId,
      metadata: { voteSalesTokenRegenerated: true, pricePerVote: parsed.data.pricePerVote },
    });
    return { success: true, data: { token }, message: 'Link regenerado — el anterior dejó de funcionar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listVoteOrdersAction(filters: VoteOrderListFilters = {}): Promise<ActionResult<VoteOrderWithCandidate[]>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:read');
    const data = await publicVotingService.listVoteOrders(session.companyId, filters);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getVoteLeaderboardAction(projectId: string): Promise<ActionResult<VoteLeaderboardRow[]>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:read');
    const data = await publicVotingService.getVoteLeaderboard(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function confirmVotePaymentAction(id: string, input: unknown): Promise<ActionResult<VoteOrder>> {
  try {
    const session = await requireAuthWithPermission('publicvoting:write');
    const parsed = confirmVotePaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await publicVotingService.confirmVotePayment(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'VoteOrder',
      entityId: data.id,
      metadata: { paidAmount: data.paidAmount, paymentStatus: data.paymentStatus },
    });
    revalidateVoting();
    return { success: true, data, message: 'Pago actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
