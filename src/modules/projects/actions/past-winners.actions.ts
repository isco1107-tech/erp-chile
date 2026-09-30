'use server';

import { revalidatePath } from 'next/cache';
import type { PastWinner } from '@prisma/client';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { blobPathnameStartsWith, isAllowedBlobUrl } from '@/lib/security/blob-url';
import { del } from '@/lib/storage/blob';
import { pastWinnerSchema } from '../schema';
import * as pastWinnersService from '../services/past-winners.service';
import { prisma } from '@/lib/prisma';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function failure(error: unknown, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof pastWinnersService.PastWinnerError) return { success: false, error: error.message };
  captureException(error, { module: 'proyectos', companyId, extra: { reason: 'past-winners' } });
  return { success: false, error: 'No se pudo guardar la ganadora' };
}

/** La foto tiene que haberla subido esta misma empresa desde el panel: no se acepta una URL cualquiera. */
function photoProblem(companyId: string, url: string): string | null {
  if (!isAllowedBlobUrl(url) || !blobPathnameStartsWith(url, `pageant-winners/${companyId}/`)) {
    return 'La foto debe subirse desde este panel (JPG, PNG o WEBP)';
  }
  return null;
}

/** Borra la foto del almacenamiento sin frenar la operación: si falla se reporta y el registro ya quedó bien. */
async function discardPhoto(url: string | null, companyId: string): Promise<void> {
  if (!url) return;
  try {
    await del(url);
  } catch (error) {
    captureException(error, { module: 'proyectos', companyId, extra: { reason: 'past-winner-photo-delete' } });
  }
}

async function publicSlugOf(companyId: string, projectId: string): Promise<string | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { publicSlug: true } });
  return project?.publicSlug ?? null;
}

async function refresh(companyId: string, projectId: string): Promise<void> {
  revalidatePath(`/dashboard/projects/${projectId}/site`);
  const slug = await publicSlugOf(companyId, projectId);
  if (slug) revalidatePath(`/certamen/${slug}`);
}

export async function listPastWinnersAction(projectId: string): Promise<ActionResult<PastWinner[]>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    return { success: true, data: await pastWinnersService.listPastWinners(session.companyId, projectId) };
  } catch (error) {
    return failure(error);
  }
}

export async function createPastWinnerAction(projectId: string, input: unknown): Promise<ActionResult<PastWinner>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:write');
    companyId = session.companyId;
    const parsed = pastWinnerSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const problem = photoProblem(session.companyId, parsed.data.photoUrl);
    if (problem) return { success: false, error: problem };
    const winner = await pastWinnersService.createPastWinner(session.companyId, projectId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PastWinner',
      entityId: winner.id,
      metadata: { projectId, name: winner.name, year: winner.year },
    });
    await refresh(session.companyId, projectId);
    return { success: true, data: winner, message: 'Ganadora agregada' };
  } catch (error) {
    return failure(error, companyId);
  }
}

export async function updatePastWinnerAction(projectId: string, id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:write');
    companyId = session.companyId;
    const parsed = pastWinnerSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const problem = photoProblem(session.companyId, parsed.data.photoUrl);
    if (problem) return { success: false, error: problem };
    const { replacedPhotoUrl } = await pastWinnersService.updatePastWinner(session.companyId, projectId, id, parsed.data);
    await discardPhoto(replacedPhotoUrl, session.companyId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PastWinner',
      entityId: id,
      metadata: { projectId, name: parsed.data.name, year: parsed.data.year },
    });
    await refresh(session.companyId, projectId);
    return { success: true, data: null, message: 'Cambios guardados' };
  } catch (error) {
    return failure(error, companyId);
  }
}

export async function deletePastWinnerAction(projectId: string, id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:write');
    companyId = session.companyId;
    const { photoUrl } = await pastWinnersService.deletePastWinner(session.companyId, projectId, id);
    await discardPhoto(photoUrl, session.companyId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'PastWinner',
      entityId: id,
      metadata: { projectId },
    });
    await refresh(session.companyId, projectId);
    return { success: true, data: null, message: 'Ganadora eliminada' };
  } catch (error) {
    return failure(error, companyId);
  }
}
