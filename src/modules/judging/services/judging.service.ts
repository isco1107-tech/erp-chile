import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import type { JudgeAssignment, JudgingCategory, ScoreSheet } from '@prisma/client';
import type { JudgeAssignmentCreateInput, JudgingCategoryCreateInput, SubmitScoreInput } from '../schema';
import { assertProjectOwnership, assertRoundOwnership } from './shared';
import { getRoundLiveResults } from './rounds.service';

// ---------------------------------------------------------------------------
// Categorías/criterios de evaluación (por ronda)
// ---------------------------------------------------------------------------

export async function createCategory(companyId: string, data: JudgingCategoryCreateInput): Promise<JudgingCategory> {
  const round = await assertRoundOwnership(companyId, data.roundId);
  return prisma.judgingCategory.create({
    data: {
      companyId,
      projectId: round.projectId,
      roundId: data.roundId,
      name: data.name,
      weightBps: data.weightBps,
      maxScore: data.maxScore,
      order: data.order,
    },
  });
}

export async function listCategories(companyId: string, roundId: string): Promise<JudgingCategory[]> {
  return prisma.judgingCategory.findMany({ where: { companyId, roundId }, orderBy: { order: 'asc' } });
}

export async function deleteCategory(companyId: string, id: string): Promise<void> {
  const result = await prisma.judgingCategory.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Categoría no encontrada');
}

// ---------------------------------------------------------------------------
// Jurados (acceso por link, sin cuenta de usuario ERP)
// ---------------------------------------------------------------------------

export async function createJudgeAssignment(companyId: string, data: JudgeAssignmentCreateInput): Promise<JudgeAssignment> {
  await assertProjectOwnership(companyId, data.projectId);
  return prisma.judgeAssignment.create({
    data: {
      companyId,
      projectId: data.projectId,
      judgeName: data.judgeName,
      judgeEmail: data.judgeEmail || undefined,
      accessToken: crypto.randomBytes(32).toString('hex'),
    },
  });
}

export async function listJudgeAssignments(companyId: string, projectId: string): Promise<JudgeAssignment[]> {
  return prisma.judgeAssignment.findMany({ where: { companyId, projectId }, orderBy: { createdAt: 'asc' } });
}

export async function deleteJudgeAssignment(companyId: string, id: string): Promise<void> {
  const result = await prisma.judgeAssignment.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Jurado no encontrado');
}

export type JudgeContext = {
  judgeAssignment: JudgeAssignment;
  project: { id: string; name: string; code: string };
  activeRound: { id: string; name: string; order: number } | null;
  categories: JudgingCategory[];
  candidates: { id: string; fullName: string; stageName: string | null; photoUrl: string | null }[];
  scoreSheets: ScoreSheet[];
};

/**
 * Resuelve todo lo que la pantalla del jurado necesita a partir del token —
 * nunca de un `companyId`/`projectId` que mande el cliente. Un token que no
 * matchea ningún `JudgeAssignment` no revela nada (mismo criterio que
 * `getInvitationByToken`): la ruta pública trata "no encontrado" igual que
 * "token inválido". Si el proyecto no tiene ninguna ronda en `VOTING`, se
 * devuelve `activeRound: null` y listas vacías — la pantalla del jurado
 * muestra "no hay votación activa" en vez de fallar.
 */
export async function getJudgeContextByToken(accessToken: string): Promise<JudgeContext | null> {
  const judgeAssignment = await prisma.judgeAssignment.findUnique({ where: { accessToken } });
  if (!judgeAssignment) return null;

  const [project, activeRound] = await Promise.all([
    prisma.project.findUnique({ where: { id: judgeAssignment.projectId }, select: { id: true, name: true, code: true } }),
    prisma.competitionRound.findFirst({
      where: { companyId: judgeAssignment.companyId, projectId: judgeAssignment.projectId, status: 'VOTING' },
      select: { id: true, name: true, order: true },
    }),
  ]);
  if (!project) return null;

  if (!activeRound) {
    return { judgeAssignment, project, activeRound: null, categories: [], candidates: [], scoreSheets: [] };
  }

  const [categories, roundContestants, scoreSheets] = await Promise.all([
    prisma.judgingCategory.findMany({ where: { companyId: judgeAssignment.companyId, roundId: activeRound.id }, orderBy: { order: 'asc' } }),
    prisma.roundContestant.findMany({
      where: { companyId: judgeAssignment.companyId, roundId: activeRound.id },
      include: { candidate: { select: { id: true, fullName: true, stageName: true, photoUrl: true } } },
      orderBy: { candidate: { fullName: 'asc' } },
    }),
    prisma.scoreSheet.findMany({ where: { judgeAssignmentId: judgeAssignment.id, roundId: activeRound.id } }),
  ]);

  return {
    judgeAssignment,
    project,
    activeRound,
    categories,
    candidates: roundContestants.map((rc) => rc.candidate),
    scoreSheets,
  };
}

