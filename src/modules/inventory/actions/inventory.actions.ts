'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type InventoryMovement, type Warehouse } from '@prisma/client';
import { requireAuthWithPermission, getAuthContext, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import { stockMovementSchema, warehouseCreateSchema } from '../schema';
import * as stockService from '../services/stock.service';
import type { StockByWarehouseRow } from '../services/stock.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe una bodega con ese código en esta empresa';
  }
  return toFriendlyErrorMessage(error);
}

export async function listWarehousesAction(): Promise<ActionResult<Warehouse[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const data = await stockService.listWarehouses(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createWarehouseAction(input: unknown): Promise<ActionResult<Warehouse>> {
  try {
    const session = await requireAuthWithPermission('inventory:write');
    const parsed = warehouseCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    // Límite del plan: multibodega es un módulo contratable y `maxWarehouses`
    // es su cupo. Se comprueba acá porque es el único punto de creación.
    const context = await getAuthContext();
    const warehouseCount = await prisma.warehouse.count({ where: { companyId: session.companyId } });
    if (warehouseCount >= 1 && !context.features.hasMultipleWarehouses) {
      return {
        success: false,
        error: `Tu plan ${context.planName} incluye una sola bodega. Contrata el módulo Multibodega para agregar más`,
      };
    }
    if (warehouseCount >= context.maxWarehouses) {
      return {
        success: false,
        error: `Tu plan ${context.planName} permite ${context.maxWarehouses} bodega(s) y ya están creadas`,
      };
    }

    const data = await stockService.createWarehouse(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Warehouse',
      entityId: data.id,
      metadata: { name: data.name, code: data.code },
    });
    revalidatePath('/dashboard/inventory');
    return { success: true, data, message: 'Bodega creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listStockByWarehouseAction(
  query?: string,
  warehouseId?: string
): Promise<ActionResult<StockByWarehouseRow[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const data = await stockService.listStockByWarehouse(session.companyId, { query, warehouseId });
    if (!can(session, 'products:costs')) {
      return { success: true, data: data.map((row) => ({ ...row, pmp: 0, valued: 0 })) };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function registerStockMovementAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('inventory:write');
    const parsed = stockMovementSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { type, productId, warehouseId, quantity, unitCost, targetWarehouseId, reference, notes } = parsed.data;

    if (type === 'PURCHASE_IN' || type === 'ADJUSTMENT_IN') {
      await stockService.registerStockIn(session.companyId, {
        productId,
        warehouseId,
        type,
        quantity,
        unitCost: unitCost ?? 0,
        reference,
        notes,
      });
    } else if (type === 'TRANSFER') {
      await stockService.registerTransfer(session.companyId, {
        productId,
        fromWarehouseId: warehouseId,
        toWarehouseId: targetWarehouseId!,
        quantity,
        reference,
        notes,
      });
    } else {
      await stockService.registerStockOut(session.companyId, {
        productId,
        warehouseId,
        type,
        quantity,
        reference,
        notes,
      });
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'STOCK_ADJUSTMENT',
      entity: 'Product',
      entityId: productId,
      metadata: { type, warehouseId, quantity, unitCost, targetWarehouseId, reference },
    });

    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data: null, message: 'Movimiento registrado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listMovementsAction(
  productId: string,
  warehouseId?: string
): Promise<ActionResult<InventoryMovement[]>> {
  try {
    const session = await requireAuthWithPermission('products:read');
    const data = await stockService.listMovements(session.companyId, productId, { warehouseId });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
