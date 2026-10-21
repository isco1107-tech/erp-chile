import { impactText, producerCountLabel, summarizeImpact, type ImpactLine } from '@/lib/impact/summary';

const line = (over: Partial<ImpactLine>): ImpactLine => ({
  productId: 'p1',
  producerId: null,
  producerName: null,
  quantity: 1,
  lineTotal: 1000,
  ...over,
});

describe('summarizeImpact', () => {
  it('omite la métrica cuando no hay productores', () => {
    expect(summarizeImpact([])).toBeNull();
    expect(summarizeImpact([line({}), line({ productId: 'p2' })])).toBeNull();
  });

  it('singular: un productor', () => {
    const result = summarizeImpact([line({ producerId: 'a', producerName: 'Quesos del Sur' })]);
    expect(result?.producerCount).toBe(1);
    expect(result?.text).toBe('Hoy compraste a 1 productor');
  });

  it('plural: agrupa por productor, cuenta productos distintos y suma montos', () => {
    const result = summarizeImpact([
      line({ productId: 'p1', producerId: 'a', producerName: 'Miel Ñuble', lineTotal: 3000 }),
      line({ productId: 'p1', producerId: 'a', producerName: 'Miel Ñuble', lineTotal: 3000, quantity: 2 }),
      line({ productId: 'p2', producerId: 'a', producerName: 'Miel Ñuble', lineTotal: 2500 }),
      line({ productId: 'p3', producerId: 'b', producerName: 'Huerta Verde', lineTotal: 1200 }),
      line({ productId: 'p4', producerId: 'c', producerName: 'Pan de Campo', lineTotal: 900 }),
      line({ productId: 'p5' }),
      line({ productId: 'p6' }),
    ]);
    expect(result?.text).toBe('Hoy compraste a 3 productores');
    expect(result?.ownItemsCount).toBe(2);
    expect(result?.producers[0]).toEqual({ name: 'Miel Ñuble', itemCount: 2, amount: 8500 });
    expect(result?.producers.map((p) => p.name)).toEqual(['Miel Ñuble', 'Huerta Verde', 'Pan de Campo']);
  });

  it('ignora líneas con cantidad cero y productores sin nombre', () => {
    const result = summarizeImpact([
      line({ producerId: 'a', producerName: 'Anulado', quantity: 0 }),
      line({ productId: 'p2', producerId: 'b', producerName: '   ' }),
      line({ productId: 'p3', producerId: 'c', producerName: 'Real' }),
    ]);
    expect(result?.producerCount).toBe(1);
    expect(result?.producers[0].name).toBe('Real');
    expect(result?.ownItemsCount).toBe(1);
  });

  it('dos productores con el mismo nombre pero distinto id cuentan por separado', () => {
    const result = summarizeImpact([
      line({ productId: 'p1', producerId: 'a', producerName: 'Don Juan' }),
      line({ productId: 'p2', producerId: 'b', producerName: 'Don Juan' }),
    ]);
    expect(result?.producerCount).toBe(2);
  });

  it('ítems libres sin producto cuentan uno a uno como propios', () => {
    const result = summarizeImpact([
      line({ productId: null }),
      line({ productId: null }),
      line({ productId: 'p3', producerId: 'a', producerName: 'X' }),
    ]);
    expect(result?.ownItemsCount).toBe(2);
  });
});

describe('textos', () => {
  it('concuerda singular y plural', () => {
    expect(producerCountLabel(1)).toBe('1 productor');
    expect(producerCountLabel(2)).toBe('2 productores');
    expect(impactText(12)).toBe('Hoy compraste a 12 productores');
  });
});
