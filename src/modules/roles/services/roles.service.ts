import { prisma } from '@/lib/prisma';
import type { CustomRole } from '@prisma/client';
import { sanitizePermissions } from '@/lib/auth/effective-permissions';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import type { CustomRoleCreateInput } from '../schema';

export { sanitizePermissions };

export type CustomRoleWithUsage = CustomRole & { userCount: number };

export async function listCustomRoles(companyId: string): Promise<CustomRoleWithUsage[]> {
  const roles = await prisma.customRole.findMany({
    where: { companyId },
    include: { _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });
  return roles.map(({ _count, ...role }) => ({ ...role, userCount: _count.users }));
}

export async function getCustomRole(companyId: string, id: string): Promise<CustomRole | null> {
  return prisma.customRole.findFirst({ where: { id, companyId } });
}

export async function createCustomRole(
  companyId: string,
  input: CustomRoleCreateInput,
  features: CompanyFeatureFlags
): Promise<CustomRole> {
  const permissions = sanitizePermissions(input.permissions, features);
  if (permissions.length === 0) {
    throw new Error('Ninguno de los permisos seleccionados está incluido en el plan de la empresa');
  }

  return prisma.customRole.create({
    data: {
      companyId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      permissions,
    },
  });
}

export async function updateCustomRole(
  companyId: string,
  id: string,
  input: CustomRoleCreateInput,
  features: CompanyFeatureFlags
): Promise<CustomRole> {
  const existing = await prisma.customRole.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('Rol no encontrado');

  const permissions = sanitizePermissions(input.permissions, features);
  if (permissions.length === 0) {
    throw new Error('Ninguno de los permisos seleccionados está incluido en el plan de la empresa');
  }

  return prisma.customRole.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      permissions,
    },
  });
}

export async function deleteCustomRole(companyId: string, id: string): Promise<void> {
  const existing = await prisma.customRole.findFirst({
    where: { id, companyId },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) throw new Error('Rol no encontrado');
  if (existing._count.users > 0) {
    throw new Error(
      `Hay ${existing._count.users} colaborador(es) con este rol. Reasígnalos antes de eliminarlo`
    );
  }

  // Las invitaciones vigentes también apuntan al rol. Borrarlo las dejaría
  // aterrizando en el rol base sin que nadie lo note, así que se avisa.
  const pendingInvitations = await prisma.invitation.count({
    where: { companyId, customRoleId: id, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pendingInvitations > 0) {
    throw new Error(
      `Hay ${pendingInvitations} invitación(es) pendiente(s) con este rol. Revócalas o espera a que se acepten antes de eliminarlo`
    );
  }

  await prisma.customRole.delete({ where: { id } });
}

/** Asigna o quita el rol personalizado de un miembro del equipo. */
export async function assignCustomRole(
  companyId: string,
  userId: string,
  customRoleId: string | null
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!user) throw new Error('Usuario no encontrado');

  if (customRoleId) {
    const role = await prisma.customRole.findFirst({ where: { id: customRoleId, companyId } });
    if (!role) throw new Error('Rol no encontrado');
  }

  await prisma.user.update({ where: { id: userId }, data: { customRoleId } });
}

/** Usuarios activos de la empresa, para contrastar contra `maxUsers` del plan. */
export async function countSeatsInUse(companyId: string): Promise<number> {
  const [users, pendingInvitations] = await Promise.all([
    prisma.user.count({ where: { companyId, isActive: true } }),
    prisma.invitation.count({ where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  // Las invitaciones vigentes ya reservan cupo: si no contaran, invitar a 10
  // personas con 3 licencias dejaría el límite en evidencia recién al aceptarlas.
  return users + pendingInvitations;
}
