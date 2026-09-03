import { z } from 'zod';
import { cleanRut, validateRut } from '@/lib/chile/rut';

const rutField = z
  .string()
  .min(3, 'El RUT es obligatorio')
  .refine((val) => validateRut(cleanRut(val)), 'RUT inválido (verifique el dígito verificador)');

export const contactCreateSchema = z.object({
  rut: rutField,
  razonSocial: z.string().min(2, 'La razón social es obligatoria'),
  nombreFantasia: z.string().optional(),
  giro: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  region: z.string().optional(),
  comuna: z.string().optional(),
  isCustomer: z.boolean().optional(),
  isSupplier: z.boolean().optional(),
  creditLimit: z.number().int().nonnegative('El límite de crédito no puede ser negativo').nullable().optional(),
  creditDays: z.number().int().nonnegative('Los días de crédito no pueden ser negativos').optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial();

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
