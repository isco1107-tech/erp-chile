import { z } from 'zod';
import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS } from '@/lib/consignment/commission';

const bps = z
  .number({ error: 'La comisión debe ser un número' })
  .int('La comisión debe ser un número entero de puntos base')
  .min(MIN_COMMISSION_BPS, 'La comisión no puede ser negativa')
  .max(MAX_COMMISSION_BPS, 'La comisión no puede superar el 100%');

/** Texto libre; un texto vacío significa "borrar" (el servicio lo guarda como null). */
const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

export const createProducerSchema = z.object({
  contactId: z.string().trim().min(1, 'Selecciona el contacto proveedor'),
  defaultCommissionBps: bps,
  /** Criterio a validar por contador. */
  commissionBase: z.enum(['NET', 'GROSS']).optional(),
  notes: optionalText(1000),
  paymentNotes: optionalText(300),
});

export const updateProducerSchema = z.object({
  defaultCommissionBps: bps.optional(),
  commissionBase: z.enum(['NET', 'GROSS']).optional(),
  isActive: z.boolean().optional(),
  notes: optionalText(1000),
  paymentNotes: optionalText(300),
});

export const assignProductSchema = z.object({
  productId: z.string().trim().min(1, 'Selecciona el producto'),
  /** `null` devuelve el producto a stock propio. */
  producerId: z.string().trim().min(1).nullable(),
  /** `null` = usar la comisión del productor. */
  commissionBpsOverride: bps.nullable().optional(),
});

const date = z.coerce.date({ error: 'Fecha inválida' });

export const buildSettlementSchema = z
  .object({
    producerId: z.string().trim().min(1, 'Selecciona el productor'),
    from: date,
    to: date,
  })
  .refine((v) => v.from.getTime() <= v.to.getTime(), { message: 'La fecha "desde" no puede ser posterior a "hasta"', path: ['to'] });

export type CreateProducerInput = z.infer<typeof createProducerSchema>;
export type UpdateProducerInput = z.infer<typeof updateProducerSchema>;
export type AssignProductInput = z.infer<typeof assignProductSchema>;
export type BuildSettlementInput = z.infer<typeof buildSettlementSchema>;
