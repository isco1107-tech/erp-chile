import { excessPermissions } from '@/lib/auth/permissions';

/**
 * Auditoría 2026-09-27 (hallazgo A-1/SEG-02/PER-01): quien tiene
 * `settings:users` no debe poder ampliarse permisos a sí mismo (editando su
 * propio rol) ni crear una cuenta con más permisos de los que él tiene.
 */

describe('excessPermissions', () => {
  it('sin exceso cuando lo solicitado es subconjunto de lo que tiene el actor', () => {
    expect(excessPermissions(['contacts:read', 'sales:read'], ['contacts:read', 'sales:read', 'purchases:read'])).toEqual([]);
  });

  it('detecta cada permiso que el actor no tiene', () => {
    expect(excessPermissions(['contacts:read', 'accounting:close_period'], ['contacts:read'])).toEqual(['accounting:close_period']);
  });

  it('ignora claves que no son permisos válidos (no las trata como exceso)', () => {
    expect(excessPermissions(['not-a-real-permission'], ['contacts:read'])).toEqual([]);
  });

  it('un OWNER (con todos los permisos del plan) nunca genera exceso', () => {
    const ownerPermissions = ['contacts:read', 'accounting:close_period', 'payroll:close', 'company:export'] as const;
    expect(excessPermissions([...ownerPermissions], ownerPermissions)).toEqual([]);
  });
});

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({
  getAuthContext: jest.fn(),
  can: (context: { permissions: string[] }, permission: string) => context.permissions.includes(permission),
  AuthError: class AuthError extends Error {
    status: 401 | 403;
    constructor(message: string, status: 401 | 403) {
      super(message);
      this.status = status;
    }
  },
  TenantInactiveError: class TenantInactiveError extends Error {},
  ModuleNotEnabledError: class ModuleNotEnabledError extends Error {},
}));

import { prisma } from '@/lib/prisma';
import { getAuthContext } from '@/lib/auth/guards';
import { createCustomRoleAction, updateCustomRoleAction, assignCustomRoleAction } from '@/modules/roles/actions/roles.actions';

const adminContext = (overrides: Record<string, unknown> = {}) => ({
  id: 'admin-1',
  companyId: 'company-1',
  role: 'ADMIN',
  customRoleId: null,
  permissions: ['settings:users', 'contacts:read', 'sales:read'],
  features: {},
  email: 'admin@empresa.cl',
  ...overrides,
});

afterEach(() => jest.restoreAllMocks());

describe('createCustomRoleAction', () => {
  it('rechaza crear un rol con un permiso que el actor no tiene', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(adminContext() as never);
    const result = await createCustomRoleAction({ name: 'Jefe de RRHH', permissions: ['payroll:close'] });
    expect(result).toEqual({ success: false, error: expect.stringContaining('payroll:close') });
  });
});

describe('updateCustomRoleAction', () => {
  it('rechaza que el actor edite los permisos de su propio rol personalizado', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(adminContext({ customRoleId: 'role-mine' }) as never);
    const result = await updateCustomRoleAction('role-mine', { name: 'Mi rol', permissions: ['contacts:read'] });
    expect(result).toEqual({ success: false, error: 'No puedes editar los permisos de tu propio rol' });
  });

  it('rechaza ampliar un rol AJENO con un permiso que el actor no tiene', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(adminContext({ customRoleId: 'other-role' }) as never);
    const result = await updateCustomRoleAction('role-de-otro', { name: 'Contador', permissions: ['accounting:close_period'] });
    expect(result).toEqual({ success: false, error: expect.stringContaining('accounting:close_period') });
  });

  it('un OWNER sí puede editar el rol que él mismo tiene asignado', async () => {
    jest.spyOn(prisma.customRole, 'findFirst').mockResolvedValue({ id: 'role-mine', companyId: 'company-1' } as never);
    jest.spyOn(prisma.customRole, 'update').mockResolvedValue({ id: 'role-mine', name: 'Mi rol', permissions: ['contacts:read'] } as never);
    jest.mocked(getAuthContext).mockResolvedValue(
      adminContext({ role: 'OWNER', customRoleId: 'role-mine', permissions: ['contacts:read', 'settings:users'] }) as never
    );
    const result = await updateCustomRoleAction('role-mine', { name: 'Mi rol', permissions: ['contacts:read'] });
    expect(result.success).toBe(true);
  });
});

describe('assignCustomRoleAction', () => {
  it('rechaza asignarle a otro un rol existente que excede los permisos del actor', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(adminContext() as never);
    jest.spyOn(prisma.customRole, 'findFirst').mockResolvedValue({ id: 'role-poderoso', permissions: ['accounting:close_period'] } as never);
    const result = await assignCustomRoleAction({ userId: 'user-2', customRoleId: 'role-poderoso' });
    expect(result).toEqual({ success: false, error: expect.stringContaining('accounting:close_period') });
  });
});