/**
 * Guarda un puntaje en borrador (editable) — no es el envío final. Un jurado
 * puede volver a tocarlo cuantas veces quiera hasta llamar `submitScore`.
 * Rechaza puntajes fuera de la ronda `VOTING` (link reutilizado tras cerrar
 * o antes de abrir) y candidatas que no están sembradas en esta ronda
 * (`RoundContestant` — ya sea porque nunca compitieron o fueron eliminadas).
 */
export async function saveDraftScore(accessToken: string, data: SubmitScoreInput): Promise<ScoreSheet> {
  const judgeAssignment = await prisma.judgeAssignment.findUnique({ where: { accessToken } });
  if (!judgeAssignment) throw new Error('Link de jurado inválido');

  const category = await prisma.judgingCategory.findFirst({
    where: { id: data.categoryId, companyId: judgeAssignment.companyId, projectId: judgeAssignment.projectId },
    include: { round: true },
  });
  if (!category) throw new Error('Categoría no encontrada');
  if (category.round.status !== 'VOTING') throw new Error('Esta ronda no está en votación');
  if (data.score > category.maxScore) throw new Error(`El puntaje máximo para esta categoría es ${category.maxScore}`);

  const contestant = await prisma.roundContestant.findFirst({
    where: { companyId: judgeAssignment.companyId, roundId: category.roundId, candidateId: data.candidateId },
  });
  if (!contestant) throw new Error('Candidata no encontrada en esta ronda');

  const existing = await prisma.scoreSheet.findUnique({
    where: { judgeAssignmentId_candidateId_categoryId: { judgeAssignmentId: judgeAssignment.id, candidateId: data.candidateId, categoryId: data.categoryId } },
  });
  if (existing?.status === 'SUBMITTED') {
    throw new Error('Este puntaje ya fue enviado y no se puede editar');
  }

  return prisma.scoreSheet.upsert({
    where: { judgeAssignmentId_candidateId_categoryId: { judgeAssignmentId: judgeAssignment.id, candidateId: data.candidateId, categoryId: data.categoryId } },
    update: { score: data.score },
    create: {
      companyId: judgeAssignment.companyId,
      judgeAssignmentId: judgeAssignment.id,
      candidateId: data.candidateId,
      categoryId: data.categoryId,
      roundId: category.roundId,
      score: data.score,
    },
  });
}

export interface SubmitScoreMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Envío final: bloquea el puntaje contra cualquier edición futura y le
 * calcula un sello SHA-256 sobre (jurado, candidata, categoría, puntaje,
 * momento del envío) — prueba de integridad de que el valor guardado es el
 * que el jurado efectivamente envió, no una edición posterior directa en la
 * base. `updateMany` con `where: { status: 'DRAFT' }` es el guard real —
 * mismo patrón que `journal.service.ts` para un período contable cerrado. Si
 * el `count` sale 0, alguien ya lo había enviado (doble clic, dos pestañas) y
 * se rechaza en vez de sobreescribir.
 */
