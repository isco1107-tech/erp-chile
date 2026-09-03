import { z } from 'zod';
import type { ProjectStatus } from '@prisma/client';

export const PROJECT_STATUSES = ['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planificación',
  IN_PROGRESS: 'En Curso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const projectCreateSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  budgetedIncome: z.number().int('El presupuesto de ingresos debe ser un número entero').nonnegative('No puede ser negativo').default(0),
  budgetedExpense: z.number().int('El presupuesto de gastos debe ser un número entero').nonnegative('No puede ser negativo').default(0),
  startDate: z.coerce.date('Fecha de inicio inválida'),
  endDate: z.coerce.date('Fecha de término inválida').optional(),
  status: z.enum(PROJECT_STATUSES).default('PLANNING'),
  notes: z.string().optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema.partial();
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
