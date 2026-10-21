import { MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { ALL_PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { findManualSectionForPath, getManualSections, getVisibleManualSections, searchManual } from '@/modules/manual/content';
import { findHintForPath, hintTopicsForPath, toManualHints } from '@/modules/manual/hints';
import { normalizeSearch } from '@/modules/manual/search';

/**
 * El manual tiene que adaptarse a lo que la empresa contrató (nunca mostrar
 * un módulo ajeno) y, en "mi rol", a lo que la persona puede hacer.
 */

function features(enabled: FeatureKey[]): CompanyFeatureFlags {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, enabled.includes(key)])) as CompanyFeatureFlags;
}

const ALL = features([...MODULE_KEYS]);

describe('Alcance del manual', () => {
  it('nunca incluye módulos no contratados, ni en el alcance de la empresa', () => {
    const onlyInventory = getManualSections('company', features(['hasInventory']), ALL_PERMISSIONS);
    const ids = onlyInventory.map((section) => section.id);
    expect(ids).toContain('catalogo-inventario');
    expect(ids).not.toContain('punto-de-venta');
    expect(ids).not.toContain('remuneraciones');
    expect(ids).not.toContain('candidatas');
  });

  it('el alcance de la empresa no depende del rol de quien lo pide', () => {
    const asOwner = getManualSections('company', ALL, ALL_PERMISSIONS).map((section) => section.id);
    const asNobody = getManualSections('company', ALL, []).map((section) => section.id);
    expect(asNobody).toEqual(asOwner);
  });

  it('"mi rol" muestra solo las secciones que el usuario puede abrir', () => {
    const warehouse: Permission[] = ['products:read', 'inventory:write', 'contacts:read'];
    const ids = getManualSections('role', ALL, warehouse).map((section) => section.id);
    expect(ids).toContain('catalogo-inventario');
    expect(ids).toContain('clientes-proveedores');
    expect(ids).not.toContain('remuneraciones');
    expect(ids).not.toContain('ventas-facturacion');
    expect(ids).not.toContain('configuracion');
  });

  it('"mi rol" quita los temas que el rol no puede hacer, dentro de una sección visible', () => {
    const readOnly = getVisibleManualSections(ALL, ['products:read']).find((section) => section.id === 'catalogo-inventario');
    const writer = getVisibleManualSections(ALL, ['products:read', 'products:write', 'inventory:write']).find((section) => section.id === 'catalogo-inventario');
    expect(readOnly!.topics.map((topic) => topic.id)).not.toContain('crear-producto');
    expect(writer!.topics.map((topic) => topic.id)).toContain('crear-producto');
  });

  it('"Contratos firmados" aparece con candidatas O con auspicios', () => {
    const withSponsorships = getManualSections('company', features(['hasSponsorships']), ALL_PERMISSIONS).map((section) => section.id);
    const withNeither = getManualSections('company', features(['hasInventory']), ALL_PERMISSIONS).map((section) => section.id);
    expect(withSponsorships).toContain('contratos-firmados');
    expect(withNeither).not.toContain('contratos-firmados');
  });
});

describe('Sección de la pantalla actual', () => {
  it('elige la ruta más específica, incluidas las de los temas', () => {
    expect(findManualSectionForPath('/dashboard/treasury/banks/abc')?.id).toBe('bancos-conciliacion');
    expect(findManualSectionForPath('/dashboard/purchases/orders/123')?.id).toBe('compras');
    expect(findManualSectionForPath('/dashboard/accounting/ledger')?.id).toBe('contabilidad');
    expect(findManualSectionForPath('/dashboard')?.id).toBe('primeros-pasos');
  });

  it('los hints livianos del navegador dan la misma respuesta', () => {
    const hints = toManualHints(getVisibleManualSections(ALL, ALL_PERMISSIONS));
    const hint = findHintForPath(hints, '/dashboard/hr/payroll/123');
    expect(hint?.id).toBe('remuneraciones');
    expect(hintTopicsForPath(hint!, '/dashboard/hr/payroll/123').map((topic) => topic.title)).toEqual(['Calcular las liquidaciones del mes']);
  });
});

describe('Búsqueda del manual', () => {
  const sections = getVisibleManualSections(ALL, ALL_PERMISSIONS);

  it('ignora tildes y mayúsculas', () => {
    expect(normalizeSearch('Liquidación ÁRBOL')).toBe('liquidacion arbol');
    const titles = searchManual(sections, 'liquidacion').flatMap((section) => section.topics.map((topic) => topic.title));
    expect(titles).toContain('Calcular las liquidaciones del mes');
  });

  it('exige todas las palabras, aunque no estén juntas', () => {
    const titles = searchManual(sections, 'anular boleta').flatMap((section) => section.topics.map((topic) => topic.title));
    expect(titles).toContain('Anular una boleta hecha por error');
    expect(searchManual(sections, 'anular xyzzy')).toHaveLength(0);
  });

  it('sin texto devuelve todo', () => {
    expect(searchManual(sections, '   ')).toHaveLength(sections.length);
  });
});
