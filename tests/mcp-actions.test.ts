jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({
  getAuthContext: jest.fn(),
  requireAuthWithPermission: jest.fn(),
  authErrorMessage: jest.fn(() => null),
}));
jest.mock('@/modules/mcp/services/tokens.service', () => {
  const actual = jest.requireActual('@/modules/mcp/services/tokens.service');
  return { ...actual, createPersonalToken: jest.fn() };
});

import { prisma } from '@/lib/prisma';
import { getAuthContext, requireAuthWithPermission } from '@/lib/auth/guards';
import { createMcpTokenAction, listMcpTokensAction } from '@/modules/mcp/actions/mcp-tokens.actions';
import { updateMcpConnectorEnabledAction } from '@/modules/mcp/actions/mcp-settings.actions';
import { createPersonalToken } from '@/modules/mcp/services/tokens.service';

/**
 * Autoservicio con una sola puerta real: nadie puede generarse un token
 * mientras la empresa no haya activado `mcpConnectorEnabled` — sin esto,
 * cualquiera podría conectar su IA personal aunque el dueño nunca lo haya
 * aprobado.
 */

const session = { id: 'u1', companyId: 'c1', email: 'ana@empresa.cl' };

afterEach(() => jest.clearAllMocks());

describe('createMcpTokenAction', () => {
  it('rechaza crear un token si la empresa no activó el conector', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(session as never);
    jest.spyOn(prisma.companySettings, 'findUnique').mockResolvedValue({ mcpConnectorEnabled: false } as never);

    const result = await createMcpTokenAction({ name: 'Claude personal' });

    expect(result).toEqual({ success: false, error: expect.stringContaining('no ha activado') });
    expect(createPersonalToken).not.toHaveBeenCalled();
  });

  it('con el conector activo, crea el token para la empresa/usuario de la sesión', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(session as never);
    jest.spyOn(prisma.companySettings, 'findUnique').mockResolvedValue({ mcpConnectorEnabled: true } as never);
    jest.mocked(createPersonalToken).mockResolvedValue({ id: 'tok-1', token: 'aether_mcp_abc' });

    const result = await createMcpTokenAction({ name: 'Claude personal' });

    expect(result).toEqual({ success: true, data: { id: 'tok-1', token: 'aether_mcp_abc' }, message: expect.any(String) });
    expect(createPersonalToken).toHaveBeenCalledWith('c1', 'u1', 'Claude personal');
  });

  it('rechaza un nombre vacío antes de tocar la base', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(session as never);
    jest.spyOn(prisma.companySettings, 'findUnique').mockResolvedValue({ mcpConnectorEnabled: true } as never);

    const result = await createMcpTokenAction({ name: '  ' });

    expect(result.success).toBe(false);
    expect(createPersonalToken).not.toHaveBeenCalled();
  });
});

describe('listMcpTokensAction', () => {
  it('lista solo los tokens de la empresa/usuario de la sesión', async () => {
    jest.mocked(getAuthContext).mockResolvedValue(session as never);
    const findManySpy = jest.spyOn(prisma.mcpPersonalToken, 'findMany').mockResolvedValue([]);

    await listMcpTokensAction();

    expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'c1', userId: 'u1', revokedAt: null } }));
  });
});

describe('updateMcpConnectorEnabledAction', () => {
  it('exige settings:company (falla si requireAuthWithPermission rechaza)', async () => {
    jest.mocked(requireAuthWithPermission).mockRejectedValue(new Error('No autorizado'));

    const result = await updateMcpConnectorEnabledAction({ enabled: true });

    expect(result.success).toBe(false);
  });

  it('con el permiso, activa el conector para la empresa de la sesión', async () => {
    jest.mocked(requireAuthWithPermission).mockResolvedValue(session as never);
    const updateSpy = jest.spyOn(prisma.companySettings, 'update').mockResolvedValue({ id: 'cs1', mcpConnectorEnabled: true } as never);

    const result = await updateMcpConnectorEnabledAction({ enabled: true });

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'c1' }, data: { mcpConnectorEnabled: true } }));
    expect(result).toEqual({ success: true, data: { enabled: true }, message: expect.any(String) });
  });
});
