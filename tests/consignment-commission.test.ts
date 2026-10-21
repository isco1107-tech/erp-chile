import {
  MAX_COMMISSION_BPS,
  isValidCommissionBps,
  resolveCommissionBps,
  splitConsignmentSale,
  summarizeSettlementLines,
} from '@/lib/consignment/commission';
import { assignProductSchema, buildSettlementSchema, createProducerSchema } from '@/modules/consignment/schema';
import { checkPermission } from '@/lib/auth/permissions';
import { DEFAULT_FEATURES, moduleForPermission } from '@/lib/auth/modules';

describe('splitConsignmentSale', () => {
  it('reparte 20% de una venta redonda', () => {
    expect(splitConsignmentSale(10_000, 2000)).toEqual({ soldNet: 10_000, commissionBps: 2000, commissionAmount: 2000, producerAmount: 8000 });
  });

  it('redondea la comisión con Math.round y el productor recibe el resto', () => {
    // 1.001 * 15% = 150,15 -> 150
    expect(splitConsignmentSale(1001, 1500)).toMatchObject({ commissionAmount: 150, producerAmount: 851 });
    // 1.003 * 15% = 150,45 -> 150 ; 1.004 * 15% = 150,6 -> 151
    expect(splitConsignmentSale(1003, 1500).commissionAmount).toBe(150);
    expect(splitConsignmentSale(1004, 1500)).toMatchObject({ commissionAmount: 151, producerAmount: 853 });
    // mitad exacta sube: 5 * 10% = 0,5 -> 1
    expect(splitConsignmentSale(5, 1000).commissionAmount).toBe(1);
  });

  it('la suma siempre cuadra con el neto', () => {
    for (const net of [1, 7, 99, 1234, 99_999, 1_250_000]) {
      for (const bps of [0, 1, 333, 1250, 2000, 3333, 9999, 10_000]) {
        const r = splitConsignmentSale(net, bps);
        expect(r.commissionAmount + r.producerAmount).toBe(net);
        expect(Number.isInteger(r.commissionAmount)).toBe(true);
      }
    }
  });

  it('0 bps: todo al productor; 10000 bps: todo a la empresa', () => {
    expect(splitConsignmentSale(4321, 0)).toMatchObject({ commissionAmount: 0, producerAmount: 4321 });
    expect(splitConsignmentSale(4321, 10_000)).toMatchObject({ commissionAmount: 4321, producerAmount: 0 });
  });

  it('neto cero no genera montos', () => {
    expect(splitConsignmentSale(0, 2500)).toMatchObject({ commissionAmount: 0, producerAmount: 0 });
  });

  it('rechaza bps fuera de rango o no enteros', () => {
    expect(() => splitConsignmentSale(1000, -1)).toThrow(RangeError);
    expect(() => splitConsignmentSale(1000, MAX_COMMISSION_BPS + 1)).toThrow(RangeError);
    expect(() => splitConsignmentSale(1000, 12.5)).toThrow(RangeError);
    expect(() => splitConsignmentSale(1000, Number.NaN)).toThrow(RangeError);
  });

  it('rechaza un neto con decimales', () => {
    expect(() => splitConsignmentSale(100.5, 1000)).toThrow(RangeError);
  });
});

describe('resolveCommissionBps', () => {
  it('el override del producto prima sobre el del productor', () => {
    expect(resolveCommissionBps(1500, 2000)).toBe(1500);
  });

  it('un override de 0 también prima', () => {
    expect(resolveCommissionBps(0, 2000)).toBe(0);
  });

  it('sin override usa el del productor', () => {
    expect(resolveCommissionBps(null, 2000)).toBe(2000);
    expect(resolveCommissionBps(undefined, 2000)).toBe(2000);
  });

  it('rechaza valores inválidos', () => {
    expect(() => resolveCommissionBps(10_001, 2000)).toThrow(RangeError);
    expect(() => resolveCommissionBps(null, -5)).toThrow(RangeError);
  });
});

describe('isValidCommissionBps / summarizeSettlementLines', () => {
  it('valida el rango', () => {
    expect(isValidCommissionBps(0)).toBe(true);
    expect(isValidCommissionBps(10_000)).toBe(true);
    expect(isValidCommissionBps(10_001)).toBe(false);
    expect(isValidCommissionBps('100')).toBe(false);
  });

  it('suma las líneas y cuadra vendido = comisión + deuda', () => {
    const lines = [splitConsignmentSale(1001, 1500), splitConsignmentSale(2500, 2000), splitConsignmentSale(333, 0)];
    const totals = summarizeSettlementLines(lines);
    expect(totals.totalSold).toBe(1001 + 2500 + 333);
    expect(totals.totalCommission + totals.totalDue).toBe(totals.totalSold);
    expect(summarizeSettlementLines([])).toEqual({ totalSold: 0, totalCommission: 0, totalDue: 0, producerNetAffected: 0, producerExempt: 0, producerIva: 0, totalPayable: 0 });
  });
});

