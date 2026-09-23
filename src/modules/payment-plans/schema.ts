import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';

export const PAYMENT_PLAN_FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;

export const PAYMENT_PLAN_FREQUENCY_LABELS: Record<(typeof PAYMENT_PLAN_FREQUENCIES)[number], string> = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
};

export const PAYMENT_PLAN_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

export const PAYMENT_PLAN_STATUS_LABELS: Record<(typeof PAYMENT_PLAN_STATUSES)[number], string> = {
  ACTIVE: 'Activo',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<'UNPAID' | 'PARTIAL' | 'PAID', string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
};

// Repite el catálogo de `src/modules/treasury/schema.ts` (`PAYMENT_METHOD_TYPES`)
// a propósito: ese schema no exporta el enum de forma reusable fuera de su
// propio módulo, y el pago de una cuota necesita el mismo tipo de dato
// (`PaymentMethodType` de Prisma) sin acoplar este módulo a treasury.
export const PAYMENT_METHOD_TYPES = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'CHEQUE', 'OTRO'] as const;

export const PAYMENT_METHOD_TYPE_LABELS: Record<(typeof PAYMENT_METHOD_TYPES)[number], string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Tarjeta de Débito',
  TARJETA_CREDITO: 'Tarjeta de Crédito',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
};

// El "cliente" de un plan de pago solo puede ser uno de estos dos tipos — no
// cualquier Contact del sistema (proveedores, etc.). Un sponsor SÍ es un
// `Contact` (vía `SponsorshipContract.contactId`, no hay modelo `Sponsor`
// propio); una candidata es un `Candidate` y su `Contact` se
// resuelve/crea automáticamente en el servicio — ver
// `getOrCreateContactForCandidate` en `payment-plans.service.ts`.
export const PAYMENT_PLAN_CLIENT_TYPES = ['SPONSOR', 'CANDIDATE'] as const;

export const PAYMENT_PLAN_CLIENT_TYPE_LABELS: Record<(typeof PAYMENT_PLAN_CLIENT_TYPES)[number], string> = {
  SPONSOR: 'Sponsor',
  CANDIDATE: 'Candidata',
};

export const paymentPlanCreateSchema = z
  .object({
    clientType: z.enum(PAYMENT_PLAN_CLIENT_TYPES, 'Selecciona un tipo de cliente'),
    contactId: z.string().optional(),
    candidateId: z.string().optional(),
    totalAmount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero'),
    installmentCount: z
      .number()
      .int('El número de cuotas debe ser un entero')
      .min(1, 'Debe haber al menos 1 cuota')
      .max(60, 'No se admiten más de 60 cuotas'),
    frequency: z.enum(PAYMENT_PLAN_FREQUENCIES, 'Selecciona una frecuencia de pago'),
    startDate: z.coerce.date(),
    penaltyBps: z
      .number()
      .int('La multa debe ser un número entero de basis points')
      .min(0, 'La multa no puede ser negativa')
      .max(10000, 'La multa no puede superar el 100% (10000 bps)')
      .default(0),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const missing = data.clientType === 'SPONSOR' ? !data.contactId : !data.candidateId;
    if (missing) {
      ctx.addIssue({
        code: 'custom',
        message: 'Seleccione un sponsor o una candidata',
        path: [data.clientType === 'SPONSOR' ? 'contactId' : 'candidateId'],
      });
    }
  });

export type PaymentPlanCreateInput = z.infer<typeof paymentPlanCreateSchema>;

// Un plan ya generado no cambia su monto total ni el número de cuotas: solo se
// permite editar sus datos administrativos (notas) o su estado (ej. cancelarlo).
export const paymentPlanUpdateSchema = z.object({
  notes: z.string().optional(),
  status: z.enum(PAYMENT_PLAN_STATUSES, 'Selecciona un estado').optional(),
});

export type PaymentPlanUpdateInput = z.infer<typeof paymentPlanUpdateSchema>;

export const installmentPaymentSchema = z.object({
  amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero'),
  method: z.enum(PAYMENT_METHOD_TYPES, 'Selecciona una forma de pago'),
  date: z.coerce.date().optional(),
});

export type InstallmentPaymentInput = z.infer<typeof installmentPaymentSchema>;

// ---------------------------------------------------------------------------
// Pago en línea desde el portal público (`/pagar/[token]`)
// ---------------------------------------------------------------------------

const rutField = z
  .string()
  .trim()
  .min(3, 'Ingresa el RUT de la candidata')
  .max(15, 'RUT inválido')
  .refine((value) => validateRut(value), 'El RUT no es válido. Revisa el dígito verificador.');

/** Paso 1 del portal: la "credencial" es solo el RUT de la candidata. */
export const publicInstallmentLookupSchema = z.object({ rut: rutField });

export type PublicInstallmentLookupInput = z.infer<typeof publicInstallmentLookupSchema>;

/**
 * Paso 2: qué cuotas paga y a quién se envía el comprobante. El RUT viaja de
 * nuevo porque el portal no guarda sesión: el servidor vuelve a comprobar que
 * cada cuota pertenezca a esa candidata dentro de la empresa del token. El
 * monto NUNCA viene del cliente: sale del saldo de cada cuota.
 */
export const publicInstallmentCheckoutSchema = z.object({
  rut: rutField,
  installmentIds: z
    .array(z.string().min(1))
    .min(1, 'Selecciona al menos una cuota')
    .max(24, 'Máximo 24 cuotas por pago')
    .refine((ids) => new Set(ids).size === ids.length, 'Hay cuotas repetidas en la selección'),
  payerName: z.string().trim().min(2, 'Tu nombre es obligatorio').max(120, 'Máximo 120 caracteres'),
  payerEmail: z.string().trim().email('Correo inválido').max(180, 'Máximo 180 caracteres'),
});

export type PublicInstallmentCheckoutInput = z.infer<typeof publicInstallmentCheckoutSchema>;

/** Honeypot del portal — mismo criterio que `TICKET_PURCHASE_HONEYPOT_FIELD`. */
export const INSTALLMENT_PORTAL_HONEYPOT_FIELD = 'website';

/** API key de Khipu desde el panel. `null` la borra (desactiva el cobro en línea). */
export const khipuCredentialSchema = z.object({
  apiKey: z.string().trim().min(10, 'La API key de Khipu parece incompleta').max(200, 'API key demasiado larga').nullable(),
});

export const ONLINE_PAYMENT_STATUS_LABELS: Record<'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED', string> = {
  PENDING: 'En curso',
  PAID: 'Pagado',
  FAILED: 'Fallido',
  EXPIRED: 'Vencido',
};
