'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type CompetitionRound, type JudgeAssignment, type JudgingCategory } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { competitionRoundCreateSchema, judgeAssignmentCreateSchema, judgingCategoryCreateSchema } from '../schema';
import * as judgingService from '../services/judging.service';
import * as roundsService from '../services/rounds.service';
import type { JudgingProjectOption } from '../services/judging.service';
import type { RoundResultRow } from '../services/rounds.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe una categoría con ese nombre en esta ronda';
  }
  if (error instanceof Error) return error.message;
  return toFriendlyErrorMessage(error);
}

function revalidateJudging() {
  revalidatePath('/dashboard/judging');
}

// ---------------------------------------------------------------------------
// Rondas
// ---------------------------------------------------------------------------

export async function listRoundsAction(projectId: string): Promise<ActionResult<CompetitionRound[]>> {
  try {
    const session = await requireAuthWithPermission('judging:read');
    const data = await roundsService.listRounds(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createRoundAction(input: unknown): Promise<ActionResult<CompetitionRound>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const parsed = competitionRoundCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await roundsService.createRound(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CompetitionRound',
      entityId: data.id,
      metadata: { projectId: data.projectId, name: data.name, order: data.order },
    });
    revalidateJudging();
    return { success: true, data, message: 'Ronda creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteRoundAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    await roundsService.deleteRound(session.companyId, id);
    revalidateJudging();
    return { success: true, data: null, message: 'Ronda eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function markRoundReadyAction(id: string): Promise<ActionResult<CompetitionRound>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const data = await roundsService.markRoundReady(session.companyId, id);
    revalidateJudging();
    return { success: true, data, message: 'Ronda lista para votación' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function openRoundAction(id: string): Promise<ActionResult<CompetitionRound>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const data = await roundsService.openRound(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompetitionRound',
      entityId: data.id,
      metadata: { status: data.status },
    });
    revalidateJudging();
    return { success: true, data, message: 'Votación abierta' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function closeRoundAction(id: string): Promise<ActionResult<CompetitionRound>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const data = await roundsService.closeRound(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompetitionRound',
      entityId: data.id,
      metadata: { status: data.status },
    });
    revalidateJudging();
    return { success: true, data, message: 'Votación finalizada y resultados calculados' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function reopenRoundAction(id: string): Promise<ActionResult<CompetitionRound>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const data = await roundsService.reopenRound(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompetitionRound',
      entityId: data.id,
      metadata: { status: data.status },
    });
    revalidateJudging();
    return { success: true, data, message: 'Votación reabierta' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function autoBalanceCategoryWeightsAction(roundId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    await roundsService.autoBalanceCategoryWeights(session.companyId, roundId);
    revalidateJudging();
    return { success: true, data: null, message: 'Ponderaciones equilibradas al 100%' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function completeRoundAction(id: string): Promise<ActionResult<CompetitionRound>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const data = await roundsService.completeRound(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompetitionRound',
      entityId: data.id,
      metadata: { status: data.status },
    });
    revalidateJudging();
    return { success: true, data, message: 'Ronda completada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getRoundResultsAction(roundId: string): Promise<ActionResult<RoundResultRow[]>> {
  try {
    const session = await requireAuthWithPermission('judging:read');
    const data = await roundsService.getRoundLiveResults(session.companyId, roundId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCategoryWeightTotalAction(roundId: string): Promise<ActionResult<number>> {
  try {
    const session = await requireAuthWithPermission('judging:read');
    const data = await roundsService.getCategoryWeightTotal(session.companyId, roundId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Categorías/criterios (por ronda)
// ---------------------------------------------------------------------------

export async function listCategoriesAction(roundId: string): Promise<ActionResult<JudgingCategory[]>> {
  try {
    const session = await requireAuthWithPermission('judging:read');
    const data = await judgingService.listCategories(session.companyId, roundId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<JudgingCategory>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const parsed = judgingCategoryCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await judgingService.createCategory(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'JudgingCategory',
      entityId: data.id,
      metadata: { roundId: data.roundId, name: data.name, weightBps: data.weightBps },
    });
    revalidateJudging();
    return { success: true, data, message: 'Categoría creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    await judgingService.deleteCategory(session.companyId, id);
    revalidateJudging();
    return { success: true, data: null, message: 'Categoría eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Jurados
// ---------------------------------------------------------------------------

export async function listJudgeAssignmentsAction(projectId: string): Promise<ActionResult<JudgeAssignment[]>> {
  try {
    const session = await requireAuthWithPermission('judging:read');
    const data = await judgingService.listJudgeAssignments(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createJudgeAssignmentAction(input: unknown): Promise<ActionResult<JudgeAssignment>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    const parsed = judgeAssignmentCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await judgingService.createJudgeAssignment(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'JudgeAssignment',
      entityId: data.id,
      // El token nunca va en el log de auditoría: es la credencial de acceso del jurado.
      metadata: { projectId: data.projectId, judgeName: data.judgeName },
    });
    revalidateJudging();
    return { success: true, data, message: 'Jurado creado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteJudgeAssignmentAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('judging:write');
    await judgingService.deleteJudgeAssignment(session.companyId, id);
    revalidateJudging();
    return { success: true, data: null, message: 'Jurado eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listJudgingProjectOptionsAction(): Promise<ActionResult<JudgingProjectOption[]>> {
  try {
    const session = await requireAuthWithPermission('judging:read');
    const data = await judgingService.listProjectOptions(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
