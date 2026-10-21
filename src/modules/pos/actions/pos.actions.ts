'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type CashMovement, type CashRegister, type CashShift, type SalesDocument } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { latidoCajaSupersuite, supersuiteHabilitada } from '@/lib/supersuite';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { getFolioAvailability, type FolioAvailability } from '@/modules/dte/services/caf.service';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import type { SalesDocumentWithItems } from '@/modules/sales/services/sales.service';
import {
  cashMovementSchema,
  cashRegisterCreateSchema,
  closeShiftSchema,
  openShiftSchema,
  posCreditNoteSchema,
  posSaleSchema,
} from '../schema';
import * as cashService from '../services/cash.service';
import * as posService from '../services/pos.service';
import type {
  CashRegisterWithWarehouse,
  ClosedShiftResult,
  OpenShiftDetail,
  ShiftHistoryItem,
  ShiftSummary,
} from '../services/cash.service';
import type {
  PosCustomerLookupResult,
  PosProduct,
  PosSaleListItem,
  PosSaleResult,
  PosTicketData,
} from '../services/pos.service';

function redactPosCosts<T extends { items: Array<{ unitCostPMP: number }> }>(sale: T): T {
  return { ...sale, items: sale.items.map((item) => ({ ...item, unitCostPMP: 0 })) };
}

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe un registro con ese identificador';
  }
  return toFriendlyErrorMessage(error);
}

function revalidatePosPaths() {
  revalidatePath('/dashboard/pos');
  revalidatePath('/pos');
}

