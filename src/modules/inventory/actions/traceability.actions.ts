'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { parseSerialList, parseFlowWindow, type SerialStatus } from '@/lib/inventory/traceability';
import { serialRegisterSchema, serialStatusChangeSchema, serialTransferSchema } from '../schema';
import * as service from '../services/traceability.service';
import type { ProductFlow, SaleOption, SerialRow, TraceableProduct } from '../services/traceability.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  // Los errores de negocio de este módulo ya traen un mensaje para la persona.
  if (error instanceof service.TraceabilityError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'inventario', companyId });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

export async function searchTraceableProductsAction(query: string): Promise<ActionResult<TraceableProduct[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    return { success: true, data: await service.searchTraceableProducts(session.companyId, String(query ?? '').slice(0, 80)) };
  } catch (error) {
    return fail(error);
  }
}

export async function getProductFlowAction(productId: string, days?: number): Promise<ActionResult<ProductFlow>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const flow = await service.getProductFlow(session.companyId, String(productId), { days: parseFlowWindow(days) });
    if (!flow) return { success: false, error: 'Producto no encontrado' };
    return { success: true, data: flow };
  } catch (error) {
    return fail(error);
  }
}

export async function listSerialsAction(productId: string, status?: SerialStatus, query?: string): Promise<ActionResult<SerialRow[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    return { success: true, data: await service.listSerials(session.companyId, String(productId), { status, query }) };
  } catch (error) {
    return fail(error);
  }
}

export async function listSalesForProductAction(productId: string): Promise<ActionResult<SaleOption[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    return { success: true, data: await service.listSalesForProduct(session.companyId, String(productId)) };
  } catch (error) {
    return fail(error);
  }
}

export async function registerSerialsAction(input: unknown): Promise<ActionResult<{ created: number; existing: string[] }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = serialRegisterSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const list = parseSerialList(parsed.data.serialsText);
    if (list.tooMany) return { success: false, error: 'Registra hasta 500 series por vez' };
    if (list.invalid.length) {
      return { success: false, error: `Estas series no son válidas (letras, números, punto, guion, barra y espacio; hasta 64 caracteres): ${list.invalid.slice(0, 3).join(', ')}` };
    }
    const data = await service.registerSerials(session.companyId, session.id, {
      productId: parsed.data.productId,
      warehouseId: parsed.data.warehouseId,
      serials: list.serials,
      lotNumber: parsed.data.lotNumber,
      supplierId: parsed.data.supplierId || null,
      notes: parsed.data.notes,
    });
    if (data.created > 0) {
      await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'ProductSerial', entityId: parsed.data.productId, metadata: { created: data.created } });
    }
    revalidatePath('/dashboard/inventory/trazabilidad');
    const skipped = data.existing.length;
    const message = skipped
      ? `${data.created} serie(s) registradas. ${skipped} ya existían y se omitieron.`
      : `${data.created} serie(s) registradas.`;
    return { success: true, data, message };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function changeSerialStatusAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = serialStatusChangeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.changeSerialStatus(session.companyId, session.id, {
      serialId: parsed.data.serialId,
      to: parsed.data.to,
      note: parsed.data.note,
      salesDocumentId: parsed.data.salesDocumentId || null,
      warehouseId: parsed.data.warehouseId || null,
    });
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ProductSerial', entityId: parsed.data.serialId, metadata: { to: parsed.data.to } });
    revalidatePath('/dashboard/inventory/trazabilidad');
    return { success: true, data: null, message: 'Serie actualizada' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function transferSerialsAction(input: unknown): Promise<ActionResult<{ moved: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = serialTransferSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await service.transferSerials(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ProductSerial', entityId: parsed.data.productId, metadata: { transferred: result.moved, to: parsed.data.toWarehouseId } });
    revalidatePath('/dashboard/inventory/trazabilidad');
    revalidatePath('/dashboard/inventory');
    return { success: true, data: { moved: result.moved }, message: `${result.moved} serie(s) trasladadas` };
  } catch (error) {
    return fail(error, companyId);
  }
}
