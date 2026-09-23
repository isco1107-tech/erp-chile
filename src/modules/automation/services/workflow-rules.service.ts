import crypto from 'crypto';
import type { Prisma, WorkflowExecutionStatus, WorkflowTriggerEvent } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { WorkflowActionConfig, WorkflowCondition } from '@/lib/workflows/types';
import type { WorkflowRuleInput } from '../schema';

export interface WorkflowRuleRow {
  id: string;
  name: string;
  description: string | null;
  trigger: WorkflowTriggerEvent;
  conditions: WorkflowCondition[];
  actions: WorkflowActionConfig[];
  isActive: boolean;
  signingSecret: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastExecution: { status: WorkflowExecutionStatus; createdAt: Date } | null;
}

function toRuleRow(rule: {
  id: string;
  name: string;
  description: string | null;
  trigger: WorkflowTriggerEvent;
  conditions: Prisma.JsonValue;
  actions: Prisma.JsonValue;
  isActive: boolean;
  signingSecret: string;
  createdBy: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  executions: Array<{ status: WorkflowExecutionStatus; createdAt: Date }>;
}): WorkflowRuleRow {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    trigger: rule.trigger,
    conditions: rule.conditions as unknown as WorkflowCondition[],
    actions: rule.actions as unknown as WorkflowActionConfig[],
    isActive: rule.isActive,
    signingSecret: rule.signingSecret,
    createdByName: rule.createdBy?.name ?? null,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    lastExecution: rule.executions[0] ?? null,
  };
}

const RULE_INCLUDE = {
  createdBy: { select: { name: true } },
  executions: { take: 1, orderBy: { createdAt: 'desc' as const }, select: { status: true, createdAt: true } },
};

export async function listWorkflowRules(companyId: string): Promise<WorkflowRuleRow[]> {
  const rules = await prisma.workflowRule.findMany({
    where: { companyId },
    include: RULE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rules.map(toRuleRow);
}

export async function getWorkflowRule(companyId: string, id: string): Promise<WorkflowRuleRow | null> {
  const rule = await prisma.workflowRule.findFirst({ where: { id, companyId }, include: RULE_INCLUDE });
  return rule ? toRuleRow(rule) : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

export async function createWorkflowRule(companyId: string, createdById: string, input: WorkflowRuleInput): Promise<WorkflowRuleRow> {
  const rule = await prisma.workflowRule.create({
    data: {
      companyId,
      createdById,
      name: input.name,
      description: input.description || null,
      trigger: input.trigger as WorkflowTriggerEvent,
      conditions: toJson(input.conditions),
      actions: toJson(input.actions),
      isActive: input.isActive,
      signingSecret: crypto.randomBytes(24).toString('hex'),
    },
    include: RULE_INCLUDE,
  });
  return toRuleRow(rule);
}

export async function updateWorkflowRule(companyId: string, id: string, input: WorkflowRuleInput): Promise<WorkflowRuleRow> {
  const existing = await prisma.workflowRule.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!existing) throw new Error('Regla de automatización no encontrada');

  await prisma.workflowRule.updateMany({
    where: { id, companyId },
    data: {
      name: input.name,
      description: input.description || null,
      trigger: input.trigger as WorkflowTriggerEvent,
      conditions: toJson(input.conditions),
      actions: toJson(input.actions),
      isActive: input.isActive,
    },
  });

  const updated = await prisma.workflowRule.findFirst({ where: { id, companyId }, include: RULE_INCLUDE });
  if (!updated) throw new Error('Regla de automatización no encontrada');
  return toRuleRow(updated);
}

export async function setWorkflowRuleActive(companyId: string, id: string, isActive: boolean): Promise<void> {
  const result = await prisma.workflowRule.updateMany({ where: { id, companyId }, data: { isActive } });
  if (result.count === 0) throw new Error('Regla de automatización no encontrada');
}

/** Invalida cualquier integración externa que tuviera el secreto anterior guardado — mismo criterio que `regenerateN8nWebhookSecret`. */
export async function regenerateWorkflowRuleSecret(companyId: string, id: string): Promise<string> {
  const signingSecret = crypto.randomBytes(24).toString('hex');
  const result = await prisma.workflowRule.updateMany({ where: { id, companyId }, data: { signingSecret } });
  if (result.count === 0) throw new Error('Regla de automatización no encontrada');
  return signingSecret;
}

export async function deleteWorkflowRule(companyId: string, id: string): Promise<void> {
  const result = await prisma.workflowRule.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Regla de automatización no encontrada');
}

export interface WorkflowExecutionRow {
  id: string;
  status: WorkflowExecutionStatus;
  eventPayload: Record<string, unknown>;
  actionResults: Array<{ type: string; success: boolean; detail: string }>;
  createdAt: Date;
}

const EXECUTION_HISTORY_LIMIT = 20;

export async function listWorkflowExecutions(companyId: string, ruleId: string): Promise<WorkflowExecutionRow[]> {
  const executions = await prisma.workflowExecution.findMany({
    where: { companyId, ruleId },
    orderBy: { createdAt: 'desc' },
    take: EXECUTION_HISTORY_LIMIT,
  });

  return executions.map((execution) => ({
    id: execution.id,
    status: execution.status,
    eventPayload: execution.eventPayload as Record<string, unknown>,
    actionResults: execution.actionResults as unknown as Array<{ type: string; success: boolean; detail: string }>,
    createdAt: execution.createdAt,
  }));
}
