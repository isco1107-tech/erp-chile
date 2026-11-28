import { prisma } from '@/lib/prisma';

jest.mock('@/modules/accounting/services/chart-setup.service', () => ({ ensureChartOfAccounts: jest.fn() }));
jest.mock('@/modules/workspace/services/workspace.service', () => ({ setDisabledNavItems: jest.fn() }));

import { createTenant, grantCompanyMembership } from '@/modules/platform/services/platform.service';
import { companyCreateSchema } from '@/modules/platform/schema';
import type { CompanyCreateInput } from '@/modules/platform/schema';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';

/** Crear una empresa con el correo de alguien que ya es dueño de otra: se vincula, no falla. */

const base: CompanyCreateInput = {
  rut: '76.086.428-5',
  businessName: 'Segunda SpA',
  email: '',
  planName: 'Base',
  maxUsers: 3,
  maxWarehouses: 1,
  status: 'ACTIVE',
  features: { ...DEFAULT_FEATURES, hasMultiCompany: false, hasAccounting: false },
  adminName: 'Dueña',
  adminEmail: 'duena@empresa.cl',
  adminPassword: undefined,
};

function mockTransaction() {
  const tx = {
    company: { create: jest.fn(async ({ data }: { data: { businessName: string } }) => ({ id: 'c2', businessName: data.businessName })) },
    warehouse: { create: jest.fn() },
    companyMembership: { create: jest.fn() },
    user: { create: jest.fn() },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (client: typeof tx) => unknown) => fn(tx)) as never);
  return tx;
}

afterEach(() => jest.restoreAllMocks());

describe('createTenant con un correo que ya tiene cuenta', () => {
  it('vincula al usuario existente como Dueño y activa multiempresa, sin crear otro usuario', async () => {
    jest.spyOn(prisma.company, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u1', companyId: 'c1' } as never);
    const tx = mockTransaction();

    const result = await createTenant(base);

    expect(result.linkedExistingUser).toBe(true);
    expect(tx.companyMembership.create).toHaveBeenCalledWith({ data: { userId: 'u1', companyId: 'c2', role: 'OWNER' } });
    expect(tx.user.create).not.toHaveBeenCalled();
    const companyData = tx.company.create.mock.calls[0]![0].data as unknown as { features: { create: { hasMultiCompany: boolean } } };
    expect(companyData.features.create.hasMultiCompany).toBe(true);
  });

  it('un correo nuevo sigue creando la cuenta, y exige contraseña inicial', async () => {
    jest.spyOn(prisma.company, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
    const tx = mockTransaction();

    await expect(createTenant(base)).rejects.toThrow('Ingresa la contraseña inicial del administrador');
    expect(tx.user.create).not.toHaveBeenCalled();

    const result = await createTenant({ ...base, adminPassword: 'Clave1234' });
    expect(result.linkedExistingUser).toBe(false);
    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'duena@empresa.cl', role: 'OWNER', companyId: 'c2' }) });
    expect(tx.companyMembership.create).not.toHaveBeenCalled();
  });

  it('una cuenta de plataforma sin empresa no se puede usar como administrador', async () => {
    jest.spyOn(prisma.company, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'sa', companyId: null } as never);
    const tx = mockTransaction();

    await expect(createTenant(base)).rejects.toThrow('cuenta de plataforma sin empresa');
    expect(tx.company.create).not.toHaveBeenCalled();
  });

  it('el formulario acepta la contraseña vacía y la sigue validando si viene', () => {
    const input = { ...base, rut: '76.086.428-5' };
    expect(companyCreateSchema.safeParse({ ...input, adminPassword: '' }).success).toBe(true);
    expect(companyCreateSchema.safeParse({ ...input, adminPassword: 'corta' }).success).toBe(false);
  });

  it('al crear solo acepta los planes vigentes (los anteriores no se ofrecen)', () => {
    const input = { ...base, rut: '76.086.428-5', adminPassword: '' };
    expect(companyCreateSchema.safeParse({ ...input, planName: 'Gestión' }).success).toBe(true);
    expect(companyCreateSchema.safeParse({ ...input, planName: 'Starter' }).success).toBe(false);
  });
});

