'use server';

import { revalidatePath } from 'next/cache';
import type { ProductionOrderStatus } from '@prisma/client';
import { authErrorMessage, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { bomSchema, completeProductionSchema, productionOrderSchema } from '../schema';
import * as service from '../services/manufacturing.service';
import type { BomRow, ProductionOrderDetail, ProductionOrderRow } from '../services/manufacturing.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.ManufacturingError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'produccion', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateManufacturing(id?: string): void {
  revalidatePath('/dashboard/manufacturing');
  revalidatePath('/dashboard/manufacturing/boms');
  if (id) revalidatePath(`/dashboard/manufacturing/${id}`);
}

export async function listBomsAction(): Promise<ActionResult<BomRow[]>> {
  try {
    const session = await requireAuthWithPermission('manufacturing:read');
    const rows = await service.listBoms(session.companyId);
    // Costos solo para quien puede verlos (mismo criterio que el catálogo).
    if (!can(session, 'products:costs')) return { success: true, data: rows.map((row) => ({ ...row, estimatedUnitCost: 0, components: row.components.map((component) => ({ ...component, pmp: 0 })) })) };
    return { success: true, data: rows };
  } catch (error) {
    return fail(error);
  }
}

export async function saveBomAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('manufacturing:write');
    companyId = session.companyId;
    const parsed = bomSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const saved = await service.saveBom(session.companyId, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: id ? 'UPDATE' : 'CREATE', entity: 'BillOfMaterials', entityId: saved.id, metadata: { name: parsed.data.name, components: parsed.data.components.length } });
    revalidateManufacturing();
    return { success: true, data: saved, message: id ? 'Receta actualizada' : 'Receta creada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveBom' });
  }
}

export async function deleteBomAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('manufacturing:write');
    await service.deleteBom(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'BillOfMaterials', entityId: id });
    revalidateManufacturing();
    return { success: true, data: null, message: 'Receta eliminada' };
  } catch (error) {
    return fail(error);
  }
}

const ORDER_FILTERS = ['OPEN', 'ALL', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export async function listProductionOrdersAction(filter: string = 'OPEN'): Promise<ActionResult<ProductionOrderRow[]>> {
  try {
    const session = await requireAuthWithPermission('manufacturing:read');
    const safe = (ORDER_FILTERS as readonly string[]).includes(filter) ? (filter as ProductionOrderStatus | 'OPEN' | 'ALL') : 'OPEN';
    const rows = await service.listProductionOrders(session.companyId, safe);
    if (!can(session, 'products:costs')) return { success: true, data: rows.map((row) => ({ ...row, totalCost: null, unitCost: null })) };
    return { success: true, data: rows };
  } catch (error) {
    return fail(error);
  }
}

export async function getProductionOrderAction(id: string): Promise<ActionResult<ProductionOrderDetail>> {
  try {
    const session = await requireAuthWithPermission('manufacturing:read');
    const order = await service.getProductionOrder(session.companyId, id);
    if (!order) return { success: false, error: 'Orden no encontrada' };
    if (!can(session, 'products:costs')) {
      return {
        success: true,
        data: { ...order, totalCost: null, unitCost: null, estimate: { materials: 0, total: 0, unitCost: 0 }, components: order.components.map((component) => ({ ...component, pmp: 0, totalCost: null })) },
      };
    }
    return { success: true, data: order };
  } catch (error) {
    return fail(error);
  }
}

export async function createProductionOrderAction(input: unknown): Promise<ActionResult<{ id: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('manufacturing:write');
    companyId = session.companyId;
    const parsed = productionOrderSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await service.createProductionOrder(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'ProductionOrder', entityId: created.id, metadata: { folio: created.folio, quantity: parsed.data.quantity } });
    revalidateManufacturing();
    return { success: true, data: created, message: `Orden de producción N° ${created.folio} creada` };
  } catch (error) {
    return fail(error, companyId, { action: 'createProductionOrder' });
  }
}

export async function startProductionOrderAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('manufacturing:write');
    await service.startProductionOrder(session.companyId, id);
    revalidateManufacturing(id);
    return { success: true, data: null, message: 'Orden en proceso' };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelProductionOrderAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('manufacturing:write');
    await service.cancelProductionOrder(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ProductionOrder', entityId: id, metadata: { status: 'CANCELLED' } });
    revalidateManufacturing(id);
    return { success: true, data: null, message: 'Orden anulada' };
  } catch (error) {
    return fail(error);
  }
}

export async function completeProductionOrderAction(id: string, input: unknown): Promise<ActionResult<{ totalCost: number; unitCost: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('manufacturing:write');
    companyId = session.companyId;
    const parsed = completeProductionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await service.completeProductionOrder(session.companyId, session.id, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ProductionOrder', entityId: id, metadata: { status: 'COMPLETED', produced: parsed.data.producedQuantity, totalCost: result.totalCost } });
    const order = await service.getProductionOrder(session.companyId, id);
    if (order) {
      void emitWorkflowEvent(session.companyId, 'PRODUCTION_ORDER_COMPLETED', {
        orderId: id,
        folio: order.folio,
        productName: order.productName,
        quantity: order.quantity,
        totalCost: result.totalCost,
        unitCost: result.unitCost,
      });
    }
    revalidateManufacturing(id);
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data: result, message: 'Producción terminada: insumos consumidos y producto ingresado a bodega' };
  } catch (error) {
    return fail(error, companyId, { action: 'completeProductionOrder', id });
  }
}
