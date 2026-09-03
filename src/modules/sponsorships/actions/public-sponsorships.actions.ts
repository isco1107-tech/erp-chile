'use server';

import * as sponsorshipsService from '../services/sponsorships.service';
import type { SponsorshipPortalView } from '../services/sponsorships.service';

/**
 * Acción pública del portal de auspiciadores: sin `requireAuthWithPermission`,
 * porque la marca no es un `User` del ERP — el `portalToken` que manda el
 * cliente ES la autenticación completa acá, validado adentro de
 * `sponsorships.service.ts` contra la fila de `SponsorshipContract`. Nunca
 * acepta `companyId`/`contractId` del cliente: todo se resuelve desde el
 * token (mismo patrón que `public-judging.actions.ts`).
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function getSponsorshipPortalAction(portalToken: string): Promise<ActionResult<SponsorshipPortalView>> {
  try {
    const data = await sponsorshipsService.getSponsorshipPortalByToken(portalToken);
    if (!data) return { success: false, error: 'Link de portal inválido o expirado' };
    return { success: true, data };
  } catch {
    // Superficie sin autenticación expuesta a internet: nunca devolver el
    // mensaje interno de un error inesperado (p.ej. de Prisma), solo uno fijo.
    return { success: false, error: 'No se pudo cargar el portal. Intenta de nuevo más tarde.' };
  }
}
