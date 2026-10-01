'use server';

import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { posterDesignSchema } from '@/lib/posters/overrides';
import { posterImagesProblem } from '../services/poster.service';
import * as designsService from '../services/poster-designs.service';
import type { PosterDesignView } from '../services/poster-designs.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function failure(error: unknown, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof designsService.PosterDesignError) return { success: false, error: error.message };
  captureException(error, { module: 'proyectos', companyId, extra: { reason: 'poster-designs' } });
  return { success: false, error: 'No se pudo guardar el diseño' };
}

export async function listPosterDesignsAction(projectId: string): Promise<ActionResult<PosterDesignView[]>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    return { success: true, data: await designsService.listPosterDesigns(session.companyId, projectId) };
  } catch (error) {
    return failure(error);
  }
}

/** Crea un diseño nuevo, o reemplaza el `designId` indicado (de este mismo certamen y empresa). */
export async function savePosterDesignAction(projectId: string, input: unknown, designId: string | null): Promise<ActionResult<PosterDesignView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:write');
    companyId = session.companyId;
    const parsed = posterDesignSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const problem = posterImagesProblem(session.companyId, parsed.data.overrides);
    if (problem) return { success: false, error: problem };

    const design = designId
      ? await designsService.updatePosterDesign(session.companyId, projectId, designId, parsed.data)
      : await designsService.createPosterDesign(session.companyId, projectId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: designId ? 'UPDATE' : 'CREATE',
      entity: 'PosterDesign',
      entityId: design.id,
      metadata: { projectId, name: design.name, piece: design.request.piece },
    });
    return { success: true, data: design, message: designId ? 'Diseño actualizado' : 'Diseño guardado' };
  } catch (error) {
    return failure(error, companyId);
  }
}

export async function deletePosterDesignAction(projectId: string, designId: string): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('projects:write');
    companyId = session.companyId;
    await designsService.deletePosterDesign(session.companyId, projectId, designId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'PosterDesign',
      entityId: designId,
      metadata: { projectId },
    });
    return { success: true, data: { id: designId }, message: 'Diseño eliminado' };
  } catch (error) {
    return failure(error, companyId);
  }
}
