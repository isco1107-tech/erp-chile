import { z } from 'zod';

/**
 * Archivo simple de facturas recibidas: proveedor, total y la imagen/PDF.
 * No reemplaza a Compras (no mueve stock ni genera cuentas por pagar): es
 * para archivar y consultar el histórico por proveedor.
 */

/** "  Distribuidora  Álamo S.A. " → "distribuidora alamo sa": agrupa aunque cambien mayúsculas, tildes, puntos o espacios. */
export function supplierKeyOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const archivedInvoiceSchema = z.object({
  supplierName: z
    .string()
    .trim()
    .min(2, 'Escribe el nombre del proveedor')
    .max(160, 'Máximo 160 caracteres')
    .refine((name) => supplierKeyOf(name).length >= 2, 'Escribe el nombre del proveedor'),
  contactId: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => value || undefined),
  invoiceNumber: z
    .string()
    .trim()
    .max(40, 'Máximo 40 caracteres')
    .optional()
    .transform((value) => value || undefined),
  issueDate: z.coerce
    .date('Fecha inválida')
    .refine((date) => date.getUTCFullYear() >= 2000, 'Revisa la fecha de la factura')
    .refine((date) => date.getTime() <= Date.now() + 36 * 60 * 60 * 1000, 'La fecha no puede ser futura'),
  totalAmount: z
    .number('Ingresa el total de la factura')
    .int('El total va en pesos, sin decimales')
    .positive('El total debe ser mayor a cero')
    .max(999_999_999_999, 'Revisa el total'),
  notes: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .transform((value) => value || undefined),
});

export type ArchivedInvoiceInput = z.infer<typeof archivedInvoiceSchema>;
