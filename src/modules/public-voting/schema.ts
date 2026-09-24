import { z } from 'zod';
import { paidAmountMoneyFields } from '@/modules/treasury/schema';

/**
 * Módulo "Votación Pagada del Público" (`hasPublicVoting`). Mismo flujo de
 * pago manual que `hasTicketing` — sin pasarela de pago, el staff confirma el
 * pago a mano.
 *
 * DECISIÓN DE ARQUITECTURA — `pricePerVote`: el schema de Prisma (ya fijado
 * para esta tarea, no se modifica) guarda `VoteOrder.pricePerVote` por orden,
 * pero no tiene ningún campo en `Project` ni en `CompanySettings` para
 * persistir el precio configurado por voto de una campaña — ninguna columna
 * libre se presta para reutilizarse sin pisar un dato de otro módulo. En vez
 * de eso, el precio vigente viaja CODIFICADO dentro del propio
 * `Project.voteSalesToken`: el staff lo fija al generar/regenerar el link
 * (`getOrCreateVoteSalesToken`/`regenerateVoteSalesToken`, ver
 * `public-voting.service.ts`), y el token completo queda con el formato
 * `<64 hex>.<precio entero>`.
 *
 * Esto es seguro porque el token se resuelve con `findUnique` por coincidencia
 * EXACTA de todo el string contra `Project.voteSalesToken` — si alguien edita
 * el segmento de precio en la URL, el string ya no matchea ninguna fila y la
 * request falla como "link inválido", nunca como "precio distinto aceptado".
 * El precio nunca viaja como un campo editable por el comprador: el servidor
 * siempre lo relee del propio token ya validado contra la base de datos.
 */

export const VOTE_TOKEN_PATTERN = /^([0-9a-f]{64})\.(\d+)$/;

export function encodeVoteToken(randomHex: string, pricePerVote: number): string {
  return `${randomHex}.${pricePerVote}`;
}

/** `null` si el token no tiene el formato esperado (nunca debería pasar para un token emitido por este módulo). */
export function decodeVoteToken(token: string): { pricePerVote: number } | null {
  const match = VOTE_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const pricePerVote = Number(match[2]);
  if (!Number.isFinite(pricePerVote) || pricePerVote <= 0) return null;
  return { pricePerVote };
}

/** Formulario interno para generar/regenerar el link, donde el staff fija el precio por voto. */
export const voteLinkSettingsSchema = z.object({
  pricePerVote: z.number().int('El precio por voto debe ser un número entero').positive('El precio por voto debe ser mayor a cero'),
});

export type VoteLinkSettingsInput = z.infer<typeof voteLinkSettingsSchema>;

/** Formulario público de compra de votos (`/votar/[token]`). `projectId`/`pricePerVote` se resuelven siempre del token. */
export const publicVotePurchaseSchema = z.object({
  candidateId: z.string().min(1, 'Selecciona una candidata'),
  buyerEmail: z.string().email('Correo inválido').max(180, 'Máximo 180 caracteres'),
  buyerPhone: z.string().max(30, 'Máximo 30 caracteres').optional(),
  voteCount: z.number().int('La cantidad de votos debe ser un número entero').positive('Debes comprar al menos 1 voto').max(10_000, 'Máximo 10.000 votos por compra'),
});

export type PublicVotePurchaseInput = z.infer<typeof publicVotePurchaseSchema>;

/** Honeypot: mismo criterio que `TICKET_PURCHASE_HONEYPOT_FIELD`. */
export const VOTE_PURCHASE_HONEYPOT_FIELD = 'website';

/** Confirmación de pago manual desde el panel interno (`publicvoting:write`). */
export const confirmVotePaymentSchema = z.object({
  paidAmount: z.number().int('El monto debe ser un número entero').nonnegative('El monto no puede ser negativo'),
  ...paidAmountMoneyFields,
});

export type ConfirmVotePaymentInput = z.infer<typeof confirmVotePaymentSchema>;
