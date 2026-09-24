import { prisma } from '@/lib/prisma';

/** SEG-05: cambiar de empresa deja una sesión registrada (revocable) y revoca la anterior. */

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ get: () => ({ value: 'token-anterior' }) })),
  headers: jest.fn(async () => new Map([['user-agent', 'jest'], ['x-forwarded-for', '10.0.0.9']])),
}));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({
  getAuthContext: jest.fn(async () => ({ id: 'u1', companyId: 'home', companyName: 'Hogar' })),
  AuthError: class AuthError extends Error {},
}));
jest.mock('@/lib/auth/session', () => ({
  createSessionToken: jest.fn(async () => 'token-nuevo'),
  setSessionCookieServer: jest.fn(),
}));
jest.mock('@/lib/auth/sessions', () => ({
  recordSession: jest.fn(),
  revokeSessionByToken: jest.fn(async () => undefined),
}));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
// La lista de IP (SEG-07) tiene su propio test; acá la empresa destino no tiene lista.
jest.mock('@/lib/auth/ip-allowlist-guard', () => ({ checkIpAllowlist: jest.fn(async () => null) }));

import { recordSession, revokeSessionByToken } from '@/lib/auth/sessions';
import { switchActiveCompanyAction } from '@/lib/auth/actions/switch-company.actions';

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('switchActiveCompanyAction (SEG-05)', () => {
  it('registra la sesión nueva en la empresa destino y revoca la anterior', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u1', role: 'ADMIN', email: 'a@b.cl', companyId: 'home', isSuperAdmin: false, sessionVersion: 0,
    } as never);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue({
      company: { businessName: 'Filial', features: { hasMultiCompany: true } },
    } as never);

    await switchActiveCompanyAction('filial');

    expect(recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', companyId: 'filial', token: 'token-nuevo', ipAddress: '10.0.0.9' })
    );
    expect(revokeSessionByToken).toHaveBeenCalledWith('token-anterior');
  });

  it('sin acceso a la empresa destino no emite ni revoca nada', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u1', role: 'ADMIN', email: 'a@b.cl', companyId: 'home', isSuperAdmin: false, sessionVersion: 0,
    } as never);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);

    const result = await switchActiveCompanyAction('ajena');

    expect(result).toEqual({ success: false, error: 'No tienes acceso a esa empresa' });
    expect(recordSession).not.toHaveBeenCalled();
    expect(revokeSessionByToken).not.toHaveBeenCalled();
  });
});
