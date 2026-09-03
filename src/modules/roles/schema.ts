import { z } from 'zod';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';

export const customRoleCreateSchema = z.object({
  name: z.string().min(2, 'El nombre del rol debe tener al menos 2 caracteres').max(60),
  description: z.string().max(200).optional().or(z.literal('')),
  permissions: z
    .array(z.enum(ALL_PERMISSIONS as [string, ...string[]]))
    .min(1, 'Seleccione al menos un permiso'),
});

export type CustomRoleCreateInput = z.infer<typeof customRoleCreateSchema>;

export const customRoleUpdateSchema = customRoleCreateSchema;

export type CustomRoleUpdateInput = z.infer<typeof customRoleUpdateSchema>;

/** Asignación de rol a un miembro: base, personalizado, o ambos combinados. */
export const memberRoleAssignSchema = z.object({
  userId: z.string().min(1),
  customRoleId: z.string().nullable(),
});
