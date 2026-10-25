import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { ALL_PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { MODULE_KEYS, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { canOpenExports, exportAccess } from '@/lib/exports/access';
import {
  SALES_GROUP_TYPES,
  movementsQuery,
  readMovementsFilter,
  readRange,
  readSalesFilter,
  salesQuery,
  type ParamReader,
} from '@/lib/exports/filters';
import { describeRange, exportFileName, isValidDay, normalizeRange, presetRange, rangeFromParams } from '@/lib/exports/ranges';

/**
 * «Exportar datos»: rangos de fechas, lectura de filtros, quién ve qué y que el
 * menú lo ofrezca solo a quien corresponde. Las consultas contra Postgres están
 * en `exports-db.test.ts`.
 */

// Sábado 2026-10-24, en Santiago.
const TODAY = { year: 2026, month: 10, day: 24 };
const reader = (params: Record<string, string>): ParamReader => (key) => params[key];
const features = (on: string[] = []): CompanyFeatureFlags => Object.fromEntries(MODULE_KEYS.map((key) => [key, on.includes(key)])) as CompanyFeatureFlags;

describe('atajos de fechas', () => {
  it.each([
    ['hoy', '2026-10-24', '2026-10-24'],
    ['ayer', '2026-10-23', '2026-10-23'],
    ['7dias', '2026-10-18', '2026-10-24'],
    ['mes', '2026-10-01', '2026-10-24'],
    ['mes-anterior', '2026-09-01', '2026-09-30'],
    ['anio', '2026-01-01', '2026-10-24'],
  ] as const)('%s', (preset, from, to) => {
    expect(presetRange(preset, TODAY)).toEqual({ from, to });
  });

  it('todo el historial no limita las fechas', () => {
    expect(presetRange('todo', TODAY)).toEqual({});
  });

  it('cruza el fin de mes y de año sin salirse del calendario', () => {
    expect(presetRange('ayer', { year: 2026, month: 3, day: 1 })).toEqual({ from: '2026-02-28', to: '2026-02-28' });
    expect(presetRange('ayer', { year: 2028, month: 3, day: 1 })).toEqual({ from: '2028-02-29', to: '2028-02-29' });
    expect(presetRange('7dias', { year: 2026, month: 1, day: 3 })).toEqual({ from: '2025-12-28', to: '2026-01-03' });
    expect(presetRange('mes-anterior', { year: 2026, month: 1, day: 15 })).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('mes-anterior', { year: 2026, month: 3, day: 31 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('fechas escritas a mano', () => {
  it('rechaza lo que no es una fecha real', () => {
    expect(isValidDay('2026-10-24')).toBe(true);
    expect(isValidDay('2026-02-31')).toBe(false);
    expect(isValidDay('24-10-2026')).toBe(false);
    expect(isValidDay('')).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });

  it('ignora lo inválido y da vuelta un rango al revés', () => {
    expect(normalizeRange('2026-10-20', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-20' });
    expect(normalizeRange('nada', '2026-10-01')).toEqual({ to: '2026-10-01' });
    expect(normalizeRange(undefined, undefined)).toEqual({});
  });
});

describe('qué rango pide la dirección', () => {
  it('sin nada, el mes en curso', () => {
    expect(rangeFromParams({}, TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-24', preset: 'mes' });
  });

  it('un atajo manda sobre las fechas sueltas', () => {
    expect(rangeFromParams({ rango: 'ayer', desde: '2026-01-01' }, TODAY)).toMatchObject({ from: '2026-10-23', to: '2026-10-23', preset: 'ayer' });
    expect(rangeFromParams({ rango: 'inventado' }, TODAY).preset).toBe('mes');
  });

  it('fechas propias; un lado vacío no limita ese lado', () => {
    expect(rangeFromParams({ desde: '2026-09-10', hasta: '2026-09-20' }, TODAY)).toEqual({ from: '2026-09-10', to: '2026-09-20', preset: 'custom' });
    expect(rangeFromParams({ desde: '2026-09-10', hasta: '' }, TODAY)).toEqual({ from: '2026-09-10', preset: 'custom' });
  });

  it('el formulario enviado sin fechas es «todo el historial», no el mes', () => {
    expect(rangeFromParams({ desde: '', hasta: '' }, TODAY)).toEqual({ preset: 'todo' });
    expect(rangeFromParams({ rango: 'todo' }, TODAY)).toEqual({ preset: 'todo' });
  });

  it('se describe para el título y el nombre del archivo', () => {
    expect(describeRange({ from: '2026-10-01', to: '2026-10-24' })).toBe('01-10-2026 al 24-10-2026');
    expect(describeRange({ from: '2026-10-24', to: '2026-10-24' })).toBe('24-10-2026');
    expect(describeRange({})).toBe('todo el historial');
    expect(exportFileName('boletas', { from: '2026-10-01', to: '2026-10-24' })).toBe('boletas-2026-10-01_a_2026-10-24.xlsx');
    expect(exportFileName('boletas', { from: '2026-10-24', to: '2026-10-24' })).toBe('boletas-2026-10-24.xlsx');
    expect(exportFileName('boletas', {})).toBe('boletas-historial-completo.xlsx');
  });
});

describe('filtros de boletas', () => {
  it('por defecto: boletas emitidas del mes en curso', () => {
    expect(readSalesFilter(reader({}), TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-24', group: 'BOLETAS', status: 'ISSUED', warehouseId: undefined, q: undefined });
  });

  it('lo desconocido cae al valor por defecto y los textos se acotan', () => {
    const filter = readSalesFilter(reader({ tipo: 'COTIZACION', estado: 'DRAFT', q: `  ${'x'.repeat(200)}  `, bodega: ' b1 ' }), TODAY);
    expect(filter.group).toBe('BOLETAS');
    expect(filter.status).toBe('ISSUED');
    expect(filter.q).toHaveLength(80);
    expect(filter.warehouseId).toBe('b1');
  });

  it('las cotizaciones y los borradores nunca se exportan', () => {
    for (const types of Object.values(SALES_GROUP_TYPES)) expect(types).not.toContain('COTIZACION');
    expect(readSalesFilter(reader({ estado: 'DRAFT' }), TODAY).status).toBe('ISSUED');
  });

  it('la dirección de descarga lleva exactamente el mismo filtro', () => {
    const filter = readSalesFilter(reader({ tipo: 'FACTURAS', estado: 'BOTH', bodega: 'b1', q: 'Ana', desde: '2026-09-01', hasta: '2026-09-30' }), TODAY);
    const again = readSalesFilter((key) => new URLSearchParams(salesQuery(filter)).get(key) ?? undefined, TODAY);
    expect(again).toEqual(filter);
  });

  it('«todo el historial» sobrevive al viaje por la dirección', () => {
    const filter = readSalesFilter(reader({ rango: 'todo' }), TODAY);
    expect(filter.from).toBeUndefined();
    const again = readSalesFilter((key) => new URLSearchParams(salesQuery(filter)).get(key) ?? undefined, TODAY);
    expect(again.from).toBeUndefined();
    expect(again.to).toBeUndefined();
  });
});

describe('filtros de movimientos', () => {
  it('por defecto: todos los tipos y todas las bodegas del mes en curso', () => {
    expect(readMovementsFilter(reader({}), TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-24', kind: 'ALL', warehouseId: undefined, q: undefined });
  });

  it('un tipo desconocido es «todos»', () => {
    expect(readMovementsFilter(reader({ tipo: 'OUTFLOWS' }), TODAY).kind).toBe('OUTFLOWS');
    expect(readMovementsFilter(reader({ tipo: 'inventado' }), TODAY).kind).toBe('ALL');
  });

  it('la dirección de descarga lleva el mismo filtro', () => {
    const filter = readMovementsFilter(reader({ tipo: 'SALES', bodega: 'b2', q: 'leche', rango: 'todo' }), TODAY);
    const again = readMovementsFilter((key) => new URLSearchParams(movementsQuery(filter)).get(key) ?? undefined, TODAY);
    expect(again).toEqual(filter);
  });

  it('readRange expone el atajo activo para resaltarlo', () => {
    expect(readRange(reader({ rango: 'ayer' }), TODAY).preset).toBe('ayer');
    expect(readRange(reader({ desde: '2026-10-01' }), TODAY).preset).toBe('custom');
  });
});

describe('quién puede exportar qué', () => {
  const access = (on: string[], permissions: Permission[]) => exportAccess({ features: features(on), permissions });

  it('boletas: con Facturación y ver ventas', () => {
    expect(access(['hasDteBilling'], ['sales:read']).sales).toBe(true);
    expect(access(['hasDteBilling'], []).sales).toBe(false);
    expect(access([], ['sales:read']).sales).toBe(false);
  });

  it('boletas: una empresa que solo tiene POS las exporta con el permiso de consultar turnos', () => {
    expect(access(['hasPos'], ['pos:close']).sales).toBe(true);
    // Operar la caja propia no basta: trae los clientes de todas las cajas.
    expect(access(['hasPos'], ['pos:operate']).sales).toBe(false);
    expect(access([], ['pos:close']).sales).toBe(false);
  });

  it('movimientos: con Inventario y ver productos; el costo solo con su permiso', () => {
    expect(access(['hasInventory'], ['products:read'])).toMatchObject({ movements: true, costs: false });
    expect(access(['hasInventory', 'hasPmpCosting'], ['products:read', 'products:costs'])).toMatchObject({ movements: true, costs: true });
    expect(access([], ['products:read', 'products:costs'])).toMatchObject({ movements: false, costs: false });
  });

  it('el libro completo se ofrece solo con Reportes', () => {
    expect(access(['hasAdvancedReports'], ['reports:read']).fullReport).toBe(true);
    expect(access([], ['reports:read']).fullReport).toBe(false);
  });

  it('sin nada que exportar, no hay pantalla', () => {
    expect(canOpenExports(access([], []))).toBe(false);
    expect(canOpenExports(access(['hasInventory'], ['products:read']))).toBe(true);
  });
});

describe('el menú', () => {
  const link = (on: string[], permissions: readonly Permission[]) =>
    buildAvailableWorkspaceNav({ features: features(on), permissions }).flatMap((group) => group.links).find((entry) => entry.id === 'exports');

  it('ofrece «Exportar datos» a quien puede bajar algo', () => {
    expect(link(['hasInventory'], ['products:read'])).toMatchObject({ href: '/dashboard/exports', label: 'Exportar datos' });
    expect(link(['hasDteBilling'], ['sales:read'])).toBeDefined();
    expect(link(['hasPos'], ['pos:close'])).toBeDefined();
  });

  it('no lo ofrece sin permiso ni módulo', () => {
    expect(link(['hasInventory'], [])).toBeUndefined();
    expect(link([], ['products:read', 'sales:read'])).toBeUndefined();
  });

  it('está en el grupo Principal y se ve con todo encendido', () => {
    const groups = buildAvailableWorkspaceNav({ features: features(MODULE_KEYS), permissions: ALL_PERMISSIONS });
    expect(groups.find((group) => group.label === 'Principal')?.links.map((entry) => entry.id)).toContain('exports');
  });
});
