'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Budget, type BudgetLine } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  budgetCreateSchema,
  budgetLineCreateSchema,
  budgetLineUpdateSchema,
  budgetUpdateSchema,
} from '../schema';
import * as budgetsService from '../services/budgets.service';
import type { BudgetVsActual, BudgetWithLines } from '../services/budgets.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al guardar el presupuesto';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

function revalidateBudgets(id?: string) {
  revalidatePath('/dashboard/budgets');
  if (id) revalidatePath(`/dashboard/budgets/${id}`);
}

export async function listBudgetsAction(): Promise<ActionResult<BudgetWithLines[]>> {
  try {
    const session = await requireAuthWithPermission('budgets:read');
    const data = await budgetsService.listBudgets(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getBudgetByIdAction(id: string): Promise<ActionResult<BudgetWithLines>> {
  try {
    const session = await requireAuthWithPermission('budgets:read');
    const budget = await budgetsService.getBudgetById(session.companyId, id);
    if (!budget) return { success: false, error: 'Presupuesto no encontrado' };
    return { success: true, data: budget };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createBudgetAction(input: unknown): Promise<ActionResult<Budget>> {
  try {
    const session = await requireAuthWithPermission('budgets:write');
    const parsed = budgetCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await budgetsService.createBudget(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Budget',
      entityId: data.id,
      metadata: { name: data.name, status: data.status },
    });
    revalidateBudgets();
    return { success: true, data, message: 'Presupuesto creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateBudgetAction(id: string, input: unknown): Promise<ActionResult<Budget>> {
  try {
    const session = await requireAuthWithPermission('budgets:write');
    const parsed = budgetUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await budgetsService.updateBudget(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Budget',
      entityId: data.id,
      metadata: { name: data.name, status: data.status },
    });
    revalidateBudgets(id);
    return { success: true, data, message: 'Presupuesto actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteBudgetAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('budgets:write');
    await budgetsService.deleteBudget(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'Budget',
      entityId: id,
      metadata: {},
    });
    revalidateBudgets();
    return { success: true, data: null, message: 'Presupuesto eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addBudgetLineAction(budgetId: string, input: unknown): Promise<ActionResult<BudgetLine>> {
  try {
    const session = await requireAuthWithPermission('budgets:write');
    const parsed = budgetLineCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await budgetsService.addBudgetLine(session.companyId, budgetId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'BudgetLine',
      entityId: data.id,
      metadata: { budgetId, category: data.category, plannedAmount: data.plannedAmount },
    });
    revalidateBudgets(budgetId);
    return { success: true, data, message: 'Línea de presupuesto agregada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updateBudgetLineAction(
  id: string,
  budgetId: string,
  input: unknown
): Promise<ActionResult<BudgetLine>> {
  try {
    const session = await requireAuthWithPermission('budgets:write');
    const parsed = budgetLineUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await budgetsService.updateBudgetLine(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'BudgetLine',
      entityId: data.id,
      metadata: { budgetId, category: data.category, plannedAmount: data.plannedAmount },
    });
    revalidateBudgets(budgetId);
    return { success: true, data, message: 'Línea de presupuesto actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteBudgetLineAction(id: string, budgetId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('budgets:write');
    await budgetsService.deleteBudgetLine(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'BudgetLine',
      entityId: id,
      metadata: { budgetId },
    });
    revalidateBudgets(budgetId);
    return { success: true, data: null, message: 'Línea de presupuesto eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getBudgetVsActualAction(budgetId: string): Promise<ActionResult<BudgetVsActual>> {
  try {
    const session = await requireAuthWithPermission('budgets:read');
    const data = await budgetsService.getBudgetVsActual(session.companyId, budgetId);
    if (!data) return { success: false, error: 'Presupuesto no encontrado' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
