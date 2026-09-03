import { prisma } from '@/lib/prisma';
import type { Budget, BudgetLine } from '@prisma/client';
import type {
  BudgetCreateInput,
  BudgetLineCreateInput,
  BudgetLineUpdateInput,
  BudgetUpdateInput,
} from '../schema';

export type BudgetWithLines = Budget & { lines: BudgetLine[] };

export async function createBudget(companyId: string, data: BudgetCreateInput): Promise<Budget> {
  return prisma.budget.create({
    data: {
      companyId,
      name: data.name,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: data.status,
      notes: data.notes || undefined,
    },
  });
}

export async function updateBudget(companyId: string, id: string, data: BudgetUpdateInput): Promise<Budget> {
  const result = await prisma.budget.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: data.status,
      notes: data.notes === '' ? null : data.notes,
    },
  });
  if (result.count === 0) throw new Error('Presupuesto no encontrado');

  const updated = await prisma.budget.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Presupuesto no encontrado');
  return updated;
}

export async function deleteBudget(companyId: string, id: string): Promise<void> {
  const result = await prisma.budget.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Presupuesto no encontrado');
}

export async function listBudgets(companyId: string): Promise<BudgetWithLines[]> {
  return prisma.budget.findMany({
    where: { companyId },
    include: { lines: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getBudgetById(companyId: string, id: string): Promise<BudgetWithLines | null> {
  return prisma.budget.findFirst({
    where: { id, companyId },
    include: { lines: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function addBudgetLine(companyId: string, budgetId: string, data: BudgetLineCreateInput): Promise<BudgetLine> {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, companyId }, select: { id: true } });
  if (!budget) throw new Error('Presupuesto no encontrado');

  return prisma.budgetLine.create({
    data: {
      companyId,
      budgetId,
      category: data.category,
      plannedAmount: data.plannedAmount,
      notes: data.notes || undefined,
    },
  });
}

export async function updateBudgetLine(companyId: string, id: string, data: BudgetLineUpdateInput): Promise<BudgetLine> {
  const result = await prisma.budgetLine.updateMany({
    where: { id, companyId },
    data: {
      category: data.category,
      plannedAmount: data.plannedAmount,
      notes: data.notes === '' ? null : data.notes,
    },
  });
  if (result.count === 0) throw new Error('Línea de presupuesto no encontrada');

  const updated = await prisma.budgetLine.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Línea de presupuesto no encontrada');
  return updated;
}

export async function deleteBudgetLine(companyId: string, id: string): Promise<void> {
  const result = await prisma.budgetLine.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Línea de presupuesto no encontrada');
}

export interface BudgetLineVsActual {
  id: string;
  category: string;
  plannedAmount: number;
  actualAmount: number;
  deviation: number;
  notes: string | null;
}

export interface BudgetVsActual {
  budget: Budget;
  lines: BudgetLineVsActual[];
  totals: {
    plannedAmount: number;
    actualAmount: number;
    deviation: number;
  };
}

/**
 * Trae el presupuesto con sus líneas y, para cada línea, suma los `Payment`
 * de Tesorería que el staff etiquetó a ella (`budgetLineId`). `deviation`
 * se calcula como real - planificado: positivo significa sobreejecución,
 * negativo significa que aún queda saldo disponible en esa categoría.
 */
export async function getBudgetVsActual(companyId: string, budgetId: string): Promise<BudgetVsActual | null> {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, companyId },
    include: { lines: { orderBy: { createdAt: 'asc' } } },
  });
  if (!budget) return null;

  const lines: BudgetLineVsActual[] = await Promise.all(
    budget.lines.map(async (line) => {
      const aggregate = await prisma.payment.aggregate({
        where: { companyId, budgetLineId: line.id },
        _sum: { amount: true },
      });
      const actualAmount = aggregate._sum.amount ?? 0;
      return {
        id: line.id,
        category: line.category,
        plannedAmount: line.plannedAmount,
        actualAmount,
        deviation: actualAmount - line.plannedAmount,
        notes: line.notes,
      };
    })
  );

  const totals = lines.reduce(
    (acc, line) => ({
      plannedAmount: acc.plannedAmount + line.plannedAmount,
      actualAmount: acc.actualAmount + line.actualAmount,
      deviation: acc.deviation + line.deviation,
    }),
    { plannedAmount: 0, actualAmount: 0, deviation: 0 }
  );

  return { budget, lines, totals };
}