describe('grantCompanyMembership (superadmin)', () => {
  it('busca el correo sin distinguir mayúsculas y enciende multiempresa en la empresa', async () => {
    const findFirst = jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({ id: 'u1', name: 'Pancho', email: 'Pancho@Gmail.com', companyId: 'home' } as never);
    const tx = {
      companyMembership: { upsert: jest.fn(async () => ({ id: 'm1', role: 'ADMIN', createdAt: new Date() })) },
      companyFeatures: { upsert: jest.fn() },
    };
    jest.spyOn(prisma, '$transaction').mockImplementation((async (fn: (client: typeof tx) => unknown) => fn(tx)) as never);

    const result = await grantCompanyMembership('filial', 'pancho@gmail.com', 'ADMIN');

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'pancho@gmail.com', mode: 'insensitive' } } }));
    expect(tx.companyFeatures.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'filial' }, update: { hasMultiCompany: true } }));
    expect(result.userEmail).toBe('Pancho@Gmail.com');
  });
});

describe('createTenant con dominio predeterminado', () => {
  const withPassword = { ...base, adminPassword: 'Clave1234' };

  /** Las cuatro consultas con que se revisa que el dominio no sea de otra empresa (ni de una de sus páginas). */
  function spyDomainChecks(taken: 'settings' | 'project' | 'webSite' | 'academySite' | null = null) {
    const answer = (name: string) => (taken === name ? { id: 'ajeno' } : null);
    return {
      settings: jest.spyOn(prisma.companySettings, 'findFirst').mockResolvedValue(answer('settings') as never),
      project: jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(answer('project') as never),
      webSite: jest.spyOn(prisma.webSite, 'findFirst').mockResolvedValue(answer('webSite') as never),
      academySite: jest.spyOn(prisma.academySite, 'findFirst').mockResolvedValue(answer('academySite') as never),
    };
  }

  function mockCompanyTransaction() {
    jest.spyOn(prisma.company, 'findUnique').mockResolvedValue(null);
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
    return mockTransaction();
  }

  it('la configuración de la empresa nace con su dominio', async () => {
    const tx = mockCompanyTransaction();
    const checks = spyDomainChecks();

    await createTenant({ ...withPassword, defaultDomain: 'miempresa.cl' });

    const data = tx.company.create.mock.calls[0]![0].data as unknown as { settings: { create: unknown } };
    expect(data.settings.create).toEqual({ defaultDomain: 'miempresa.cl' });
    // La empresa aún no existe: el dominio se revisa contra TODAS.
    expect(checks.settings).toHaveBeenCalledWith({ where: { defaultDomain: 'miempresa.cl' }, select: { id: true } });
  });

  it('sin dominio la configuración nace vacía y no se consulta nada de dominios', async () => {
    const tx = mockCompanyTransaction();
    const checks = spyDomainChecks();

    await createTenant(withPassword);

    const data = tx.company.create.mock.calls[0]![0].data as unknown as { settings: { create: unknown } };
    expect(data.settings.create).toEqual({});
    expect(checks.settings).not.toHaveBeenCalled();
    expect(checks.webSite).not.toHaveBeenCalled();
  });

  it.each(['settings', 'project', 'webSite', 'academySite'] as const)('no se crea la empresa si el dominio ya lo usa otra (%s)', async (taken) => {
    const tx = mockCompanyTransaction();
    spyDomainChecks(taken);

    await expect(createTenant({ ...withPassword, defaultDomain: 'miempresa.cl' })).rejects.toThrow('otra empresa');
    expect(tx.company.create).not.toHaveBeenCalled();
  });

  it('el esquema normaliza el dominio, acepta vacío y rechaza lo que no es un dominio público', () => {
    const input = { ...base, adminPassword: '' };
    expect(companyCreateSchema.parse({ ...input, defaultDomain: 'https://www.MiEmpresa.CL/' }).defaultDomain).toBe('miempresa.cl');
    expect(companyCreateSchema.parse({ ...input, defaultDomain: '' }).defaultDomain).toBeUndefined();
    expect(companyCreateSchema.parse(input).defaultDomain).toBeUndefined();
    const bad = companyCreateSchema.safeParse({ ...input, defaultDomain: '203.0.113.5' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toContain('dirección IP');
  });
});
