import { z } from 'zod';

export const BUDGET_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const;

export const BUDGET_STATUS_LABELS: Record<(typeof BUDGET_STATUSES)[number], string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
};

/**
 * `status` usa `.default()` a propósito: al envolver este schema en
 * `.partial()` para el update, Zod NO aplica el default sobre un campo
 * omitido (queda `undefined`, que Prisma ignora en el `data` del update) —
 * solo se activa en la creación.
 */
const budgetShape = z
  .object({
    name: z.string().min(1, 'El nombre del presupuesto es obligatorio'),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    status: z.enum(BUDGET_STATUSES).default('DRAFT'),
    notes: z.string().optional(),
  })
  .refine((data) => data.periodEnd > data.periodStart, {
    message: 'La fecha de término debe ser posterior a la fecha de inicio',
    path: ['periodEnd'],
  });

export const budgetCreateSchema = budgetShape;

// Repetido sobre el `.object()` base antes del `.refine()`: `.partial()` no
// puede encadenarse después de un `ZodEffects` (el resultado de `.refine()`),
// así que la validación cruzada de fechas se re-declara acá para el update.
export const budgetUpdateSchema = z
  .object({
    name: z.string().min(1, 'El nombre del presupuesto es obligatorio'),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    status: z.enum(BUDGET_STATUSES).default('DRAFT'),
    notes: z.string().optional(),
  })
  .partial()
  .refine((data) => !data.periodStart || !data.periodEnd || data.periodEnd > data.periodStart, {
    message: 'La fecha de término debe ser posterior a la fecha de inicio',
    path: ['periodEnd'],
  });

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;

const budgetLineShape = z.object({
  category: z.string().min(1, 'La categoría es obligatoria'),
  plannedAmount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero'),
  notes: z.string().optional(),
});

export const budgetLineCreateSchema = budgetLineShape;
export const budgetLineUpdateSchema = budgetLineShape.partial();

export type BudgetLineCreateInput = z.infer<typeof budgetLineCreateSchema>;
export type BudgetLineUpdateInput = z.infer<typeof budgetLineUpdateSchema>;
