import { z } from 'zod';

export const createJobPositionSchema = z.object({
  name: z.string().min(1, 'El nombre del cargo es obligatorio').max(100),
  level: z.string().max(60).optional().or(z.literal('')),
});

export type CreateJobPositionInput = z.infer<typeof createJobPositionSchema>;

export const assignManagerSchema = z.object({
  managerId: z.string().min(1).nullable(),
});

export type AssignManagerInput = z.infer<typeof assignManagerSchema>;

export const assignJobPositionSchema = z.object({
  jobPositionId: z.string().min(1).nullable(),
});

export type AssignJobPositionInput = z.infer<typeof assignJobPositionSchema>;

export const applySuggestionsSchema = z.object({
  assignments: z.array(
    z.object({
      userId: z.string().min(1),
      managerId: z.string().min(1).nullable(),
      jobPositionId: z.string().min(1).nullable(),
    })
  ),
});

export type ApplySuggestionsInput = z.infer<typeof applySuggestionsSchema>;
