/**
 * Multiempresa: la empresa que pide la sesión (`activeCompanyId`) se revalida
 * contra la base en cada lectura. Si esa membresía ya no sirve, el contexto
 * vuelve a la empresa hogar Y LO DICE (`activeCompanyUnavailable`), para que
 * el panel avise en vez de dejar a la persona trabajando en la empresa
 * equivocada sin saberlo.
 */
export {};

type GuardsModule = typeof import("../src/lib/auth/guards");

const company = (id: string, name: string, features: Record<string, boolean> | null = null) => ({
  id,
  businessName: name,
  logoUrl: null,
  backgroundUrl: null,
  brandPalette: [],
  status: 'ACTIVE' as const,
  planName: 'PRO',
  maxUsers: 10,
  maxWarehouses: 3,
  features,
  settings: null,
});

const homeUser = {
  id: 'user-1',
  role: 'ADMIN' as const,
  email: 'contadora@estudio.cl',
  name: 'Contadora',
  companyId: 'hogar',
  isSuperAdmin: false,
  isActive: true,
  mustChangePassword: false,
  sessionVersion: 1,
  customRole: null,
  company: company('hogar', 'Estudio Contable'),
};

describe('getAuthContext con empresa activa distinta de la hogar', () => {
  const mockVerifySessionToken = jest.fn();
  const mockUserFindUnique = jest.fn();
  const mockMembershipFindUnique = jest.fn();
  let getAuthContext: GuardsModule['getAuthContext'];

  beforeEach(() => {
    jest.resetModules();
    mockVerifySessionToken.mockReset();
    mockUserFindUnique.mockReset();
    mockMembershipFindUnique.mockReset();

    jest.doMock('next/headers', () => ({
      cookies: jest.fn().mockResolvedValue({ get: () => ({ value: 'token-abc' }) }),
      headers: jest.fn().mockResolvedValue({ get: () => null }),
    }));
    jest.doMock('@/lib/auth/session', () => ({ verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args) }));
    jest.doMock('@/lib/auth/sessions', () => ({
      isSessionRevoked: jest.fn().mockResolvedValue(false),
      touchSession: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: {
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        companyMembership: { findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args) },
        companySettings: { findUnique: jest.fn() },
      },
    }));

    getAuthContext = (require('../src/lib/auth/guards') as GuardsModule).getAuthContext;
    mockUserFindUnique.mockResolvedValueOnce(homeUser).mockResolvedValueOnce({ sessionVersion: 1 });
  });

  afterEach(() => {
    jest.dontMock('next/headers');
    jest.dontMock('@/lib/auth/session');
    jest.dontMock('@/lib/auth/sessions');
    jest.dontMock('@/lib/prisma');
  });

  it('abre la empresa de la membresía cuando tiene Multiempresa', async () => {
    mockVerifySessionToken.mockResolvedValue({ userId: 'user-1', sessionVersion: 1, activeCompanyId: 'cliente' });
    mockMembershipFindUnique.mockResolvedValue({
      companyId: 'cliente',
      role: 'ACCOUNTANT',
      customRole: null,
      company: company('cliente', 'Cliente SpA', { hasMultiCompany: true }),
    });

    const context = await getAuthContext();
    expect(context.companyId).toBe('cliente');
    expect(context.role).toBe('ACCOUNTANT');
    expect(context.activeCompanyUnavailable).toBe(false);
  });

  it('si la membresía ya no existe, vuelve a la hogar y lo marca', async () => {
    mockVerifySessionToken.mockResolvedValue({ userId: 'user-1', sessionVersion: 1, activeCompanyId: 'cliente' });
    mockMembershipFindUnique.mockResolvedValue(null);

    const context = await getAuthContext();
    expect(context.companyId).toBe('hogar');
    expect(context.companyName).toBe('Estudio Contable');
    expect(context.activeCompanyUnavailable).toBe(true);
  });

  it('si a la otra empresa le apagaron Multiempresa, vuelve a la hogar y lo marca', async () => {
    mockVerifySessionToken.mockResolvedValue({ userId: 'user-1', sessionVersion: 1, activeCompanyId: 'cliente' });
    mockMembershipFindUnique.mockResolvedValue({
      companyId: 'cliente',
      role: 'ADMIN',
      customRole: null,
      company: company('cliente', 'Cliente SpA', { hasMultiCompany: false }),
    });

    const context = await getAuthContext();
    expect(context.companyId).toBe('hogar');
    expect(context.role).toBe('ADMIN');
    expect(context.activeCompanyUnavailable).toBe(true);
  });

  it('una sesión en la empresa hogar no marca nada', async () => {
    mockVerifySessionToken.mockResolvedValue({ userId: 'user-1', sessionVersion: 1 });
    const context = await getAuthContext();
    expect(context.companyId).toBe('hogar');
    expect(context.activeCompanyUnavailable).toBe(false);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });
});
