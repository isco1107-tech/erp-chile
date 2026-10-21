'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { assignProductSchema, buildSettlementSchema, createProducerSchema, updateProducerSchema } from '../schema';
import * as service from '../services/consignment.service';
import * as settlementService from '../services/settlement.service';
import type { ProducerRow } from '../services/consignment.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.ConsignmentError) return { success: false, error: error.message };
  captureException(error, { module: 'consignacion', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

export async function listProducersAction(): Promise<ActionResult<ProducerRow[]>> {
  try {
    const session = await requireAuthWithPermission('consignment:read');
    return { success: true, data: await service.listProducers(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function createProducerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = createProducerSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await service.createProducer(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Producer',
      entityId: created.id,
      metadata: { contactId: parsed.data.contactId, defaultCommissionBps: parsed.data.defaultCommissionBps },
    });
    revalidatePath('/dashboard/consignment');
    return { success: true, data: created, message: 'Productor creado' };
  } catch (error) {
    return fail(error, companyId, { action: 'createProducer' });
  }
}

export async function updateProducerAction(producerId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = updateProducerSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.updateProducer(session.companyId, producerId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Producer',
      entityId: producerId,
      metadata: { defaultCommissionBps: parsed.data.defaultCommissionBps, isActive: parsed.data.isActive },
    });
    revalidatePath('/dashboard/consignment');
    return { success: true, data: null, message: 'Productor actualizado' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateProducer', producerId });
  }
}

export async function assignProductToProducerAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = assignProductSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.assignProductToProducer(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Product',
      entityId: parsed.data.productId,
      metadata: { producerId: parsed.data.producerId, commissionBpsOverride: parsed.data.commissionBpsOverride ?? null },
    });
    revalidatePath('/dashboard/consignment');
    return { success: true, data: null, message: parsed.data.producerId ? 'Producto asignado al productor' : 'Producto devuelto a stock propio' };
  } catch (error) {
    return fail(error, companyId, { action: 'assignProductToProducer' });
  }
}

export async function buildSettlementAction(input: unknown): Promise<ActionResult<{ id: string; lineCount: number; totalDue: number; totalPayable: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsed = buildSettlementSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    // "desde" y "hasta" son días inclusive; el servicio los lleva al calendario de Santiago.
    const settlement = await service.buildSettlement(session.companyId, parsed.data.producerId, parsed.data.from, parsed.data.to);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'ConsignmentSettlement',
      entityId: settlement.id,
      metadata: { producerId: parsed.data.producerId, lineCount: settlement.lineCount, totalDue: settlement.totalDue },
    });
    revalidatePath('/dashboard/consignment');
    return { success: true, data: settlement, message: 'Liquidación en borrador creada' };
  } catch (error) {
    return fail(error, companyId, { action: 'buildSettlement' });
  }
}

const settlementIdSchema = z.string().trim().min(1, 'Liquidación inválida');

async function runSettlementTransition(
  settlementId: unknown,
  run: (companyId: string, id: string) => Promise<unknown>,
  audit: { entity: 'ConsignmentSettlement'; action: 'UPDATE' | 'DELETE'; metadata: Record<string, unknown> },
  message: string,
  extra: string
): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('consignment:write');
    companyId = session.companyId;
    const parsedId = settlementIdSchema.safeParse(settlementId);
    if (!parsedId.success) return { success: false, error: parsedId.error.issues[0]?.message ?? 'Datos inválidos' };
    await run(session.companyId, parsedId.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: audit.action,
      entity: audit.entity,
      entityId: parsedId.data,
      metadata: audit.metadata,
    });
    revalidatePath('/dashboard/consignment');
    return { success: true, data: null, message };
  } catch (error) {
    return fail(error, companyId, { action: extra });
  }
}

export async function confirmSettlementAction(settlementId: unknown): Promise<ActionResult<null>> {
  return runSettlementTransition(
    settlementId,
    (companyId, id) => settlementService.confirmSettlement(companyId, id),
    { entity: 'ConsignmentSettlement', action: 'UPDATE', metadata: { transition: 'DRAFT->CONFIRMED' } },
    'Liquidación confirmada. Se creó la cuenta por pagar al productor en Tesorería.',
    'confirmSettlement'
  );
}

export async function markSettlementPaidAction(settlementId: unknown): Promise<ActionResult<null>> {
  return runSettlementTransition(
    settlementId,
    (companyId, id) => settlementService.markSettlementPaid(companyId, id),
    { entity: 'ConsignmentSettlement', action: 'UPDATE', metadata: { transition: 'CONFIRMED->PAID' } },
    'Liquidación marcada como pagada',
    'markSettlementPaid'
  );
}

export async function discardSettlementAction(settlementId: unknown): Promise<ActionResult<null>> {
  return runSettlementTransition(
    settlementId,
    (companyId, id) => settlementService.discardSettlement(companyId, id),
    { entity: 'ConsignmentSettlement', action: 'DELETE', metadata: { transition: 'DRAFT->DISCARDED' } },
    'Borrador descartado: sus ventas volvieron a pendientes',
    'discardSettlement'
  );
}

export async function getProductConsignmentAction(productId: string): Promise<ActionResult<settlementService.ProductConsignmentState>> {
  try {
    const session = await requireAuthWithPermission('consignment:read');
    const state = await settlementService.getProductConsignment(session.companyId, String(productId));
    if (!state) return { success: false, error: 'Producto no encontrado' };
    return { success: true, data: state };
  } catch (error) {
    return fail(error);
  }
}
