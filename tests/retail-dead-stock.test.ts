import {
  DEAD_STOCK_DAY_OPTIONS,
  daysBetween,
  isAlertMilestone,
  isDeadStockDays,
  stoppedSince,
  suggestFor,
  summarizeDeadStock,
  type DeadStockRow,
} from '@/lib/retail/dead-stock';
import { DEFAULT_FEATURES, MODULES, moduleEnabled, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { buildModuleCatalog } from '@/lib/navigation/module-catalog';
import { catalogoDeModulos, flagsDeModulo, flagsParaEncender } from '@/lib/supersuite/modulos';
import { getVisibleManualSections } from '@/modules/manual/content';

/**
 * Stock muerto: qué cuenta como detenido (lo recién llegado no) y el
 * interruptor propio dentro de Métricas de retail (solo funciona con los dos
 * encendidos, y encenderlo desde la Supersuite enciende también al padre).
 */

const d = (iso: string) => new Date(iso);
const NOW = d('2026-10-23T18:00:00Z');

describe('desde cuándo está detenido', () => {
  it('corre desde la última salida si es lo más reciente', () => {
    expect(stoppedSince({ lastOutAt: d('2026-09-01T00:00:00Z'), restockedAt: d('2026-06-01T00:00:00Z'), firstMovementAt: d('2026-01-01T00:00:00Z') })).toEqual(d('2026-09-01T00:00:00Z'));
  });

  it('lo que volvió a tener stock después de agotarse empieza de cero', () => {
    expect(stoppedSince({ lastOutAt: d('2026-08-01T00:00:00Z'), restockedAt: d('2026-10-15T00:00:00Z'), firstMovementAt: d('2026-01-01T00:00:00Z') })).toEqual(d('2026-10-15T00:00:00Z'));
  });

  it('sin salidas ni reabastecimiento usa el primer movimiento; sin kardex no inventa nada', () => {
    expect(stoppedSince({ lastOutAt: null, restockedAt: null, firstMovementAt: d('2026-03-01T00:00:00Z') })).toEqual(d('2026-03-01T00:00:00Z'));
    expect(stoppedSince({ lastOutAt: null, restockedAt: null, firstMovementAt: null })).toBeNull();
  });

  it('cuenta días completos y nunca negativos', () => {
    expect(daysBetween(d('2026-09-23T17:00:00Z'), NOW)).toBe(30);
    expect(daysBetween(d('2026-09-23T19:00:00Z'), NOW)).toBe(29);
    expect(daysBetween(d('2026-10-24T00:00:00Z'), NOW)).toBe(0);
  });
});

describe('sugerencia por producto', () => {
  const base = { neverSold: false, daysStopped: 40, thresholdDays: 30, daysToExpiry: null };
  it('el vencimiento manda sobre todo lo demás', () => {
    expect(suggestFor({ ...base, neverSold: true, daysToExpiry: -2 })).toBe('EXPIRED');
    expect(suggestFor({ ...base, neverSold: true, daysToExpiry: 12 })).toBe('EXPIRING');
  });
  it('nunca vendido, mucho tiempo detenido o recién detenido', () => {
    expect(suggestFor({ ...base, daysToExpiry: 200, neverSold: true })).toBe('NEVER_SOLD');
    expect(suggestFor({ ...base, daysStopped: 90 })).toBe('LONG_STOPPED');
    expect(suggestFor(base)).toBe('STOPPED');
  });
});

describe('hitos de aviso', () => {
  it('avisa al cumplir el umbral y luego cada otro tanto, no a diario', () => {
    expect([29, 30, 31, 59, 60, 90].map((days) => isAlertMilestone(days, 30))).toEqual([false, true, false, false, true, true]);
    expect(isAlertMilestone(0, 0)).toBe(false);
  });
  it('el umbral sale de una lista cerrada', () => {
    expect(DEAD_STOCK_DAY_OPTIONS).toContain(30);
    expect(isDeadStockDays(30)).toBe(true);
    expect(isDeadStockDays(31)).toBe(false);
  });
});

describe('resumen', () => {
  const row = (partial: Partial<DeadStockRow>): DeadStockRow => ({
    productId: 'p', name: 'P', sku: 'S', brand: null, unit: 'UN', category: null, stock: 2, daysStopped: 40, lastSaleAt: null, neverSold: false, daysToExpiry: null, value: 1000, suggestion: 'STOPPED', ...partial,
  });
  it('suma unidades y valor solo si se pueden ver costos', () => {
    const rows = [row({ neverSold: true, suggestion: 'NEVER_SOLD' }), row({ stock: 3, value: 500, suggestion: 'EXPIRING' })];
    expect(summarizeDeadStock(rows, true)).toEqual({ products: 2, units: 5, value: 1500, neverSold: 1, expiring: 1 });
    expect(summarizeDeadStock(rows, false).value).toBeNull();
  });
});

describe('interruptor propio dentro de Métricas de retail', () => {
  const flags = (on: Partial<CompanyFeatureFlags>): CompanyFeatureFlags => ({ ...DEFAULT_FEATURES, ...on });
  const navIds = (features: CompanyFeatureFlags) => buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features }).flatMap((group) => group.links.map((link) => link.id));

  it('declara a su padre y usa sus permisos', () => {
    const mod = MODULES.find((entry) => entry.key === 'hasDeadStock')!;
    expect(mod.requires).toBe('hasRetailMetrics');
    expect(mod.permissions).toEqual([]);
  });

  it('solo funciona con los dos encendidos', () => {
    expect(moduleEnabled(flags({ hasDeadStock: true }), 'hasDeadStock')).toBe(false);
    expect(moduleEnabled(flags({ hasRetailMetrics: true }), 'hasDeadStock')).toBe(false);
    expect(moduleEnabled(flags({ hasRetailMetrics: true, hasDeadStock: true }), 'hasDeadStock')).toBe(true);
  });

  it('el menú lo muestra solo con los dos encendidos, y el padre puede ir solo', () => {
    expect(navIds(flags({ hasDeadStock: true }))).not.toContain('retail-dead-stock');
    expect(navIds(flags({ hasRetailMetrics: true }))).toEqual(expect.arrayContaining(['retail-live']));
    expect(navIds(flags({ hasRetailMetrics: true }))).not.toContain('retail-dead-stock');
    expect(navIds(flags({ hasRetailMetrics: true, hasDeadStock: true }))).toEqual(expect.arrayContaining(['retail-live', 'retail-dead-stock']));
  });

  it('el manual tampoco lo muestra sin el padre', () => {
    const ids = (features: CompanyFeatureFlags) => getVisibleManualSections(features).map((section) => section.id);
    expect(ids(flags({ hasDeadStock: true }))).not.toContain('stock-muerto');
    expect(ids(flags({ hasRetailMetrics: true, hasDeadStock: true }))).toContain('stock-muerto');
  });

  it('en Configuración → Módulos y menú su pantalla es de su propio interruptor', () => {
    const moduleOf = (id: string) => buildModuleCatalog().flatMap((area) => area.modules).find((mod) => mod.items.some((item) => item.id === id))?.key;
    expect(moduleOf('retail-dead-stock')).toBe('hasDeadStock');
    expect(moduleOf('retail-live')).toBe('hasRetailMetrics');
  });

  it('la Supersuite lo nombra aparte y encenderlo enciende también al padre (apagar no arrastra)', () => {
    expect(flagsDeModulo('stock_muerto')).toEqual(['hasDeadStock']);
    expect(flagsParaEncender(['hasDeadStock']).sort()).toEqual(['hasDeadStock', 'hasRetailMetrics']);
    expect(flagsParaEncender(['hasRetailMetrics'])).toEqual(['hasRetailMetrics']);
    const item = catalogoDeModulos().find((entry) => entry.alias.includes('stock_muerto'));
    expect(item).toMatchObject({ id: 'dead-stock', precioMensual: 3990, desactivable: true });
  });
});
