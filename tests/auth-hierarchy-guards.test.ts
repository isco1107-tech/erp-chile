import { assertCanManageTarget } from '@/lib/services/users.service';

/**
 * `guards.ts` importa `./session`, que a su vez importa `jose` (paquete
 * ESM-only) — cargar el módulo real bajo ts-jest revienta con "Unexpected
 * token export" (mismo motivo por el que `candidates-security.test.ts`
 * siempre mockea `@/lib/auth/guards` en vez de importarlo). Se mockean acá
 * `./session`/`./sessions`/`@/lib/prisma` (las únicas fuentes de I/O real que
 * `guards.ts` toca al cargarse) para poder requerir el módulo real y probar
 * `assertPasswordChangeNotPending`/`AuthError` sin reimplementarlos.
 */
type GuardsModule = typeof import('../src/lib/auth/guards');

describe('assertPasswordChangeNotPending (SEG-08)', () => {
  let assertPasswordChangeNotPending: GuardsModule['assertPasswordChangeNotPending'];
  let AuthError: GuardsModule['AuthError'];

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('@/lib/auth/session', () => ({ verifySessionToken: jest.fn() }));
    jest.doMock('@/lib/auth/sessions', () => ({ isSessionRevoked: jest.fn(), touchSession: jest.fn() }));
    jest.doMock('@/lib/prisma', () => ({ prisma: {} }));

    const guards: GuardsModule = require('../src/lib/auth/guards');
    assertPasswordChangeNotPending = guards.assertPasswordChangeNotPending;
    AuthError = guards.AuthError;
  });

  afterAll(() => {
    jest.dontMock('@/lib/auth/session');
    jest.dontMock('@/lib/auth/sessions');
    jest.dontMock('@/lib/prisma');
  });

  it('lanza AuthError 403 cuando hay un cambio de contraseña pendiente', () => {
    expect(() => assertPasswordChangeNotPending({ mustChangePassword: true })).toThrow(AuthError);
    try {
      assertPasswordChangeNotPending({ mustChangePassword: true });
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as InstanceType<GuardsModule['AuthError']>).status).toBe(403);
    }
  });

  it('no lanza cuando no hay cambio de contraseña pendiente', () => {
    expect(() => assertPasswordChangeNotPending({ mustChangePassword: false })).not.toThrow();
  });
});

/**
 * SEG-03: sin esto, `settings:users` alcanzaba para que un ADMIN reseteara la
 * contraseña de un OWNER, o para que cualquier CustomRole con ese permiso
 * actuara sobre una cuenta de plataforma (`isSuperAdmin`) que compartiera esa
 * empresa como hogar. La matriz actor→objetivo se prueba acá de forma
 * aislada — `resetUserTemporaryPassword`/`changeUserRole`/`toggleUserStatus`/
 * `deleteUser` solo le pasan el rol base real de la sesión y el target ya
 * leído de la base.
 */
describe('assertCanManageTarget (SEG-03)', () => {
  it('bloquea a un ADMIN actuando sobre un OWNER', () => {
    expect(() => assertCanManageTarget('ADMIN', { role: 'OWNER', isSuperAdmin: false })).toThrow(
      'Solo un Dueño (OWNER) puede administrar a otro Dueño'
    );
  });

  it('permite a un OWNER actuando sobre otro OWNER', () => {
    expect(() => assertCanManageTarget('OWNER', { role: 'OWNER', isSuperAdmin: false })).not.toThrow();
  });

  it('bloquea a cualquier actor (incluido OWNER) sobre una cuenta de plataforma', () => {
    expect(() => assertCanManageTarget('OWNER', { role: 'ADMIN', isSuperAdmin: true })).toThrow(
      'No se puede administrar una cuenta de plataforma desde la empresa'
    );
    expect(() => assertCanManageTarget('ADMIN', { role: 'ADMIN', isSuperAdmin: true })).toThrow(
      'No se puede administrar una cuenta de plataforma desde la empresa'
    );
  });

  it('permite a un ADMIN actuando sobre otro ADMIN/SALES/WAREHOUSE/ACCOUNTANT normales', () => {
    for (const role of ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTANT'] as const) {
      expect(() => assertCanManageTarget('ADMIN', { role, isSuperAdmin: false })).not.toThrow();
    }
  });

  it('un ADMIN con un CustomRole no elude la regla: la función siempre recibe el rol BASE real, nunca el permiso efectivo', () => {
    // La llamada ya recibe `actorRole` como el enum `Role` de la sesión
    // (`session.role`), no un permiso — así que un CustomRole con
    // `settings:users` otorgado a un SALES sigue bloqueado igual que un
    // ADMIN sin CustomRole.
    expect(() => assertCanManageTarget('SALES', { role: 'OWNER', isSuperAdmin: false })).toThrow(
      'Solo un Dueño (OWNER) puede administrar a otro Dueño'
    );
  });
});
