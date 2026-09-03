'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type CashMovement, type CashRegister, type CashShift } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  cashMovementSchema,
  cashRegisterCreateSchema,
  closeShiftSchema,
  openShiftSchema,
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
import type { PosProduct, PosSaleListItem, PosSaleResult } from '../services/pos.service';

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
    revalidatePath('/dashboard/pos');
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
    revalidatePath('/dashboard/pos');
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
    revalidatePath('/dashboard/pos');
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
    revalidatePath('/dashboard/pos');
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
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'ISSUE_DTE',
      entity: 'SalesDocument',
      entityId: sale.id,
      metadata: { folio: sale.folio, total: sale.totalAmount, medioPago: sale.paymentMethod, origen: 'POS' },
    });
    revalidatePath('/dashboard/pos');
    revalidatePath('/dashboard/inventory');
    return { success: true, data: can(session, 'products:costs') ? sale : redactPosCosts(sale), message: `Boleta #${sale.folio} emitida` };
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
