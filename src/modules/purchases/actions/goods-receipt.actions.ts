'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { goodsReceiptCreateSchema } from '../schema';
import * as goodsReceiptService from '../services/goods-receipt.service';
import type { GoodsReceiptWithItems, GoodsReceiptWithRelations } from '../services/goods-receipt.service';
import type { GoodsReceipt } from '@prisma/client';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export async function listGoodsReceiptsAction(orderId?: string): Promise<ActionResult<GoodsReceiptWithRelations[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const data = await goodsReceiptService.listGoodsReceipts(session.companyId, orderId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getGoodsReceiptAction(id: string): Promise<ActionResult<GoodsReceiptWithRelations>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const receipt = await goodsReceiptService.getGoodsReceipt(session.companyId, id);
    if (!receipt) return { success: false, error: 'Recepción no encontrada' };
    return { success: true, data: receipt };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createGoodsReceiptAction(input: unknown): Promise<ActionResult<GoodsReceiptWithItems>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    const parsed = goodsReceiptCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await goodsReceiptService.createGoodsReceipt(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'GoodsReceipt',
      entityId: data.id,
      metadata: { folio: data.folio, orderId: data.orderId, itemCount: data.items.length },
    });
    revalidatePath('/dashboard/purchases/orders');
    revalidatePath(`/dashboard/purchases/orders/${data.orderId}`);
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data, message: `Recepción #${data.folio} registrada` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelGoodsReceiptAction(id: string): Promise<ActionResult<GoodsReceipt>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    const data = await goodsReceiptService.cancelGoodsReceipt(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'GoodsReceipt',
      entityId: data.id,
      metadata: { reason: 'goods_receipt_cancelled' },
    });
    revalidatePath('/dashboard/purchases/orders');
    revalidatePath(`/dashboard/purchases/orders/${data.orderId}`);
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data, message: 'Recepción anulada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
