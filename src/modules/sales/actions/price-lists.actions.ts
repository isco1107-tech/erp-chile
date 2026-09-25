'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { priceListBulkSchema, priceListItemsSchema, priceListSchema } from '../schema';
import * as service from '../services/price-lists.service';
import type { ContactPricing, PriceListDetail, PriceListRow } from '../services/price-lists.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: authErrorMessage(error) ?? toFriendlyErrorMessage(error) };
}

export async function listPriceListsAction(): Promise<ActionResult<PriceListRow[]>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    return { success: true, data: await service.listPriceLists(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getPriceListAction(id: string): Promise<ActionResult<PriceListDetail>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const list = await service.getPriceList(session.companyId, id);
    if (!list) return { success: false, error: 'Lista de precios no encontrada' };
    return { success: true, data: list };
  } catch (error) {
    return fail(error);
  }
}

export async function createPriceListAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const parsed = priceListSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const list = await service.createPriceList(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'PriceList', entityId: list.id, metadata: { name: list.name } });
    revalidatePath('/dashboard/sales/price-lists');
    return { success: true, data: { id: list.id }, message: 'Lista de precios creada' };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePriceListAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const parsed = priceListSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.updatePriceList(session.companyId, id, parsed.data);
    revalidatePath('/dashboard/sales/price-lists');
    revalidatePath(`/dashboard/sales/price-lists/${id}`);
    return { success: true, data: null, message: 'Lista actualizada' };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePriceListAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    await service.deletePriceList(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'PriceList', entityId: id });
    revalidatePath('/dashboard/sales/price-lists');
    return { success: true, data: null, message: 'Lista eliminada' };
  } catch (error) {
    return fail(error);
  }
}

export async function savePriceListItemsAction(id: string, rows: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const parsed = priceListItemsSchema.safeParse(rows);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const count = await service.setPriceListItems(session.companyId, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'PriceList', entityId: id, metadata: { prices: count } });
    revalidatePath(`/dashboard/sales/price-lists/${id}`);
    return { success: true, data: { count }, message: `${count} precio(s) guardado(s)` };
  } catch (error) {
    return fail(error);
  }
}

export async function fillPriceListAction(id: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const parsed = priceListBulkSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const count = await service.fillPriceListFromCatalog(session.companyId, id, parsed.data.percent, parsed.data.categoryId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'PriceList', entityId: id, metadata: { bulkPercent: parsed.data.percent, products: count } });
    revalidatePath(`/dashboard/sales/price-lists/${id}`);
    return { success: true, data: { count }, message: `${count} producto(s) con precio calculado` };
  } catch (error) {
    return fail(error);
  }
}

export async function getContactPricingAction(contactId: string): Promise<ActionResult<ContactPricing>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    return { success: true, data: await service.getContactPricing(session.companyId, contactId) };
  } catch (error) {
    return fail(error);
  }
}

export async function assignPriceListAction(contactId: string, priceListId: string | null): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('contacts:write');
    await service.assignPriceListToContact(session.companyId, contactId, priceListId);
    revalidatePath('/dashboard/contacts');
    return { success: true, data: null, message: priceListId ? 'Lista de precios asignada' : 'Cliente sin lista de precios' };
  } catch (error) {
    return fail(error);
  }
}
