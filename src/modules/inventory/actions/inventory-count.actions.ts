'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { inventoryCountCreateSchema, inventoryCountEntriesSchema } from '../schema';
import * as countService from '../services/inventory-count.service';
import type { InventoryCountDetail, InventoryCountListItem, PostCountResult } from '../services/inventory-count.service';
import * as lotsService from '../services/lots.service';
import type { ExpirySummary, LotFilter, LotRow } from '../services/lots.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (!(error instanceof Error)) captureException(error, { module: 'inventario', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

/** Quien no ve costos ve el conteo sin valorizar. */
function redactCountCosts(detail: InventoryCountDetail): InventoryCountDetail {
  return {
    ...detail,
    lines: detail.lines.map((line) => ({ ...line, unitCost: 0 })),
    summary: { ...detail.summary, surplusValue: 0, shortageValue: 0, netValue: 0 },
  };
}

export async function listInventoryCountsAction(): Promise<ActionResult<InventoryCountListItem[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    return { success: true, data: await countService.listInventoryCounts(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getInventoryCountAction(id: string): Promise<ActionResult<InventoryCountDetail>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const detail = await countService.getInventoryCount(session.companyId, String(id));
    if (!detail) return { success: false, error: 'Conteo no encontrado' };
    return { success: true, data: can(session, 'products:costs') ? detail : redactCountCosts(detail) };
  } catch (error) {
    return fail(error);
  }
}

export async function createInventoryCountAction(input: unknown): Promise<ActionResult<{ id: string; folio: number; lines: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = inventoryCountCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await countService.createInventoryCount(session.companyId, session.id, {
      warehouseId: parsed.data.warehouseId,
      categoryId: parsed.data.categoryId || undefined,
      notes: parsed.data.notes || undefined,
    });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'InventoryCount',
      entityId: data.id,
      metadata: { folio: data.folio, warehouseId: parsed.data.warehouseId, lines: data.lines },
    });
    revalidatePath('/dashboard/inventory/counts');
    return { success: true, data, message: `Conteo #${data.folio} abierto con ${data.lines} productos` };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function saveInventoryCountEntriesAction(id: string, entries: unknown): Promise<ActionResult<{ saved: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const parsed = inventoryCountEntriesSchema.safeParse(entries);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const saved = await countService.saveCountEntries(session.companyId, String(id), parsed.data);
    return { success: true, data: { saved }, message: saved === 1 ? '1 línea guardada' : `${saved} líneas guardadas` };
  } catch (error) {
    return fail(error, companyId, { countId: id });
  }
}

export async function postInventoryCountAction(id: string): Promise<ActionResult<PostCountResult>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const result = await countService.postInventoryCount(session.companyId, String(id), session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'STOCK_ADJUSTMENT',
      entity: 'InventoryCount',
      entityId: String(id),
      metadata: { adjusted: result.adjusted, surplusValue: result.surplusValue, shortageValue: result.shortageValue },
    });
    // Después de confirmar: una automatización caída no deshace el ajuste.
    void emitWorkflowEvent(session.companyId, 'INVENTORY_COUNT_POSTED', {
      countId: String(id),
      folio: result.folio,
      warehouseName: result.warehouseName,
      adjusted: result.adjusted,
      surplusValue: result.surplusValue,
      shortageValue: result.shortageValue,
    });
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/inventory/counts');
    const data = can(session, 'products:costs') ? result : { ...result, surplusValue: 0, shortageValue: 0 };
    return {
      success: true,
      data,
      message: result.adjusted === 0 ? 'Conteo contabilizado: el stock ya cuadraba' : `Conteo contabilizado: ${result.adjusted} productos ajustados`,
    };
  } catch (error) {
    return fail(error, companyId, { countId: id });
  }
}

export async function cancelInventoryCountAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    await countService.cancelInventoryCount(session.companyId, String(id));
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'InventoryCount',
      entityId: String(id),
      metadata: { status: 'CANCELLED' },
    });
    revalidatePath('/dashboard/inventory/counts');
    return { success: true, data: null, message: 'Conteo anulado' };
  } catch (error) {
    return fail(error, companyId, { countId: id });
  }
}

// ─── Lotes y vencimientos ────────────────────────────────────────────────────

const LOT_FILTERS: readonly LotFilter[] = ['all', 'expired', 'soon', 'ok'];

export async function listLotsAction(options?: { filter?: string; warehouseId?: string; query?: string }): Promise<ActionResult<LotRow[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const filter = LOT_FILTERS.find((value) => value === options?.filter) ?? 'all';
    const rows = await lotsService.listLots(session.companyId, {
      now: new Date(),
      filter,
      warehouseId: options?.warehouseId || undefined,
      query: options?.query?.slice(0, 80),
    });
    return { success: true, data: can(session, 'products:costs') ? rows : rows.map((row) => ({ ...row, value: 0 })) };
  } catch (error) {
    return fail(error);
  }
}

export async function getExpirySummaryAction(): Promise<ActionResult<ExpirySummary>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const summary = await lotsService.getExpirySummary(session.companyId, new Date());
    return { success: true, data: can(session, 'products:costs') ? summary : { ...summary, expiredValue: 0, soonValue: 0 } };
  } catch (error) {
    return fail(error);
  }
}
