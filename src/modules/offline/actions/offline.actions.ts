'use server';

import type { OfflineOperationKind } from '@prisma/client';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import type { Permission } from '@/lib/auth/permissions';
import { captureException } from '@/lib/observability';
import { createPosSaleAction } from '@/modules/pos/actions/pos.actions';
import { registerStockMovementAction } from '@/modules/inventory/actions/inventory.actions';
import { createPurchaseDocumentAction } from '@/modules/purchases/actions/purchases.actions';
import { createGoodsReceiptAction } from '@/modules/purchases/actions/goods-receipt.actions';
import { capturedAtProblem, offlineOperationSchema, type OfflineOperationInput } from '../schema';
import { claimOfflineOperation, completeOfflineOperation, failOfflineOperation } from '../services/offline-operations.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export interface OfflineSyncOutcome {
  status: 'DONE' | 'FAILED' | 'PROCESSING';
  resultRef: string | null;
  /** Folio asignado (ventas del POS), para reemplazar el comprobante provisorio. */
  folio: number | null;
  error: string | null;
}

const PERMISSION_BY_KIND: Record<OfflineOperationKind, Permission> = {
  POS_SALE: 'pos:operate',
  STOCK_MOVEMENT: 'inventory:write',
  PURCHASE: 'purchases:write',
  GOODS_RECEIPT: 'purchases:orders',
};

/** Marca en las notas del documento que se registró sin conexión, con la hora real. */
function offlineNote(existing: unknown, capturedAt: Date): string {
  const when = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(capturedAt);
  const prefix = typeof existing === 'string' && existing.trim() ? `${existing.trim()} ` : '';
  return `${prefix}[Registrado sin conexión el ${when}]`.slice(0, 1000);
}

/** Ejecuta la operación con la MISMA Server Action que usa el formulario en línea. */
async function execute(input: OfflineOperationInput, capturedAt: Date): Promise<{ ok: true; resultRef: string | null; folio: number | null } | { ok: false; error: string }> {
  switch (input.kind) {
    case 'POS_SALE': {
      // La clave de la venta es la misma de la operación: si la venta ya se
      // creó (y se perdió la respuesta), el POS devuelve esa misma venta.
      const result = await createPosSaleAction(input.shiftId, { ...input.payload, idempotencyKey: input.idempotencyKey });
      return result.success ? { ok: true, resultRef: result.data.id, folio: result.data.folio } : { ok: false, error: result.error };
    }
    case 'STOCK_MOVEMENT': {
      const result = await registerStockMovementAction({ ...input.payload, notes: offlineNote(input.payload.notes, capturedAt) });
      return result.success ? { ok: true, resultRef: null, folio: null } : { ok: false, error: result.error };
    }
    case 'PURCHASE': {
      const result = await createPurchaseDocumentAction({ ...input.payload, notes: offlineNote(input.payload.notes, capturedAt) }, 'ISSUED');
      return result.success ? { ok: true, resultRef: result.data.id, folio: null } : { ok: false, error: result.error };
    }
    case 'GOODS_RECEIPT': {
      const result = await createGoodsReceiptAction({ ...input.payload, notes: offlineNote(input.payload.notes, capturedAt) });
      return result.success ? { ok: true, resultRef: result.data.id, folio: null } : { ok: false, error: result.error };
    }
  }
}

/**
 * Sincroniza UNA operación hecha sin conexión (modo contingencia). El equipo
 * las manda en el orden en que se hicieron.
 *
 * `success: false` = no se pudo intentar (sin sesión, otra empresa, datos
 * inválidos): el equipo la conserva. `success: true` trae el resultado:
 * DONE (aplicada), FAILED (rechazada, no aplicada; se puede corregir y
 * reintentar) o PROCESSING (quedó a medias: se revisa, no se reintenta sola).
 */
export async function syncOfflineOperationAction(input: unknown): Promise<ActionResult<OfflineSyncOutcome>> {
  const parsed = offlineOperationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Operación sin conexión con datos inválidos' };
  const operation = parsed.data;

  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION_BY_KIND[operation.kind]);
    companyId = session.companyId;
    // Nunca se aplica en otra empresa: si la persona cambió de empresa, la
    // operación espera hasta que vuelva a la empresa donde la hizo.
    if (operation.companyId !== session.companyId) {
      return { success: false, error: 'Esta operación se hizo en otra empresa: entra a esa empresa para sincronizarla' };
    }
    const capturedAt = new Date(operation.capturedAt);
    const problem = capturedAtProblem(capturedAt);
    if (problem) return { success: false, error: problem };

    const claim = await claimOfflineOperation(session.companyId, session.id, {
      idempotencyKey: operation.idempotencyKey,
      kind: operation.kind,
      capturedAt,
      retry: operation.retry,
    });
    if (claim.state === 'done') return { success: true, data: { status: 'DONE', resultRef: claim.resultRef, folio: null, error: null } };
    if (claim.state === 'failed') return { success: true, data: { status: 'FAILED', resultRef: null, folio: null, error: claim.error } };
    if (claim.state === 'processing') return { success: true, data: { status: 'PROCESSING', resultRef: null, folio: null, error: null } };

    let outcome: Awaited<ReturnType<typeof execute>>;
    try {
      outcome = await execute(operation, capturedAt);
    } catch (error) {
      captureException(error, { module: 'offline', companyId, extra: { kind: operation.kind } });
      outcome = { ok: false, error: 'No se pudo aplicar la operación. Revisa los datos y reintenta' };
    }
    if (outcome.ok) {
      await completeOfflineOperation(session.companyId, claim.operationId, outcome.resultRef);
      return { success: true, data: { status: 'DONE', resultRef: outcome.resultRef, folio: outcome.folio, error: null } };
    }
    await failOfflineOperation(session.companyId, claim.operationId, outcome.error);
    return { success: true, data: { status: 'FAILED', resultRef: null, folio: null, error: outcome.error } };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'offline', companyId, extra: { kind: operation.kind } });
    return { success: false, error: 'No se pudo sincronizar la operación' };
  }
}
