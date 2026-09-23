import { z } from 'zod';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

// SEG-04: a diferencia de `documentCreateSchema.fileUrl` de candidatas, este
// campo no validaba ni siquiera el host — cualquier string pasaba. Mismo
// allowlist que ya usa candidatas (protocolo + host de R2/Vercel Blob), para
// que subir un pagaré firmado no acepte una URL arbitraria (incluida una
// interna, vía SSRF si algo llega a hacerle `fetch()` en el servidor).
const documentUrlSchema = z
  .string()
  .optional()
  .refine((value) => !value || isAllowedBlobUrl(value), 'URL de archivo no permitida');

export const PROMISSORY_NOTE_STATUSES = ['ACTIVE', 'PAID', 'PROTESTED', 'CANCELLED'] as const;

export const PROMISSORY_NOTE_STATUS_LABELS: Record<(typeof PROMISSORY_NOTE_STATUSES)[number], string> = {
  ACTIVE: 'Vigente',
  PAID: 'Pagado',
  PROTESTED: 'Protestado',
  CANCELLED: 'Anulado',
};

export const PAYMENT_STATUS_LABELS: Record<'UNPAID' | 'PARTIAL' | 'PAID', string> = {
  UNPAID: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
};

/**
 * `status` usa `.default()` a propósito: al envolver este schema en
 * `.partial()` para el update, Zod NO aplica el default sobre un campo
 * omitido (queda `undefined`, que Prisma ignora en el `data` del update) —
 * solo se activa en la creación, mismo criterio que
 * `src/modules/sponsorships/schema.ts`.
 */
const promissoryNoteShape = z
  .object({
    contactId: z.string().min(1, 'Seleccione un contacto'),
    candidateId: z.string().optional(),
    amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a $0'),
    issueDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    documentUrl: documentUrlSchema,
    status: z.enum(PROMISSORY_NOTE_STATUSES).default('ACTIVE'),
    notes: z.string().optional(),
  })
  .refine((data) => data.dueDate > data.issueDate, {
    message: 'La fecha de vencimiento debe ser posterior a la fecha de emisión',
    path: ['dueDate'],
  });

export const promissoryNoteCreateSchema = promissoryNoteShape;

// El `.refine()` de arriba envuelve el `.object()` en un `ZodEffects`, que no
// expone `.partial()` — se reconstruye la forma base sin el refine para el
// update (edición parcial, sin obligar a reenviar ambas fechas juntas).
const promissoryNoteUpdateShape = z.object({
  contactId: z.string().min(1, 'Seleccione un contacto'),
  candidateId: z.string().optional(),
  amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a $0'),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  documentUrl: documentUrlSchema,
  status: z.enum(PROMISSORY_NOTE_STATUSES, 'Selecciona un estado'),
  notes: z.string().optional(),
});

export const promissoryNoteUpdateSchema = promissoryNoteUpdateShape.partial();

export type PromissoryNoteCreateInput = z.infer<typeof promissoryNoteCreateSchema>;
export type PromissoryNoteUpdateInput = z.infer<typeof promissoryNoteUpdateSchema>;

export const promissoryNotePaymentSchema = z.object({
  paidAmount: z.number().int('El monto debe ser un número entero').nonnegative('El monto no puede ser negativo'),
});

export type PromissoryNotePaymentInput = z.infer<typeof promissoryNotePaymentSchema>;
