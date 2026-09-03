import { prisma } from '@/lib/prisma';
import type { CompetitionRound } from '@prisma/client';
import type { CompetitionRoundCreateInput } from '../schema';
import { assertProjectOwnership, assertRoundOwnership } from './shared';

export async function createRound(companyId: string, data: CompetitionRoundCreateInput): Promise<CompetitionRound> {
  await assertProjectOwnership(companyId, data.projectId);
  return prisma.competitionRound.create({
    data: {
      companyId,
      projectId: data.projectId,
      order: data.order,
      name: data.name,
      cutOffCount: data.isFinalRound ? null : data.cutOffCount,
      isFinalRound: data.isFinalRound,
    },
  });
}

export async function listRounds(companyId: string, projectId: string): Promise<CompetitionRound[]> {
  return prisma.competitionRound.findMany({ where: { companyId, projectId }, orderBy: { order: 'asc' } });
}

/** Solo se puede borrar una ronda que todavía no se abrió — una vez en votación es un hecho de producción en vivo, no un borrador. */
export async function deleteRound(companyId: string, id: string): Promise<void> {
  const result = await prisma.competitionRound.deleteMany({ where: { id, companyId, status: 'DRAFT' } });
  if (result.count === 0) throw new Error('Solo se puede eliminar una ronda en borrador');
}

export async function getCategoryWeightTotal(companyId: string, roundId: string): Promise<number> {
  const result = await prisma.judgingCategory.aggregate({ where: { companyId, roundId }, _sum: { weightBps: true } });
  return result._sum.weightBps ?? 0;
}

/** Distribuye el 100% (10000 bps) equitativamente entre los criterios de la ronda. */
export async function autoBalanceCategoryWeights(companyId: string, roundId: string): Promise<void> {
  await assertRoundOwnership(companyId, roundId);
  const categories = await prisma.judgingCategory.findMany({ where: { companyId, roundId }, orderBy: { order: 'asc' } });
  if (categories.length === 0) return;
  const equalShare = Math.floor(10000 / categories.length);
  const remainder = 10000 - equalShare * categories.length;
  for (let i = 0; i < categories.length; i++) {
    const weightBps = equalShare + (i === 0 ? remainder : 0);
    await prisma.judgingCategory.update({
      where: { id: categories[i]!.id },
      data: { weightBps },
    });
  }
}

/** `DRAFT → READY`: exige que los criterios de la ronda sumen 100% de ponderación antes de poder abrir la votación. */
export async function markRoundReady(companyId: string, roundId: string): Promise<CompetitionRound> {
  const round = await assertRoundOwnership(companyId, roundId);
  if (round.status !== 'DRAFT') throw new Error('Solo una ronda en borrador puede marcarse como lista');

  const weightTotal = await getCategoryWeightTotal(companyId, roundId);
  if (weightTotal !== 10000) {
    await autoBalanceCategoryWeights(companyId, roundId);
  }

  const result = await prisma.competitionRound.updateMany({ where: { id: roundId, companyId, status: 'DRAFT' }, data: { status: 'READY' } });
  if (result.count === 0) throw new Error('La ronda ya no está en borrador');
  return prisma.competitionRound.findUniqueOrThrow({ where: { id: roundId, companyId } });
}

/**
 * "Votar ahora": Habilita la votación de esta ronda independiente.
 * Funciona directamente desde DRAFT o READY. Si los criterios no suman 100%,
 * los equilibra automáticamente. Si otra ronda estaba en VOTING, la cierra para
 * que los jurados vean siempre la ronda que el director activó.
 */
