import {
  resolvePermissions,
  sanitizePermissions,
  filterByFeatures,
} from '@/lib/auth/effective-permissions';
import {
  DEFAULT_FEATURES,
  availablePermissionGroups,
  blockedModuleForRoute,
  moduleForPermission,
  toFeatureFlags,
  MODULES,
  type CompanyFeatureFlags,
} from '@/lib/auth/modules';
import { ALL_PERMISSIONS, PERMISSION_LABELS, permissionsForRole } from '@/lib/auth/permissions';

/**
 * El control de acceso del SaaS es el cruce de tres cosas: el rol del
 * trabajador, el rol personalizado que le asignó su empresa, y los módulos que
 * esa empresa contrató. Estos tests fijan ese cruce, sobre todo el caso que
 * más fácil se rompe: que revocar un módulo revoque de verdad sus permisos.
 */

const FULL: CompanyFeatureFlags = {
  hasInventory: true,
  hasPmpCosting: true,
  hasDteBilling: true,
  hasPurchases: true,
  hasTreasury: true,
  hasAdvancedReports: true,
  hasMultipleWarehouses: true,
  hasPos: true,
  hasAccounting: true,
  hasCrm: true,
  hasEventProjects: true,
  hasSponsorships: true,
  hasFeeDocuments: true,
  hasCandidates: true,
  hasOrgChart: true,
  hasLiveProduction: true,
  hasJudging: true,
  hasMultiCompany: true,
  hasBudgets: true,
  hasPromissoryNotes: true,
  hasInstallmentPlans: true,
  hasTicketing: true,
  hasPublicVoting: true,
  hasIntelligence: true,
  hasSalesPipeline: true,
  hasPayroll: true,
  hasFixedAssets: true,
  hasExpenseReports: true,
};

const STARTER: CompanyFeatureFlags = { ...DEFAULT_FEATURES };

