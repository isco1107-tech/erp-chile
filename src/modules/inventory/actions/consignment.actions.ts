'use server';

import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import * as consignmentService from '../services/consignment.service';
import type { ConsignorOption } from '../services/consignment.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown, companyId?: string): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  const message = toFriendlyErrorMessage(error);
  if (!(error instanceof Error) || message !== error.message) captureException(error, { module: 'consignacion', companyId });
  return message;
}

/** Sellers de la empresa, para elegir el dueño de un producto. */
export async function listConsignorOptionsAction(): Promise<ActionResult<ConsignorOption[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:read');
    companyId = session.companyId;
    return { success: true, data: await consignmentService.listConsignorOptions(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}
