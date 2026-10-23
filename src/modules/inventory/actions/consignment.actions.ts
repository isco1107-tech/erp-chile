'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import type { ConsignmentSettlementStatus } from '@prisma/client';
import { consignmentReceiveSchema, consignmentReturnSchema, settlementGenerateSchema, settlementPaySchema, settlementVoidSchema } from '../schema';
import * as consignmentService from '../services/consignment.service';
import * as settlementService from '../services/consignment-settlement.service';
import type { ConsignedStockGroup, ConsignorOption } from '../services/consignment.service';
import type { PendingSettlement, SettlementDetail, SettlementListItem, SettlementOverviewRow } from '../services/consignment-settlement.service';

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

/** Existencias de la mercadería de cada seller. */
export async function listConsignedStockAction(): Promise<ActionResult<ConsignedStockGroup[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:read');
    companyId = session.companyId;
    return { success: true, data: await consignmentService.listConsignedStock(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

// ─── Liquidaciones ───────────────────────────────────────────────────────────

/** Una fila por seller: lo pendiente de liquidar y lo liquidado sin pagar. */
export async function listSettlementOverviewAction(): Promise<ActionResult<SettlementOverviewRow[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:read');
    companyId = session.companyId;
    return { success: true, data: await settlementService.listSettlementOverview(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

/** Lo que se le liquidaría hoy a un seller, línea por línea (no guarda nada). */
export async function getPendingSettlementAction(consignorId: string): Promise<ActionResult<PendingSettlement>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:read');
    companyId = session.companyId;
    return { success: true, data: await settlementService.getPendingSettlement(session.companyId, String(consignorId)) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

const SETTLEMENT_STATUSES: readonly ConsignmentSettlementStatus[] = ['CONFIRMED', 'PAID', 'VOIDED'];

export async function listSettlementsAction(consignorId?: string, status?: string): Promise<ActionResult<SettlementListItem[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:read');
    companyId = session.companyId;
    const parsedStatus = SETTLEMENT_STATUSES.find((value) => value === status);
    return { success: true, data: await settlementService.listSettlements(session.companyId, { consignorId: consignorId || undefined, status: parsedStatus }) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

export async function getSettlementAction(id: string): Promise<ActionResult<SettlementDetail>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:read');
    companyId = session.companyId;
    const data = await settlementService.getSettlement(session.companyId, String(id));
    if (!data) return { success: false, error: 'Liquidación no encontrada' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

/** Genera la liquidación de todo lo pendiente de un seller. */
export async function generateSettlementAction(input: unknown): Promise<ActionResult<{ id: string; number: number; payoutAmount: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = settlementGenerateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const settlement = await settlementService.generateSettlement(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'ConsignmentSettlement',
      entityId: settlement.id,
      metadata: { number: settlement.number, consignorId: settlement.consignorId, payoutAmount: settlement.payoutAmount, units: settlement.units, adjustmentAmount: parsed.data.adjustmentAmount },
    });
    revalidatePath('/dashboard/inventory/consignment');
    return { success: true, data: { id: settlement.id, number: settlement.number, payoutAmount: settlement.payoutAmount }, message: `Liquidación N° ${settlement.number} generada` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

/** Marca la liquidación como pagada al seller (el pago en sí se hace fuera: transferencia, efectivo…). */
export async function markSettlementPaidAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = settlementPaySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await settlementService.markSettlementPaid(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ConsignmentSettlement',
      entityId: parsed.data.id,
      metadata: { status: 'PAID', paidAt: parsed.data.paidAt, reference: parsed.data.reference },
    });
    revalidatePath('/dashboard/inventory/consignment');
    return { success: true, data: null, message: 'Liquidación marcada como pagada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}

/** Anula una liquidación sin pagar: sus ventas vuelven a quedar pendientes. */
export async function voidSettlementAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = settlementVoidSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await settlementService.voidSettlement(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ConsignmentSettlement',
      entityId: parsed.data.id,
      metadata: { status: 'VOIDED', reason: parsed.data.reason },
    });
    revalidatePath('/dashboard/inventory/consignment');
    return { success: true, data: null, message: 'Liquidación anulada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, companyId) };
  }
}
