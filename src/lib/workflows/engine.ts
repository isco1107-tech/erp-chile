import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { evaluateConditions } from './condition-evaluator';
import { runWorkflowAction } from './action-runner';
import type { WorkflowActionConfig, WorkflowCondition, WorkflowEventPayload, WorkflowActionResult } from './types';
import type { WorkflowExecutionStatus, WorkflowTriggerEvent } from '@prisma/client';

/**
 * Punto de entrada único del motor de automatizaciones. Se llama DESPUÉS de
 * que la operación de negocio ya se confirmó (nunca dentro de un
 * `prisma.$transaction` de venta/compra/etc. — enviar un correo o llamar un
 * webhook es I/O externo que no debe poder hacer rollback de una venta).
 *
 * Contrato de "nunca lanza": un error en una automatización jamás debe tumbar
 * el flujo de negocio que la disparó. Se captura y se reporta a
 * observabilidad, nunca se propaga al llamador.
 *
 * Deliberado: solo se persiste un `WorkflowExecution` por regla que hizo
 * match de condiciones y corrió sus acciones — una regla activa cuyas
 * condiciones no aplicaron para este evento no genera fila. El volumen de
 * eventos de negocio (una venta por minuto, etc.) haría que el historial
 * fuera puro ruido de "no aplicó" si se registrara cada evaluación.
 */
export async function emitWorkflowEvent(companyId: string, trigger: WorkflowTriggerEvent, payload: WorkflowEventPayload): Promise<void> {
  try {
    const rules = await prisma.workflowRule.findMany({
      where: { companyId, trigger, isActive: true },
      select: { id: true, name: true, conditions: true, actions: true, signingSecret: true },
    });

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as WorkflowCondition[];
      if (!evaluateConditions(conditions, payload)) continue;

      const actions = rule.actions as unknown as WorkflowActionConfig[];
      const results: WorkflowActionResult[] = [];

      for (const action of actions) {
        const result = await runWorkflowAction(action, payload, {
          companyId,
          ruleId: rule.id,
          ruleName: rule.name,
          trigger,
          signingSecret: rule.signingSecret,
        });
        results.push(result);
      }

      const status = statusFromResults(results);
      const eventPayload: Prisma.InputJsonValue = JSON.parse(JSON.stringify(payload));
      const actionResults: Prisma.InputJsonValue = JSON.parse(JSON.stringify(results));

      await prisma.workflowExecution.create({
        data: {
          companyId,
          ruleId: rule.id,
          trigger,
          status,
          eventPayload,
          actionResults,
        },
      });
    }
  } catch (error) {
    captureException(error, { module: 'workflows.engine', companyId, extra: { trigger } });
  }
}

function statusFromResults(results: WorkflowActionResult[]): WorkflowExecutionStatus {
  const successCount = results.filter((r) => r.success).length;
  if (successCount === results.length) return 'SUCCESS';
  if (successCount === 0) return 'FAILED';
  return 'PARTIAL_FAILURE';
}