export async function openRound(companyId: string, roundId: string): Promise<CompetitionRound> {
  const round = await assertRoundOwnership(companyId, roundId);
  if (round.status === 'VOTING') return round;

  // Validar que la ronda tenga al menos un criterio
  const categories = await prisma.judgingCategory.findMany({ where: { companyId, roundId }, orderBy: { order: 'asc' } });
  if (categories.length === 0) {
    throw new Error('Agrega al menos un criterio de evaluación a esta ronda antes de iniciar la votación');
  }

  // Si los pesos no suman 10000 bps (100%), auto-equilibrar
  const weightTotal = categories.reduce((sum, c) => sum + c.weightBps, 0);
  if (weightTotal !== 10000) {
    await autoBalanceCategoryWeights(companyId, roundId);
  }

  // Resolver candidatas participantes para esta ronda
  let contestantCandidateIds: string[] = [];
  if (round.order > 1) {
    const previousRound = await prisma.competitionRound.findFirst({
      where: { companyId, projectId: round.projectId, order: round.order - 1 },
    });
    if (previousRound && (previousRound.status === 'COMPLETED' || previousRound.status === 'VOTING_CLOSED')) {
      const qualifiers = await prisma.roundContestant.findMany({
        where: { companyId, roundId: previousRound.id, qualified: true },
        select: { candidateId: true },
      });
      if (qualifiers.length > 0) {
        contestantCandidateIds = qualifiers.map((q) => q.candidateId);
      }
    }
  }

  // Si es la ronda 1 o la ronda anterior no tenía corte (competencia abierta para todas)
  if (contestantCandidateIds.length === 0) {
    const candidates = await prisma.candidate.findMany({
      where: { companyId, projectId: round.projectId, status: { in: ['OFFICIAL_CANDIDATE', 'FINALIST'] } },
      select: { id: true },
    });
    contestantCandidateIds = candidates.map((c) => c.id);
  }

  if (contestantCandidateIds.length === 0) {
    throw new Error('No hay candidatas oficiales registradas para este certamen');
  }

  await prisma.$transaction(async (tx) => {
    // Si otra ronda estaba en votación, cerrarla para que los jurados evalúen esta ronda
    await tx.competitionRound.updateMany({
      where: { companyId, projectId: round.projectId, status: 'VOTING', id: { not: roundId } },
      data: { status: 'VOTING_CLOSED' },
    });

    // Abrir la ronda seleccionada
    await tx.competitionRound.updateMany({
      where: { id: roundId, companyId },
      data: { status: 'VOTING' },
    });

    // Sembrar candidatas en RoundContestant
    for (const candidateId of contestantCandidateIds) {
      await tx.roundContestant.upsert({
        where: { roundId_candidateId: { roundId, candidateId } },
        update: {},
        create: { companyId, roundId, candidateId },
      });
    }
  });

  return prisma.competitionRound.findUniqueOrThrow({ where: { id: roundId, companyId } });
}

/** Reabre una ronda previamente cerrada para permitir correcciones o votos adicionales. */
export async function reopenRound(companyId: string, roundId: string): Promise<CompetitionRound> {
  const round = await assertRoundOwnership(companyId, roundId);
  if (round.status !== 'VOTING_CLOSED') throw new Error('Solo se puede reabrir una ronda con votación cerrada');

  await prisma.$transaction(async (tx) => {
    // Cerrar cualquier otra que esté en voting
    await tx.competitionRound.updateMany({
      where: { companyId, projectId: round.projectId, status: 'VOTING', id: { not: roundId } },
      data: { status: 'VOTING_CLOSED' },
    });

    await tx.competitionRound.updateMany({
      where: { id: roundId, companyId },
      data: { status: 'VOTING' },
    });
  });

  return prisma.competitionRound.findUniqueOrThrow({ where: { id: roundId, companyId } });
}

export interface RoundResultRow {
  candidateId: string;
  fullName: string;
  stageName: string | null;
  photoUrl: string | null;
  weightedTotal: number;
  submittedCount: number;
  expectedCount: number;
  rank: number | null;
  qualified: boolean;
  categoryScores: Record<string, number>;
}

/**
 * Recalcula el resultado ponderado de la ronda en cada llamada, nunca lo
 * persiste (mismo principio que el balance de comprobación contable) —
 * `RoundContestant.finalScore`/`rank` recién se escriben, una sola vez, en
 * `closeRound`.
 */
