import 'server-only';

import { prisma } from '@/lib/prisma';
import { MAX_POSTER_DESIGNS, posterRequestSchema, type PosterDesignInput, type PosterRequestBody } from '@/lib/posters/overrides';

/**
 * Diseños de afiche guardados por certamen. Toda consulta lleva `companyId` y
 * el certamen se verifica antes de escribir. La personalización se vuelve a
 * validar al leer (`posterRequestSchema`): un registro viejo o alterado no
 * puede llegar al renderizador sin pasar por las mismas reglas que al guardar.
 */

export class PosterDesignError extends Error {}

export interface PosterDesignView {
  id: string;
  name: string;
  request: PosterRequestBody;
  updatedAt: string;
}

const SELECT = { id: true, name: true, piece: true, style: true, format: true, accent: true, candidateId: true, qr: true, overrides: true, updatedAt: true } as const;

type Row = { id: string; name: string; piece: string; style: string; format: string; accent: string | null; candidateId: string | null; qr: boolean | null; overrides: unknown; updatedAt: Date };

/** `null` si el registro ya no cumple las reglas (ej. una pieza que dejó de existir). */
function toView(row: Row): PosterDesignView | null {
  const parsed = posterRequestSchema.safeParse({
    piece: row.piece,
    style: row.style,
    format: row.format,
    accent: row.accent,
    candidateId: row.candidateId,
    qr: row.qr,
    overrides: row.overrides,
  });
  return parsed.success ? { id: row.id, name: row.name, request: parsed.data, updatedAt: row.updatedAt.toISOString() } : null;
}

export async function listPosterDesigns(companyId: string, projectId: string): Promise<PosterDesignView[]> {
  const rows = await prisma.posterDesign.findMany({ where: { companyId, projectId }, select: SELECT, orderBy: { updatedAt: 'desc' } });
  return rows.map(toView).filter((view): view is PosterDesignView => view !== null);
}

export async function getPosterDesign(companyId: string, projectId: string, id: string): Promise<PosterDesignView | null> {
  const row = await prisma.posterDesign.findFirst({ where: { id, companyId, projectId }, select: SELECT });
  return row ? toView(row) : null;
}

async function assertProject(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new PosterDesignError('Certamen no encontrado');
}

function columns(input: PosterDesignInput) {
  return {
    name: input.name,
    piece: input.piece,
    style: input.style,
    format: input.format,
    accent: input.accent,
    candidateId: input.candidateId,
    qr: input.qr,
    overrides: input.overrides,
  };
}

export async function createPosterDesign(companyId: string, projectId: string, userId: string, input: PosterDesignInput): Promise<PosterDesignView> {
  await assertProject(companyId, projectId);
  const total = await prisma.posterDesign.count({ where: { companyId, projectId } });
  if (total >= MAX_POSTER_DESIGNS) throw new PosterDesignError(`Puedes guardar hasta ${MAX_POSTER_DESIGNS} diseños por certamen. Elimina alguno para guardar otro.`);
  const row = await prisma.posterDesign.create({ data: { companyId, projectId, createdById: userId, ...columns(input) }, select: SELECT });
  return toView(row)!;
}

export async function updatePosterDesign(companyId: string, projectId: string, id: string, input: PosterDesignInput): Promise<PosterDesignView> {
  const result = await prisma.posterDesign.updateMany({ where: { id, companyId, projectId }, data: columns(input) });
  if (result.count === 0) throw new PosterDesignError('Diseño no encontrado');
  const view = await getPosterDesign(companyId, projectId, id);
  if (!view) throw new PosterDesignError('Diseño no encontrado');
  return view;
}

export async function deletePosterDesign(companyId: string, projectId: string, id: string): Promise<void> {
  const result = await prisma.posterDesign.deleteMany({ where: { id, companyId, projectId } });
  if (result.count === 0) throw new PosterDesignError('Diseño no encontrado');
}
