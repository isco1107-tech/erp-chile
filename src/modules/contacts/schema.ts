import { z } from 'zod';
import { cleanRut, validateRut } from '@/lib/chile/rut';
import { BANK_ACCOUNT_TYPES, BANK_CODES } from '@/lib/treasury/banks';

const rutField = z
  .string()
  .min(3, 'El RUT es obligatorio')
  .refine((val) => validateRut(cleanRut(val)), 'RUT inválido. Verifica que esté bien escrito, ej: 12.345.678-K');

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
  /** Lista de precios del cliente; `null` = precio del catálogo. */
  priceListId: z.string().min(1).nullable().optional(),
  /** Datos bancarios para pagarle (nómina de pago a proveedores). */
  bankCode: z.enum(BANK_CODES).nullable().optional(),
  bankAccountType: z.enum(BANK_ACCOUNT_TYPES).nullable().optional(),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^[\d-]{4,24}$/, 'Número de cuenta inválido (solo dígitos)')
    .nullable()
    .optional()
    .or(z.literal('')),
  paymentNoticeEmail: z.string().email('Correo de aviso inválido').nullable().optional().or(z.literal('')),
});

export const contactUpdateSchema = contactCreateSchema.partial();

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
