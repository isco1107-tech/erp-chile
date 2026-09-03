import { prisma } from '@/lib/prisma';
import type { CompetitionRound } from '@prisma/client';

export async function assertProjectOwnership(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El proyecto/certamen no existe o no pertenece a esta empresa');
}

export async function assertRoundOwnership(companyId: string, roundId: string): Promise<CompetitionRound> {
  const round = await prisma.competitionRound.findFirst({ where: { id: roundId, companyId } });
  if (!round) throw new Error('La ronda no existe o no pertenece a esta empresa');
  return round;
}
