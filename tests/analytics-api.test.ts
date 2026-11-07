jest.mock('@/lib/auth/guards', () => ({
  requireAuthWithPermission: jest.fn(),
  authErrorMessage: (error: unknown) => error instanceof Error && ['AuthError', 'ModuleNotEnabledError'].includes(error.name) ? error.message : null,
  AuthError: class AuthError extends Error {
    constructor(message: string, public status: number) { super(message); this.name = 'AuthError'; }
  },
}));
jest.mock('@/modules/analytics/service', () => ({ analyticsSnapshot: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
import { GET } from '@/app/api/analytics/route';
import { AuthError, requireAuthWithPermission, type AuthContext } from '@/lib/auth/guards';
import { analyticsSnapshot } from '@/modules/analytics/service';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';
import { resolvePermissions } from '@/lib/auth/effective-permissions';
import type { AnalyticsSnapshot } from '@/lib/analytics/types';

const auth = jest.mocked(requireAuthWithPermission);
const snapshot = jest.mocked(analyticsSnapshot);
const request = (query = '') => new Request(`http://localhost/api/analytics${query}`);
beforeEach(() => jest.resetAllMocks());

it('rechaza sesiones vencidas sin consultar registros y sin caché', async () => {
  auth.mockRejectedValue(new AuthError('Sesión vencida', 401));
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(snapshot).not.toHaveBeenCalled();
});
it.each(['SALES', 'WAREHOUSE', 'ACCOUNTANT'] as const)('rechaza el rol %s incluso si otro guard concediera el permiso', async (role) => {
  auth.mockResolvedValue({ role, companyId: 'a' } as AuthContext);
  expect((await GET(request())).status).toBe(403);
  expect(snapshot).not.toHaveBeenCalled();
});
it.each(['analytics', 'science'])('consulta %s solo con el contexto autenticado y su permiso propio', async (module) => {
  const context = { role: 'ADMIN', companyId: 'a' } as AuthContext;
  auth.mockResolvedValue(context);
  snapshot.mockResolvedValue({ companyId: 'a' } as AnalyticsSnapshot);
  const response = await GET(request(`?module=${module}&days=7`));
  expect(response.status).toBe(200);
  expect(auth).toHaveBeenCalledWith(module === 'science' ? 'science:view' : 'analytics:view');
  expect(snapshot).toHaveBeenCalledWith(context, module, 7);
  expect(response.headers.get('Vary')).toBe('Cookie');
});
it.each(['?companyId=b', '?days=365', '?module=other'])('rechaza parámetros no autorizados: %s', async (query) => {
  expect((await GET(request(query))).status).toBe(400);
  expect(snapshot).not.toHaveBeenCalled();
});
it('un módulo revocado se rechaza antes de consultar datos', async () => {
  const error = new Error('Módulo desactivado'); error.name = 'ModuleNotEnabledError';
  auth.mockRejectedValue(error);
  expect((await GET(request())).status).toBe(403);
  expect(snapshot).not.toHaveBeenCalled();
});
it('descarta permisos ejecutivos delegados a roles operativos y respeta cada interruptor', () => {
  for (const role of ['SALES', 'WAREHOUSE', 'ACCOUNTANT'] as const) {
    expect(resolvePermissions({ role, customRolePermissions: ['analytics:view', 'science:view'], features: { ...DEFAULT_FEATURES, hasDataAnalytics: true, hasDataScience: true } })).toEqual([]);
  }
  expect(resolvePermissions({ role: 'ADMIN', customRolePermissions: null, features: { ...DEFAULT_FEATURES, hasDataScience: true } })).toContain('science:view');
  expect(resolvePermissions({ role: 'OWNER', customRolePermissions: null, features: DEFAULT_FEATURES })).not.toContain('analytics:view');
});
