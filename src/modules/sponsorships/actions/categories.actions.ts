'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { z } from 'zod';
import { sponsorshipCategoryCreateSchema, sponsorshipCategoryRenameSchema } from '../schema';
import * as categoriesService from '../services/categories.service';
import type { SponsorshipCategoryRow } from '../services/categories.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function revalidateCategories() {
  revalidatePath('/dashboard/sponsorships', 'layout');
  revalidatePath('/dashboard/crm', 'layout');
}

export async function listCategoriesAction(projectId: unknown): Promise<ActionResult<SponsorshipCategoryRow[]>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:read');
    const id = z.string().min(1).safeParse(projectId);
    if (!id.success) return { success: false, error: 'Elige un certamen' };
    return { success: true, data: await categoriesService.listCategories(session.companyId, id.data) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipCategoryCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const category = await categoriesService.createCategory(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SponsorshipCategory',
      entityId: category.id,
      metadata: { name: category.name, projectId: category.projectId },
    });
    revalidateCategories();
    return { success: true, data: { id: category.id }, message: 'Categoría creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function renameCategoryAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipCategoryRenameSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await categoriesService.renameCategory(session.companyId, id, parsed.data.name);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipCategory',
      entityId: id,
      metadata: { name: parsed.data.name },
    });
    revalidateCategories();
    return { success: true, data: null, message: 'Categoría actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    await categoriesService.deleteCategory(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'SponsorshipCategory',
      entityId: id,
    });
    revalidateCategories();
    return { success: true, data: null, message: 'Categoría eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
