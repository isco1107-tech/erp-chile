/**
 * SEG-07: `checkIpAllowlist` solo se llamaba al emitir la sesión (login,
 * 2FA, invitación) — una vez emitido el JWT, ni `getAuthContext()` (usado en
 * cada request) ni el cambio de empresa (`switchActiveCompanyAction`)
 * revalidaban la IP contra la política de la empresa EFECTIVA. Una sesión
 * abierta desde una red permitida seguía operando desde cualquier otra, y
 * activar una empresa con lista más estricta la ignoraba por completo.
 *
 * Mismo patrón de `jest.doMock` + `require()` síncrono que
 * `auth-hierarchy-guards.test.ts`: `guards.ts` importa `./session` (que
 * carga `jose`, ESM-only) así que se mockean las fuentes de I/O reales para
 * poder requerir el módulo real y ejercer `getAuthContext()` completo.
 */
type GuardsModule = typeof import('../src/lib/auth/guards');

const baseUser = {
  id: 'user-1',
  role: 'ADMIN' as const,
  email: 'user@empresa.cl',
  name: 'Usuario Uno',
  companyId: 'company-1',
  isSuperAdmin: false,
  isActive: true,
  mustChangePassword: false,
  sessionVersion: 1,
  customRole: null,
  company: {
    businessName: 'Empresa Uno',
    logoUrl: null,
    backgroundUrl: null,
    brandPalette: [],
    status: 'ACTIVE' as const,
    planName: 'PRO',
    maxUsers: 10,
    maxWarehouses: 3,
    features: null,
    settings: null as { ipAllowlistEnabled: boolean; ipAllowlist: string[] } | null,
  },
};

describe('getAuthContext revalida la lista de IP en cada lectura (SEG-07)', () => {
  const mockCookiesGet = jest.fn();
  const mockHeadersGet = jest.fn();
  const mockVerifySessionToken = jest.fn();
  const mockUserFindUnique = jest.fn();
  let getAuthContext: GuardsModule['getAuthContext'];
  let AuthError: GuardsModule['AuthError'];

  beforeEach(() => {
    jest.resetModules();
    mockCookiesGet.mockReset();
    mockHeadersGet.mockReset();
    mockVerifySessionToken.mockReset();
    mockUserFindUnique.mockReset();

    jest.doMock('next/headers', () => ({
      cookies: jest.fn().mockResolvedValue({ get: (name: string) => mockCookiesGet(name) }),
      headers: jest.fn().mockResolvedValue({ get: (name: string) => mockHeadersGet(name) }),
    }));
    jest.doMock('@/lib/auth/session', () => ({
      verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
    }));
    jest.doMock('@/lib/auth/sessions', () => ({
      isSessionRevoked: jest.fn().mockResolvedValue(false),
      touchSession: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: {
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        companySettings: { findUnique: jest.fn() },
      },
    }));

    const guards: GuardsModule = require('../src/lib/auth/guards');
    getAuthContext = guards.getAuthContext;
    AuthError = guards.AuthError;

    mockCookiesGet.mockReturnValue({ value: 'token-abc' });
    mockVerifySessionToken.mockResolvedValue({ userId: 'user-1', sessionVersion: 1 });
  });

  afterEach(() => {
    jest.dontMock('next/headers');
    jest.dontMock('@/lib/auth/session');
    jest.dontMock('@/lib/auth/sessions');
    jest.dontMock('@/lib/prisma');
  });

  it('rechaza la request cuando la IP no está en la lista de la empresa', async () => {
    mockHeadersGet.mockImplementation((name: string) => (name === 'x-forwarded-for' ? '203.0.113.9' : null));
    mockUserFindUnique
      .mockResolvedValueOnce({
        ...baseUser,
        company: { ...baseUser.company, settings: { ipAllowlistEnabled: true, ipAllowlist: ['10.0.0.0/24'] } },
      })
      .mockResolvedValueOnce({ sessionVersion: 1 });

    let caught: unknown;
    try {
      await getAuthContext();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthError);
    // Error específico: el dashboard lo usa para mandar a /login?reason=ip con el motivo.
    expect((caught as Error).constructor.name).toBe('IpNotAllowedError');
    expect((caught as InstanceType<GuardsModule['AuthError']>).status).toBe(403);
    expect((caught as InstanceType<GuardsModule['AuthError']>).message).toMatch(/dirección IP/i);
  });

  it('deja pasar la request cuando la empresa no tiene lista configurada (vacía/desactivada)', async () => {
    mockHeadersGet.mockImplementation((name: string) => (name === 'x-forwarded-for' ? '203.0.113.9' : null));
    mockUserFindUnique
      .mockResolvedValueOnce({
        ...baseUser,
        company: { ...baseUser.company, settings: { ipAllowlistEnabled: false, ipAllowlist: [] } },
      })
      .mockResolvedValueOnce({ sessionVersion: 1 });

    const context = await getAuthContext();
    expect(context.id).toBe('user-1');
    expect(context.companyId).toBe('company-1');
  });

  it('deja pasar la request cuando la IP sí está en la lista', async () => {
    mockHeadersGet.mockImplementation((name: string) => (name === 'x-forwarded-for' ? '10.0.0.5' : null));
    mockUserFindUnique
      .mockResolvedValueOnce({
        ...baseUser,
        company: { ...baseUser.company, settings: { ipAllowlistEnabled: true, ipAllowlist: ['10.0.0.0/24'] } },
      })
      .mockResolvedValueOnce({ sessionVersion: 1 });

    const context = await getAuthContext();
    expect(context.companyId).toBe('company-1');
  });
});
