/**
 * SEG-02: `completeForcedPasswordChangeAction` no comprobaba que hubiera un
 * cambio de contraseña obligatorio pendiente — cualquier sesión ordinaria
 * podía usarla para fijar una contraseña nueva sin volver a pedir la actual.
 * La única pantalla que la invoca (`/change-password`) ya redirige si
 * `mustChangePassword` es `false`, pero eso es gating de UI: la Server Action
 * en sí es invocable directamente. Se prueba acá que el propio guard del
 * servidor rechaza esa llamada sin mutar nada.
 *
 * Mismo patrón de `jest.doMock` + `require()` síncrono que
 * `candidates-security.test.ts`, por la misma razón: orden de mockeo
 * explícito, sin depender del hoisting de `jest.mock`.
 */

type ChangePasswordModule = typeof import('../src/lib/actions/change-password');

describe('completeForcedPasswordChangeAction (SEG-02)', () => {
  const mockUserUpdate = jest.fn();
  let mockGetAuthContext: jest.Mock;
  let completeForcedPasswordChangeAction: ChangePasswordModule['completeForcedPasswordChangeAction'];

  beforeEach(() => {
    jest.resetModules();
    mockUserUpdate.mockReset();

    mockGetAuthContext = jest.fn();

    jest.doMock('next/headers', () => ({ headers: jest.fn().mockResolvedValue(new Map()) }));
    jest.doMock('@/lib/auth/guards', () => ({
      getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
      authErrorMessage: () => null,
    }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: { user: { update: mockUserUpdate } },
    }));
    jest.doMock('@/lib/auth/session', () => ({
      createSessionToken: jest.fn().mockResolvedValue('token'),
      setSessionCookieServer: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('@/lib/auth/sessions', () => ({ recordSession: jest.fn().mockResolvedValue(undefined) }));
    jest.doMock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

    const actions: ChangePasswordModule = require('../src/lib/actions/change-password');
    completeForcedPasswordChangeAction = actions.completeForcedPasswordChangeAction;
  });

  afterEach(() => {
    jest.dontMock('next/headers');
    jest.dontMock('@/lib/auth/guards');
    jest.dontMock('@/lib/prisma');
    jest.dontMock('@/lib/auth/session');
    jest.dontMock('@/lib/auth/sessions');
    jest.dontMock('@/lib/auth/audit');
  });

  it('rechaza la petición y no toca la base de datos cuando no hay cambio de contraseña pendiente', async () => {
    mockGetAuthContext.mockResolvedValue({ id: 'user-1', companyId: 'company-1', mustChangePassword: false });

    const result = await completeForcedPasswordChangeAction({ password: 'Nueva12345!', confirmPassword: 'Nueva12345!' });

    expect(result).toEqual({ success: false, error: 'No hay un cambio de contraseña pendiente' });
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('permite completar el cambio cuando sí hay un cambio de contraseña pendiente', async () => {
    mockGetAuthContext.mockResolvedValue({
      id: 'user-1',
      companyId: 'company-1',
      companyName: 'Empresa',
      email: 'user@empresa.cl',
      mustChangePassword: true,
    });
    mockUserUpdate.mockResolvedValue({
      id: 'user-1',
      role: 'ADMIN',
      email: 'user@empresa.cl',
      companyId: 'company-1',
      isSuperAdmin: false,
      sessionVersion: 1,
    });

    const result = await completeForcedPasswordChangeAction({ password: 'Nueva12345!', confirmPassword: 'Nueva12345!' });

    expect(result.success).toBe(true);
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
  });
});
