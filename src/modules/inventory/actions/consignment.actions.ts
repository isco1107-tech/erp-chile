'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { consignmentReceiveSchema, consignmentReturnSchema } from '../schema';
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

/** Recibe mercadería de un seller: sube el stock a su nombre, sin compra ni costo. */
export async function receiveConsignedStockAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = consignmentReceiveSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const movement = await consignmentService.receiveConsignedStock(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'STOCK_ADJUSTMENT',
      entity: 'Product',
      entityId: parsed.data.productId,
      metadata: { consignment: 'receive', movementId: movement.id, warehouseId: parsed.data.warehouseId, quantity: parsed.data.quantity },
    });
    revalidatePath('/dashboard/inventory');
    return { success: true, data: null, message: 'Mercadería del seller recibida' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

/** Devuelve mercadería al seller: baja el stock sin venderla. */
export async function returnConsignedStockAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = consignmentReturnSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const movement = await consignmentService.returnConsignedStock(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'STOCK_ADJUSTMENT',
      entity: 'Product',
      entityId: parsed.data.productId,
      metadata: { consignment: 'return', movementId: movement.id, warehouseId: parsed.data.warehouseId, quantity: parsed.data.quantity },
    });
    revalidatePath('/dashboard/inventory');
    return { success: true, data: null, message: 'Mercadería devuelta al seller' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}
