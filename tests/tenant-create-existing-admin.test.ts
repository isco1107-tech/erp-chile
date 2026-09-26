import { prisma } from '@/lib/prisma';

jest.mock('@/modules/accounting/services/chart-setup.service', () => ({ ensureChartOfAccounts: jest.fn() }));
jest.mock('@/modules/workspace/services/workspace.service', () => ({ setDisabledNavItems: jest.fn() }));

import { createTenant } from '@/modules/platform/services/platform.service';
import { companyCreateSchema } from '@/modules/platform/schema';
import type { CompanyCreateInput } from '@/modules/platform/schema';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';

/** Crear una empresa con el correo de alguien que ya es dueño de otra: se vincula, no falla. */

const base: CompanyCreateInput = {
  rut: '76.086.428-5',
  businessName: 'Segunda SpA',
  email: '',
  planName: 'Starter',
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
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'u1', companyId: 'c1' } as never);
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
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
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
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'sa', companyId: null } as never);
    const tx = mockTransaction();

    await expect(createTenant(base)).rejects.toThrow('cuenta de plataforma sin empresa');
    expect(tx.company.create).not.toHaveBeenCalled();
  });

  it('el formulario acepta la contraseña vacía y la sigue validando si viene', () => {
    const input = { ...base, rut: '76.086.428-5' };
    expect(companyCreateSchema.safeParse({ ...input, adminPassword: '' }).success).toBe(true);
    expect(companyCreateSchema.safeParse({ ...input, adminPassword: 'corta' }).success).toBe(false);
  });
});
