import { buildAccessibleCompanies, selectableCount } from '@/lib/auth/accessible-companies';

/** Selector de empresa del login: misma regla que `loadContext()` (guards.ts). */

const row = (id: string, status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CANCELLED', hasMultiCompany: boolean) => ({
  id,
  businessName: `Empresa ${id}`,
  status,
  features: { hasMultiCompany } as never,
});

describe('buildAccessibleCompanies', () => {
  it('la empresa hogar va primero y las membresías con hasMultiCompany después', () => {
    const list = buildAccessibleCompanies(row('home', 'ACTIVE', false), [row('filial', 'TRIAL', true)]);
    expect(list.map((c) => [c.id, c.isHome, c.operational])).toEqual([
      ['home', true, true],
      ['filial', false, true],
    ]);
    expect(selectableCount(list)).toBe(2);
  });

  it('ignora membresías de empresas sin el módulo multiempresa (no se podrían abrir)', () => {
    const list = buildAccessibleCompanies(row('home', 'ACTIVE', false), [row('otra', 'ACTIVE', false)]);
    expect(list.map((c) => c.id)).toEqual(['home']);
    expect(selectableCount(list)).toBe(1);
  });

  it('muestra la empresa suspendida pero no la cuenta como elegible', () => {
    const list = buildAccessibleCompanies(row('home', 'ACTIVE', false), [row('susp', 'SUSPENDED', true)]);
    expect(list.find((c) => c.id === 'susp')?.operational).toBe(false);
    expect(selectableCount(list)).toBe(1);
  });

  it('no repite la empresa hogar si también tiene membresía en ella', () => {
    const list = buildAccessibleCompanies(row('home', 'ACTIVE', true), [row('home', 'ACTIVE', true)]);
    expect(list).toHaveLength(1);
  });

  it('sin empresa hogar (cuenta de plataforma) solo quedan las membresías', () => {
    expect(buildAccessibleCompanies(null, [row('filial', 'ACTIVE', true)]).map((c) => c.isHome)).toEqual([false]);
  });
});
