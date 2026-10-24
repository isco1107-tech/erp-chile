jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(),
  authErrorMessage: (error: unknown) =>
    error instanceof Error && error.name === 'AuthError' ? error.message : null,
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  },
}));
jest.mock('@/modules/control/service', () => ({ controlSnapshot: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
import { GET } from '@/app/api/control/route';
import { requireAuthWithPermission, AuthError } from '@/lib/auth/guards';
import { controlSnapshot } from '@/modules/control/service';
const auth = jest.mocked(requireAuthWithPermission);
const snapshot = jest.mocked(controlSnapshot);
beforeEach(() => jest.clearAllMocks());
it('rechaza sesiones ausentes antes de consultar datos', async () => {
  auth.mockRejectedValue(new AuthError('Inicia sesión', 401));
  const response = await GET();
  expect(response.status).toBe(401);
  expect(snapshot).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('un administrador no obtiene la vista del dueño', async () => {
  auth.mockResolvedValue({ role: 'ADMIN', companyId: 'otra' } as Awaited<
    ReturnType<typeof requireAuthWithPermission>
  >);
  expect((await GET()).status).toBe(403);
  expect(snapshot).not.toHaveBeenCalled();
});
it('consulta exclusivamente el contexto autenticado del dueño sin caché', async () => {
  const context = { role: 'OWNER', companyId: 'empresa-propia' } as Awaited<
    ReturnType<typeof requireAuthWithPermission>
  >;
  auth.mockResolvedValue(context);
  snapshot.mockResolvedValue({
    at: '2026-10-24T12:00:00Z',
    company: 'Empresa',
    user: 'Dueño',
    salesToday: 0,
    salesMonth: 0,
    documentsToday: 0,
    incomeToday: 0,
    expenseToday: 0,
    openRegisters: 0,
    registers: [],
    activity: [],
  });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(auth).toHaveBeenCalledWith('settings:company');
  expect(snapshot).toHaveBeenCalledWith(context);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
