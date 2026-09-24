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
  treasuryAccountId: z.string().min(1).optional(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/**
 * Datos del movimiento de dinero que acompañan a cualquier pago o cobro
 * hecho desde otro módulo (honorarios, rendiciones, sueldos, cuotas…). Se
 * valida igual en el cliente y en la Server Action.
 */
export const moneyDetailsSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHOD_TYPES, 'Selecciona un medio de pago').default('TRANSFERENCIA'),
  treasuryAccountId: z.string().min(1).optional(),
  paymentDate: z.coerce.date().optional(),
  referenceNumber: z.string().trim().max(120, 'La referencia es muy larga').optional(),
});

export type MoneyDetailsInput = z.infer<typeof moneyDetailsSchema>;

/**
 * Campos opcionales de Tesorería para las pantallas que registran un "monto
 * pagado acumulado" (entradas, votos, pagarés, auspicios): con qué medio y a
 * qué caja/banco entró la diferencia. Se agregan con `.extend(...)`.
 */
export const paidAmountMoneyFields = {
  paymentMethod: z.enum(PAYMENT_METHOD_TYPES, 'Selecciona un medio de pago').optional(),
  treasuryAccountId: z.string().min(1).optional(),
};

export const TREASURY_ACCOUNT_TYPES = ['CASH', 'BANK'] as const;
export const TREASURY_ACCOUNT_TYPE_LABELS: Record<(typeof TREASURY_ACCOUNT_TYPES)[number], string> = {
  CASH: 'Caja',
  BANK: 'Cuenta bancaria',
};

export const treasuryAccountSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre a la cuenta (ej. "Banco Estado cta. cte.")').max(80),
  type: z.enum(TREASURY_ACCOUNT_TYPES, 'Elige si es caja o cuenta bancaria'),
  bankName: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(40).optional(),
  ledgerAccountId: z.string().min(1).optional(),
  openingBalance: z.number().int('El saldo inicial debe ser un entero en pesos').default(0),
  openingDate: z.coerce.date().optional(),
  isDefault: z.boolean().default(false),
});

export type TreasuryAccountInput = z.infer<typeof treasuryAccountSchema>;
