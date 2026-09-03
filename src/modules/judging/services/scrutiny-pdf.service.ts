import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { getRoundLiveResults } from './rounds.service';

const PAGE_WIDTH = 595.28; // A4 puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;

/**
 * Acta notarial de escrutinio: solo se puede generar con la ronda cerrada
 * (`VOTING_CLOSED`/`COMPLETED`) — es un documento de cierre que certifica un
 * resultado ya congelado (`RoundContestant.finalScore`/`rank`), no una vista
 * en vivo que pueda seguir cambiando. El hash SHA-256 al pie es el sello de
 * integridad del acta completa: cualquier alteración posterior del PDF, o de
 * los datos que lo originaron, produce un hash distinto y detectable.
 */
export async function buildRoundActaPdf(companyId: string, roundId: string): Promise<Buffer> {
  const round = await prisma.competitionRound.findFirst({ where: { id: roundId, companyId }, include: { project: true, company: true } });
  if (!round) throw new Error('Ronda no encontrada');
  if (round.status !== 'VOTING_CLOSED' && round.status !== 'COMPLETED') {
    throw new Error('El acta notarial solo se puede generar con la votación cerrada');
  }

  const [judgeAssignments, results] = await Promise.all([
    prisma.judgeAssignment.findMany({ where: { companyId, projectId: round.projectId }, orderBy: { createdAt: 'asc' } }),
    getRoundLiveResults(companyId, roundId),
  ]);

  const generatedAt = new Date();
  const seal = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        roundId: round.id,
        projectId: round.projectId,
        results: results.map((r) => ({ id: r.candidateId, score: r.weightedTotal, rank: r.rank, qualified: r.qualified })),
      }),
    )
    .digest('hex');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(lineHeight: number) {
    if (y - lineHeight < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function writeLine(text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const gap = opts.gap ?? size + 6;
    ensureSpace(gap);
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: opts.bold ? fontBold : font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1),
    });
    y -= gap;
  }

  writeLine('ACTA DE ESCRUTINIO', { size: 18, bold: true, gap: 26 });
  writeLine(round.company.businessName, { size: 12, bold: true });
  writeLine(`Certamen: ${round.project.name} (${round.project.code})`);
  writeLine(`Ronda: ${round.name}${round.isFinalRound ? ' — Ronda Final' : ''}`);
  writeLine(`Estado: ${round.status === 'COMPLETED' ? 'Completada' : 'Votación cerrada'}`);
  writeLine(`Fecha de generación: ${generatedAt.toLocaleString('es-CL')}`, { gap: 22 });

  writeLine('Jurado', { size: 13, bold: true, gap: 20 });
  if (judgeAssignments.length === 0) {
    writeLine('Sin jurados registrados para este certamen.');
  } else {
    for (const judge of judgeAssignments) {
      writeLine(`• ${judge.judgeName}${judge.judgeEmail ? ` (${judge.judgeEmail})` : ''}`);
    }
  }
  y -= 8;

  writeLine('Resultado', { size: 13, bold: true, gap: 20 });
  writeLine('Puesto', { size: 10, bold: true, gap: 0 });
  {
    // Encabezado de tabla en una sola línea con columnas fijas.
    ensureSpace(18);
    const cols = [
      { x: MARGIN, text: 'Puesto' },
      { x: MARGIN + 60, text: 'Candidata' },
      { x: MARGIN + 300, text: 'Puntaje' },
      { x: MARGIN + 380, text: round.isFinalRound ? 'Posición final' : 'Clasificó' },
    ];
    for (const col of cols) {
      page.drawText(col.text, { x: col.x, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    }
    y -= 16;

    for (const row of results) {
      ensureSpace(16);
      const rank = row.rank ?? '—';
      const status = round.isFinalRound ? (row.rank === 1 ? 'Ganadora' : row.rank === 2 ? 'Virreina' : row.rank === 3 ? '2da Finalista' : '—') : row.qualified ? 'Sí' : 'No';
      page.drawText(String(rank), { x: MARGIN, y, size: 10, font });
      page.drawText((row.stageName || row.fullName).slice(0, 38), { x: MARGIN + 60, y, size: 10, font });
      page.drawText(row.weightedTotal.toFixed(2), { x: MARGIN + 300, y, size: 10, font });
      page.drawText(status, { x: MARGIN + 380, y, size: 10, font });
      y -= 16;
    }
  }

  y -= 24;
  writeLine('Sello de integridad (SHA-256)', { size: 11, bold: true, gap: 16 });
  ensureSpace(14);
  page.drawText(seal, { x: MARGIN, y, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 40;

  writeLine('_______________________________', { gap: 14 });
  writeLine('Director/a de Producción');
  y -= 20;
  writeLine('_______________________________', { gap: 14 });
  writeLine('Ministro de Fe / Notario');

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
