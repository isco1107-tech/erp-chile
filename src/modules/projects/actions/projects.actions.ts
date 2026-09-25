'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Project } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { getProjectFinancialSummary, type ProjectFinancialSummary } from '@/lib/services/projects';
import { projectCreateSchema, projectPublicSiteSchema, projectUpdateSchema } from '../schema';
import { publicSlugProblem } from '@/lib/events/public-slug';
import { getPageantHub, type PageantHub } from '../services/hub.service';
import * as projectsService from '../services/projects.service';
import * as customDomainService from '../services/custom-domain.service';
import type { CustomDomainView } from '../services/custom-domain.service';

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

// ---------------------------------------------------------------------------
// Centro de mando del certamen y micrositio público
// ---------------------------------------------------------------------------

export async function getPageantHubAction(id: string): Promise<ActionResult<PageantHub>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    const hub = await getPageantHub(session.companyId, id, session.features);
    if (!hub) return { success: false, error: 'Proyecto no encontrado' };
    return { success: true, data: hub };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePublicSiteAction(id: string, input: unknown): Promise<ActionResult<Project>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const parsed = projectPublicSiteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    if (parsed.data.publicSlug && !(await projectsService.isPublicSlugAvailable(session.companyId, id, parsed.data.publicSlug))) {
      return { success: false, error: 'Esa dirección ya la usa otro certamen. Prueba agregando el año o la ciudad.' };
    }
    const data = await projectsService.updatePublicSite(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: id,
      metadata: { publicSite: { slug: parsed.data.publicSlug, enabled: parsed.data.publicSiteEnabled } },
    });
    revalidatePath(`/dashboard/projects/${id}`);
    if (data.publicSlug) revalidatePath(`/certamen/${data.publicSlug}`);
    return { success: true, data, message: parsed.data.publicSiteEnabled ? 'Sitio publicado' : 'Configuración guardada' };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { success: false, error: 'Esa dirección ya la usa otro certamen. Prueba agregando el año o la ciudad.' };
    }
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function checkPublicSlugAction(id: string, slug: string): Promise<ActionResult<{ available: boolean; problem: string | null }>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const normalized = String(slug).trim().toLowerCase();
    const problem = publicSlugProblem(normalized);
    if (problem) return { success: true, data: { available: false, problem } };
    const available = await projectsService.isPublicSlugAvailable(session.companyId, id, normalized);
    return { success: true, data: { available, problem: available ? null : 'Esa dirección ya está en uso' } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ── Dominio propio del micrositio ────────────────────────────────────────────

function customDomainErrorMessage(error: unknown): string {
  if (error instanceof customDomainService.CustomDomainError) return error.message;
  return toErrorMessage(error);
}

export async function getCustomDomainAction(id: string): Promise<ActionResult<CustomDomainView>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    return { success: true, data: await customDomainService.refreshCustomDomain(session.companyId, id) };
  } catch (error) {
    return { success: false, error: customDomainErrorMessage(error) };
  }
}

export async function setCustomDomainAction(id: string, domain: unknown): Promise<ActionResult<CustomDomainView>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    if (typeof domain !== 'string') return { success: false, error: 'Escribe el dominio, por ejemplo missuniversotemuco.cl' };
    const data = await customDomainService.setCustomDomain(session.companyId, id, domain);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: id,
      metadata: { customDomain: data.domain },
    });
    revalidatePath(`/dashboard/projects/${id}/site`);
    return { success: true, data, message: data.verifiedAt ? 'Dominio conectado' : 'Dominio guardado: falta configurar los DNS' };
  } catch (error) {
    return { success: false, error: customDomainErrorMessage(error) };
  }
}

export async function removeCustomDomainAction(id: string): Promise<ActionResult<CustomDomainView>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const data = await customDomainService.removeCustomDomain(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Project',
      entityId: id,
      metadata: { customDomain: null },
    });
    revalidatePath(`/dashboard/projects/${id}/site`);
    return { success: true, data, message: 'Dominio quitado: el sitio sigue en su dirección normal' };
  } catch (error) {
    return { success: false, error: customDomainErrorMessage(error) };
  }
}
