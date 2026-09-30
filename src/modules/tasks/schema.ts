import { z } from 'zod';
import { DELEGATED_DECISIONS } from '@/lib/tasks/delegation';

/** Máximo de una columna `Int` de Postgres (int4): un monto mayor pasaría Zod y fallaría al guardar. */
export const MAX_INT4 = 2_147_483_647;

const optionalText = (max: number) => z.string().trim().max(max).optional();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const TASK_STATUSES = ['TODO', 'DOING', 'DONE', 'CANCELLED'] as const;
export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = { TODO: 'Por hacer', DOING: 'En curso', DONE: 'Hecha', CANCELLED: 'Cancelada' };
export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export const TASK_PRIORITY_LABELS: Record<(typeof TASK_PRIORITIES)[number], string> = { LOW: 'Baja', NORMAL: 'Normal', HIGH: 'Alta' };
export const TASK_RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export const TASK_RECURRENCE_LABELS: Record<(typeof TASK_RECURRENCES)[number], string> = { NONE: 'No se repite', DAILY: 'Todos los días', WEEKLY: 'Cada semana', MONTHLY: 'Cada mes' };

export const taskSchema = z.object({
  title: z.string().trim().min(3, 'Escribe qué hay que hacer').max(140),
  description: optionalText(1000),
  priority: z.enum(TASK_PRIORITIES).default('NORMAL'),
  dueDate: isoDay.nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  recurrence: z.enum(TASK_RECURRENCES).default('NONE'),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const roleEnum = z.enum(['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT']);

export const delegationRuleSchema = z
  .object({
    decision: z.enum(DELEGATED_DECISIONS),
    title: z.string().trim().min(3, 'Describe la regla').max(140),
    delegateeId: z.string().min(1).nullable().optional(),
    delegateRole: roleEnum.nullable().optional(),
    maxAmount: z.number().int('Monto en pesos enteros').min(0).max(MAX_INT4, 'Monto demasiado alto').nullable().optional(),
    maxPercent: z.number().int('Porcentaje entero').min(0).max(100).nullable().optional(),
    conditions: optionalText(500),
    isActive: z.boolean().default(true),
  })
  .refine((rule) => Boolean(rule.delegateeId) !== Boolean(rule.delegateRole), { message: 'Elige una persona o un rol (no ambos)', path: ['delegateeId'] })
  .refine((rule) => rule.delegateRole !== 'OWNER', { message: 'El dueño no necesita que le deleguen nada', path: ['delegateRole'] });
export type DelegationRuleInput = z.infer<typeof delegationRuleSchema>;
