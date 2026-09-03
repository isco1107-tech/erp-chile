import { z } from 'zod';

/**
 * Módulo "Venta de Entradas" (`hasTicketing`). Sin pasarela de pago: el
 * comprador transfiere fuera del sistema (datos en
 * `CompanySettings.bankTransferInfo`) y el staff confirma el pago a mano
 * desde el panel — ver nota de arquitectura en `prisma/schema.prisma` sobre
 * `TicketType`/`TicketSale`.
 */

export const ticketTypeCreateSchema = z.object({
  projectId: z.string().min(1, 'Debe seleccionar un proyecto/certamen'),
  name: z.string().min(1, 'El nombre del tipo de entrada es obligatorio').max(120, 'Máximo 120 caracteres'),
  price: z.number().int('El precio debe ser un número entero').nonnegative('El precio no puede ser negativo'),
  // `null` = sin límite de cupo.
  quantityAvailable: z.number().int('El cupo debe ser un número entero').positive('El cupo debe ser mayor a cero').nullable().optional(),
  salesOpen: z.boolean().default(true),
});

export type TicketTypeCreateInput = z.infer<typeof ticketTypeCreateSchema>;

export const ticketTypeUpdateSchema = ticketTypeCreateSchema.omit({ projectId: true }).partial();

export type TicketTypeUpdateInput = z.infer<typeof ticketTypeUpdateSchema>;

/** Formulario público de compra (`/tickets/[token]`). El `projectId` se
 * resuelve SIEMPRE desde el token, nunca desde el cliente. */
export const publicTicketPurchaseSchema = z.object({
  ticketTypeId: z.string().min(1, 'Selecciona un tipo de entrada'),
  buyerName: z.string().min(2, 'Tu nombre completo es obligatorio').max(180, 'Máximo 180 caracteres'),
  buyerEmail: z.string().email('Correo inválido').max(180, 'Máximo 180 caracteres'),
  buyerPhone: z.string().max(30, 'Máximo 30 caracteres').optional(),
  quantity: z.number().int('La cantidad debe ser un número entero').positive('Debes comprar al menos 1 entrada').max(20, 'Máximo 20 entradas por compra'),
});

export type PublicTicketPurchaseInput = z.infer<typeof publicTicketPurchaseSchema>;

/** Honeypot: mismo criterio que `CANDIDATE_HONEYPOT_FIELD` — campo oculto que
 * una persona real nunca completa; deliberadamente fuera del schema Zod. */
export const TICKET_PURCHASE_HONEYPOT_FIELD = 'website';

/** Confirmación de pago manual desde el panel interno (`ticketing:write`). */
export const confirmTicketPaymentSchema = z.object({
  paidAmount: z.number().int('El monto debe ser un número entero').nonnegative('El monto no puede ser negativo'),
});

export type ConfirmTicketPaymentInput = z.infer<typeof confirmTicketPaymentSchema>;
