'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAuthContext, can, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import * as usersService from '@/lib/services/users.service';
import type { UserActivitySummary } from '@/lib/services/users.service';
import { phoneSchema } from '@/lib/phone';
import { ROLE_LABELS } from '@/lib/auth/roles';
import type { Role } from '@prisma/client';
import { listJobPositions } from '@/modules/org-chart/services/org-chart.service';
import type { JobPositionWithUsage } from '@/modules/org-chart/services/org-chart.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  roleLabel: string;
  customRoleName: string | null;
  companyName: string;
  createdAt: Date;
  isActive: boolean;
  isSelf: boolean;
  activity: UserActivitySummary;
  photoUrl: string | null;
  jobPositionId: string | null;
  jobPositionName: string | null;
  orgChartEnabled: boolean;
}

/**
 * Perfil + actividad de un usuario. Sin `userId` (o con el propio id) es
 * "Mi Perfil": cualquiera puede ver el suyo. Con el id de otra persona,
 * exige rol OWNER/ADMIN — mismo corte que ya usa la lista de sesiones activas.
 */
export async function getUserProfileAction(userId?: string): Promise<ActionResult<UserProfile>> {
  try {
    const context = await getAuthContext();
    const targetId = userId ?? context.id;
    const isSelf = targetId === context.id;
    if (!isSelf && !can(context, 'settings:users')) {
      return { success: false, error: 'No tienes permiso para ver el perfil de otra persona' };
    }

    const user = await prisma.user.findFirst({
      where: { id: targetId, companyId: context.companyId },
      include: { customRole: { select: { name: true } }, jobPosition: { select: { name: true } } },
    });
    if (!user) return { success: false, error: 'Usuario no encontrado' };

    const activity = await usersService.getUserActivity(context.companyId, targetId);

    return {
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        customRoleName: user.customRole?.name ?? null,
        companyName: context.companyName,
        createdAt: user.createdAt,
        isActive: user.isActive,
        isSelf,
        activity,
        photoUrl: user.photoUrl,
        jobPositionId: user.jobPositionId,
        jobPositionName: user.jobPosition?.name ?? null,
        orgChartEnabled: context.features.hasOrgChart,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const updatePhoneSchema = z.object({ phone: phoneSchema });

export async function updateMyPhoneAction(input: unknown): Promise<ActionResult<{ phone: string | null }>> {
  try {
    const context = await getAuthContext();
    const parsed = updatePhoneSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const phone = parsed.data.phone || null;
    const updated = await usersService.updateOwnPhone(context.companyId, context.id, phone);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'self_update_phone' },
    });

    revalidatePath('/dashboard/settings/profile');
    return { success: true, data: { phone: updated.phone }, message: 'Teléfono actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const updateJobPositionSchema = z.object({ jobPositionId: z.string().nullable() });

/** Catálogo de cargos de la empresa, para el `<select>` de "Mi cargo" en el propio perfil. */
export async function listJobPositionsForSelfAction(): Promise<ActionResult<JobPositionWithUsage[]>> {
  try {
    const context = await getAuthContext();
    if (!context.features.hasOrgChart) return { success: false, error: 'Módulo no incluido en tu plan actual' };
    const data = await listJobPositions(context.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateMyJobPositionAction(
  input: unknown
): Promise<ActionResult<{ jobPositionId: string | null }>> {
  try {
    const context = await getAuthContext();
    if (!context.features.hasOrgChart) return { success: false, error: 'Módulo no incluido en tu plan actual' };

    const parsed = updateJobPositionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    if (parsed.data.jobPositionId !== null) {
      const position = await prisma.jobPosition.findFirst({
        where: { id: parsed.data.jobPositionId, companyId: context.companyId },
      });
      if (!position) return { success: false, error: 'El cargo seleccionado no pertenece a tu empresa' };
    }

    const updated = await usersService.updateOwnJobPosition(context.companyId, context.id, parsed.data.jobPositionId);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'self_update_job_position' },
    });

    revalidatePath('/dashboard/settings/profile');
    return { success: true, data: { jobPositionId: updated.jobPositionId }, message: 'Cargo actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
