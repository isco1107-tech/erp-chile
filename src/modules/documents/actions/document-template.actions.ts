'use server';

import { revalidatePath } from 'next/cache';
import type { DocumentTemplate, DocumentTemplateType } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { documentTemplateUpsertSchema } from '../schema';
import * as templateService from '../services/document-template.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Error) return error.message;
  return toFriendlyErrorMessage(error);
}

/** Editar la carta de sponsors requiere `sponsorships:write`; editar el contrato de candidatas requiere `candidates:write` — no se creó un permiso `documents:*` nuevo. */
async function requirePermissionForType(type: DocumentTemplateType) {
  return type === 'SPONSOR_COMMITMENT_LETTER'
    ? requireAuthWithPermission('sponsorships:write')
    : requireAuthWithPermission('candidates:write');
}

export async function getTemplateAction(type: DocumentTemplateType): Promise<ActionResult<DocumentTemplate | null>> {
  try {
    const session =
      type === 'SPONSOR_COMMITMENT_LETTER' ? await requireAuthWithPermission('sponsorships:read') : await requireAuthWithPermission('candidates:read');
    const data = await templateService.getTemplate(session.companyId, type);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function upsertTemplateAction(input: unknown): Promise<ActionResult<DocumentTemplate>> {
  try {
    const parsed = documentTemplateUpsertSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const session = await requirePermissionForType(parsed.data.type);
    const data = await templateService.upsertTemplate(session.companyId, parsed.data);
    revalidatePath('/dashboard/sponsorships');
    revalidatePath('/dashboard/candidates');
    return { success: true, data, message: 'Plantilla guardada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
