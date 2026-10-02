jest.mock('@/modules/mcp/services/tokens.service', () => ({
  resolveMcpSession: jest.fn(),
}));
jest.mock('@/modules/agents/services/copilot-tools', () => ({
  getSalesMarginSummary: jest.fn(async (companyId: string) => ({ companyId, netSales: 1000 })),
  getOverdueBalances: jest.fn(async (companyId: string) => ({ companyId })),
  getVatProjection: jest.fn(async (companyId: string) => ({ companyId })),
  formatToolResultForPrompt: jest.fn(() => 'resumen'),
}));

import { registerMcpTools } from '@/modules/mcp/tools';
import { resolveMcpSession } from '@/modules/mcp/services/tokens.service';
import * as copilotTools from '@/modules/agents/services/copilot-tools';

/**
 * El conector MCP expone datos reales de la empresa a una IA externa — dos
 * cosas tienen que ser ciertas sin excepción: (1) el companyId que se
 * consulta es SIEMPRE el de la sesión resuelta del token, nunca algo que
 * venga en los argumentos de la tool (el modelo no puede "pedir" otra
 * empresa), y (2) sin el permiso que la tool exige, la respuesta es un
 * rechazo limpio, no datos ni un error crudo de Prisma.
 */

function fakeServer() {
  const handlers = new Map<string, (args: Record<string, unknown>, ctx: unknown) => Promise<unknown>>();
  return {
    registerTool: jest.fn((name: string, _config: unknown, handler: never) => {
      handlers.set(name, handler as never);
    }),
    handlers,
  };
}

function ctxWithToken(token: string) {
  return { http: { authInfo: { token } } };
}

describe('registerMcpTools — aislamiento y permisos', () => {
  afterEach(() => jest.clearAllMocks());

  it('whoami sin sesión válida (token revocado/inválido) lanza en vez de responder', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue(null);
    const server = fakeServer();
    registerMcpTools(server as never);
    await expect(server.handlers.get('whoami')!({}, ctxWithToken('bad'))).rejects.toThrow();
  });

  it('getSalesMarginSummary con el permiso correspondiente: llama al ejecutor con el companyId de LA SESIÓN, ignorando cualquier companyId en los args', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue({
      companyId: 'empresa-real',
      companyName: 'Real',
      userId: 'u1',
      userName: 'Ana',
      permissions: ['sales:read'] as never,
      features: {} as never,
    });
    const server = fakeServer();
    registerMcpTools(server as never);

    const result = (await server.handlers.get('getSalesMarginSummary')!(
      { from: '2026-01-01', to: '2026-01-31', companyId: 'empresa-ajena' },
      ctxWithToken('good')
    )) as { isError?: boolean };

    expect(copilotTools.getSalesMarginSummary).toHaveBeenCalledWith('empresa-real', { from: '2026-01-01', to: '2026-01-31', companyId: 'empresa-ajena' });
    expect(result.isError).toBeUndefined();
  });

  it('getSalesMarginSummary SIN el permiso: rechaza sin llamar al ejecutor', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue({
      companyId: 'c1',
      companyName: 'C1',
      userId: 'u1',
      userName: 'Ana',
      permissions: [] as never,
      features: {} as never,
    });
    const server = fakeServer();
    registerMcpTools(server as never);

    const result = (await server.handlers.get('getSalesMarginSummary')!({ from: '2026-01-01', to: '2026-01-31' }, ctxWithToken('good'))) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('sales:read');
    expect(copilotTools.getSalesMarginSummary).not.toHaveBeenCalled();
  });

  it('search_manual no exige ningún permiso de negocio (siempre disponible)', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue({
      companyId: 'c1',
      companyName: 'C1',
      userId: 'u1',
      userName: 'Ana',
      permissions: [] as never,
      features: {} as never,
    });
    const server = fakeServer();
    registerMcpTools(server as never);

    const result = (await server.handlers.get('search_manual')!({}, ctxWithToken('good'))) as { content: Array<{ text: string }> };
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it('registra exactamente las tools esperadas (whoami, search_manual y las 6 de datos)', () => {
    const server = fakeServer();
    registerMcpTools(server as never);
    expect([...server.handlers.keys()].sort()).toEqual(
      [
        'findProducts',
        'getContactBalance',
        'getLowStockProducts',
        'getOverdueBalances',
        'getSalesMarginSummary',
        'getVatProjection',
        'search_manual',
        'whoami',
      ].sort()
    );
  });
});
