import { buildModuleCatalog } from '@/lib/navigation/module-catalog';
import { allKnownNavItemIds } from '@/lib/navigation/workspace-nav';
import { MODULE_KEYS } from '@/lib/auth/modules';

describe('catálogo del panel SaaS por área', () => {
  const catalog = buildModuleCatalog();
  const screens = catalog.flatMap((area) => [...area.modules.flatMap((mod) => mod.items), ...area.baseItems]);

  it('cada pantalla del menú aparece exactamente una vez', () => {
    const ids = screens.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(allKnownNavItemIds());
  });

  it('cada módulo contratable aparece exactamente una vez', () => {
    const keys = catalog.flatMap((area) => area.modules.map((mod) => mod.key));
    expect(keys.sort()).toEqual([...MODULE_KEYS].sort());
  });

  it('Clientes & Proveedores se puede ocultar desde Ventas', () => {
    const ventas = catalog.find((area) => area.label === 'Ventas');
    const contacts = ventas?.baseItems.find((item) => item.id === 'contacts');
    expect(contacts).toBeDefined();
    expect(contacts?.locked).toBe(false);
  });

  it('Inicio y Configuración quedan bloqueados', () => {
    expect(screens.filter((item) => item.locked).map((item) => item.id).sort()).toEqual(['home', 'settings']);
  });

  it('las pantallas que dependen de dos módulos van con su dueño', () => {
    const moduleOf = (id: string) => catalog.flatMap((area) => area.modules).find((mod) => mod.items.some((item) => item.id === id))?.key;
    expect(moduleOf('agents')).toBe('hasCrm');
    expect(moduleOf('contracts')).toBe('hasCandidates');
  });
});
