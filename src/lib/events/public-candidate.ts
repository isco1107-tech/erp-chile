import type { CandidateStatus } from '@prisma/client';

/**
 * Lo que de una candidata puede salir a una superficie pública (micrositio,
 * votación del público, correos a compradores). Regla de CLAUDE.md: nombre
 * artístico, número, `representing`, foto y `publicBio` — nunca el nombre
 * de la ficha de postulación (`fullName`), RUT, edad ni contacto.
 */

/** Estados en los que una candidata ya es parte oficial del certamen y puede mostrarse. */
export const PUBLIC_CANDIDATE_STATUSES: CandidateStatus[] = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'];

/** Nombre público: el artístico, o "Candidata N° 7" si no tiene; jamás el nombre de la ficha. */
export function publicCandidateName(candidate: { stageName: string | null; candidateNumber: number | null }): string {
  const stage = candidate.stageName?.trim();
  if (stage) return stage;
  return candidate.candidateNumber !== null ? `Candidata N° ${candidate.candidateNumber}` : 'Candidata';
}
