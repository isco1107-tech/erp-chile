import { z } from 'zod';

export const PAYMENT_METHOD_TYPES = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'CHEQUE', 'OTRO'] as const;

export const PAYMENT_METHOD_TYPE_LABELS: Record<(typeof PAYMENT_METHOD_TYPES)[number], string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Tarjeta de Débito',
  TARJETA_CREDITO: 'Tarjeta de Crédito',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

export const registerPaymentSchema = z.object({
  amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero'),
  paymentMethod: z.enum(PAYMENT_METHOD_TYPES, 'Selecciona una forma de pago'),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;
