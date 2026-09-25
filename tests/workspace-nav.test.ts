import { MODULE_KEYS, DEFAULT_FEATURES, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { ALL_PERMISSIONS, permissionsForRole } from '@/lib/auth/permissions';
import {
  LOCKED_NAV_ITEMS,
  allKnownNavItemIds,
  applyDisabledNavItems,
  buildAvailableWorkspaceNav,
  buildWorkspaceNav,
  findNavLinkForPath,
  sanitizeDisabledNavItems,
} from '@/lib/navigation/workspace-nav';

/**
 * Menú configurable por empresa: cada ítem del panel izquierdo se puede
 * apagar, salvo Inicio y Configuración. Estos tests fijan esas reglas y que
 * los ids no choquen entre sí (un id duplicado apagaría dos pantallas).
 */

const ALL_FEATURES = Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as CompanyFeatureFlags;
const FULL_ACCESS = { permissions: ALL_PERMISSIONS, features: ALL_FEATURES, isSuperAdmin: true };
const ids = (groups: ReturnType<typeof buildWorkspaceNav>) => groups.flatMap((g) => g.links.map((l) => l.id));

describe('registro de navegación', () => {
  it('todo enlace tiene un id único', () => {
    const all = ids(buildAvailableWorkspaceNav(FULL_ACCESS));
    expect(new Set(all).size).toBe(all.length);
  });

  it('todo href es único', () => {
    const hrefs = buildAvailableWorkspaceNav(FULL_ACCESS).flatMap((g) => g.links.map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('incluye los módulos nuevos cuando están contratados', () => {
    const all = ids(buildAvailableWorkspaceNav(FULL_ACCESS));
    expect(all).toEqual(expect.arrayContaining(['intelligence', 'intelligence-cash', 'intelligence-flows', 'crm', 'hr-employees', 'hr-payroll', 'hr-leave', 'fixed-assets', 'expenses']));
  });

  it('no muestra módulos no contratados', () => {
    const all = ids(buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features: { ...DEFAULT_FEATURES }, isSuperAdmin: false }));
    expect(all).not.toContain('intelligence');
    expect(all).not.toContain('hr-payroll');
    expect(all).toContain('home');
  });

  it('un vendedor no ve remuneraciones aunque el plan las incluya', () => {
    const all = ids(buildAvailableWorkspaceNav({ permissions: permissionsForRole('SALES'), features: ALL_FEATURES, isSuperAdmin: false }));
    expect(all).not.toContain('hr-payroll');
    expect(all).toContain('crm');
    expect(all).toContain('expenses');
  });
});

describe('ítems apagados por la empresa', () => {
  it('desaparecen del menú y el grupo vacío también', () => {
    const groups = buildWorkspaceNav({ ...FULL_ACCESS, disabledNavItems: ['purchases', 'purchase-requests', 'purchase-orders', 'purchases-imports', 'purchases-inbox'] });
    expect(ids(groups)).not.toContain('purchases');
    expect(groups.some((g) => g.label === 'Compras')).toBe(false);
  });

  it('Inicio y Configuración nunca se pueden apagar', () => {
    const groups = buildWorkspaceNav({ ...FULL_ACCESS, disabledNavItems: [...LOCKED_NAV_ITEMS] });
    expect(ids(groups)).toEqual(expect.arrayContaining(['home', 'settings']));
  });

  it('una lista vacía no cambia nada', () => {
    const available = buildAvailableWorkspaceNav(FULL_ACCESS);
    expect(applyDisabledNavItems(available, [])).toBe(available);
  });
});

describe('saneamiento de la preferencia guardada', () => {
  const known = allKnownNavItemIds();

  it('descarta ids desconocidos, duplicados y bloqueados', () => {
    expect(sanitizeDisabledNavItems(['crm', 'crm', 'home', 'no-existe', 'settings', 'expenses'], known)).toEqual(['crm', 'expenses']);
  });

  it('conoce todos los ids del plan completo', () => {
    for (const id of ids(buildAvailableWorkspaceNav({ ...FULL_ACCESS, isSuperAdmin: false }))) expect(known.has(id)).toBe(true);
  });
});

describe('a qué sección pertenece una ruta', () => {
  const links = buildAvailableWorkspaceNav(FULL_ACCESS).flatMap((g) => g.links);

  it('prefiere la coincidencia más específica', () => {
    expect(findNavLinkForPath(links, '/dashboard/purchases/orders/abc')?.id).toBe('purchase-orders');
    expect(findNavLinkForPath(links, '/dashboard/purchases/new')?.id).toBe('purchases');
    expect(findNavLinkForPath(links, '/dashboard/hr/payroll/123/payslips/9')?.id).toBe('hr-payroll');
    expect(findNavLinkForPath(links, '/dashboard/hr')?.id).toBe('hr-employees');
  });

  it('Inicio solo coincide exacto', () => {
    expect(findNavLinkForPath(links, '/dashboard')?.id).toBe('home');
    expect(findNavLinkForPath(links, '/dashboard/no-existe')).toBeNull();
  });

  it('no confunde prefijos parecidos', () => {
    expect(findNavLinkForPath(links, '/dashboard/salesforce')).toBeNull();
  });
});
