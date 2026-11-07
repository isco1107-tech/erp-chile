jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(),
  authErrorMessage: (error: unknown) => error instanceof Error && error.name === 'AuthError' ? error.message : null,
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); this.name = 'AuthError'; }
  },
}));
jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('@/lib/auth/audit', () => ({ getRequestIp: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/supersuite', () => ({ registrarUsoSupersuite: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
import { updateAnalyticsModulesAction } from '@/modules/analytics/actions';
import { requireAuthWithPermission, type AuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

const auth = jest.mocked(requireAuthWithPermission);
beforeEach(() => jest.resetAllMocks());
it('no permite activar por un rol operativo aunque tenga settings:company personalizado', async () => {
  auth.mockResolvedValue({ role: 'SALES', companyId: 'a' } as AuthContext);
  const result = await updateAnalyticsModulesAction({ analytics: true, science: true });
  expect(result.success).toBe(false);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it('rechaza selección de otra empresa o flags de otros módulos', async () => {
  auth.mockResolvedValue({ role: 'ADMIN', companyId: 'a' } as AuthContext);
  expect((await updateAnalyticsModulesAction({ analytics: true, science: true, companyId: 'b' })).success).toBe(false);
  expect((await updateAnalyticsModulesAction({ analytics: true, science: true, hasAccounting: true })).success).toBe(false);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it('un fallo de persistencia no informa activación exitosa', async () => {
  auth.mockResolvedValue({ role: 'ADMIN', companyId: 'a' } as AuthContext);
  jest.mocked(prisma.$transaction).mockRejectedValue(new Error('db unavailable'));
  expect((await updateAnalyticsModulesAction({ analytics: true, science: false })).success).toBe(false);
});
