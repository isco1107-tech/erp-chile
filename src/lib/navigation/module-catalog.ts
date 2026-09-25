import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { MODULES, MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { LOCKED_NAV_ITEMS, buildAvailableWorkspaceNav } from './workspace-nav';

/**
 * Catálogo del panel SaaS: cada área del menú (Ventas, Finanzas, Candidatas…)
 * con los módulos contratables que viven ahí y las pantallas de cada uno.
 * Se DERIVA del registro de navegación y del registro de módulos —no es una
 * lista escrita a mano—: la pantalla que desaparece del menú al apagar un
 * módulo es de ese módulo. Así un módulo o una pantalla nueva aparece sola
 * en el panel.
 *
 * Dos niveles de control, con efectos distintos:
 * - Módulo (`CompanyFeatures`): el contrato. Apagado, sus rutas y permisos
 *   quedan bloqueados para toda la empresa.
 * - Pantalla (`CompanySettings.disabledNavItems`): el menú. Apagada, deja de
 *   verse en el menú, la paleta ⌘K y su ruta muestra "sección desactivada".
 *   Sirve también para lo que no depende de un módulo (Clientes &
 *   Proveedores, Mensajería, Manual…).
 */

export interface CatalogItem {
  id: string;
  label: string;
  /** Inicio y Configuración: no se pueden apagar. */
  locked: boolean;
}

export interface CatalogModule {
  key: FeatureKey;
  label: string;
  description: string;
  items: CatalogItem[];
}

export interface CatalogArea {
  label: string;
  modules: CatalogModule[];
  /** Pantallas del área incluidas en todo plan (no dependen de un módulo). */
  baseItems: CatalogItem[];
}

/** Módulos sin pantalla propia en el menú: a qué área pertenecen en el panel. */
const MODULE_AREA_FALLBACK: Partial<Record<FeatureKey, string>> = {
  hasPmpCosting: 'Inventario',
  hasMultipleWarehouses: 'Inventario',
};
const GENERAL_AREA = 'General del plan';

function allFeatures(value: boolean): CompanyFeatureFlags {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, value])) as CompanyFeatureFlags;
}

function navIds(features: CompanyFeatureFlags): Set<string> {
  const groups = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features, isSuperAdmin: false });
  return new Set(groups.flatMap((group) => group.links.map((link) => link.id)));
}

export function buildModuleCatalog(): CatalogArea[] {
  const full = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features: allFeatures(true), isSuperAdmin: false });
  const groupOf = new Map<string, string>();
  const labelOf = new Map<string, string>();
  const hrefOf = new Map<string, string>();
  for (const group of full) {
    for (const link of group.links) {
      groupOf.set(link.id, group.label);
      labelOf.set(link.id, link.label);
      hrefOf.set(link.id, link.href);
    }
  }
  const fullIds = new Set(groupOf.keys());

  // Pantallas de cada módulo: las que desaparecen al apagar solo ese módulo.
  const moduleOfItem = new Map<string, FeatureKey>();
  for (const mod of MODULES) {
    const without = navIds({ ...allFeatures(true), [mod.key]: false });
    for (const id of fullIds) if (!without.has(id) && !moduleOfItem.has(id)) moduleOfItem.set(id, mod.key);
  }
  // Pantallas que dependen de varios módulos a la vez (ej. "Agentes" sale con
  // Agentes o con Eventos; "Contratos firmados" con Candidatas o Auspicios):
  // van con el módulo dueño de su ruta o, si no hay, con el que domina su grupo.
  const withNone = navIds(allFeatures(false));
  for (const id of fullIds) {
    if (moduleOfItem.has(id) || withNone.has(id)) continue;
    const href = hrefOf.get(id) ?? '';
    const owner = MODULES.find((mod) => mod.routes.some((route) => href === route || href.startsWith(`${route}/`)));
    if (owner) {
      moduleOfItem.set(id, owner.key);
      continue;
    }
    const group = groupOf.get(id);
    const sibling = [...moduleOfItem.entries()].find(([other]) => groupOf.get(other) === group);
    if (sibling) moduleOfItem.set(id, sibling[1]);
  }

  const item = (id: string): CatalogItem => ({ id, label: labelOf.get(id) ?? id, locked: LOCKED_NAV_ITEMS.includes(id) });
  const areas = new Map<string, CatalogArea>();
  const area = (label: string) => {
    let found = areas.get(label);
    if (!found) {
      found = { label, modules: [], baseItems: [] };
      areas.set(label, found);
    }
    return found;
  };
  // El orden de las áreas es el del menú.
  for (const group of full) area(group.label);

  for (const mod of MODULES) {
    const items = [...fullIds].filter((id) => moduleOfItem.get(id) === mod.key);
    const areaLabel = items.length > 0 ? groupOf.get(items[0])! : (MODULE_AREA_FALLBACK[mod.key] ?? GENERAL_AREA);
    area(areaLabel).modules.push({ key: mod.key, label: mod.label, description: mod.description, items: items.map(item) });
  }
  for (const id of fullIds) {
    if (!moduleOfItem.has(id)) area(groupOf.get(id)!).baseItems.push(item(id));
  }

  return [...areas.values()].filter((a) => a.modules.length > 0 || a.baseItems.length > 0);
}
