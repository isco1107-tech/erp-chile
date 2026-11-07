'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { AuthError, authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { getRequestIp } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { registrarUsoSupersuite } from '@/lib/supersuite';
import type { ActionResult } from '@/modules/workspace/actions/workspace.actions';

const selectionSchema = z.object({ analytics: z.boolean(), science: z.boolean() }).strict();

/** Solo estos dos interruptores: no permite modificar otros módulos ni otra empresa. */
export async function updateAnalyticsModulesAction(input: unknown): Promise<ActionResult<{ analytics: boolean; science: boolean }>> {
  let companyId: string | undefined;
  try {
    const context = await requireAuthWithPermission('settings:company');
    if (context.role !== 'OWNER' && context.role !== 'ADMIN') throw new AuthError('Solo dueños y administradores pueden activar estos módulos', 403);
    const tenantId = context.companyId;
    companyId = tenantId;
    const parsed = selectionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'La selección de módulos no es válida' };
    const { analytics, science } = parsed.data;
    const ipAddress = await getRequestIp();
    const audit = {
      companyId, userId: context.id, userEmail: context.email,
      action: 'UPDATE' as const, entity: 'CompanyFeatures', entityId: companyId,
      metadata: { hasDataAnalytics: analytics, hasDataScience: science }, ipAddress,
    };
    await prisma.$transaction(async (tx) => {
      await tx.companyFeatures.upsert({
        where: { companyId: tenantId },
        create: { companyId: tenantId, hasDataAnalytics: analytics, hasDataScience: science },
        update: { hasDataAnalytics: analytics, hasDataScience: science },
      });
      await tx.auditLog.create({ data: audit });
    });
    registrarUsoSupersuite(audit);
    revalidatePath('/dashboard', 'layout');
    return { success: true, data: { analytics, science }, message: 'Módulos de datos actualizados' };
  } catch (error) {
    const message = authErrorMessage(error);
    if (message) return { success: false, error: message };
    captureException(error, { module: 'analytics', companyId });
    return { success: false, error: 'No se pudieron guardar los módulos de datos' };
  }
}
