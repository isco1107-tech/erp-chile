'use server';

import type { AuditAction, AuditLog } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import * as auditService from '@/lib/services/audit.service';
import type { AuditLogFilters } from '@/lib/services/audit.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export async function listAuditLogsAction(filters?: {
  action?: AuditAction;
  entity?: string;
  query?: string;
}): Promise<ActionResult<AuditLog[]>> {
  try {
    const session = await requireAuthWithPermission('audit:read');
    const data = await auditService.listAuditLogs(session.companyId, filters as AuditLogFilters);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
