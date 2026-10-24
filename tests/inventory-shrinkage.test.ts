import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isCalendarDay,
  isExpiryAlertDay,
  reasonKey,
  resolvePeriod,
  suggestLiability,
  summarizeShrinkage,
} from '@/lib/inventory/shrinkage';
import { assignLiabilitySchema, shrinkageSettingsSchema } from '@/modules/inventory/shrinkage.schema';

/**
 * Mermas con responsable: la sugerencia sale solo de lo que la empresa
 * definió, nunca se adivina el proveedor, y el resumen cuadra por estado.
 */

describe('responsable sugerido', () => {
  const defaults = { EXPIRED: 'SUPPLIER', DAMAGED: 'STORE', NONE: 'STORE' } as const;

  it('sin acuerdo para el motivo no hay sugerencia', () => {
    expect(suggestLiability({ reasonCode: 'TASTING', defaults, movementSupplierId: null, productSupplierIds: ['a'] })).toBeNull();
    expect(suggestLiability({ reasonCode: 'EXPIRED', defaults: {}, movementSupplierId: 'a', productSupplierIds: ['a'] })).toBeNull();
  });

  it('la tienda no necesita proveedor; una salida sin motivo usa el acuerdo de "sin motivo"', () => {
    expect(suggestLiability({ reasonCode: 'DAMAGED', defaults, movementSupplierId: null, productSupplierIds: [] })).toEqual({ party: 'STORE', supplierId: null });
    expect(suggestLiability({ reasonCode: null, defaults, movementSupplierId: null, productSupplierIds: [] })).toEqual({ party: 'STORE', supplierId: null });
    // Un código desconocido cuenta como sin motivo, no como uno de la lista.
    expect(reasonKey('INVENTADO')).toBe('NONE');
  });

  it('la mercadería de un seller la responde su dueño, antes que la llegada o los proveedores', () => {
    expect(suggestLiability({ reasonCode: 'EXPIRED', defaults, productConsignorId: 'seller', movementSupplierId: 'llegada', productSupplierIds: ['a', 'b'] })).toEqual({ party: 'SUPPLIER', supplierId: 'seller' });
    expect(suggestLiability({ reasonCode: 'DAMAGED', defaults, productConsignorId: 'seller', movementSupplierId: null, productSupplierIds: [] })).toEqual({ party: 'STORE', supplierId: null });
  });

  it('el proveedor: el de la llegada, o el único del producto; con varios y sin llegada decide una persona', () => {
    expect(suggestLiability({ reasonCode: 'EXPIRED', defaults, movementSupplierId: 'llegada', productSupplierIds: ['a', 'b'] })).toEqual({ party: 'SUPPLIER', supplierId: 'llegada' });
    expect(suggestLiability({ reasonCode: 'EXPIRED', defaults, movementSupplierId: null, productSupplierIds: ['a'] })).toEqual({ party: 'SUPPLIER', supplierId: 'a' });
    expect(suggestLiability({ reasonCode: 'EXPIRED', defaults, movementSupplierId: null, productSupplierIds: ['a', 'b'] })).toBeNull();
    expect(suggestLiability({ reasonCode: 'EXPIRED', defaults, movementSupplierId: null, productSupplierIds: [] })).toBeNull();
  });
});

