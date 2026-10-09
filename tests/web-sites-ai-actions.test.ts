import { proposeSiteDesignAction } from '@/modules/web-sites/actions/ai-designer.actions';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getWebSite } from '@/modules/web-sites/services/web-sites.service';
import { getProject } from '@/modules/projects/services/projects.service';
import { generateAgentText } from '@/modules/agents/services/gemini-agent';
import { DEFAULT_THEME } from '@/lib/web-sites/theme';
import { academyDesignSchema } from '@/lib/web-sites/ai-designer';

jest.mock('@/lib/auth/guards', () => ({ requireAuthWithPermission: jest.fn(), authErrorMessage: jest.fn(() => null) }));
jest.mock('@/lib/security/rate-limiter', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/modules/web-sites/services/web-sites.service', () => ({ getWebSite: jest.fn() }));
jest.mock('@/modules/projects/services/projects.service', () => ({ getProject: jest.fn() }));
jest.mock('@/modules/agents/services/gemini-agent', () => ({ generateAgentText: jest.fn() }));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));

const auth = jest.mocked(requireAuthWithPermission);
const generator = jest.mocked(generateAgentText);
const webSite = jest.mocked(getWebSite);
const project = jest.mocked(getProject);
const limiter = jest.mocked(checkRateLimit);
const current = { blocks: [], theme: DEFAULT_THEME };
const web = { target: 'web', resourceId: 'site-1', pageId: 'home', instruction: 'Mejora el sitio en móvil', current };
const env = { gemini: process.env.GEMINI_API_KEY, nvidia: process.env.NVIDIA_API_KEY };

beforeEach(() => {
  jest.resetAllMocks();
  auth.mockResolvedValue({ companyId: 'tenant-1', id: 'user-1' } as Awaited<ReturnType<typeof requireAuthWithPermission>>);
  limiter.mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: null, limit: 5 });
  webSite.mockResolvedValue({ name: 'Sitio propio', document: { pages: [] }, assets: [] } as unknown as NonNullable<Awaited<ReturnType<typeof getWebSite>>>);
  project.mockResolvedValue({ name: 'Evento propio' } as NonNullable<Awaited<ReturnType<typeof getProject>>>);
  process.env.GEMINI_API_KEY = 'test-placeholder';
  delete process.env.NVIDIA_API_KEY;
  generator.mockResolvedValue(JSON.stringify({ target: 'web', summary: 'Diseño nuevo', changes: ['Mejor lectura'], design: current }));
});
afterAll(() => {
  if (env.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = env.gemini;
  if (env.nvidia === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = env.nvidia;
});

it('exige permiso de escritura y busca el sitio dentro de la empresa de la sesión', async () => {
  expect((await proposeSiteDesignAction(web)).success).toBe(true);
  expect(auth).toHaveBeenCalledWith('websites:write');
  expect(webSite).toHaveBeenCalledWith('tenant-1', 'site-1');
  expect(generator).toHaveBeenCalledTimes(1);
  expect(generator.mock.calls[0][2]).toBe('reasoning');
  expect(generator.mock.calls[0][3]).toHaveProperty('geminiModel');
});
it('no llama al proveedor cuando el sitio pertenece a otra empresa o no existe', async () => {
  webSite.mockResolvedValue(null);
  expect((await proposeSiteDesignAction(web)).success).toBe(false);
  expect(generator).not.toHaveBeenCalled();
});
it('rechaza solicitudes sin permiso antes de usar IA', async () => {
  auth.mockRejectedValue(new Error('Denied'));
  expect((await proposeSiteDesignAction(web)).success).toBe(false);
  expect(generator).not.toHaveBeenCalled();
});
it.each(['event', 'event-studio'] as const)('comprueba la propiedad del recurso %s', async (target) => {
  project.mockResolvedValue(null);
  const eventCurrent = target === 'event' ? { publicTagline: '', publicDescription: '', publicAccent: 'gold', sponsorExclusivityNote: '' } : current;
  expect((await proposeSiteDesignAction({ ...web, target, current: eventCurrent })).success).toBe(false);
  expect(auth).toHaveBeenCalledWith('projects:write');
  expect(project).toHaveBeenCalledWith('tenant-1', 'site-1');
  expect(generator).not.toHaveBeenCalled();
});
it('el asistente de academia necesita academy:manage y no lee fichas de alumnas', async () => {
  const design = academyDesignSchema.parse({});
  generator.mockResolvedValue(JSON.stringify({ target: 'academy', summary: 'Propuesta', changes: ['Texto más claro'], design }));
  expect((await proposeSiteDesignAction({ target: 'academy', instruction: 'Mejora mi academia', current: design })).success).toBe(true);
  expect(auth).toHaveBeenCalledWith('academy:manage');
  expect(project).not.toHaveBeenCalled();
  expect(webSite).not.toHaveBeenCalled();
});
it('limita solicitudes por empresa antes de usar la cuota compartida', async () => {
  limiter.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 1000, limit: 5 });
  expect((await proposeSiteDesignAction(web)).success).toBe(false);
  expect(generator).not.toHaveBeenCalled();
});
it('informa que no hay claves sin exponer valores del entorno', async () => {
  delete process.env.GEMINI_API_KEY;
  expect(await proposeSiteDesignAction(web)).toEqual({ success: false, error: 'El asistente necesita GEMINI_API_KEY o NVIDIA_API_KEY configurada en el servidor.' });
  expect(generator).not.toHaveBeenCalled();
});
it('rechaza una respuesta de un objetivo distinto', async () => {
  generator.mockResolvedValue('{}');
  expect((await proposeSiteDesignAction(web)).success).toBe(false);
});
it('no devuelve mensajes internos del proveedor que puedan contener credenciales', async () => {
  generator.mockRejectedValue(new Error('Provider failure with private details'));
  const result = await proposeSiteDesignAction(web);
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private details');
});
