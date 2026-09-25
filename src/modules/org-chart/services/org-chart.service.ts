import { prisma } from '@/lib/prisma';
import type { JobPosition } from '@prisma/client';
import { SAFE_USER_SELECT, type SafeUser } from '@/lib/services/users.service';
import type { CreateJobPositionInput } from '../schema';

export type JobPositionWithUsage = JobPosition & { userCount: number };

export type MinimalUser = { id: string; managerId: string | null };

/**
 * Reusa `SAFE_USER_SELECT`/`SafeUser` de `src/lib/services/users.service.ts`
 * en vez de reimplementar su propio `Omit<User, 'passwordHash'>` — ese
 * duplicado dejaba pasar `totpSecret` y otros campos de seguridad al
 * navegador igual que `SafeUser` antes de convertirse en lista positiva.
 */
export type StaffFlatRow = SafeUser & {
  jobPosition: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
  customRole: { name: string } | null;
};

export interface OrgChartNode {
  user: { id: string; name: string; email: string; photoUrl: string | null; isActive: boolean };
  jobPositionName: string | null;
  children: OrgChartNode[];
}

/**
 * Valida que asignar `newManagerId` como jefe de `userId` no cree un ciclo de
 * reporte (A depende de B que depende de A) ni que alguien se asigne a sí
 * mismo como su propio jefe. Función pura: sin Prisma adentro, reusada tanto
 * por la asignación manual (`assignManager`) como por el saneamiento de
 * sugerencias de IA (`sanitizeSuggestions`).
 */
export function validateManagerAssignment(
  allUsers: MinimalUser[],
  userId: string,
  newManagerId: string | null
): void {
  if (newManagerId === null) return;
  if (newManagerId === userId) {
    throw new Error('No puedes asignarte a ti mismo como tu propio jefe');
  }

  const byId = new Map(allUsers.map((u) => [u.id, u]));
  const visited = new Set<string>();
  let currentId: string | null = newManagerId;
  while (currentId !== null) {
    if (currentId === userId) {
      throw new Error(
        'Esto crearía un ciclo de reporte: esa persona ya depende (directa o indirectamente) de ti'
      );
    }
    if (visited.has(currentId)) break; // ciclo preexistente en los datos, ajeno a esta asignación
    visited.add(currentId);
    currentId = byId.get(currentId)?.managerId ?? null;
  }
}

export async function listJobPositions(companyId: string): Promise<JobPositionWithUsage[]> {
  const positions = await prisma.jobPosition.findMany({
    where: { companyId },
    include: { _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });
  return positions.map(({ _count, ...position }) => ({ ...position, userCount: _count.users }));
}

export async function createJobPosition(
  companyId: string,
  data: CreateJobPositionInput
): Promise<JobPosition> {
  return prisma.jobPosition.create({
    data: {
      companyId,
      name: data.name.trim(),
      level: data.level?.trim() || undefined,
    },
  });
}

export async function deleteJobPosition(companyId: string, id: string): Promise<void> {
  const existing = await prisma.jobPosition.findFirst({
    where: { id, companyId },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) throw new Error('Cargo no encontrado');
  if (existing._count.users > 0) {
    throw new Error(
      `Hay ${existing._count.users} colaborador(es) con este cargo. Reasígnalos antes de eliminarlo`
    );
  }

  await prisma.jobPosition.deleteMany({ where: { id, companyId } });
}

async function listMinimalUsers(companyId: string): Promise<MinimalUser[]> {
  return prisma.user.findMany({ where: { companyId }, select: { id: true, managerId: true } });
}

export async function assignManager(
  companyId: string,
  userId: string,
  managerId: string | null
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!user) throw new Error('Usuario no encontrado');

  if (managerId !== null) {
    const manager = await prisma.user.findFirst({ where: { id: managerId, companyId } });
    if (!manager) throw new Error('El jefe seleccionado no pertenece a tu empresa');
  }

  const allUsers = await listMinimalUsers(companyId);
  validateManagerAssignment(allUsers, userId, managerId);

  const result = await prisma.user.updateMany({ where: { id: userId, companyId }, data: { managerId } });
  if (result.count === 0) throw new Error('Usuario no encontrado');
}

export async function assignJobPosition(
  companyId: string,
  userId: string,
  jobPositionId: string | null
): Promise<void> {
  if (jobPositionId !== null) {
    const position = await prisma.jobPosition.findFirst({ where: { id: jobPositionId, companyId } });
    if (!position) throw new Error('El cargo seleccionado no pertenece a tu empresa');
  }

  const result = await prisma.user.updateMany({ where: { id: userId, companyId }, data: { jobPositionId } });
  if (result.count === 0) throw new Error('Usuario no encontrado');
}

export async function listStaffFlat(companyId: string): Promise<StaffFlatRow[]> {
  return prisma.user.findMany({
    where: { companyId },
    select: {
      ...SAFE_USER_SELECT,
      jobPosition: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      // No forma parte del molde original de la tabla de gestión, pero
      // suggest-hierarchy.service.ts la reutiliza para incluir el rol
      // personalizado de cada persona en el prompt de la IA.
      customRole: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getOrgChartTree(companyId: string): Promise<OrgChartNode[]> {
  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      email: true,
      photoUrl: true,
      isActive: true,
      managerId: true,
      jobPosition: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const nodeById = new Map<string, OrgChartNode>();
  for (const user of users) {
    nodeById.set(user.id, {
      user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl, isActive: user.isActive },
      jobPositionName: user.jobPosition?.name ?? null,
      children: [],
    });
  }

  const roots: OrgChartNode[] = [];
  for (const user of users) {
    const node = nodeById.get(user.id)!;
    // Sin jefe, o jefe fuera del set (defensivo: no debería pasar dentro de una
    // misma empresa, pero evita perder el nodo si ocurriera): queda como raíz.
    const managerNode = user.managerId ? nodeById.get(user.managerId) : undefined;
    if (managerNode) managerNode.children.push(node);
    else roots.push(node);
  }

  return roots;
}
