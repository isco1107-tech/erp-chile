import { ALL_PERMISSIONS, permissionsForRole, type Permission } from '@/lib/auth/permissions';
import { DEFAULT_FEATURES, MODULES, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import {
  buildCompanySetupReadiness,
  canOpenSetupItem,
  isRealCustomer,
  missingCompanyProfileFields,
  summarizeSetupProgress,
  type CompanySetupInput,
  type SetupFeatureFlags,
} from '@/lib/setup/readiness';

/**
 * "Primeros pasos": el checklist se arma solo con datos reales, solo con los
 * módulos contratados y solo con pantallas que quien mira puede abrir.
 */

const NO_FEATURES: SetupFeatureFlags = {
  hasInventory: false,
  hasPos: false,
  hasDteBilling: false,
  hasTreasury: false,
  hasAccounting: false,
  hasPayroll: false,
  hasEventProjects: false,
};

const COMPLETE_COMPANY = {
  rut: '76.123.456-0',
  businessName: 'Comercial Austral SpA',
  giro: 'Venta al por menor',
  address: 'Av. Alemania 123',
  comuna: 'Temuco',
};

const EMPTY_COUNTS = {
  customers: 0,
  products: 0,
  stockWithQuantity: 0,
  cashRegisters: 0,
  bankAccounts: 0,
  workers: 0,
  projects: 0,
  users: 1,
  invitations: 0,
  issuedSales: 0,
};

function build(overrides: Partial<Omit<CompanySetupInput, 'features' | 'counts' | 'company'>> & {
  features?: Partial<SetupFeatureFlags>;
  counts?: Partial<CompanySetupInput['counts']>;
  company?: Partial<CompanySetupInput['company']>;
} = {}) {
  const { features, counts, company, ...rest } = overrides;
  return buildCompanySetupReadiness({
    features: { ...NO_FEATURES, ...features },
    permissions: ALL_PERMISSIONS,
    company: { ...COMPLETE_COMPANY, ...company },
    counts: { ...EMPTY_COUNTS, ...counts },
    foliosAvailable: false,
    hasChartOfAccounts: false,
    ...rest,
  });
}

const ids = (report: ReturnType<typeof build>) => report.items.map((item) => item.id);

describe('Primeros pasos: módulos contratados', () => {
  it('sin ningún módulo solo quedan el perfil de la empresa y el equipo', () => {
    expect(ids(build())).toEqual(['company-profile', 'team']);
  });

  it('cada módulo agrega solo sus pasos', () => {
    expect(ids(build({ features: { hasInventory: true } }))).toEqual(['company-profile', 'products', 'initial-stock', 'team']);
    expect(ids(build({ features: { hasPos: true } }))).toEqual(['company-profile', 'cash-register', 'team']);
    expect(ids(build({ features: { hasTreasury: true } }))).toEqual(['company-profile', 'customers', 'bank-account', 'team']);
    expect(ids(build({ features: { hasAccounting: true } }))).toEqual(['company-profile', 'chart-of-accounts', 'team']);
    expect(ids(build({ features: { hasPayroll: true } }))).toEqual(['company-profile', 'first-worker', 'team']);
    expect(ids(build({ features: { hasEventProjects: true } }))).toEqual(['company-profile', 'first-project', 'team']);
  });

  it('los folios del SII y la primera venta solo existen con facturación electrónica', () => {
    expect(ids(build())).not.toContain('folios');
    expect(ids(build({ features: { hasDteBilling: true } }))).toEqual(['company-profile', 'folios', 'customers', 'first-sale', 'team']);
  });

  it('con todo contratado respeta el orden recomendado', () => {
    const all = build({
      features: { hasInventory: true, hasPos: true, hasDteBilling: true, hasTreasury: true, hasAccounting: true, hasPayroll: true, hasEventProjects: true },
    });
    expect(ids(all)).toEqual([
      'company-profile',
      'folios',
      'products',
      'initial-stock',
      'customers',
      'cash-register',
      'first-sale',
      'bank-account',
      'chart-of-accounts',
      'first-worker',
      'first-project',
      'team',
    ]);
  });
});

describe('Primeros pasos: datos reales', () => {
  it('el perfil se completa con razón social, RUT, giro, dirección y comuna', () => {
    expect(build().items[0]).toMatchObject({ id: 'company-profile', status: 'ok' });
    const incomplete = build({ company: { giro: '  ', address: null } });
    expect(incomplete.items[0]?.status).toBe('todo');
    expect(incomplete.items[0]?.detail).toContain('giro y dirección');
    expect(missingCompanyProfileFields({ ...COMPLETE_COMPANY, rut: '', comuna: null })).toEqual(['RUT', 'comuna']);
  });

  it('productos y stock se marcan según los conteos', () => {
    const none = build({ features: { hasInventory: true } });
    expect(none.items.find((i) => i.id === 'products')?.status).toBe('todo');
    expect(none.items.find((i) => i.id === 'products')?.detail).toContain('Sin productos no puedes vender');

    const withProducts = build({ features: { hasInventory: true }, counts: { products: 3 } });
    expect(withProducts.items.find((i) => i.id === 'products')?.status).toBe('ok');
    expect(withProducts.items.find((i) => i.id === 'initial-stock')?.status).toBe('todo');

    const withStock = build({ features: { hasInventory: true }, counts: { products: 3, stockWithQuantity: 2 } });
    expect(withStock.items.find((i) => i.id === 'initial-stock')?.status).toBe('ok');
  });

  it('el equipo cuenta con otro usuario o con una invitación enviada', () => {
    expect(build().items.find((i) => i.id === 'team')?.status).toBe('todo');
    expect(build({ counts: { users: 2 } }).items.find((i) => i.id === 'team')?.status).toBe('ok');
    expect(build({ counts: { invitations: 1 } }).items.find((i) => i.id === 'team')?.status).toBe('ok');
  });

  it('los folios dependen de que haya folios sin usar', () => {
    const without = build({ features: { hasDteBilling: true } });
    expect(without.items.find((i) => i.id === 'folios')?.status).toBe('todo');
    const withFolios = build({ features: { hasDteBilling: true }, foliosAvailable: true });
    expect(withFolios.items.find((i) => i.id === 'folios')?.status).toBe('ok');
  });

  it('el plan de cuentas, la caja, el banco, el trabajador y el proyecto salen de sus datos', () => {
    const report = build({
      features: { hasPos: true, hasTreasury: true, hasAccounting: true, hasPayroll: true, hasEventProjects: true },
      counts: { cashRegisters: 1, bankAccounts: 1, workers: 1, projects: 1 },
      hasChartOfAccounts: true,
    });
    for (const id of ['cash-register', 'bank-account', 'chart-of-accounts', 'first-worker', 'first-project']) {
      expect(report.items.find((i) => i.id === id)?.status).toBe('ok');
    }
  });

  it('el consumidor final 66.666.666-6 no cuenta como cliente', () => {
    expect(isRealCustomer({ isCustomer: true, rutClean: '666666666' })).toBe(false);
    expect(isRealCustomer({ isCustomer: false, rutClean: '123456785' })).toBe(false);
    expect(isRealCustomer({ isCustomer: true, rutClean: '123456785' })).toBe(true);
    // Con el conteo que entrega el servicio (ya sin consumidor final) en cero, el paso sigue pendiente.
    const report = build({ features: { hasDteBilling: true }, counts: { customers: 0 } });
    expect(report.items.find((i) => i.id === 'customers')?.status).toBe('todo');
  });
});

describe('Primeros pasos: permisos', () => {
  it('quien no puede abrir una pantalla no recibe su paso', () => {
    const sales = permissionsForRole('SALES');
    const report = build({
      features: { hasInventory: true, hasDteBilling: true, hasTreasury: true, hasAccounting: true },
      permissions: sales,
    });
    // SALES no edita la empresa, no carga folios, no ajusta stock, no maneja tesorería ni contabilidad ni equipo.
    expect(ids(report)).toEqual(['customers', 'first-sale']);
    for (const item of report.items) expect(sales).toContain(item.permission);
  });

  it('un rol de bodega ve productos y stock, pero no folios ni cuentas', () => {
    const warehouse = permissionsForRole('WAREHOUSE');
    const report = build({ features: { hasInventory: true, hasDteBilling: true, hasTreasury: true }, permissions: warehouse });
    expect(ids(report)).toEqual(['products', 'initial-stock', 'customers']);
  });

  it('la caja exige también poder editar la empresa', () => {
    const onlyPos: Permission[] = ['pos:operate'];
    expect(ids(build({ features: { hasPos: true }, permissions: onlyPos }))).toEqual([]);
    expect(ids(build({ features: { hasPos: true }, permissions: ['pos:operate', 'settings:company'] }))).toContain('cash-register');
    expect(canOpenSetupItem({ permission: 'pos:operate', alsoRequires: ['settings:company'] }, onlyPos)).toBe(false);
  });

  it('sin permisos no hay pasos y el avance cuenta como completo', () => {
    const report = build({ features: { hasInventory: true }, permissions: [] });
    expect(report.items).toEqual([]);
    expect(report).toMatchObject({ done: 0, total: 0, percent: 100, next: null, complete: false });
  });

  it('un ítem del menú que la empresa apagó no se ofrece', () => {
    const report = build({ features: { hasInventory: true }, disabledNavItems: ['inventory'] });
    expect(ids(report)).toEqual(['company-profile', 'products', 'team']);
  });
});

describe('Primeros pasos: avance y siguiente paso', () => {
  it('el siguiente es el primer pendiente en el orden recomendado', () => {
    const report = build({ features: { hasInventory: true }, counts: { products: 2 } });
    expect(report.next?.id).toBe('initial-stock');
    expect(report).toMatchObject({ done: 2, total: 4, percent: 50, complete: false });
  });

  it('con todo hecho no hay siguiente y queda completo', () => {
    const report = build({ features: { hasInventory: true }, counts: { products: 2, stockWithQuantity: 1, users: 2 } });
    expect(report).toMatchObject({ done: 4, total: 4, percent: 100, next: null, complete: true });
  });

  it('summarizeSetupProgress redondea el porcentaje', () => {
    const report = build({ features: { hasInventory: true, hasPos: true }, counts: { products: 1 } });
    const progress = summarizeSetupProgress(report.items);
    expect(progress.total).toBe(5);
    expect(progress.done).toBe(2);
    expect(progress.percent).toBe(40);
  });

  it('cada paso trae un detalle accionable y una ruta del panel', () => {
    const report = build({
      features: { hasInventory: true, hasPos: true, hasDteBilling: true, hasTreasury: true, hasAccounting: true, hasPayroll: true, hasEventProjects: true },
      company: { giro: null },
    });
    for (const item of report.items) {
      expect(item.status).toBe('todo');
      expect(item.detail.length).toBeGreaterThan(30);
      expect(item.href.startsWith('/dashboard/')).toBe(true);
    }
  });
});

describe('Primeros pasos: coherencia con el menú', () => {
  it('cada paso apunta a una pantalla del menú, a una subruta de ella o al índice que la agrupa', () => {
    const features = Object.fromEntries(MODULES.map((m) => [m.key, true])) as CompanyFeatureFlags;
    const links = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features: { ...DEFAULT_FEATURES, ...features }, isSuperAdmin: false }).flatMap((g) => g.links);
    const report = build({
      features: { hasInventory: true, hasPos: true, hasDteBilling: true, hasTreasury: true, hasAccounting: true, hasPayroll: true, hasEventProjects: true },
    });
    for (const item of report.items) {
      const path = item.href.split('?')[0]!;
      const navLink = links.find((link) => link.id === item.navId);
      expect(navLink).toBeDefined();
      // El plan de cuentas vive en el índice de Contabilidad, que agrupa a Libro Diario, Mayor, etc.
      const related = path === navLink!.href || path.startsWith(`${navLink!.href}/`) || navLink!.href.startsWith(`${path}/`);
      expect(related).toBe(true);
    }
  });
});
