'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { workflowRuleInputSchema, type WorkflowRuleInput } from '../schema';
import * as workflowRulesService from '../services/workflow-rules.service';
import type { WorkflowExecutionRow, WorkflowRuleRow } from '../services/workflow-rules.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown, context: Record<string, unknown>): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Error && error.message === 'Regla de automatización no encontrada') return error.message;

  captureException(error, { module: 'automation', ...context });
  return 'No se pudo completar la operación sobre la regla de automatización';
}

const AUTOMATIONS_PATH = '/dashboard/settings/automations';

export async function listWorkflowRulesAction(): Promise<ActionResult<WorkflowRuleRow[]>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    const rules = await workflowRulesService.listWorkflowRules(session.companyId);
    return { success: true, data: rules };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'listWorkflowRules' }) };
  }
}

export async function createWorkflowRuleAction(input: WorkflowRuleInput): Promise<ActionResult<WorkflowRuleRow>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    const parsed = workflowRuleInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }

    const rule = await workflowRulesService.createWorkflowRule(session.companyId, session.id, parsed.data);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'WorkflowRule',
      entityId: rule.id,
      metadata: { name: rule.name, trigger: rule.trigger, actionsCount: rule.actions.length },
    });

    revalidatePath(AUTOMATIONS_PATH);
    return { success: true, data: rule, message: 'Regla creada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'createWorkflowRule' }) };
  }
}

export async function updateWorkflowRuleAction(id: string, input: WorkflowRuleInput): Promise<ActionResult<WorkflowRuleRow>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    const parsed = workflowRuleInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    }

    const rule = await workflowRulesService.updateWorkflowRule(session.companyId, id, parsed.data);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WorkflowRule',
      entityId: rule.id,
      metadata: { name: rule.name, trigger: rule.trigger },
    });

    revalidatePath(AUTOMATIONS_PATH);
    return { success: true, data: rule, message: 'Regla actualizada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'updateWorkflowRule' }) };
  }
}

export async function setWorkflowRuleActiveAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    await workflowRulesService.setWorkflowRuleActive(session.companyId, id, isActive);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WorkflowRule',
      entityId: id,
      metadata: { isActive },
    });

    revalidatePath(AUTOMATIONS_PATH);
    return { success: true, data: null, message: isActive ? 'Regla activada' : 'Regla desactivada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'setWorkflowRuleActive' }) };
  }
}

export async function regenerateWorkflowRuleSecretAction(id: string): Promise<ActionResult<{ signingSecret: string }>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    const signingSecret = await workflowRulesService.regenerateWorkflowRuleSecret(session.companyId, id);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WorkflowRule',
      entityId: id,
      metadata: { signingSecretRegenerated: true },
    });

    revalidatePath(AUTOMATIONS_PATH);
    return { success: true, data: { signingSecret }, message: 'Secreto regenerado: actualiza la integración externa con el nuevo valor' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'regenerateWorkflowRuleSecret' }) };
  }
}

export async function deleteWorkflowRuleAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    await workflowRulesService.deleteWorkflowRule(session.companyId, id);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'WorkflowRule',
      entityId: id,
    });

    revalidatePath(AUTOMATIONS_PATH);
    return { success: true, data: null, message: 'Regla eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'deleteWorkflowRule' }) };
  }
}

export async function listWorkflowExecutionsAction(ruleId: string): Promise<ActionResult<WorkflowExecutionRow[]>> {
  try {
    const session = await requireAuthWithPermission('automation:manage');
    const executions = await workflowRulesService.listWorkflowExecutions(session.companyId, ruleId);
    return { success: true, data: executions };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, { action: 'listWorkflowExecutions' }) };
  }
}
