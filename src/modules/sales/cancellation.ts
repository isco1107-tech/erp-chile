import type { SiiSubmissionStatus } from '@prisma/client';

/**
 * Anular (ver CONTEXT.md) es dejar sin efecto dentro de Aether un documento
 * que aún no llega al SII. Un DTE ya despachado no se puede anular ante el
 * SII: se corrige con una Nota de Crédito (código 61).
 *
 * Se considera despachado si el SII entregó un Track ID o si el estado de
 * envío avanzó más allá de `PENDING` ("timbrado, aún no despachado"). Puro y
 * sin Prisma para que la UI pueda usar la misma regla que el servidor.
 */
export function isSubmittedToSii(document: {
  siiTrackId: string | null;
  siiStatus: SiiSubmissionStatus | null;
}): boolean {
  if (document.siiTrackId) return true;
  return document.siiStatus !== null && document.siiStatus !== 'PENDING';
}

export const SUBMITTED_TO_SII_CANCEL_ERROR =
  'Este documento ya fue enviado al SII y no se puede anular. Emite una Nota de Crédito para corregirlo';