describe('Registro de módulos', () => {
  it('cada permiso pertenece a lo sumo a un módulo', () => {
    const seen = new Map<string, string>();
    for (const mod of MODULES) {
      for (const permission of mod.permissions) {
        expect(seen.has(permission)).toBe(false);
        seen.set(permission, mod.key);
      }
    }
  });

  it('todos los permisos del registro existen en la matriz', () => {
    for (const mod of MODULES) {
      for (const permission of mod.permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('todo permiso tiene etiqueta en lenguaje de negocio', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toBeTruthy();
    }
  });

  it('sin fila de features asume el plan mínimo, no acceso total', () => {
    const flags = toFeatureFlags(null);
    expect(flags).toEqual(DEFAULT_FEATURES);
    expect(flags.hasDteBilling).toBe(false);
    expect(flags.hasTreasury).toBe(false);
    expect(flags.hasAdvancedReports).toBe(false);
  });
});

describe('resolvePermissions — rol base', () => {
  it('un vendedor con plan completo recibe los permisos de su rol', () => {
    const permissions = resolvePermissions({
      role: 'SALES',
      customRolePermissions: null,
      features: FULL,
    });
    expect(permissions).toEqual(expect.arrayContaining(['sales:write', 'products:read', 'contacts:read']));
    expect(permissions).not.toContain('sales:cancel');
    expect(permissions).not.toContain('settings:users');
  });

  it('el OWNER recibe todos los permisos que el plan cubre', () => {
    const permissions = resolvePermissions({
      role: 'OWNER',
      customRolePermissions: null,
      features: FULL,
    });
    expect(permissions.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('el OWNER no queda encerrado por un rol personalizado mal configurado', () => {
    const permissions = resolvePermissions({
      role: 'OWNER',
      customRolePermissions: ['contacts:read'],
      features: FULL,
    });
    expect(permissions).toContain('settings:users');
  });
});

describe('resolvePermissions — el plan recorta al rol', () => {
  it('sin DTE contratado nadie puede vender, ni siquiera el OWNER', () => {
    const owner = resolvePermissions({ role: 'OWNER', customRolePermissions: null, features: STARTER });
    expect(owner).not.toContain('sales:write');
    expect(owner).not.toContain('sales:read');
    expect(owner).not.toContain('sales:cancel');
    // Lo transversal sigue disponible: la empresa no queda inutilizable.
    expect(owner).toContain('contacts:read');
    expect(owner).toContain('settings:users');
    expect(owner).toContain('products:read');
  });

  it('sin Tesorería no hay permisos de cobranza para el contador', () => {
    const accountant = resolvePermissions({
      role: 'ACCOUNTANT',
      customRolePermissions: null,
      features: STARTER,
    });
    expect(accountant).not.toContain('treasury:read');
    expect(accountant).not.toContain('treasury:write');
    expect(accountant).not.toContain('reports:read');
  });

  it('revocar un módulo revoca sus permisos aunque el rol personalizado los liste', () => {
    const custom = ['sales:write', 'purchases:write', 'contacts:read', 'products:read'];

    const conDte = resolvePermissions({ role: 'SALES', customRolePermissions: custom, features: FULL });
    expect(conDte).toContain('sales:write');
    expect(conDte).toContain('purchases:write');

    const sinDte = resolvePermissions({
      role: 'SALES',
      customRolePermissions: custom,
      features: { ...FULL, hasDteBilling: false },
    });
    expect(sinDte).not.toContain('sales:write');
    // Los demás permisos del mismo rol sobreviven.
    expect(sinDte).toContain('purchases:write');
    expect(sinDte).toContain('contacts:read');
  });

  it('quitar el costeo PMP oculta los costos sin tocar el catálogo', () => {
    const permissions = resolvePermissions({
      role: 'WAREHOUSE',
      customRolePermissions: null,
      features: { ...FULL, hasPmpCosting: false },
    });
    expect(permissions).not.toContain('products:costs');
    expect(permissions).toContain('products:read');
    expect(permissions).toContain('inventory:write');
  });
});

describe('resolvePermissions — rol personalizado', () => {
  it('el rol personalizado reemplaza a la matriz del rol base', () => {
    const permissions = resolvePermissions({
      role: 'SALES',
      customRolePermissions: ['products:read', 'contacts:read'],
      features: FULL,
    });
    expect(permissions.sort()).toEqual(['contacts:read', 'products:read']);
    // `sales:write` viene del rol base SALES y el rol personalizado no lo incluye.
    expect(permissionsForRole('SALES')).toContain('sales:write');
    expect(permissions).not.toContain('sales:write');
  });

  it('puede otorgar más que el rol base dentro del mismo plan', () => {
    const permissions = resolvePermissions({
      role: 'SALES',
      customRolePermissions: ['sales:cancel', 'treasury:write'],
      features: FULL,
    });
    expect(permissions).toEqual(expect.arrayContaining(['sales:cancel', 'treasury:write']));
  });

  it('descarta claves desconocidas en vez de otorgarlas', () => {
    const permissions = resolvePermissions({
      role: 'SALES',
      customRolePermissions: ['sales:write', 'admin:*', 'no-existe', ''],
      features: FULL,
    });
    expect(permissions).toEqual(['sales:write']);
  });

  it('una lista vacía deja al usuario sin permisos, no con los del rol base', () => {
    const permissions = resolvePermissions({
      role: 'ACCOUNTANT',
      customRolePermissions: [],
      features: FULL,
    });
    expect(permissions).toEqual([]);
  });
});

describe('sanitizePermissions — lo que se persiste en un rol', () => {
  it('quita duplicados, claves inválidas y permisos fuera del plan', () => {
    const result = sanitizePermissions(
      ['contacts:read', 'contacts:read', 'sales:write', 'treasury:write', 'inventado'],
      STARTER
    );
    expect(result).toEqual(['contacts:read']);
  });

  it('conserva lo contratado', () => {
    const result = sanitizePermissions(['purchases:write', 'products:costs'], FULL);
    expect(result.sort()).toEqual(['products:costs', 'purchases:write']);
  });

  it('filterByFeatures deja pasar los permisos transversales', () => {
    const result = filterByFeatures(['contacts:read', 'settings:users', 'audit:read'], STARTER);
    expect(result.sort()).toEqual(['audit:read', 'contacts:read', 'settings:users']);
    for (const permission of result) {
      expect(moduleForPermission(permission)).toBeUndefined();
    }
  });
});

describe('Bloqueo de rutas por módulo', () => {
  it('bloquea la ruta del módulo y también sus subrutas', () => {
    const sinDte = { ...FULL, hasDteBilling: false };
    expect(blockedModuleForRoute('/dashboard/sales', sinDte)?.key).toBe('hasDteBilling');
    expect(blockedModuleForRoute('/dashboard/sales/new', sinDte)?.key).toBe('hasDteBilling');
    expect(blockedModuleForRoute('/dashboard/sales/abc123', sinDte)?.key).toBe('hasDteBilling');
  });

  it('no bloquea rutas de módulos contratados', () => {
    expect(blockedModuleForRoute('/dashboard/sales', FULL)).toBeUndefined();
    expect(blockedModuleForRoute('/dashboard/contacts', STARTER)).toBeUndefined();
    expect(blockedModuleForRoute('/dashboard', STARTER)).toBeUndefined();
  });

  it('no confunde prefijos parecidos', () => {
    const sinCompras = { ...FULL, hasPurchases: false };
    expect(blockedModuleForRoute('/dashboard/purchases', sinCompras)?.key).toBe('hasPurchases');
    expect(blockedModuleForRoute('/dashboard/purchases-report', sinCompras)).toBeUndefined();
  });
});

describe('Constructor de roles — casillas ofrecidas al cliente', () => {
  it('solo ofrece permisos de módulos contratados', () => {
    const groups = availablePermissionGroups(STARTER);
    const offered = groups.flatMap((group) => group.permissions.map((p) => p.key));

    expect(offered).toContain('products:read');
    expect(offered).toContain('contacts:read');
    expect(offered).not.toContain('sales:write');
    expect(offered).not.toContain('treasury:write');
    expect(offered).not.toContain('reports:read');
  });

  it('un plan completo ofrece todo lo que sanitize aceptaría', () => {
    const offered = availablePermissionGroups(FULL).flatMap((g) => g.permissions.map((p) => p.key));
    expect(sanitizePermissions(offered, FULL).sort()).toEqual([...offered].sort());
  });

  it('siempre incluye el grupo transversal, incluso en el plan mínimo', () => {
    const groups = availablePermissionGroups(STARTER);
    expect(groups[0]?.key).toBe('core');
    expect(groups[0]?.permissions.length).toBeGreaterThan(0);
  });
});
