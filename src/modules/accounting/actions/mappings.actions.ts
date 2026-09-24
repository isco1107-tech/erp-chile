'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import * as mappingsService from '../services/mappings.service';
import type { MappingBoard } from '../services/mappings.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

const setMappingSchema = z.object({
  key: z.string().min(1).max(60),
  accountId: z.string().min(1, 'Elige una cuenta'),
});

export async function getMappingBoardAction(): Promise<ActionResult<MappingBoard>> {
  try {
    const session = await requireAuthWithPermission('accounting:view');
    return { success: true, data: await mappingsService.getMappingBoard(session.companyId) };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? toFriendlyErrorMessage(error) };
  }
}

export async function setAccountMappingAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('accounting:manage_accounts');
    const parsed = setMappingSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { previousAccountId } = await mappingsService.setAccountMapping(session.companyId, parsed.data.key, parsed.data.accountId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'AccountMapping',
      entityId: parsed.data.key,
      metadata: { key: parsed.data.key, from: previousAccountId, to: parsed.data.accountId },
    });
    revalidatePath('/dashboard/accounting/mappings');
    return { success: true, data: null, message: 'Cuenta actualizada: aplica a los asientos que se generen desde ahora' };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? toFriendlyErrorMessage(error) };
  }
}
