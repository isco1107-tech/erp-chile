import { z } from 'zod';
import { moneyDetailsSchema } from '@/modules/treasury/schema';

/**
 * Alta de una Boleta de Honorarios Electrónica (BHE) ya emitida por el
 * prestador ante el SII: este módulo solo la REGISTRA (folio + datos), no la
 * emite. `retentionRateBps` es opcional — si no viene, el service usa la tasa
 * por defecto de `CompanySettings.honorariumRetentionBps`.
 */
export const feeDocumentCreateSchema = z.object({
  contactId: z.string().min(1, 'Selecciona el prestador de servicios'),
  projectId: z.string().optional(),
  folioNumber: z.string().min(1, 'El folio es obligatorio'),
  issueDate: z.coerce.date(),
  serviceDescription: z.string().min(1, 'Describe el servicio prestado'),
  grossAmount: z.number().int('El monto bruto debe ser un número entero').positive('El monto bruto debe ser mayor a cero'),
  retentionRateBps: z
    .number()
    .int('La tasa de retención debe ser un número entero')
    .nonnegative('La tasa de retención no puede ser negativa')
    .max(10000, 'La tasa de retención no puede superar el 100%')
    .optional(),
});

export type FeeDocumentCreateInput = z.infer<typeof feeDocumentCreateSchema>;

/** El pago del líquido pasa por Tesorería: medio, caja/banco, fecha y comprobante. */
export const markFeeDocumentPaidSchema = moneyDetailsSchema;

export type MarkFeeDocumentPaidInput = z.infer<typeof markFeeDocumentPaidSchema>;

export const listFeeDocumentsFilterSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
  projectId: z.string().optional(),
  contactId: z.string().optional(),
});

export type ListFeeDocumentsFilter = z.infer<typeof listFeeDocumentsFilterSchema>;
