import { z } from 'zod';

export const competitionRoundCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  order: z.number().int('El orden debe ser un número entero').positive('El orden debe ser mayor a cero'),
  name: z.string().min(1, 'El nombre de la ronda es obligatorio'),
  cutOffCount: z.number().int('El corte debe ser un número entero').positive('El corte debe ser mayor a cero').nullable().default(null),
  isFinalRound: z.boolean().default(false),
});

export type CompetitionRoundCreateInput = z.infer<typeof competitionRoundCreateSchema>;

export const judgingCategoryCreateSchema = z.object({
  roundId: z.string().min(1, 'Seleccione una ronda'),
  name: z.string().min(1, 'El nombre de la categoría es obligatorio'),
  weightBps: z.number().int('La ponderación debe ser un número entero').positive('La ponderación debe ser mayor a cero').max(10000),
  maxScore: z.number().int('El puntaje máximo debe ser un número entero').positive('El puntaje máximo debe ser mayor a cero').default(10),
  order: z.number().int().default(0),
});

export type JudgingCategoryCreateInput = z.infer<typeof judgingCategoryCreateSchema>;

export const judgeAssignmentCreateSchema = z.object({
  projectId: z.string().min(1, 'Seleccione un proyecto/certamen'),
  judgeName: z.string().min(1, 'El nombre del jurado es obligatorio'),
  judgeEmail: z.string().email('Email inválido').optional().or(z.literal('')),
});

export type JudgeAssignmentCreateInput = z.infer<typeof judgeAssignmentCreateSchema>;

/**
 * `score` se valida contra `JudgingCategory.maxScore` en el servicio, no acá
 * — el schema Zod no conoce el `maxScore` de la categoría en cuestión sin una
 * consulta a la base, así que ese chequeo vive en `judging.service.ts` junto
 * al resto de las reglas de negocio del puntaje.
 */
export const submitScoreSchema = z.object({
  candidateId: z.string().min(1),
  categoryId: z.string().min(1),
  score: z.number().int('El puntaje debe ser un número entero').nonnegative('El puntaje no puede ser negativo'),
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
