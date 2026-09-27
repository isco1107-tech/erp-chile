import { resolveOrCreateMappedAccount } from '@/modules/accounting/chart-of-accounts';

/**
 * Auditoría 2026-09-27, hallazgo C-1: una empresa que sembró su plan de
 * cuentas antes de que existiera una clave de mapeo nueva (GASTO_HONORARIOS,
 * GASTO_REEMBOLSOS...) no debe quedar bloqueada la primera vez que se usa —
 * `resolveOrCreateMappedAccount` la completa sola, sin tocar nada que el
 * contador ya haya configurado.
 */

function fakeTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountMapping: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: { accountId: string } }) => data),
    },
    account: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: { code: string } }) => ({ id: `acc-${data.code}`, ...data })),
    },
    ...overrides,
  };
}

describe('resolveOrCreateMappedAccount', () => {
  it('si el mapeo ya existe, lo devuelve sin tocar ni crear nada', async () => {
    const tx = fakeTx({ accountMapping: { findUnique: jest.fn(async () => ({ accountId: 'acc-existente' })), create: jest.fn() } });
    const id = await resolveOrCreateMappedAccount(tx as never, 'c1', 'GASTO_HONORARIOS', '6108');
    expect(id).toBe('acc-existente');
    expect(tx.account.findFirst).not.toHaveBeenCalled();
  });

  it('si la cuenta ya existe por código pero sin mapeo, solo crea el mapeo', async () => {
    const tx = fakeTx({ account: { findFirst: jest.fn(async () => ({ id: 'acc-6108' })), create: jest.fn() } });
    const id = await resolveOrCreateMappedAccount(tx as never, 'c1', 'GASTO_HONORARIOS', '6108');
    expect(id).toBe('acc-6108');
    expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.accountMapping.create).toHaveBeenCalledWith({ data: { companyId: 'c1', key: 'GASTO_HONORARIOS', accountId: 'acc-6108' } });
  });

  it('si ni la cuenta ni el mapeo existen, crea ambos con el padre resuelto por código', async () => {
    const tx = fakeTx({
      account: {
        findFirst: jest.fn(async ({ where }: { where: { code: string } }) => (where.code === '6' ? { id: 'acc-6' } : null)),
        create: jest.fn(async ({ data }: { data: { code: string } }) => ({ id: `acc-${data.code}`, ...data })),
      },
    });
    const id = await resolveOrCreateMappedAccount(tx as never, 'c1', 'GASTO_HONORARIOS', '6108');
    expect(id).toBe('acc-6108');
    expect(tx.account.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: '6108', name: 'Honorarios', parentId: 'acc-6' }) }));
  });

  it('si falta la cuenta padre en el plan de esta empresa, lanza un error claro', async () => {
    const tx = fakeTx();
    await expect(resolveOrCreateMappedAccount(tx as never, 'c1', 'GASTO_HONORARIOS', '6108')).rejects.toThrow(/Falta la cuenta 6/);
  });

  it('lanza si el código no existe en CHART_OF_ACCOUNTS (error de programación, no de usuario)', async () => {
    const tx = fakeTx();
    await expect(resolveOrCreateMappedAccount(tx as never, 'c1', 'X', '9999')).rejects.toThrow(/no definido/);
  });
});
