'use server';

import * as candidatesService from '../services/candidates.service';
import type { RegistrationProjectInfo } from '../services/candidates.service';

/**
 * Acción pública de auto-inscripción de candidatas: sin
 * `requireAuthWithPermission`, porque la postulante no es un `User` del ERP —
 * el `candidateRegistrationToken` que manda el cliente ES la autenticación
 * completa acá, validado adentro de `candidates.service.ts` contra la fila de
 * `Project`. Nunca acepta `companyId`/`projectId` del cliente: todo se
 * resuelve desde el token (mismo patrón que `public-sponsorships.actions.ts`).
 *
 * El envío real del formulario (`submitCandidateRegistration`) NO vive acá
 * como Server Action: incluye 2 fotografías de hasta 5 MB cada una y las
 * Server Actions de Next.js truncan el body a 1 MB (mismo motivo documentado
 * en `app/api/candidates/photo-upload/route.ts`). Por eso el envío se maneja
 * en un Route Handler: `app/api/public/candidates/[token]/apply/route.ts`.
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function getCandidateRegistrationProjectAction(token: string): Promise<ActionResult<RegistrationProjectInfo>> {
  try {
    const data = await candidatesService.getRegistrationProjectByToken(token);
    if (!data) return { success: false, error: 'Link de inscripción inválido o expirado' };
    return { success: true, data };
  } catch {
    // Superficie sin autenticación expuesta a internet: nunca devolver el
    // mensaje interno de un error inesperado (p.ej. de Prisma), solo uno fijo.
    return { success: false, error: 'No se pudo cargar el formulario. Intenta de nuevo más tarde.' };
  }
}
