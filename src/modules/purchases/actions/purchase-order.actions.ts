'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type PurchaseOrder, type PurchaseOrderStatus } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { purchaseOrderCreateSchema } from '../schema';
import * as purchaseOrderService from '../services/purchase-order.service';
import type {
  PurchaseOrderListItem,
  PurchaseOrderWithItems,
  PurchaseOrderWithRelations,
} from '../services/purchase-order.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe una orden de compra con ese folio';
  }
  return toFriendlyErrorMessage(error);
}

export async function listPurchaseOrdersAction(
  status?: PurchaseOrderStatus,
  query?: string
): Promise<ActionResult<PurchaseOrderListItem[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const data = await purchaseOrderService.listPurchaseOrders(session.companyId, { status, query });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listReceivableOrdersAction(): Promise<ActionResult<PurchaseOrderListItem[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    const data = await purchaseOrderService.listReceivableOrders(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPurchaseOrderAction(id: string): Promise<ActionResult<PurchaseOrderWithRelations>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const order = await purchaseOrderService.getPurchaseOrder(session.companyId, id);
    if (!order) return { success: false, error: 'Orden de compra no encontrada' };
    return { success: true, data: order };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPurchaseOrderAction(input: unknown): Promise<ActionResult<PurchaseOrderWithItems>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    const parsed = purchaseOrderCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await purchaseOrderService.createPurchaseOrder(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: data.id,
      metadata: { folio: data.folio, contactId: data.contactId, itemCount: data.items.length },
    });
    revalidatePath('/dashboard/purchases/orders');
    return { success: true, data, message: `Orden de compra #${data.folio} creada` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function sendPurchaseOrderAction(id: string): Promise<ActionResult<PurchaseOrder>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    const data = await purchaseOrderService.sendPurchaseOrder(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: data.id,
      metadata: { reason: 'purchase_order_sent' },
    });
    revalidatePath('/dashboard/purchases/orders');
    revalidatePath(`/dashboard/purchases/orders/${id}`);
    return { success: true, data, message: 'Orden enviada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelPurchaseOrderAction(id: string): Promise<ActionResult<PurchaseOrder>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    const data = await purchaseOrderService.cancelPurchaseOrder(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'PurchaseOrder',
      entityId: data.id,
      metadata: { reason: 'purchase_order_cancelled' },
    });
    revalidatePath('/dashboard/purchases/orders');
    revalidatePath(`/dashboard/purchases/orders/${id}`);
    return { success: true, data, message: 'Orden anulada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
