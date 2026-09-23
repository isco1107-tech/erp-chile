'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { can, requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { candidatePresentationSchema, NUMBERING_ORDERS } from '../schema';
import * as castingService from '../services/casting.service';
import type { CastingCard } from '../services/casting.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function revalidateCasting() {
  revalidatePath('/dashboard/candidates', 'layout');
}

export async function listCastingBoardAction(projectId: string): Promise<ActionResult<{ cards: CastingCard[]; canSeePhotos: boolean }>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const canSeePhotos = can(session, 'candidates:sensitive');
    const cards = await castingService.listCastingBoard(session.companyId, String(projectId), canSeePhotos);
    return { success: true, data: { cards, canSeePhotos } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateCandidatePresentationAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = candidatePresentationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await castingService.updateCandidatePresentation(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Candidate',
      entityId: id,
      metadata: { presentation: { number: parsed.data.candidateNumber, representing: parsed.data.representing, public: parsed.data.showOnPublicSite } },
    });
    revalidateCasting();
    return { success: true, data: null, message: 'Presentación actualizada' };
  } catch (error) {
    if (error instanceof castingService.DuplicateCandidateNumberError) return { success: false, error: error.message };
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function numberOfficialCandidatesAction(projectId: unknown, order: unknown): Promise<ActionResult<{ numbered: number }>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = z.object({ projectId: z.string().min(1), order: z.enum(NUMBERING_ORDERS) }).safeParse({ projectId, order });
    if (!parsed.success) return { success: false, error: 'Elige el certamen y el orden de numeración' };
    const numbered = await castingService.numberOfficialCandidates(session.companyId, parsed.data.projectId, parsed.data.order);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Candidate',
      entityId: parsed.data.projectId,
      metadata: { numbering: parsed.data.order, numbered },
    });
    revalidateCasting();
    return { success: true, data: { numbered }, message: numbered === 0 ? 'No hay candidatas oficiales para numerar' : `${numbered} candidata(s) numerada(s)` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