describe('resumen', () => {
  const rows = [
    { quantity: 2, totalCost: 1000, state: 'STORE' as const, supplier: null },
    { quantity: 3, totalCost: 3000, state: 'SUPPLIER' as const, supplier: { id: 'b', name: 'Quesos B' } },
    { quantity: 1, totalCost: 5000, state: 'SUPPLIER' as const, supplier: { id: 'a', name: 'Miel A' } },
    { quantity: 4, totalCost: 400, state: 'SUPPLIER' as const, supplier: { id: 'b', name: 'Quesos B' } },
    { quantity: 5, totalCost: 50, state: 'UNASSIGNED' as const, supplier: null },
  ];

  it('suma por estado y por proveedor, de mayor a menor costo', () => {
    const summary = summarizeShrinkage(rows, true);
    expect(summary).toMatchObject({ movements: 5, units: 15, cost: 9450 });
    expect(summary.byState.STORE).toEqual({ movements: 1, units: 2, cost: 1000 });
    expect(summary.byState.SUPPLIER).toEqual({ movements: 3, units: 8, cost: 8400 });
    expect(summary.byState.UNASSIGNED).toEqual({ movements: 1, units: 5, cost: 50 });
    expect(summary.bySupplier.map((entry) => [entry.name, entry.cost])).toEqual([
      ['Miel A', 5000],
      ['Quesos B', 3400],
    ]);
  });

  it('sin permiso de costos no hay montos', () => {
    const summary = summarizeShrinkage(rows.map((row) => ({ ...row, totalCost: null })), false);
    expect(summary.cost).toBeNull();
    expect(summary.byState.SUPPLIER.cost).toBeNull();
    expect(summary.bySupplier[0]).toMatchObject({ cost: null });
    // Sin costos se ordena por unidades.
    expect(summary.bySupplier[0]!.name).toBe('Quesos B');
  });
});

describe('período y avisos', () => {
  it('fechas inválidas o ausentes = los últimos 30 días; al revés se ordenan', () => {
    expect(resolvePeriod(undefined, undefined, '2026-10-23')).toEqual({ from: '2026-09-24', to: '2026-10-23' });
    expect(resolvePeriod('2026-02-31', 'mañana', '2026-10-23')).toEqual({ from: '2026-09-24', to: '2026-10-23' });
    expect(resolvePeriod('2026-10-10', '2026-10-01', '2026-10-23')).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(isCalendarDay('2028-02-29')).toBe(true);
    expect(isCalendarDay('2026-02-29')).toBe(false);
  });

  it('un lote avisa el día que le faltan los días configurados y el día que vence, no a diario', () => {
    expect([7, 6, 1, 0, -1].map((days) => isExpiryAlertDay(days, 7))).toEqual([true, false, false, true, false]);
  });
});

describe('esquemas', () => {
  it('responder el proveedor exige cuál', () => {
    expect(assignLiabilitySchema.safeParse({ movementId: 'm1', party: 'SUPPLIER' }).success).toBe(false);
    expect(assignLiabilitySchema.safeParse({ movementId: 'm1', party: 'SUPPLIER', supplierId: 's1' }).success).toBe(true);
    expect(assignLiabilitySchema.safeParse({ movementId: 'm1', party: null }).success).toBe(true);
    expect(assignLiabilitySchema.safeParse({ movementId: 'm1', party: 'CLIENTE' }).success).toBe(false);
  });

  it('acuerdos: solo motivos y responsables de la lista, y días de aviso de la lista', () => {
    expect(shrinkageSettingsSchema.safeParse({ defaults: { EXPIRED: 'SUPPLIER', NONE: 'STORE' }, expiryAlerts: true, expiryAlertDays: 7 }).success).toBe(true);
    expect(shrinkageSettingsSchema.safeParse({ defaults: { INVENTADO: 'STORE' }, expiryAlerts: true, expiryAlertDays: 7 }).success).toBe(false);
    expect(shrinkageSettingsSchema.safeParse({ defaults: { EXPIRED: 'NADIE' }, expiryAlerts: true, expiryAlertDays: 7 }).success).toBe(false);
    expect(shrinkageSettingsSchema.safeParse({ defaults: {}, expiryAlerts: true, expiryAlertDays: 8 }).success).toBe(false);
  });
});

describe('referencias que definen una pérdida', () => {
  it('la toma de inventario sigue escribiendo la referencia que se reconoce como faltante', () => {
    const source = readFileSync(join(__dirname, '../src/modules/inventory/services/inventory-count.service.ts'), 'utf8');
    expect(source).toContain('const reference = `Toma de inventario #${count.folio}`;');
  });
});
