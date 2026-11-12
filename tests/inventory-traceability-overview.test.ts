import { buildAttention, linkRate, MIN_MOVEMENTS_FOR_LINK_RATE, type OverviewFacts } from '@/lib/inventory/traceability-overview';

const base: OverviewFacts = {
  expiredLots: 0,
  expiredUnits: 0,
  soonLots: 0,
  unlotProducts: 0,
  unlotUnits: 0,
  serialMismatches: 0,
  overdueOrders: 0,
  lostSerials30d: 0,
  unassignedSerialSales: 0,
  linkableMovements30d: 0,
  linkedMovements30d: 0,
  expiryDays: 30,
};

describe('porcentaje de movimientos con documento', () => {
  it('no opina con pocos movimientos', () => {
    expect(linkRate(5, MIN_MOVEMENTS_FOR_LINK_RATE - 1)).toBeNull();
    expect(linkRate(0, 0)).toBeNull();
  });
  it('calcula con un decimal y no pasa de 100', () => {
    expect(linkRate(19, 20)).toBe(95);
    expect(linkRate(1, 30)).toBe(3.3);
    expect(linkRate(40, 30)).toBe(100);
  });
});

describe('qué atender', () => {
  it('sin hechos no hay alertas', () => {
    expect(buildAttention(base)).toEqual([]);
  });

  it('ordena por gravedad: urgente, revisar, aviso', () => {
    const items = buildAttention({
      ...base,
      lostSerials30d: 2,
      overdueOrders: 1,
      expiredLots: 3,
      expiredUnits: 40,
    });
    expect(items.map((i) => i.tone)).toEqual(['danger', 'warning', 'info']);
    expect(items[0]!.title).toBe('3 lotes vencidos con saldo');
  });

  it('usa singular y plural', () => {
    expect(buildAttention({ ...base, expiredLots: 1, expiredUnits: 1 })[0]!.title).toBe('1 lote vencido con saldo');
    expect(buildAttention({ ...base, overdueOrders: 2 })[0]!.title).toBe('2 órdenes de compra atrasadas');
  });

  it('avisa del enlace solo si hay base para medirlo y está bajo la meta', () => {
    expect(buildAttention({ ...base, linkableMovements30d: 10, linkedMovements30d: 0 })).toEqual([]);
    expect(buildAttention({ ...base, linkableMovements30d: 100, linkedMovements30d: 99 })).toEqual([]);
    const low = buildAttention({ ...base, linkableMovements30d: 100, linkedMovements30d: 50 });
    expect(low).toHaveLength(1);
    expect(low[0]!.title).toContain('50%');
  });

  it('avisa de las ventas sin serie asignada', () => {
    const items = buildAttention({ ...base, unassignedSerialSales: 3 });
    expect(items[0]!.title).toBe('3 unidades vendidas sin serie asignada');
    expect(buildAttention({ ...base, unassignedSerialSales: 1 })[0]!.title).toBe('1 unidad vendida sin serie asignada');
  });

  it('menciona los días configurados de vencimiento', () => {
    expect(buildAttention({ ...base, soonLots: 2, expiryDays: 7 })[0]!.title).toBe('2 lotes vencen en 7 días');
  });
});
