import { z } from 'zod';
import { PAYMENT_METHOD_TYPES } from '@/modules/treasury/schema';

/**
 * Evento `payment.confirmed`: hoy el único tipo de evento entrante que el
 * ERP sabe ejecutar (ver `n8n-handler.service.ts`). Pensado para que una
 * automatización de conciliación bancaria (n8n leyendo una cartola o un
 * correo del banco) marque un documento como pagado sin que alguien lo
 * tipee a mano en Tesorería.
 *
 * El documento se busca por folio dentro de la empresa del token — nunca
 * por `id` interno, porque n8n no lo conoce; el folio es lo que aparece en
 * la cartola/glosa bancaria.
 */
export const paymentConfirmedEventSchema = z.object({
  documentType: z.enum(['sales', 'purchase']),
  folio: z.string().min(1, 'Falta el folio del documento'),
  amount: z.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a cero'),
  paymentMethod: z.enum(PAYMENT_METHOD_TYPES).default('TRANSFERENCIA'),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  notes: z.string().optional(),
});

export type PaymentConfirmedEvent = z.infer<typeof paymentConfirmedEventSchema>;

/** Sobre genérico del webhook: lo mínimo para poder identificar y
 * deduplicar el evento antes de mirar `payload`. */
export const n8nWebhookEnvelopeSchema = z.object({
  eventId: z.string().min(1, 'Falta eventId'),
  eventType: z.string().min(1, 'Falta eventType'),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export type N8nWebhookEnvelope = z.infer<typeof n8nWebhookEnvelopeSchema>;

/** Tipos de evento entrante que el ERP sabe ejecutar hoy. Cualquier otro
 * `eventType` se registra igual (para no perder el evento ni romper un
 * workflow de n8n que lo reintente) pero no dispara ninguna acción. */
export const SUPPORTED_N8N_EVENT_TYPES = ['payment.confirmed'] as const;