export async function listCashRegistersAction(): Promise<ActionResult<CashRegisterWithWarehouse[]>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    // Provisiona la caja por defecto para que un local nuevo pueda vender sin
    // pasar antes por configuración.
    await cashService.ensureDefaultCashRegister(session.companyId);
    return { success: true, data: await cashService.listCashRegisters(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createCashRegisterAction(input: unknown): Promise<ActionResult<CashRegister>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    // Crear cajas es configuración del local, no operación de mostrador.
    if (!can(session, 'settings:company')) {
      return { success: false, error: 'Solo un Administrador puede crear cajas' };
    }
    const parsed = cashRegisterCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const register = await cashService.createCashRegister(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CashRegister',
      entityId: register.id,
      metadata: { name: register.name },
    });
    revalidatePosPaths();
    return { success: true, data: register, message: `Caja "${register.name}" creada` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCurrentShiftAction(): Promise<ActionResult<OpenShiftDetail | null>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await cashService.getOpenShiftForUser(session.companyId, session.id) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Latido de la caja hacia la Supersuite mientras el POS está abierto en pantalla.
 * Solo reporta un turno ABIERTO del propio usuario; no hace nada si la
 * Supersuite no está configurada.
 */
export async function posHeartbeatAction(): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    if (!supersuiteHabilitada()) return { success: true, data: null };
    const shift = await cashService.getOpenShiftForUser(session.companyId, session.id);
    if (shift) latidoCajaSupersuite(session.companyId, { id: shift.cashRegister.id, name: shift.cashRegister.name });
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function openShiftAction(input: unknown): Promise<ActionResult<CashShift>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    const parsed = openShiftSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const shift = await cashService.openShift(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CashShift',
      entityId: shift.id,
      metadata: { initialAmount: shift.initialAmount, cashRegisterId: shift.cashRegisterId },
    });
    revalidatePosPaths();
    return { success: true, data: shift, message: 'Caja abierta' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getShiftSummaryAction(shiftId: string): Promise<ActionResult<ShiftSummary>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await cashService.getShiftSummary(session.companyId, shiftId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function closeShiftAction(shiftId: string, input: unknown): Promise<ActionResult<ClosedShiftResult>> {
  try {
    // Cerrar caja es el control sobre el cajero: exige su propio permiso.
    const session = await requireAuthWithPermission('pos:close');
    const parsed = closeShiftSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const shift = await cashService.getShift(session.companyId, shiftId);
    if (!shift) return { success: false, error: 'Turno no encontrado' };

    const result = await cashService.closeShift(session.companyId, shiftId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CashShift',
      entityId: shiftId,
      metadata: {
        cerradoPor: session.email,
        cajero: shift.user?.email ?? 'Usuario eliminado',
        esperado: result.shift.expectedAmount,
        contado: result.shift.actualAmount,
        descuadre: result.shift.difference,
      },
    });
    revalidatePosPaths();
    return {
      success: true,
      data: result,
      message: result.shift.difference === 0 ? 'Caja cerrada sin descuadre' : 'Caja cerrada con descuadre',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function registerCashMovementAction(
  shiftId: string,
  input: unknown
): Promise<ActionResult<CashMovement>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    const parsed = cashMovementSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const movement = await cashService.registerCashMovement(session.companyId, shiftId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CashMovement',
      entityId: movement.id,
      metadata: { type: movement.type, amount: movement.amount, reason: movement.reason },
    });
    revalidatePosPaths();
    return { success: true, data: movement, message: 'Movimiento registrado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listCashMovementsAction(shiftId: string): Promise<ActionResult<CashMovement[]>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await cashService.listCashMovements(session.companyId, shiftId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPosProductsAction(warehouseId: string): Promise<ActionResult<PosProduct[]>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await posService.listPosProducts(session.companyId, warehouseId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPosSaleAction(shiftId: string, input: unknown): Promise<ActionResult<PosSaleResult>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    const parsed = posSaleSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const sale = await posService.createPosSale(session.companyId, session.id, shiftId, parsed.data);
    const dteLabel = DTE_TYPE_LABELS[sale.dteType] ?? 'Boleta';
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'ISSUE_DTE',
      entity: 'SalesDocument',
      entityId: sale.id,
      metadata: {
        dteType: sale.dteType,
        folio: sale.folio,
        total: sale.totalAmount,
        medioPago: sale.paymentMethod,
        origen: 'POS',
      },
    });
    revalidatePosPaths();
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/sales');
    return {
      success: true,
      data: can(session, 'products:costs') ? sale : redactPosCosts(sale),
      message: `${dteLabel} #${sale.folio} emitida`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listShiftSalesAction(shiftId: string): Promise<ActionResult<PosSaleListItem[]>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await posService.listShiftSales(session.companyId, shiftId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listShiftsAction(): Promise<ActionResult<ShiftHistoryItem[]>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await cashService.listShifts(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function lookupPosCustomerAction(rut: string): Promise<ActionResult<PosCustomerLookupResult | null>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await posService.lookupPosCustomerByRut(session.companyId, rut) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPosTicketAction(documentId: string): Promise<ActionResult<PosTicketData | null>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    const ticket = await posService.getTicket(session.companyId, documentId);
    if (!ticket) return { success: false, error: 'Comprobante no encontrado' };
    return {
      success: true,
      data: can(session, 'products:costs') ? ticket : redactPosCosts(ticket),
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelPosSaleAction(
  shiftId: string,
  documentId: string,
  reason: string
): Promise<ActionResult<SalesDocument>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      return { success: false, error: 'Indica el motivo de la anulación (mínimo 3 caracteres)' };
    }
    const cancelled = await posService.cancelPosSale(session.companyId, shiftId, documentId, trimmedReason);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CANCEL_DTE',
      entity: 'SalesDocument',
      entityId: cancelled.id,
      metadata: { folio: cancelled.folio, dteType: cancelled.dteType, motivo: trimmedReason, origen: 'POS' },
    });
    revalidatePosPaths();
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/sales');
    return { success: true, data: cancelled, message: `Documento #${cancelled.folio} anulado` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPosCreditNoteAction(
  shiftId: string,
  input: unknown
): Promise<ActionResult<SalesDocumentWithItems & { timbrePdf417: string | null }>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    const parsed = posCreditNoteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const creditNote = await posService.createPosCreditNote(
      session.companyId,
      session.id,
      shiftId,
      parsed.data
    );
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'ISSUE_DTE',
      entity: 'SalesDocument',
      entityId: creditNote.id,
      metadata: {
        dteType: creditNote.dteType,
        folio: creditNote.folio,
        total: creditNote.totalAmount,
        referenceType: creditNote.referenceType,
        referenceFolio: creditNote.referenceFolio,
        origen: 'POS_DEVOLUCION',
      },
    });
    revalidatePosPaths();
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/sales');
    return {
      success: true,
      data: can(session, 'products:costs') ? creditNote : redactPosCosts(creditNote),
      message: `Nota de Crédito #${creditNote.folio} emitida`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPosFolioAvailabilityAction(): Promise<ActionResult<FolioAvailability[]>> {
  try {
    const session = await requireAuthWithPermission('pos:operate');
    return { success: true, data: await getFolioAvailability(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
