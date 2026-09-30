/**
 * @jest-environment node
 */
jest.mock('@/modules/mcp/services/tokens.service', () => ({
  resolveMcpSession: jest.fn(),
}));
jest.mock('@/modules/agents/services/copilot-tools', () => ({
  getSalesMarginSummary: jest.fn(async (companyId: string) => ({ companyId })),
  getOverdueBalances: jest.fn(async (companyId: string) => ({ companyId })),
  getVatProjection: jest.fn(async (companyId: string) => ({ companyId })),
  formatToolResultForPrompt: jest.fn(() => 'resumen'),
}));

import { POST } from '@/app/api/mcp/route';
import { resolveMcpSession } from '@/modules/mcp/services/tokens.service';
import { clearAllRateLimits } from '@/lib/security/rate-limiter';

/**
 * Prueba de punta a punta del conector: el handler REAL de `mcp-handler` y el
 * SDK MCP real, hablando JSON-RPC por HTTP como lo hace un Claude/ChatGPT
 * personal. Lo único simulado es la base de datos (`resolveMcpSession`).
 */

const session = {
  companyId: 'empresa-real',
  companyName: 'Real SpA',
  userId: 'u1',
  userName: 'Ana',
  permissions: ['sales:read'] as never,
  features: {} as never,
};

function rpc(body: unknown, token?: string) {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function readRpc(response: Response) {
  const text = await response.text();
  const dataLine = text.split('\n').find((line) => line.startsWith('data:'));
  return JSON.parse(dataLine ? dataLine.slice(5) : text);
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
};

describe('POST /api/mcp — handshake real', () => {
  afterEach(() => {
    jest.clearAllMocks();
    clearAllRateLimits();
  });

  it('sin token responde 401', async () => {
    const response = await POST(rpc(initialize));
    expect(response.status).toBe(401);
  });

  it('con un token que no resuelve a una sesión responde 401', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue(null);
    const response = await POST(rpc(initialize, 'aether_mcp_malo'));
    expect(response.status).toBe(401);
  });

  it('con token válido: initialize, tools/list y tools/call funcionan', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue(session);

    const init = await POST(rpc(initialize, 'aether_mcp_ok'));
    expect(init.status).toBe(200);
    const initBody = await readRpc(init);
    expect(initBody.result.serverInfo.name).toBe('Aether ERP');

    const list = await POST(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 'aether_mcp_ok'));
    const listBody = await readRpc(list);
    const names = listBody.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(names).toEqual(['getOverdueBalances', 'getSalesMarginSummary', 'getVatProjection', 'search_manual', 'whoami']);

    const call = await POST(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whoami', arguments: {} } }, 'aether_mcp_ok'));
    const callBody = await readRpc(call);
    expect(callBody.result.isError).toBeFalsy();
    expect(callBody.result.content[0].text).toContain('Real SpA');
  });

  it('rechaza argumentos fuera de rango sin llegar a la consulta (mes 13, fecha inválida)', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue({ ...session, permissions: ['sales:read', 'purchases:read'] as never });

    const vat = await readRpc(
      await POST(rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'getVatProjection', arguments: { month: 13 } } }, 'aether_mcp_ok'))
    );
    expect(vat.error ?? vat.result?.isError).toBeTruthy();

    const margin = await readRpc(
      await POST(rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'getSalesMarginSummary', arguments: { from: 'hoy', to: '2026-01-31' } } }, 'aether_mcp_ok'))
    );
    expect(margin.error ?? margin.result?.isError).toBeTruthy();
  });

  it('tras 20 tokens inválidos la IP queda frenada aunque el token sea bueno', async () => {
    jest.mocked(resolveMcpSession).mockResolvedValue(null);
    for (let i = 0; i < 20; i += 1) await POST(rpc(initialize, `malo-${i}`));
    jest.mocked(resolveMcpSession).mockClear();
    jest.mocked(resolveMcpSession).mockResolvedValue(session);
    const response = await POST(rpc(initialize, 'aether_mcp_ok'));
    expect(response.status).toBe(401);
    expect(resolveMcpSession).not.toHaveBeenCalled();
  });
});
