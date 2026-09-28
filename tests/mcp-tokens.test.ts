import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashMcpToken, resolveMcpSession, createPersonalToken, revokePersonalToken, TooManyTokensError } from '@/modules/mcp/services/tokens.service';

/**
 * Conector MCP: `resolveMcpSession` es la única puerta de entrada — la usan
 * tanto `withMcpAuth` (en `app/api/mcp/route.ts`) como cada tool en cada
 * llamada, así que un fallo acá compromete todo el conector. Se prueba que
 * cierra el acceso de inmediato ante cualquiera de las señales que también
 * cierran `getAuthContext()`: token revocado, usuario desactivado, empresa
 * suspendida, y — la señal propia de este conector — la empresa habiendo
 * apagado `mcpConnectorEnabled`.
 */

const baseRecord = {
  id: 'tok-1',
  companyId: 'c1',
  userId: 'u1',
  revokedAt: null as Date | null,
  user: { id: 'u1', name: 'Ana', isActive: true, role: 'ADMIN' as Role, companyId: 'c1' as string | null, customRole: null },
  company: {
    id: 'c1',
    businessName: 'Empresa Ejemplo',
    status: 'ACTIVE' as const,
    features: {},
    settings: { mcpConnectorEnabled: true },
  },
};

function mockFindUnique(overrides: Partial<typeof baseRecord> = {}) {
  jest.spyOn(prisma.mcpPersonalToken, 'findUnique').mockResolvedValue({ ...baseRecord, ...overrides } as never);
  jest.spyOn(prisma.mcpPersonalToken, 'update').mockResolvedValue({} as never);
}

afterEach(() => jest.restoreAllMocks());

describe('hashMcpToken', () => {
  it('es determinístico y distinto para tokens distintos', () => {
    expect(hashMcpToken('abc')).toBe(hashMcpToken('abc'));
    expect(hashMcpToken('abc')).not.toBe(hashMcpToken('abd'));
  });
});

describe('resolveMcpSession', () => {
  it('token válido: devuelve la sesión con permisos resueltos', async () => {
    mockFindUnique();
    const session = await resolveMcpSession('raw-token');
    expect(session).not.toBeNull();
    expect(session?.companyId).toBe('c1');
    expect(session?.userId).toBe('u1');
    expect(session?.userName).toBe('Ana');
  });

  it('token que no existe: null', async () => {
    jest.spyOn(prisma.mcpPersonalToken, 'findUnique').mockResolvedValue(null);
    expect(await resolveMcpSession('nope')).toBeNull();
  });

  it('token revocado: null, aunque el resto siga válido', async () => {
    mockFindUnique({ revokedAt: new Date() });
    expect(await resolveMcpSession('raw-token')).toBeNull();
  });

  it('usuario desactivado: null', async () => {
    mockFindUnique({ user: { ...baseRecord.user, isActive: false } });
    expect(await resolveMcpSession('raw-token')).toBeNull();
  });

  it('empresa apagó el conector: null, sin tocar la fila del token', async () => {
    mockFindUnique({ company: { ...baseRecord.company, settings: { mcpConnectorEnabled: false } } });
    expect(await resolveMcpSession('raw-token')).toBeNull();
  });

  it('empresa suspendida: null', async () => {
    mockFindUnique({ company: { ...baseRecord.company, status: 'SUSPENDED' as never } });
    expect(await resolveMcpSession('raw-token')).toBeNull();
  });

  it('un OWNER sin CustomRole obtiene los permisos de su rol base', async () => {
    mockFindUnique({ user: { ...baseRecord.user, role: 'OWNER' as const } });
    const session = await resolveMcpSession('raw-token');
    expect(session?.permissions.length).toBeGreaterThan(0);
  });
});

describe('resolveMcpSession con un token de otra empresa (Multiempresa)', () => {
  // Ana es Dueña en su empresa hogar (hogar) y Vendedora en c1 por membresía.
  const foreign = {
    user: { ...baseRecord.user, role: 'OWNER' as Role, companyId: 'hogar' },
    company: { ...baseRecord.company, features: { hasMultiCompany: true } },
  };

  it('usa el rol de la membresía, nunca el de la empresa hogar', async () => {
    mockFindUnique(foreign);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue({ role: 'SALES', customRole: null } as never);
    const asMember = await resolveMcpSession('raw-token');

    mockFindUnique({ ...foreign, user: { ...foreign.user, companyId: 'c1' } });
    const asOwner = await resolveMcpSession('raw-token');

    expect(asMember).not.toBeNull();
    expect(asMember!.permissions.length).toBeLessThan(asOwner!.permissions.length);
    expect(asMember!.permissions).not.toContain('settings:users');
  });

  it('sin membresía vigente (la quitaron), el token deja de servir', async () => {
    mockFindUnique(foreign);
    jest.spyOn(prisma.companyMembership, 'findUnique').mockResolvedValue(null);
    expect(await resolveMcpSession('raw-token')).toBeNull();
  });

  it('si la empresa apagó Multiempresa, el token deja de servir', async () => {
    mockFindUnique({ ...foreign, company: { ...baseRecord.company, features: { hasMultiCompany: false } } });
    const membership = jest.spyOn(prisma.companyMembership, 'findUnique');
    expect(await resolveMcpSession('raw-token')).toBeNull();
    expect(membership).not.toHaveBeenCalled();
  });
});

describe('createPersonalToken / revokePersonalToken', () => {
  it('crea un token, guarda solo el hash, y el token devuelto no coincide con lo guardado', async () => {
    jest.spyOn(prisma.mcpPersonalToken, 'count').mockResolvedValue(0);
    const createSpy = jest
      .spyOn(prisma.mcpPersonalToken, 'create')
      .mockImplementation((async ({ data }: { data: { tokenHash: string } }) => ({ id: 'new-id', ...data })) as never);

    const result = await createPersonalToken('c1', 'u1', 'Claude personal');
    expect(result.token).toMatch(/^aether_mcp_/);
    const savedData = createSpy.mock.calls[0][0].data as { tokenHash: string };
    expect(savedData.tokenHash).toBe(hashMcpToken(result.token));
    expect(savedData.tokenHash).not.toContain(result.token);
  });

  it('rechaza crear un sexto token activo', async () => {
    jest.spyOn(prisma.mcpPersonalToken, 'count').mockResolvedValue(5);
    await expect(createPersonalToken('c1', 'u1', 'Otro')).rejects.toThrow(TooManyTokensError);
  });

  it('revocar solo afecta el token de esa empresa/usuario (companyId/userId en el where)', async () => {
    const updateManySpy = jest.spyOn(prisma.mcpPersonalToken, 'updateMany').mockResolvedValue({ count: 1 });
    await revokePersonalToken('c1', 'u1', 'tok-1');
    expect(updateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tok-1', companyId: 'c1', userId: 'u1', revokedAt: null } })
    );
  });

  it('revocar un token ajeno (0 filas afectadas) lanza en vez de fallar en silencio', async () => {
    jest.spyOn(prisma.mcpPersonalToken, 'updateMany').mockResolvedValue({ count: 0 });
    await expect(revokePersonalToken('c1', 'u1', 'tok-de-otro')).rejects.toThrow();
  });
});
