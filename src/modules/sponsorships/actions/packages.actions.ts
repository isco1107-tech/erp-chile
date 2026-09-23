'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { sponsorshipPackageSchema, sponsorshipPackageUpdateSchema } from '../schema';
import * as packagesService from '../services/packages.service';
import type { SponsorshipPackageRow } from '../services/packages.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function revalidatePackages() {
  revalidatePath('/dashboard/sponsorships/packages');
  revalidatePath('/dashboard/crm', 'layout');
}

export async function listPackagesAction(projectId?: string): Promise<ActionResult<SponsorshipPackageRow[]>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:read');
    return { success: true, data: await packagesService.listPackages(session.companyId, projectId || undefined) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPackageAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipPackageSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const pkg = await packagesService.createPackage(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SponsorshipPackage',
      entityId: pkg.id,
      metadata: { name: pkg.name, price: pkg.price, projectId: pkg.projectId },
    });
    revalidatePackages();
    return { success: true, data: { id: pkg.id }, message: 'Plan creado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePackageAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const parsed = sponsorshipPackageUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await packagesService.updatePackage(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SponsorshipPackage',
      entityId: id,
      metadata: { name: parsed.data.name, price: parsed.data.price },
    });
    revalidatePackages();
    return { success: true, data: null, message: 'Plan actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deletePackageAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    await packagesService.deletePackage(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'SponsorshipPackage', entityId: id });
    revalidatePackages();
    return { success: true, data: null, message: 'Plan eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function copyPackagesAction(fromProjectId: unknown, toProjectId: unknown): Promise<ActionResult<{ copied: number }>> {
  try {
    const session = await requireAuthWithPermission('sponsorships:write');
    const ids = z.tuple([z.string().min(1), z.string().min(1)]).safeParse([fromProjectId, toProjectId]);
    if (!ids.success) return { success: false, error: 'Elige el certamen de origen y el de destino' };
    const copied = await packagesService.copyPackages(session.companyId, ids.data[0], ids.data[1]);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SponsorshipPackage',
      entityId: ids.data[1],
      metadata: { copiedFrom: ids.data[0], copied },
    });
    revalidatePackages();
    return { success: true, data: { copied }, message: copied === 0 ? 'El certamen de origen no tiene planes' : `${copied} plan(es) copiado(s)` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
