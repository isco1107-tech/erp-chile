const requireSuperAdmin = jest.fn();
const listTenants = jest.fn();
const sincronizar = jest.fn();
const habilitada = jest.fn();

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a), AuthError: class extends Error {} }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/prisma-errors', () => ({ toFriendlyErrorMessage: () => null }));
jest.mock('@/modules/platform/services/platform.service', () => ({ listTenants: (...a: unknown[]) => listTenants(...a) }));
jest.mock('@/lib/supersuite', () => ({
  sincronizarEmpresaSupersuite: (...a: unknown[]) => sincronizar(...a),
  solicitudModulosAtendidaSupersuite: jest.fn(),
  supersuiteHabilitada: () => habilitada(),
}));

import { syncTenantsSupersuiteAction } from '@/modules/platform/actions/platform.actions';

/** Reenviar la ficha de todas las empresas a la Supersuite (cuando se cambió algo directo en la base). */

beforeEach(() => {
  jest.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: 'u1' });
  habilitada.mockReturnValue(true);
});

it('envía la ficha de cada empresa y avisa cuántas fueron', async () => {
  listTenants.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
  const result = await syncTenantsSupersuiteAction();
  expect(result).toMatchObject({ success: true, data: { empresas: 3 } });
  expect(sincronizar.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2', 'c3']);
});

it('sin Supersuite configurada no envía nada y lo dice', async () => {
  habilitada.mockReturnValue(false);
  const result = await syncTenantsSupersuiteAction();
  expect(result).toMatchObject({ success: false });
  expect(listTenants).not.toHaveBeenCalled();
  expect(sincronizar).not.toHaveBeenCalled();
});

it('solo un superadmin puede pedirlo', async () => {
  requireSuperAdmin.mockRejectedValue(new Error('No autorizado'));
  const result = await syncTenantsSupersuiteAction();
  expect(result.success).toBe(false);
  expect(listTenants).not.toHaveBeenCalled();
  expect(sincronizar).not.toHaveBeenCalled();
});
