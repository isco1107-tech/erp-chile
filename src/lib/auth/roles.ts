import type { Role } from '@prisma/client';

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Dueño',
  ADMIN: 'Administrador',
  SALES: 'Vendedor',
  WAREHOUSE: 'Bodeguero',
  ACCOUNTANT: 'Contador',
};

export const ROLE_BADGE_CLASS: Record<Role, string> = {
  OWNER: 'bg-violet-600/10 text-violet-600',
  ADMIN: 'bg-blue-600/10 text-blue-600',
  SALES: 'bg-green-600/10 text-green-600',
  WAREHOUSE: 'bg-amber-600/10 text-amber-600',
  ACCOUNTANT: 'bg-cyan-600/10 text-cyan-600',
};
