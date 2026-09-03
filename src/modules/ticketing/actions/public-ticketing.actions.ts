'use server';

import * as ticketingService from '../services/ticketing.service';
import type { PublicTicketingProjectInfo } from '../services/ticketing.service';

/**
 * Acción pública de venta de entradas: sin `requireAuthWithPermission`, el
 * comprador no es un `User` del ERP — el `ticketSalesToken` que manda el
 * cliente ES la autenticación completa acá (mismo criterio que
 * `public-registration.actions.ts` de Candidatas). La compra en sí
 * (`createPublicTicketOrder`) va en un Route Handler
 * (`app/api/public/tickets/[token]/purchase/route.ts`), no en una Server
 * Action, para poder aplicar honeypot + rate limit con el mismo patrón que el
 * resto de los endpoints públicos.
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function getPublicTicketingProjectAction(token: string): Promise<ActionResult<PublicTicketingProjectInfo>> {
  try {
    const data = await ticketingService.getPublicTicketingProjectByToken(token);
    if (!data) return { success: false, error: 'Link de venta de entradas inválido o expirado' };
    return { success: true, data };
  } catch {
    // Superficie sin autenticación expuesta a internet: nunca devolver el
    // mensaje interno de un error inesperado.
    return { success: false, error: 'No se pudo cargar la página de venta de entradas. Intenta de nuevo más tarde.' };
  }
}
