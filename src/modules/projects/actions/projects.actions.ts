'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Project } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { getProjectFinancialSummary, type ProjectFinancialSummary } from '@/lib/services/projects';
import { projectCreateSchema, projectUpdateSchema } from '../schema';
import * as projectsService from '../services/projects.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export type ProjectWithFinancials = Project & { financialSummary: ProjectFinancialSummary };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'Ya existe un proyecto con ese código en esta empresa';
  }
  return toFriendlyErrorMessage(error);
}

export async function createProjectAction(input: unknown): Promise<ActionResult<Project>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const parsed = projectCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await projectsService.createProject(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Project',
      entityId: data.id,
      metadata: { code: data.code, name: data.name },
    });
    revalidatePath('/dashboard/projects');
    return { success: true, data, message: 'Proyecto creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateProjectAction(id: string, input: unknown): Promise<ActionResult<Project>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const parsed = projectUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await projectsService.updateProject(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: id,
      metadata: { changes: parsed.data },
    });
    revalidatePath('/dashboard/projects');
    revalidatePath(`/dashboard/projects/${id}`);
    return { success: true, data, message: 'Proyecto actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listProjectsAction(): Promise<ActionResult<Project[]>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    const data = await projectsService.listProjects(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteProjectAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    await projectsService.deleteProject(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'Project',
      entityId: id,
      metadata: {},
    });
    revalidatePath('/dashboard/projects');
    return { success: true, data: null, message: 'Proyecto eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getProjectAction(id: string): Promise<ActionResult<ProjectWithFinancials>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    const project = await projectsService.getProject(session.companyId, id);
    if (!project) return { success: false, error: 'Proyecto no encontrado' };
    const financialSummary = await getProjectFinancialSummary(session.companyId, id);
    return { success: true, data: { ...project, financialSummary } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
