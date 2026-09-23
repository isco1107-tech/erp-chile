import 'server-only';

import type { CandidateStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CandidatePresentationInput, NUMBERING_ORDERS } from '../schema';

/**
 * Tablero de casting y presentación pública de candidatas. Lee solo los
 * campos que el tablero necesita (nunca RUT, fecha de nacimiento ni datos de
 * contacto); la foto se devuelve solo a quien tiene `candidates:sensitive`,
 * mismo criterio que la ficha y el listado.
 */

export interface CastingCard {
  id: string;
  fullName: string;
  stageName: string | null;
  status: CandidateStatus;
  photoUrl: string | null;
  comuna: string | null;
  folio: string | null;
  candidateNumber: number | null;
  representing: string | null;
  publicBio: string | null;
  showOnPublicSite: boolean;
  createdAt: Date;
  documentsCount: number;
  contractSigned: boolean;
}

export async function listCastingBoard(companyId: string, projectId: string, canSeePhotos: boolean): Promise<CastingCard[]> {
  const rows = await prisma.candidate.findMany({
    where: { companyId, projectId },
    select: {
      id: true,
      fullName: true,
      stageName: true,
      status: true,
      photoUrl: true,
      comuna: true,
      folio: true,
      candidateNumber: true,
      representing: true,
      publicBio: true,
      showOnPublicSite: true,
      createdAt: true,
      _count: { select: { documents: true } },
      documents: { where: { companyId, documentType: 'CONTRACT_IMAGE', signedAt: { not: null } }, select: { id: true }, take: 1 },
    },
    orderBy: [{ candidateNumber: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 1000,
  });
  return rows.map(({ _count, documents, photoUrl, ...row }) => ({
    ...row,
    photoUrl: canSeePhotos ? photoUrl : null,
    documentsCount: _count.documents,
    contractSigned: documents.length > 0,
  }));
}

export class DuplicateCandidateNumberError extends Error {}

export async function updateCandidatePresentation(companyId: string, id: string, input: CandidatePresentationInput): Promise<void> {
  const candidate = await prisma.candidate.findFirst({ where: { id, companyId }, select: { projectId: true } });
  if (!candidate) throw new Error('Candidata no encontrada');
  if (input.candidateNumber !== null) {
    const taken = await prisma.candidate.findFirst({
      where: { companyId, projectId: candidate.projectId, candidateNumber: input.candidateNumber, NOT: { id } },
      select: { fullName: true, stageName: true },
    });
    if (taken) throw new DuplicateCandidateNumberError(`El N° ${input.candidateNumber} ya lo tiene ${taken.stageName ?? taken.fullName}`);
  }
  await prisma.candidate.updateMany({
    where: { id, companyId },
    data: {
      candidateNumber: input.candidateNumber,
      representing: input.representing || null,
      publicBio: input.publicBio || null,
      showOnPublicSite: input.showOnPublicSite,
    },
  });
}

const NUMBERABLE: CandidateStatus[] = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'];

/**
 * Numera a las candidatas oficiales de 1 a N. Se limpian primero los
 * números de todo el certamen y después se asignan, dentro de una
 * transacción: renumerar en un solo paso chocaría contra el índice único
 * `[projectId, candidateNumber]` cuando dos candidatas intercambian número.
 */
export async function numberOfficialCandidates(companyId: string, projectId: string, order: (typeof NUMBERING_ORDERS)[number]): Promise<number> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El certamen no existe o no pertenece a tu empresa');
  const candidates = await prisma.candidate.findMany({
    where: { companyId, projectId, status: { in: NUMBERABLE } },
    select: { id: true, fullName: true, stageName: true, representing: true, createdAt: true },
  });
  const collator = new Intl.Collator('es-CL', { sensitivity: 'base' });
  const name = (c: (typeof candidates)[number]) => c.stageName ?? c.fullName;
  candidates.sort((a, b) => {
    if (order === 'registration') return a.createdAt.getTime() - b.createdAt.getTime();
    if (order === 'representing') return collator.compare(a.representing ?? '~', b.representing ?? '~') || collator.compare(name(a), name(b));
    return collator.compare(name(a), name(b));
  });
  await prisma.$transaction([
    prisma.candidate.updateMany({ where: { companyId, projectId }, data: { candidateNumber: null } }),
    ...candidates.map((c, index) => prisma.candidate.updateMany({ where: { id: c.id, companyId }, data: { candidateNumber: index + 1 } })),
  ]);
  return candidates.length;
}
