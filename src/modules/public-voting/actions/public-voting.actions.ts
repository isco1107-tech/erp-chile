'use server';

import * as publicVotingService from '../services/public-voting.service';
import type { PublicVotingProjectInfo } from '../services/public-voting.service';

/**
 * Acción pública de votación pagada: sin `requireAuthWithPermission` — el
 * `voteSalesToken` que manda el cliente ES la autenticación completa acá
 * (mismo criterio que `public-ticketing.actions.ts`).
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function getPublicVotingProjectAction(token: string): Promise<ActionResult<PublicVotingProjectInfo>> {
  try {
    const data = await publicVotingService.getPublicVotingProjectByToken(token);
    if (!data) return { success: false, error: 'Link de votación inválido o expirado' };
    return { success: true, data };
  } catch {
    return { success: false, error: 'No se pudo cargar la página de votación. Intenta de nuevo más tarde.' };
  }
}
