import { z } from 'zod';
import { BANK_ACCOUNT_TYPES, BANK_CODES } from '@/lib/treasury/banks';

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
  /** Cuenta bancaria propia por la que entra o sale (para conciliar). */
  bankAccountId: z.string().optional(),
  notes: z.string().optional(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

// ─── Ola 3: bancos, cheques, nóminas y cobranza ──────────────────────────────


const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const clpAmount = z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero').max(100_000_000_000, 'Monto demasiado alto');

export const bankAccountSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre (ej. Cuenta corriente Santander)').max(80, 'Máximo 80 caracteres'),
  bankCode: z.enum(BANK_CODES, 'Selecciona el banco'),
  accountType: z.enum(BANK_ACCOUNT_TYPES, 'Selecciona el tipo de cuenta'),
  accountNumber: z.string().trim().regex(/^[\d-]{4,24}$/, 'Número de cuenta inválido (solo dígitos)'),
  openingBalance: z.number().int('El saldo debe ser un número entero').min(-100_000_000_000).max(100_000_000_000),
  openingDate: z.union([z.literal(''), isoDate]).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type BankAccountFormInput = z.infer<typeof bankAccountSchema>;

export const BANK_LINE_IGNORE_REASONS = ['Comisión bancaria', 'Intereses', 'Impuesto (ITE/timbres)', 'Traspaso entre cuentas propias', 'Aporte o retiro de socios', 'Otro'] as const;

export const bankLineIgnoreSchema = z.object({
  reason: z.string().trim().min(3, 'Indica el motivo').max(200, 'Máximo 200 caracteres'),
});

export const bankLineMatchSchema = z.object({
  paymentIds: z.array(z.string().min(1)).min(1, 'Selecciona al menos un cobro o pago').max(50),
});

export const bankLineRegisterSchema = z.object({
  allocations: z
    .array(z.object({ documentId: z.string().min(1), amount: clpAmount }))
    .min(1, 'Elige al menos un documento')
    .max(50),
});

export const CHEQUE_STATUS_LABELS = {
  RECEIVED: { PORTFOLIO: 'En cartera', DEPOSITED: 'Depositado', CLEARED: 'Cobrado', BOUNCED: 'Protestado', VOIDED: 'Anulado' },
  ISSUED: { PORTFOLIO: 'Girado', DEPOSITED: 'Girado', CLEARED: 'Cobrado', BOUNCED: 'Protestado', VOIDED: 'Anulado' },
} as const;

export const chequeSchema = z
  .object({
    direction: z.enum(['RECEIVED', 'ISSUED']),
    number: z.string().trim().regex(/^\d{1,12}$/, 'N° de cheque inválido (solo dígitos)'),
    bankCode: z.enum(BANK_CODES, 'Selecciona el banco del cheque'),
    drawerName: z.string().trim().max(120).optional(),
    drawerRut: z.string().trim().max(20).optional(),
    contactId: z.string().optional(),
    amount: clpAmount,
    issueDate: isoDate,
    dueDate: isoDate,
    documentId: z.string().optional(),
    bankAccountId: z.string().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.dueDate >= value.issueDate, { message: 'La fecha de cobro no puede ser anterior a la de emisión', path: ['dueDate'] })
  .refine((value) => value.direction === 'RECEIVED' || !!value.bankAccountId, { message: 'Indica de qué cuenta se giró', path: ['bankAccountId'] })
  .refine((value) => !!value.documentId || !!value.contactId, { message: 'Indica el documento que paga o, al menos, el cliente/proveedor', path: ['contactId'] });

export type ChequeFormInput = z.infer<typeof chequeSchema>;

export const chequeReasonSchema = z.object({ reason: z.string().trim().min(3, 'Indica el motivo').max(200, 'Máximo 200 caracteres') });

export const PAYMENT_BATCH_STATUS_LABELS = { DRAFT: 'Por pagar', PAID: 'Pagada', CANCELLED: 'Anulada' } as const;

export const paymentBatchSchema = z.object({
  bankAccountId: z.string().min(1, 'Selecciona la cuenta de origen'),
  paymentDate: isoDate,
  notes: z.string().trim().max(300).optional(),
  items: z
    .array(z.object({ purchaseDocumentId: z.string().min(1), amount: clpAmount }))
    .min(1, 'Elige al menos una factura')
    .max(500, 'Máximo 500 facturas por nómina')
    .refine((items) => new Set(items.map((item) => item.purchaseDocumentId)).size === items.length, 'Una factura aparece dos veces'),
});

export const COLLECTION_NOTE_KINDS = ['CALL', 'EMAIL', 'VISIT', 'WHATSAPP', 'PROMISE', 'NOTE'] as const;

export const COLLECTION_NOTE_LABELS: Record<(typeof COLLECTION_NOTE_KINDS)[number], string> = {
  CALL: 'Llamado',
  EMAIL: 'Correo',
  VISIT: 'Visita',
  WHATSAPP: 'WhatsApp',
  PROMISE: 'Promesa de pago',
  NOTE: 'Nota',
};

export const collectionNoteSchema = z
  .object({
    contactId: z.string().min(1),
    salesDocumentId: z.string().optional(),
    kind: z.enum(COLLECTION_NOTE_KINDS),
    note: z.string().trim().min(3, 'Describe la gestión').max(1000, 'Máximo 1000 caracteres'),
    promiseDate: z.union([z.literal(''), isoDate]).optional(),
    promiseAmount: z.number().int().positive().optional(),
  })
  .refine((value) => value.kind !== 'PROMISE' || !!value.promiseDate, { message: 'Indica la fecha comprometida', path: ['promiseDate'] });

export const collectionSettingsSchema = z.object({
  enabled: z.boolean(),
  days: z.array(z.number().int().min(-30, 'Máximo 30 días antes').max(180, 'Máximo 180 días después')).max(8, 'Máximo 8 recordatorios'),
});
