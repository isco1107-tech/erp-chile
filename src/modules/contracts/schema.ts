import { z } from 'zod';
import { parseSantiagoDateInput } from '@/lib/chile/timezone';
import { PAYMENT_METHODS } from '@/modules/sales/schema';

/** Documentos que puede generar un contrato: los que representan una venta real. */
export const CONTRACT_DTE_TYPES = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const;

export const BILLING_FREQUENCIES = ['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;

export const CONTRACT_STATUS_LABELS: Record<'ACTIVE' | 'PAUSED' | 'ENDED', string> = {
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  ENDED: 'Terminado',
};

export const contractLineSchema = z.object({
  productId: z.string().min(1).optional(),
  description: z.string().trim().min(1, 'Cada línea necesita una descripción').max(300),
  quantity: z.number().positive('La cantidad debe ser mayor a cero').max(1_000_000),
  unitPrice: z.number().int('El precio debe ser un entero en pesos').min(0, 'El precio no puede ser negativo').max(10_000_000_000),
  /** Solo para líneas sin producto; con producto manda el catálogo. */
  isExempt: z.boolean().default(false),
});

/**
 * Fecha del formulario ("YYYY-MM-DD") como medianoche en Santiago: el
 * calendario de facturación se calcula en hora chilena, y la medianoche UTC
 * que daría `z.coerce.date` cae en el día anterior.
 */
const santiagoDay = (message: string) =>
  z.string(message).transform((value, ctx) => {
    const date = parseSantiagoDateInput(value);
    if (!date) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return date;
  });

export const serviceContractSchema = z
  .object({
    contactId: z.string().min(1, 'Elige el cliente'),
    projectId: z.string().min(1).optional(),
    name: z.string().trim().min(2, 'Ponle un nombre al contrato (ej. "Mantención mensual")').max(120),
    dteType: z.enum(CONTRACT_DTE_TYPES, 'Elige qué documento se emite'),
    paymentMethod: z.enum(PAYMENT_METHODS).default('CREDITO_30'),
    paymentTermDays: z.number().int().min(0, 'El plazo no puede ser negativo').max(180, 'El plazo máximo es 180 días').default(30),
    frequency: z.enum(BILLING_FREQUENCIES).default('MONTHLY'),
    startDate: santiagoDay('Indica desde cuándo rige el contrato'),
    endDate: santiagoDay('La fecha de término no es válida').optional(),
    autoIssue: z.boolean().default(false),
    warehouseId: z.string().min(1).optional(),
    notes: z.string().trim().max(1000).optional(),
    lines: z.array(contractLineSchema).min(1, 'Agrega al menos un servicio al contrato').max(50),
  })
  .refine((value) => !value.endDate || value.endDate.getTime() >= value.startDate.getTime(), {
    message: 'La fecha de término no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

export type ServiceContractInput = z.infer<typeof serviceContractSchema>;

export const contractStatusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']) });

/** Normaliza lo guardado en base al catálogo del formulario (valor inesperado → el por defecto). */
export function asContractDteType(value: string): (typeof CONTRACT_DTE_TYPES)[number] {
  return CONTRACT_DTE_TYPES.find((type) => type === value) ?? 'FACTURA_33';
}

export function asSalesPaymentMethod(value: string): (typeof PAYMENT_METHODS)[number] {
  return PAYMENT_METHODS.find((method) => method === value) ?? 'CREDITO_30';
}
