import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';

export const EXPENSE_CATEGORIES = [
  'Transporte',
  'Combustible',
  'Peajes y estacionamiento',
  'Alimentación',
  'Alojamiento',
  'Materiales e insumos',
  'Representación',
  'Otros',
] as const;

export const EXPENSE_DOCUMENT_TYPES = ['BOLETA', 'FACTURA', 'TICKET', 'SIN_DOCUMENTO'] as const;
export const EXPENSE_DOCUMENT_LABELS: Record<(typeof EXPENSE_DOCUMENT_TYPES)[number], string> = {
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
  TICKET: 'Ticket / comprobante',
  SIN_DOCUMENTO: 'Sin documento',
};

export const EXPENSE_STATUS_LABELS: Record<'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED', string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  REIMBURSED: 'Reembolsada',
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const expenseReportSchema = z.object({
  title: z.string().trim().min(3, 'Ponle un nombre a la rendición (ej.: Viaje a Concepción)').max(160),
  projectId: optionalText(64),
});

export const expenseItemSchema = z.object({
  expenseDate: z.coerce.date({ error: 'Indica la fecha del gasto' }),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2, 'Describe el gasto').max(300),
  documentType: z.enum(EXPENSE_DOCUMENT_TYPES),
  documentNumber: optionalText(40),
  supplierName: optionalText(160),
  supplierRut: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => !value || validateRut(value), 'El RUT del comercio no es válido'),
  amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero').max(100_000_000),
});

export const expenseReviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    notes: optionalText(500),
  })
  .refine((data) => data.decision === 'APPROVED' || Boolean(data.notes), {
    message: 'Explica el motivo del rechazo para que se pueda corregir',
    path: ['notes'],
  });

export const expenseReimburseSchema = z.object({
  reference: optionalText(120),
});

export type ExpenseReportInput = z.infer<typeof expenseReportSchema>;
export type ExpenseItemInput = z.infer<typeof expenseItemSchema>;
export type ExpenseReviewInput = z.infer<typeof expenseReviewSchema>;
