'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { salesOrderCloseSchema, salesOrderCreateSchema } from '../schema';
import * as ordersService from '../services/sales-orders.service';
import type { SalesOrderDetail, SalesOrderListItem, SalesOrderSummary } from '../services/sales-orders.service';
import { remainingToDispatch, remainingToInvoice } from '../orders';
import type { SalesOrderStatus } from '@prisma/client';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

/**
 * Los errores de negocio de los servicios ya vienen redactados para el usuario;
 * `toFriendlyErrorMessage` traduce (y reporta) solo lo que genera Prisma. Lo
 * que no es ni una cosa ni la otra se reporta a observabilidad.
 */
function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (!(error instanceof Error)) captureException(error, { module: 'ventas', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

export async function listSalesOrdersAction(status?: SalesOrderStatus | 'OPEN', query?: string): Promise<ActionResult<SalesOrderListItem[]>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    return { success: true, data: await ordersService.listSalesOrders(session.companyId, { status, query }) };
  } catch (error) {
    return fail(error);
  }
}

export async function getSalesOrderSummaryAction(): Promise<ActionResult<SalesOrderSummary>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    return { success: true, data: await ordersService.getSalesOrderSummary(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getSalesOrderAction(id: string): Promise<ActionResult<SalesOrderDetail>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const order = await ordersService.getSalesOrder(session.companyId, id);
    if (!order) return { success: false, error: 'Nota de venta no encontrada' };
    return { success: true, data: order };
  } catch (error) {
    return fail(error);
  }
}

export async function createSalesOrderAction(input: unknown): Promise<ActionResult<{ id: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('sales:write');
    companyId = session.companyId;
    const parsed = salesOrderCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const order = await ordersService.createSalesOrder(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SalesOrder',
      entityId: order.id,
      metadata: { folio: order.folio, totalAmount: order.totalAmount, quoteId: parsed.data.quoteId },
    });
    revalidatePath('/dashboard/sales/orders');
    return { success: true, data: { id: order.id, folio: order.folio }, message: `Nota de venta #${order.folio} creada` };
  } catch (error) {
    return fail(error, companyId, { reason: 'createSalesOrder' });
  }
}

export async function closeSalesOrderAction(id: string, input: unknown): Promise<ActionResult<{ status: SalesOrderStatus }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('sales:write');
    companyId = session.companyId;
    const parsed = salesOrderCloseSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const order = await ordersService.closeSalesOrder(session.companyId, id, parsed.data.reason);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SalesOrder',
      entityId: id,
      metadata: { closed: order.status, reason: parsed.data.reason },
    });
    revalidatePath('/dashboard/sales/orders');
    revalidatePath(`/dashboard/sales/orders/${id}`);
    return {
      success: true,
      data: { status: order.status },
      message: order.status === 'CANCELLED' ? 'Nota de venta anulada' : 'Saldo pendiente cerrado',
    };
  } catch (error) {
    return fail(error, companyId, { reason: 'closeSalesOrder' });
  }
}

export interface OrderDocumentPrefill {
  orderId: string;
  folio: number;
  contactId: string;
  warehouseId: string;
  paymentMethod: string;
  sellerId: string | null;
  lines: {
    salesOrderItemId: string;
    productId: string | null;
    sku: string | null;
    description: string;
    unitPrice: number;
    discountPercent: number;
    isExempt: boolean;
    remainingToInvoice: number;
    remainingToDispatch: number;
  }[];
}

/** Datos para emitir una factura, boleta o guía desde la nota (formulario de Ventas). */
export async function getOrderDocumentPrefillAction(id: string): Promise<ActionResult<OrderDocumentPrefill>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const order = await ordersService.getSalesOrder(session.companyId, id);
    if (!order) return { success: false, error: 'Nota de venta no encontrada' };
    if (order.status !== 'PENDING' && order.status !== 'IN_PROGRESS') return { success: false, error: `La nota de venta #${order.folio} ya está cerrada` };
    return {
      success: true,
      data: {
        orderId: order.id,
        folio: order.folio,
        contactId: order.contactId,
        warehouseId: order.warehouseId,
        paymentMethod: order.paymentMethod,
        sellerId: order.sellerId,
        lines: order.items.map((item) => ({
          salesOrderItemId: item.id,
          productId: item.productId,
          sku: item.sku,
          description: item.description,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          isExempt: item.isExempt,
          remainingToInvoice: remainingToInvoice(item),
          remainingToDispatch: remainingToDispatch(item),
        })),
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export interface QuotePrefill {
  quoteId: string;
  folio: number | null;
  contactId: string;
  warehouseId: string;
  paymentMethod: string;
  notes: string | null;
  lines: { productId: string | null; sku: string | null; description: string; quantity: number; unitPrice: number; discountPercent: number; isExempt: boolean }[];
}

/** Datos para convertir una cotización en nota de venta. */
export async function getQuotePrefillAction(quoteId: string): Promise<ActionResult<QuotePrefill>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const quote = await prisma.salesDocument.findFirst({
      where: { id: quoteId, companyId: session.companyId, dteType: 'COTIZACION' },
      include: { items: true },
    });
    if (!quote) return { success: false, error: 'Cotización no encontrada' };
    return {
      success: true,
      data: {
        quoteId: quote.id,
        folio: quote.folio,
        contactId: quote.contactId,
        warehouseId: quote.warehouseId,
        paymentMethod: quote.paymentMethod,
        notes: quote.notes,
        lines: quote.items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          isExempt: item.isExempt,
        })),
      },
    };
  } catch (error) {
    return fail(error);
  }
}

/** Stock comprometido por notas abiertas, para mostrar "disponible" al vender. */
export async function getReservedStockAction(productIds: string[], warehouseId?: string): Promise<ActionResult<Record<string, number>>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const ids = productIds.filter((id) => typeof id === 'string').slice(0, 500);
    const reserved = await ordersService.getReservedStock(session.companyId, ids, warehouseId);
    return { success: true, data: Object.fromEntries(reserved) };
  } catch (error) {
    return fail(error);
  }
}
