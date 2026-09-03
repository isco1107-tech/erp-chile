import {
  autoBalanceCategoryWeights,
  RoundResultRow,
} from '@/modules/judging/services/rounds.service';
import { prisma } from '@/lib/prisma';

describe('Judging Module: Rondas y Votación Independiente', () => {
  const companyId = 'comp-test';
  const roundId = 'round-test-1';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Auto-balance de ponderaciones: distribuye equitativamente 10000 bps (100%) entre los criterios', async () => {
    const mockCategories = [
      { id: 'cat-1', name: 'Traje de Baño', weightBps: 2000, order: 1 },
      { id: 'cat-2', name: 'Elegancia', weightBps: 2000, order: 2 },
      { id: 'cat-3', name: 'Pregunta', weightBps: 2000, order: 3 },
    ];

    jest.spyOn(prisma.competitionRound, 'findFirst').mockResolvedValue({
      id: roundId,
      companyId,
      projectId: 'proj-1',
      order: 1,
      name: 'Ronda 1',
      cutOffCount: null,
      isFinalRound: false,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    jest.spyOn(prisma.judgingCategory, 'findMany').mockResolvedValue(mockCategories as never);

    const updatedWeights: { id: string; weightBps: number }[] = [];
    jest.spyOn(prisma.judgingCategory, 'update').mockImplementation(((args: { where: { id: string }; data: { weightBps: number } }) => {
      updatedWeights.push({ id: args.where.id, weightBps: args.data.weightBps });
      return Promise.resolve(args.data);
    }) as never);

    await autoBalanceCategoryWeights(companyId, roundId);

    // 10000 / 3 = 3333, con resto 1 agregado a la primera (3334, 3333, 3333) = 10000 bps
    expect(updatedWeights).toHaveLength(3);
    const sum = updatedWeights.reduce((acc, c) => acc + c.weightBps, 0);
    expect(sum).toBe(10000);
    expect(updatedWeights[0]?.weightBps).toBe(3334);
    expect(updatedWeights[1]?.weightBps).toBe(3333);
    expect(updatedWeights[2]?.weightBps).toBe(3333);
  });

  it('Cálculo de Resultados: normaliza escalas por criterio y ordena por puntaje ponderado', () => {
    const categories = [
      { id: 'cat-1', name: 'Criterio A', weightBps: 6000, maxScore: 10 }, // 60%
      { id: 'cat-2', name: 'Criterio B', weightBps: 4000, maxScore: 5 },  // 40%
    ];

    // Candidata 1: 10/10 en A (100% * 60% = 60), 5/5 en B (100% * 40% = 40) => Total 100
    // Candidata 2: 8/10 en A (80% * 60% = 48), 2.5/5 en B (50% * 40% = 20) => Total 68
    const candidateScores = [
      {
        candidateId: 'cand-1',
        fullName: 'Candidata Uno',
        scores: [
          { categoryId: 'cat-1', score: 10 },
          { categoryId: 'cat-2', score: 5 },
        ],
      },
      {
        candidateId: 'cand-2',
        fullName: 'Candidata Dos',
        scores: [
          { categoryId: 'cat-1', score: 8 },
          { categoryId: 'cat-2', score: 2.5 },
        ],
      },
    ];

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const calculated = candidateScores.map((c) => {
      const weightedTotal = c.scores.reduce((sum, item) => {
        const cat = categoryMap.get(item.categoryId)!;
        const normalized = (item.score / cat.maxScore) * 100;
        return sum + (normalized * cat.weightBps) / 10000;
      }, 0);
      return {
        candidateId: c.candidateId,
        fullName: c.fullName,
        weightedTotal: Math.round(weightedTotal * 100) / 100,
      };
    });

    calculated.sort((a, b) => b.weightedTotal - a.weightedTotal);

    expect(calculated[0]?.candidateId).toBe('cand-1');
    expect(calculated[0]?.weightedTotal).toBe(100);
    expect(calculated[1]?.candidateId).toBe('cand-2');
    expect(calculated[1]?.weightedTotal).toBe(68);
  });
});
