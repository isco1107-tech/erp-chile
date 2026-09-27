'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type CustomRole } from '@prisma/client';
import {
  AuthError,
  ModuleNotEnabledError,
  TenantInactiveError,
  getAuthContext,
  can,
  type AuthContext,
} from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { excessPermissions } from '@/lib/auth/permissions';
import { customRoleCreateSchema, memberRoleAssignSchema } from '../schema';
import * as rolesService from '../services/roles.service';
import type { CustomRoleWithUsage } from '../services/roles.service';

/** Auditoría 2026-09-27 (hallazgo A-1/SEG-02/PER-01) — ver `excessPermissions`. */
function assertPermissionsWithinActor(requested: readonly string[], context: AuthContext): void {
  const excess = excessPermissions(requested, context.permissions);
  if (excess.length > 0) {
    throw new AuthError(`No puedes otorgar un permiso que tú mismo no tienes: ${excess.join(', ')}`, 403);
  }
}

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof TenantInactiveError) return error.message;
  if (error instanceof ModuleNotEnabledError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'Ya existe un rol con ese nombre en tu empresa';
  }
  return toFriendlyErrorMessage(error);
}

/** Solo quien puede gestionar el equipo puede tocar los roles. */
async function requireRoleManager() {
  const context = await getAuthContext();
  if (!can(context, 'settings:users')) throw new AuthError('No autorizado para esta acción', 403);
  return context;
}

export async function listCustomRolesAction(): Promise<ActionResult<CustomRoleWithUsage[]>> {
  try {
    const context = await requireRoleManager();
    return { success: true, data: await rolesService.listCustomRoles(context.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createCustomRoleAction(input: unknown): Promise<ActionResult<CustomRole>> {
  try {
    const context = await requireRoleManager();
    const parsed = customRoleCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    assertPermissionsWithinActor(parsed.data.permissions, context);

    const role = await rolesService.createCustomRole(context.companyId, parsed.data, context.features);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'CREATE',
      entity: 'CustomRole',
      entityId: role.id,
      metadata: { name: role.name, permissions: role.permissions },
    });

    revalidatePath('/dashboard/settings/roles');
    return { success: true, data: role, message: `Rol "${role.name}" creado` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateCustomRoleAction(id: string, input: unknown): Promise<ActionResult<CustomRole>> {
  try {
    const context = await requireRoleManager();
    // No puede editar los permisos del rol que él mismo tiene asignado: sin
    // esto, `assignCustomRoleAction` bloqueaba auto-asignarse un rol, pero
    // nada bloqueaba ampliar el que ya tiene.
    if (id === context.customRoleId && context.role !== 'OWNER') {
      return { success: false, error: 'No puedes editar los permisos de tu propio rol' };
    }
    const parsed = customRoleCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    assertPermissionsWithinActor(parsed.data.permissions, context);

    const role = await rolesService.updateCustomRole(context.companyId, id, parsed.data, context.features);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'CustomRole',
      entityId: role.id,
      metadata: { name: role.name, permissions: role.permissions },
    });

    revalidatePath('/dashboard/settings/roles');
    revalidatePath('/dashboard', 'layout');
    return { success: true, data: role, message: 'Rol actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteCustomRoleAction(id: string): Promise<ActionResult<null>> {
  try {
    const context = await requireRoleManager();
    await rolesService.deleteCustomRole(context.companyId, id);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'DELETE',
      entity: 'CustomRole',
      entityId: id,
    });

    revalidatePath('/dashboard/settings/roles');
    return { success: true, data: null, message: 'Rol eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function assignCustomRoleAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const context = await requireRoleManager();
    const parsed = memberRoleAssignSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    if (parsed.data.userId === context.id) {
      return { success: false, error: 'No puedes cambiar tu propio rol personalizado' };
    }
    // Mismo criterio que crear/editar un rol (A-1): asignarle a otra persona
    // un rol YA existente con más permisos que los del actor sería la misma
    // escalada por otra puerta.
    if (parsed.data.customRoleId) {
      const targetRole = await rolesService.getCustomRole(context.companyId, parsed.data.customRoleId);
      if (!targetRole) return { success: false, error: 'Rol personalizado no encontrado' };
      assertPermissionsWithinActor(targetRole.permissions, context);
    }

    await rolesService.assignCustomRole(context.companyId, parsed.data.userId, parsed.data.customRoleId);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: parsed.data.userId,
      metadata: { customRoleId: parsed.data.customRoleId },
    });

    revalidatePath('/dashboard/settings/users');
    return { success: true, data: null, message: 'Rol asignado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export interface SeatUsage {
  used: number;
  max: number;
  planName: string;
}

export async function getSeatUsageAction(): Promise<ActionResult<SeatUsage>> {
  try {
    const context = await requireRoleManager();
    const used = await rolesService.countSeatsInUse(context.companyId);
    return { success: true, data: { used, max: context.maxUsers, planName: context.planName } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