describe('schemas de consignación', () => {
  it('rechaza comisiones fuera de rango', () => {
    expect(createProducerSchema.safeParse({ contactId: 'c1', defaultCommissionBps: 10_001 }).success).toBe(false);
    expect(createProducerSchema.safeParse({ contactId: 'c1', defaultCommissionBps: -1 }).success).toBe(false);
    expect(createProducerSchema.safeParse({ contactId: 'c1', defaultCommissionBps: 12.5 }).success).toBe(false);
    expect(createProducerSchema.safeParse({ contactId: 'c1', defaultCommissionBps: 2000 }).success).toBe(true);
  });

  it('asignar acepta producerId null (volver a stock propio) y override null', () => {
    expect(assignProductSchema.safeParse({ productId: 'p1', producerId: null }).success).toBe(true);
    expect(assignProductSchema.safeParse({ productId: 'p1', producerId: 'x', commissionBpsOverride: null }).success).toBe(true);
    expect(assignProductSchema.safeParse({ productId: 'p1', producerId: 'x', commissionBpsOverride: 20_000 }).success).toBe(false);
  });

  it('el período no puede ir al revés', () => {
    expect(buildSettlementSchema.safeParse({ producerId: 'x', from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
    expect(buildSettlementSchema.safeParse({ producerId: 'x', from: '2026-10-01', to: '2026-10-10' }).success).toBe(true);
  });
});

describe('permisos y módulo de consignación', () => {
  it('los permisos pertenecen al módulo hasConsignment, apagado por defecto', () => {
    expect(moduleForPermission('consignment:read')).toBe('hasConsignment');
    expect(moduleForPermission('consignment:write')).toBe('hasConsignment');
    expect(DEFAULT_FEATURES.hasConsignment).toBe(false);
  });

  it('bodega y ventas ven pero no arman liquidaciones', () => {
    expect(checkPermission('SALES', 'consignment:read')).toBe(true);
    expect(checkPermission('SALES', 'consignment:write')).toBe(false);
    expect(checkPermission('WAREHOUSE', 'consignment:write')).toBe(false);
    expect(checkPermission('ACCOUNTANT', 'consignment:write')).toBe(true);
  });
});

describe('redondeo simétrico y base de comisión', () => {
  it('venta y devolución exacta suman cero (Math.round(-2.5) = -2 rompía el cuadre)', () => {
    for (const net of [5, 25, 1001, 1003, 1004, 99_995, 1_250_005]) {
      for (const bps of [1000, 1500, 2500, 3333, 5000]) {
        const sale = splitConsignmentSale(net, bps);
        const back = splitConsignmentSale(-net, bps);
        expect(sale.commissionAmount + back.commissionAmount).toBe(0);
        expect(sale.producerAmount + back.producerAmount).toBe(0);
        expect(sale.soldNet + back.soldNet).toBe(0);
      }
    }
  });

  it('la mitad se aleja de cero también en negativos', () => {
    expect(splitConsignmentSale(-5, 5000).commissionAmount).toBe(-3);
    expect(splitConsignmentSale(5, 5000).commissionAmount).toBe(3);
  });

  it('no produce -0', () => {
    expect(Object.is(splitConsignmentSale(0, 2500).commissionAmount, 0)).toBe(true);
  });

  it('base GROSS calcula la comisión sobre neto + IVA; NET (por defecto) sobre el neto', () => {
    expect(splitConsignmentSale(1000, 2000, { base: 'GROSS', saleIva: 190 })).toMatchObject({ commissionAmount: 238, producerAmount: 762 });
    expect(splitConsignmentSale(1000, 2000, { base: 'NET', saleIva: 190 })).toMatchObject({ commissionAmount: 200, producerAmount: 800 });
  });
});

describe('summarizeSettlementLines: factura del productor (modelo A1)', () => {
  it('IVA una sola vez sobre el neto afecto agregado; las líneas exentas no llevan IVA', () => {
    const totals = summarizeSettlementLines([
      { soldNet: 1001, commissionAmount: 150, producerAmount: 851, isExempt: false },
      { soldNet: 1003, commissionAmount: 150, producerAmount: 853, isExempt: false },
      { soldNet: 2000, commissionAmount: 600, producerAmount: 1400, isExempt: true },
    ]);
    // IVA por línea sería 162+162 = 324; agregado: 1704 * 19% = 323,76 -> 324 (lo que cuenta es calcular una sola vez).
    expect(totals).toMatchObject({ producerNetAffected: 1704, producerExempt: 1400, producerIva: 324, totalPayable: 1704 + 1400 + 324, totalDue: 3104 });
  });

  it('saldo negativo (devoluciones mayores a las ventas) se mantiene negativo y simétrico', () => {
    const totals = summarizeSettlementLines([{ soldNet: -1000, commissionAmount: -200, producerAmount: -800, isExempt: false }]);
    expect(totals.producerIva).toBe(-152);
    expect(totals.totalPayable).toBe(-952);
  });
});

describe('settlementPeriodBounds (calendario de Santiago, como el F29)', () => {
  const { settlementPeriodBounds } = require('@/lib/consignment/period') as typeof import('@/lib/consignment/period');

  it('un día completo: de la medianoche local a la medianoche siguiente (límite superior exclusivo)', () => {
    const { from, toExclusive } = settlementPeriodBounds(new Date('2026-10-05T00:00:00Z'), new Date('2026-10-05T00:00:00Z'));
    expect(toExclusive.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
  });

  it('una venta de las 23:30 locales del último día queda dentro; la de las 00:30 del siguiente, fuera', () => {
    const { from, toExclusive } = settlementPeriodBounds(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-31T00:00:00Z'));
    // Octubre 2026 en Santiago es UTC-3 (horario de verano): 23:30 locales = 02:30 UTC del día siguiente.
    const lastNight = new Date('2026-11-01T02:30:00Z');
    const nextNight = new Date('2026-11-01T03:30:00Z');
    expect(lastNight >= from && lastNight < toExclusive).toBe(true);
    expect(nextNight < toExclusive).toBe(false);
  });

  it('cruza el fin de mes y de año sin desbordar', () => {
    const { toExclusive } = settlementPeriodBounds(new Date('2026-12-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z'));
    expect(toExclusive.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});