export async function getRoundLiveResults(companyId: string, roundId: string): Promise<RoundResultRow[]> {
  const round = await assertRoundOwnership(companyId, roundId);

  const [roundContestants, categories, judgeCount, scoreSheets] = await Promise.all([
    prisma.roundContestant.findMany({
      where: { companyId, roundId },
      include: { candidate: { select: { id: true, fullName: true, stageName: true, photoUrl: true } } },
    }),
    prisma.judgingCategory.findMany({ where: { companyId, roundId }, orderBy: { order: 'asc' } }),
    prisma.judgeAssignment.count({ where: { companyId, projectId: round.projectId } }),
    prisma.scoreSheet.findMany({ where: { companyId, roundId, status: 'SUBMITTED' } }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const expectedCount = categories.length * judgeCount;

  const rows: RoundResultRow[] = roundContestants.map((rc) => {
    const own = scoreSheets.filter((s) => s.candidateId === rc.candidateId);
    
    // Promedio o cálculo por categoría
    const categoryScores: Record<string, number> = {};
    for (const cat of categories) {
      const catSheets = own.filter((s) => s.categoryId === cat.id);
      if (catSheets.length > 0) {
        const avg = catSheets.reduce((sum, s) => sum + s.score, 0) / catSheets.length;
        categoryScores[cat.id] = Math.round(avg * 10) / 10;
      } else {
        categoryScores[cat.id] = 0;
      }
    }

    const weightedTotal = own.reduce((sum, sheet) => {
      const category = categoryById.get(sheet.categoryId);
      if (!category || category.maxScore === 0) return sum;
      // Normaliza a 0-100 antes de ponderar según weightBps
      const normalized = (sheet.score / category.maxScore) * 100;
      return sum + (normalized * category.weightBps) / 10000;
    }, 0);

    return {
      candidateId: rc.candidateId,
      fullName: rc.candidate.fullName,
      stageName: rc.candidate.stageName,
      photoUrl: rc.candidate.photoUrl,
      weightedTotal: Math.round(weightedTotal * 100) / 100,
      submittedCount: own.length,
      expectedCount,
      rank: rc.rank,
      qualified: rc.qualified,
      categoryScores,
    };
  });

  return rows.sort((a, b) => b.weightedTotal - a.weightedTotal);
}

/**
 * `VOTING → VOTING_CLOSED`. Congela el ranking: escribe `finalScore`/`rank`
 * una única vez (guard `updateMany` con `where: { status: 'VOTING' }`, mismo
 * patrón que `ScoreSheet.submitScore`) y marca `qualified` para las
 * `cutOffCount` mejores — un empate justo en el límite de corte extiende el
 * corte (todas las candidatas empatadas en la última posición clasifican).
 * La ronda final no calcula `qualified`: solo importa el `rank` 1/2/3.
 */
export async function closeRound(companyId: string, roundId: string): Promise<CompetitionRound> {
  const round = await assertRoundOwnership(companyId, roundId);
  if (round.status !== 'VOTING') throw new Error('Solo se puede cerrar una ronda que esté en votación');

  const results = await getRoundLiveResults(companyId, roundId);

  const qualifiedIds = new Set<string>();
  if (!round.isFinalRound && round.cutOffCount != null && results.length > 0) {
    const cutoffScore = results[Math.min(round.cutOffCount, results.length) - 1]?.weightedTotal;
    if (cutoffScore !== undefined) {
      for (const row of results) {
        if (row.weightedTotal >= cutoffScore) qualifiedIds.add(row.candidateId);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    const locked = await tx.competitionRound.updateMany({ where: { id: roundId, companyId, status: 'VOTING' }, data: { status: 'VOTING_CLOSED' } });
    if (locked.count === 0) throw new Error('La ronda ya fue cerrada');

    for (const [index, row] of results.entries()) {
      await tx.roundContestant.update({
        where: { roundId_candidateId: { roundId, candidateId: row.candidateId } },
        data: {
          finalScore: row.weightedTotal,
          rank: index + 1,
          qualified: round.isFinalRound ? false : qualifiedIds.has(row.candidateId),
        },
      });
    }
  });

  return prisma.competitionRound.findUniqueOrThrow({ where: { id: roundId, companyId } });
}

/**
 * `VOTING_CLOSED → COMPLETED`. Solo en la ronda final: marca `Candidate.status
 * = WINNER` para el `rank = 1`. No se toca ningún otro estado de candidata —
 * `RoundContestant.qualified` ya es la fuente de verdad de eliminación por
 * ronda para el resto.
 */
export async function completeRound(companyId: string, roundId: string): Promise<CompetitionRound> {
  const round = await assertRoundOwnership(companyId, roundId);
  if (round.status !== 'VOTING_CLOSED') throw new Error('Solo se puede completar una ronda con la votación cerrada');

  await prisma.$transaction(async (tx) => {
    const locked = await tx.competitionRound.updateMany({ where: { id: roundId, companyId, status: 'VOTING_CLOSED' }, data: { status: 'COMPLETED' } });
    if (locked.count === 0) throw new Error('La ronda ya fue completada');

    if (round.isFinalRound) {
      const winner = await tx.roundContestant.findFirst({ where: { roundId, companyId, rank: 1 } });
      if (winner) {
        await tx.candidate.updateMany({ where: { id: winner.candidateId, companyId }, data: { status: 'WINNER' } });
      }
    }
  });

  return prisma.competitionRound.findUniqueOrThrow({ where: { id: roundId, companyId } });
}
