import { prisma } from '@/lib/prisma';
import type { Project } from '@prisma/client';
import type { ProjectCreateInput, ProjectUpdateInput } from '../schema';

export async function createProject(companyId: string, data: ProjectCreateInput): Promise<Project> {
  return prisma.project.create({
    data: {
      companyId,
      code: data.code,
      name: data.name,
      budgetedIncome: data.budgetedIncome,
      budgetedExpense: data.budgetedExpense,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      notes: data.notes,
    },
  });
}

export async function updateProject(companyId: string, id: string, data: ProjectUpdateInput): Promise<Project> {
  // `updateMany` + relectura en vez de `update({ where: { id } })`: así el
  // filtro de tenant es imposible de omitir por accidente (ver CLAUDE.md
  // sección 2.3).
  const result = await prisma.project.updateMany({
    where: { id, companyId },
    data: {
      code: data.code,
      name: data.name,
      budgetedIncome: data.budgetedIncome,
      budgetedExpense: data.budgetedExpense,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      notes: data.notes,
    },
  });
  if (result.count === 0) throw new Error('Proyecto no encontrado');

  const project = await prisma.project.findFirst({ where: { id, companyId } });
  if (!project) throw new Error('Proyecto no encontrado');
  return project;
}

export async function listProjects(companyId: string): Promise<Project[]> {
  return prisma.project.findMany({
    where: { companyId },
    orderBy: { startDate: 'desc' },
  });
}

export async function getProject(companyId: string, id: string): Promise<Project | null> {
  return prisma.project.findFirst({ where: { id, companyId } });
}

/**
 * Solo se permite eliminar un proyecto sin nada vinculado todavía. Un
 * proyecto con documentos/auspicios/boletas/candidatas reales debe pasar a
 * estado `CANCELLED` en vez de borrarse — eliminar arrastraría (o dejaría
 * huérfano) historial financiero real.
 */
export async function deleteProject(companyId: string, id: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id, companyId },
    include: {
      _count: {
        select: {
          salesDocuments: true,
          purchaseDocuments: true,
          payments: true,
          sponsorshipContracts: true,
          feeDocuments: true,
          candidates: true,
        },
      },
    },
  });
  if (!project) throw new Error('Proyecto no encontrado');

  const linkedCount = Object.values(project._count).reduce((sum, n) => sum + n, 0);
  if (linkedCount > 0) {
    throw new Error(
      'No se puede eliminar: el proyecto tiene documentos, auspicios, boletas o candidatas vinculadas. Cámbialo a estado "Cancelado" en vez de eliminarlo.'
    );
  }

  const result = await prisma.project.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Proyecto no encontrado');
}
