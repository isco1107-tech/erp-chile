'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { commissionRateSchema } from '../schema';
import * as service from '../services/commissions.service';
import type { CommissionReport, SellerOption } from '../services/commissions.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: authErrorMessage(error) ?? toFriendlyErrorMessage(error) };
}

/** Vendedores que se pueden asignar a una venta o nota de venta. */
export async function listSellersAction(): Promise<ActionResult<{ id: string; name: string }[]>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const sellers = await service.listSellers(session.companyId);
    return { success: true, data: sellers.map(({ id, name }) => ({ id, name })) };
  } catch (error) {
    return fail(error);
  }
}

/** Tasas y reporte: son datos de remuneración variable, solo para quien ve reportes. */
export async function listSellerRatesAction(): Promise<ActionResult<SellerOption[]>> {
  try {
    const session = await requireAuthWithPermission('reports:read');
    return { success: true, data: await service.listSellers(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getCommissionReportAction(year: number, month: number): Promise<ActionResult<CommissionReport>> {
  try {
    const session = await requireAuthWithPermission('reports:read');
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return { success: false, error: 'Período inválido' };
    }
    return { success: true, data: await service.getCommissionReport(session.companyId, year, month) };
  } catch (error) {
    return fail(error);
  }
}

export async function setCommissionRateAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('settings:users');
    const parsed = commissionRateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const rateBps = Math.round(parsed.data.ratePercent * 100);
    await service.setCommissionRate(session.companyId, parsed.data.userId, rateBps, parsed.data.basis);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SalesCommissionRate',
      entityId: parsed.data.userId,
      metadata: { rateBps, basis: parsed.data.basis },
    });
    revalidatePath('/dashboard/sales/commissions');
    return { success: true, data: null, message: 'Comisión guardada' };
  } catch (error) {
    return fail(error);
  }
}
