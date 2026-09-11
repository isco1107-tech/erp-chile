import { z } from 'zod';
import { isSafeOutboundWebhookUrl } from '@/lib/security/outbound-url';
import { WORKFLOW_TRIGGER_DEFINITIONS } from '@/lib/workflows/types';

/**
 * Validación de reglas de automatización. Es la única puerta de entrada al
 * `Json` de `WorkflowRule.conditions`/`.actions` — el motor (`engine.ts`) lee
 * ese JSON confiando en que ya pasó por aquí, así que cualquier forma nueva
 * de condición/acción debe agregarse ACÁ primero, no solo en
 * `src/lib/workflows/types.ts`.
 */

const TRIGGER_EVENTS = Object.keys(WORKFLOW_TRIGGER_DEFINITIONS) as [string, ...string[]];

export const workflowConditionSchema = z.object({
  field: z.string().min(1, 'Selecciona un campo'),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal', 'contains']),
  value: z.string().min(1, 'El valor no puede estar vacío').max(200),
});

const MAX_TEMPLATE_LENGTH = 2000;

const sendEmailActionSchema = z.object({
  type: z.literal('SEND_EMAIL'),
  to: z.string().min(1, 'Falta el destinatario').max(200),
  subject: z.string().min(1, 'Falta el asunto').max(200),
  body: z.string().min(1, 'Falta el mensaje').max(MAX_TEMPLATE_LENGTH),
});

const createNotificationActionSchema = z.object({
  type: z.literal('CREATE_NOTIFICATION'),
  title: z.string().min(1, 'Falta el título').max(150),
  message: z.string().min(1, 'Falta el mensaje').max(MAX_TEMPLATE_LENGTH),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  href: z.string().max(300).optional(),
});

const callWebhookActionSchema = z.object({
  type: z.literal('CALL_WEBHOOK'),
  url: z
    .string()
    .min(1, 'Falta la URL')
    .max(500)
    .refine((value) => isSafeOutboundWebhookUrl(value).ok, {
      message: 'La URL debe ser https:// y no puede apuntar a un host interno o privado',
    }),
});

export const workflowActionSchema = z.discriminatedUnion('type', [sendEmailActionSchema, createNotificationActionSchema, callWebhookActionSchema]);

export const workflowRuleInputSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(120),
  description: z.string().max(500).optional(),
  trigger: z.enum(TRIGGER_EVENTS),
  conditions: z.array(workflowConditionSchema).max(10, 'Máximo 10 condiciones por regla'),
  actions: z.array(workflowActionSchema).min(1, 'La regla necesita al menos una acción').max(10, 'Máximo 10 acciones por regla'),
  isActive: z.boolean().default(true),
});

export type WorkflowRuleInput = z.infer<typeof workflowRuleInputSchema>;
