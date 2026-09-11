import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/mailer';
import { escapeHtml } from '@/lib/email/templates';
import { isSafeOutboundWebhookUrl, assertResolvesToPublicAddress } from '@/lib/security/outbound-url';
import { captureException } from '@/lib/observability';
import { renderTemplate } from './template';
import type { WorkflowActionConfig, WorkflowActionResult, WorkflowEventPayload, WorkflowTriggerEvent } from './types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBHOOK_TIMEOUT_MS = 8000;

export interface WorkflowActionRunContext {
  companyId: string;
  ruleId: string;
  ruleName: string;
  trigger: WorkflowTriggerEvent;
  signingSecret: string;
}

/** Ejecuta una acción y NUNCA lanza — el motor la corre en un `for` y necesita seguir con la siguiente aunque esta falle. */
export async function runWorkflowAction(action: WorkflowActionConfig, payload: WorkflowEventPayload, context: WorkflowActionRunContext): Promise<WorkflowActionResult> {
  try {
    switch (action.type) {
      case 'SEND_EMAIL':
        return await runSendEmail(action, payload);
      case 'CREATE_NOTIFICATION':
        return await runCreateNotification(action, payload, context);
      case 'CALL_WEBHOOK':
        return await runCallWebhook(action, payload, context);
    }
  } catch (error) {
    captureException(error, { module: 'workflows.action-runner', companyId: context.companyId, extra: { ruleId: context.ruleId, actionType: action.type } });
    return { type: action.type, success: false, detail: `Error inesperado: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function runSendEmail(action: Extract<WorkflowActionConfig, { type: 'SEND_EMAIL' }>, payload: WorkflowEventPayload): Promise<WorkflowActionResult> {
  const to = renderTemplate(action.to, payload).text.trim();
  if (!EMAIL_REGEX.test(to)) {
    return { type: 'SEND_EMAIL', success: false, detail: `Destinatario inválido tras resolver la plantilla: "${to}"` };
  }

  const subject = renderTemplate(action.subject, payload).text;
  const bodyResult = renderTemplate(action.body, payload);
  // El texto insertado por {{campo}} viene de datos de negocio — algunos con
  // origen en un formulario público sin autenticar (ej. el nombre de una
  // candidata en CANDIDATE_REGISTERED). Sin escapar, ese campo se inyecta tal
  // cual en el HTML del correo real que recibe el destinatario configurado en
  // la regla. Mismo escapado que ya usa el resto de las plantillas transaccionales
  // (`src/lib/email/templates.ts`) — este es el único punto que lo saltaba.
  const html = escapeHtml(bodyResult.text).replace(/\n/g, '<br>');

  const delivery = await sendEmail({ to, subject, html, text: bodyResult.text });
  if (delivery.status === 'failed') {
    return { type: 'SEND_EMAIL', success: false, detail: `Falló el envío a ${to}: ${delivery.error ?? 'sin detalle'}` };
  }
  const note = bodyResult.unknownFields.length > 0 ? ` (campos desconocidos en la plantilla: ${bodyResult.unknownFields.join(', ')})` : '';
  return { type: 'SEND_EMAIL', success: true, detail: `Enviado a ${to}${note}` };
}

async function runCreateNotification(
  action: Extract<WorkflowActionConfig, { type: 'CREATE_NOTIFICATION' }>,
  payload: WorkflowEventPayload,
  context: WorkflowActionRunContext
): Promise<WorkflowActionResult> {
  const title = renderTemplate(action.title, payload).text;
  const message = renderTemplate(action.message, payload).text;

  await prisma.workflowNotification.create({
    data: {
      companyId: context.companyId,
      ruleId: context.ruleId,
      severity: action.severity,
      title,
      message,
      href: action.href || null,
    },
  });

  return { type: 'CREATE_NOTIFICATION', success: true, detail: `Notificación creada: "${title}"` };
}

async function runCallWebhook(action: Extract<WorkflowActionConfig, { type: 'CALL_WEBHOOK' }>, payload: WorkflowEventPayload, context: WorkflowActionRunContext): Promise<WorkflowActionResult> {
  const staticCheck = isSafeOutboundWebhookUrl(action.url);
  if (!staticCheck.ok) {
    return { type: 'CALL_WEBHOOK', success: false, detail: `URL rechazada: ${staticCheck.reason}` };
  }

  const url = new URL(action.url);
  await assertResolvesToPublicAddress(url.hostname);

  const body = JSON.stringify({
    event: context.trigger,
    ruleId: context.ruleId,
    ruleName: context.ruleName,
    companyId: context.companyId,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = crypto.createHmac('sha256', context.signingSecret).update(body).digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aether-Signature': `sha256=${signature}` },
      body,
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { type: 'CALL_WEBHOOK', success: false, detail: `El destino respondió ${response.status}` };
    }
    return { type: 'CALL_WEBHOOK', success: true, detail: `Entregado (HTTP ${response.status})` };
  } finally {
    clearTimeout(timeout);
  }
}
