'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type JobPosition } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import {
  applySuggestionsSchema,
  assignJobPositionSchema,
  assignManagerSchema,
  createJobPositionSchema,
} from '../schema';
import * as orgChartService from '../services/org-chart.service';
import type { JobPositionWithUsage, OrgChartNode, StaffFlatRow } from '../services/org-chart.service';
import { suggestOrgChart } from '../services/suggest-hierarchy.service';
import type { OrgChartSuggestion } from '../services/suggest-hierarchy.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'Ya existe un cargo con ese nombre en tu empresa';
  }
  return toFriendlyErrorMessage(error);
}

function revalidateOrgChart() {
  revalidatePath('/dashboard/org-chart');
  revalidatePath('/dashboard/org-chart/manage');
}

export async function listJobPositionsAction(): Promise<ActionResult<JobPositionWithUsage[]>> {
  try {
    const context = await requireAuthWithPermission('orgchart:read');
    const data = await orgChartService.listJobPositions(context.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createJobPositionAction(input: unknown): Promise<ActionResult<JobPosition>> {
  try {
    const context = await requireAuthWithPermission('orgchart:write');
    const parsed = createJobPositionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const position = await orgChartService.createJobPosition(context.companyId, parsed.data);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'CREATE',
      entity: 'JobPosition',
      entityId: position.id,
      metadata: { name: position.name, level: position.level },
    });

    revalidateOrgChart();
    return { success: true, data: position, message: `Cargo "${position.name}" creado` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteJobPositionAction(id: string): Promise<ActionResult<null>> {
  try {
    const context = await requireAuthWithPermission('orgchart:write');
    await orgChartService.deleteJobPosition(context.companyId, id);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'DELETE',
      entity: 'JobPosition',
      entityId: id,
    });

    revalidateOrgChart();
    return { success: true, data: null, message: 'Cargo eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listStaffFlatAction(): Promise<ActionResult<StaffFlatRow[]>> {
  try {
    const context = await requireAuthWithPermission('orgchart:read');
    const data = await orgChartService.listStaffFlat(context.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function assignManagerAction(userId: string, managerId: string | null): Promise<ActionResult<null>> {
  try {
    const context = await requireAuthWithPermission('orgchart:write');
    const parsed = assignManagerSchema.safeParse({ managerId });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    await orgChartService.assignManager(context.companyId, userId, parsed.data.managerId);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      metadata: { reason: 'orgchart_assign_manager', managerId: parsed.data.managerId },
    });

    revalidateOrgChart();
    return { success: true, data: null, message: 'Jefe asignado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function assignJobPositionAction(
  userId: string,
  jobPositionId: string | null
): Promise<ActionResult<null>> {
  try {
    const context = await requireAuthWithPermission('orgchart:write');
    const parsed = assignJobPositionSchema.safeParse({ jobPositionId });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    await orgChartService.assignJobPosition(context.companyId, userId, parsed.data.jobPositionId);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      metadata: { reason: 'orgchart_assign_job_position', jobPositionId: parsed.data.jobPositionId },
    });

    revalidateOrgChart();
    return { success: true, data: null, message: 'Cargo asignado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getOrgChartTreeAction(): Promise<ActionResult<OrgChartNode[]>> {
  try {
    const context = await requireAuthWithPermission('orgchart:read');
    const data = await orgChartService.getOrgChartTree(context.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function suggestOrgChartAction(): Promise<ActionResult<OrgChartSuggestion[]>> {
  try {
    const context = await requireAuthWithPermission('orgchart:ai');
    const data = await suggestOrgChart(context.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export interface ApplyAssignmentsResult {
  appliedCount: number;
  failures: Array<{ userId: string; error: string }>;
}

export async function applyOrgChartAssignmentsAction(
  assignments: unknown
): Promise<ActionResult<ApplyAssignmentsResult>> {
  try {
    const context = await requireAuthWithPermission('orgchart:write');
    const parsed = applySuggestionsSchema.safeParse({ assignments });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    let appliedCount = 0;
    const failures: Array<{ userId: string; error: string }> = [];

    // Cada fila se valida y aplica de forma independiente (tenant + ciclo, ya
    // cubiertos dentro de assignManager/assignJobPosition): si una falla, no
    // debe tumbar las demás.
    for (const assignment of parsed.data.assignments) {
      try {
        await orgChartService.assignManager(context.companyId, assignment.userId, assignment.managerId);
        await orgChartService.assignJobPosition(context.companyId, assignment.userId, assignment.jobPositionId);
        appliedCount += 1;
      } catch (error) {
        failures.push({ userId: assignment.userId, error: toErrorMessage(error) });
      }
    }

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: 'bulk',
      metadata: {
        reason: 'orgchart_apply_ai_suggestions',
        appliedCount,
        failedCount: failures.length,
        failures,
      },
    });

    revalidateOrgChart();
    return {
      success: true,
      data: { appliedCount, failures },
      message: `Se aplicaron ${appliedCount} de ${parsed.data.assignments.length} sugerencia(s)`,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