export async function submitScore(accessToken: string, data: SubmitScoreInput, meta: SubmitScoreMeta = {}): Promise<ScoreSheet> {
  const judgeAssignment = await prisma.judgeAssignment.findUnique({ where: { accessToken } });
  if (!judgeAssignment) throw new Error('Link de jurado inválido');

  await saveDraftScore(accessToken, data);

  const submittedAt = new Date();
  const auditHash = crypto
    .createHash('sha256')
    .update(`${judgeAssignment.id}|${data.candidateId}|${data.categoryId}|${data.score}|${submittedAt.toISOString()}`)
    .digest('hex');

  const result = await prisma.scoreSheet.updateMany({
    where: {
      judgeAssignmentId: judgeAssignment.id,
      candidateId: data.candidateId,
      categoryId: data.categoryId,
      status: 'DRAFT',
    },
    data: {
      status: 'SUBMITTED',
      submittedAt,
      auditHash,
      ipAddress: meta.ipAddress ?? undefined,
      userAgent: meta.userAgent ?? undefined,
    },
  });
  if (result.count === 0) throw new Error('Este puntaje ya fue enviado y no se puede editar');

  const updated = await prisma.scoreSheet.findUnique({
    where: { judgeAssignmentId_candidateId_categoryId: { judgeAssignmentId: judgeAssignment.id, candidateId: data.candidateId, categoryId: data.categoryId } },
  });
  if (!updated) throw new Error('Puntaje no encontrado');
  return updated;
}

// ---------------------------------------------------------------------------
// Acta de escrutinio (Excel), por ronda
// ---------------------------------------------------------------------------

export async function buildScrutinyWorkbook(companyId: string, roundId: string): Promise<Buffer> {
  const round = await prisma.competitionRound.findFirst({ where: { id: roundId, companyId }, include: { project: true } });
  if (!round) throw new Error('Ronda no encontrada');

  const [categories, judgeAssignments, roundContestants, scoreSheets] = await Promise.all([
    prisma.judgingCategory.findMany({ where: { companyId, roundId }, orderBy: { order: 'asc' } }),
    prisma.judgeAssignment.findMany({ where: { companyId, projectId: round.projectId } }),
    prisma.roundContestant.findMany({ where: { companyId, roundId }, include: { candidate: true }, orderBy: { candidate: { fullName: 'asc' } } }),
    prisma.scoreSheet.findMany({ where: { companyId, roundId } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP Chile — Producción de Certámenes';
  wb.created = new Date();

  for (const category of categories) {
    const ws = wb.addWorksheet(category.name.slice(0, 31));
    ws.columns = [
      { header: 'Candidata', key: 'candidate', width: 30 },
      ...judgeAssignments.map((j) => ({ header: j.judgeName, key: j.id, width: 18 })),
      { header: 'Estado', key: 'status', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const rc of roundContestants) {
      const row: Record<string, unknown> = { candidate: rc.candidate.stageName || rc.candidate.fullName };
      let allSubmitted = true;
      for (const judge of judgeAssignments) {
        const sheet = scoreSheets.find((s) => s.candidateId === rc.candidateId && s.categoryId === category.id && s.judgeAssignmentId === judge.id);
        row[judge.id] = sheet?.status === 'SUBMITTED' ? sheet.score : sheet ? `${sheet.score} (borrador)` : '—';
        if (sheet?.status !== 'SUBMITTED') allSubmitted = false;
      }
      row.status = allSubmitted ? 'Completo' : 'Pendiente';
      ws.addRow(row);
    }
  }

  const resultsSheet = wb.addWorksheet('Resumen ponderado');
  resultsSheet.columns = [
    { header: 'Puesto', key: 'rank', width: 8 },
    { header: 'Candidata', key: 'candidate', width: 30 },
    { header: 'Puntaje ponderado', key: 'total', width: 18 },
    { header: 'Planillas enviadas', key: 'submitted', width: 18 },
    { header: 'Clasificó', key: 'qualified', width: 12 },
  ];
  resultsSheet.getRow(1).font = { bold: true };
  const results = await getRoundLiveResults(companyId, roundId);
  results.forEach((row, index) => {
    resultsSheet.addRow({
      rank: index + 1,
      candidate: row.stageName || row.fullName,
      total: row.weightedTotal,
      submitted: `${row.submittedCount}/${row.expectedCount}`,
      qualified: row.qualified ? 'Sí' : 'No',
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface JudgingProjectOption {
  id: string;
  name: string;
  code: string;
}

export async function listProjectOptions(companyId: string): Promise<JudgingProjectOption[]> {
  return prisma.project.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true },
    orderBy: { startDate: 'desc' },
  });
}
