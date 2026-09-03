'use server';

import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import * as financialStatementsService from '../services/financial-statements.service';
import type {
  BalanceSheetResult,
  CashFlowStatementResult,
  IncomeStatementResult,
} from '../services/financial-statements.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

const periodSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

function parsePeriod(year: number, month: number): { success: true; data: { year: number; month: number } } | { success: false; error: string } {
  const parsed = periodSchema.safeParse({ year, month });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Período inválido' };
  return { success: true, data: parsed.data };
}

export async function getBalanceSheetAction(year: number, month: number): Promise<ActionResult<BalanceSheetResult>> {
  try {
    const session = await requireAuthWithPermission('reports:financial');
    const parsed = parsePeriod(year, month);
    if (!parsed.success) return parsed;
    const data = await financialStatementsService.getBalanceSheet(session.companyId, parsed.data.year, parsed.data.month);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getIncomeStatementAction(year: number, month: number): Promise<ActionResult<IncomeStatementResult>> {
  try {
    const session = await requireAuthWithPermission('reports:financial');
    const parsed = parsePeriod(year, month);
    if (!parsed.success) return parsed;
    const data = await financialStatementsService.getIncomeStatement(session.companyId, parsed.data.year, parsed.data.month);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCashFlowStatementAction(year: number, month: number): Promise<ActionResult<CashFlowStatementResult>> {
  try {
    const session = await requireAuthWithPermission('reports:financial');
    const parsed = parsePeriod(year, month);
    if (!parsed.success) return parsed;
    const data = await financialStatementsService.getCashFlowStatement(session.companyId, parsed.data.year, parsed.data.month);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
