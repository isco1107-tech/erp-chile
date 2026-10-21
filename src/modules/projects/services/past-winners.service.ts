import 'server-only';

import type { PastWinner } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MAX_PAST_WINNERS, type PastWinnerInput } from '../schema';

/**
 * Ganadoras de ediciones anteriores del certamen (salón de la fama del
 * micrositio). Toda consulta lleva `companyId` y el certamen se verifica antes
 * de escribir: una ganadora nunca cuelga de un certamen de otra empresa.
 * Orden de la galería: la edición más reciente primero (esa es la destacada);
 * las que no tienen año, al final, en el orden en que se cargaron.
 */

export class PastWinnerError extends Error {}

export function listPastWinners(companyId: string, projectId: string): Promise<PastWinner[]> {
  return prisma.pastWinner.findMany({
    where: { companyId, projectId },
    orderBy: [{ year: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
}

async function assertProject(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new PastWinnerError('Certamen no encontrado');
}

export async function createPastWinner(companyId: string, projectId: string, data: PastWinnerInput): Promise<PastWinner> {
  await assertProject(companyId, projectId);
  const total = await prisma.pastWinner.count({ where: { companyId, projectId } });
  if (total >= MAX_PAST_WINNERS) throw new PastWinnerError(`Puedes publicar hasta ${MAX_PAST_WINNERS} fotos de ganadoras. Elimina alguna para agregar otra.`);
  return prisma.pastWinner.create({ data: { companyId, projectId, ...data } });
}

/** Devuelve la URL de la foto reemplazada (si cambió) para que quien llama la borre del almacenamiento. */
export async function updatePastWinner(companyId: string, projectId: string, id: string, data: PastWinnerInput): Promise<{ replacedPhotoUrl: string | null }> {
  const current = await prisma.pastWinner.findFirst({ where: { id, companyId, projectId }, select: { photoUrl: true } });
  if (!current) throw new PastWinnerError('Ganadora no encontrada');
  const result = await prisma.pastWinner.updateMany({ where: { id, companyId, projectId }, data });
  if (result.count === 0) throw new PastWinnerError('Ganadora no encontrada');
  return { replacedPhotoUrl: current.photoUrl !== data.photoUrl ? current.photoUrl : null };
}

/** Devuelve la URL de la foto para que quien llama la borre del almacenamiento (es pública: no puede quedar huérfana). */
export async function deletePastWinner(companyId: string, projectId: string, id: string): Promise<{ photoUrl: string }> {
  const current = await prisma.pastWinner.findFirst({ where: { id, companyId, projectId }, select: { photoUrl: true } });
  if (!current) throw new PastWinnerError('Ganadora no encontrada');
  const result = await prisma.pastWinner.deleteMany({ where: { id, companyId, projectId } });
  if (result.count === 0) throw new PastWinnerError('Ganadora no encontrada');
  return { photoUrl: current.photoUrl };
}
