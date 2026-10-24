import { comboCandidates, describePair, pairMetrics, parseBasketPeriod, parseMinTogether, rankPairs } from '@/lib/retail/basket';

/**
 * Canasta cruzada: lo que ordena es el lift (cuántas veces más que el azar),
 * no cuántas veces aparece un par; un par muy vendido sin relación no es un
 * combo, y con pocos casos no se muestra nada.
 */

describe('métricas de un par', () => {
  it('soporte, confianza en los dos sentidos y lift', () => {
    // 100 boletas: A en 20, B en 10, juntos en 8.
    const m = pairMetrics({ a: 'A', b: 'B', together: 8, withA: 20, withB: 10 }, 100)!;
    expect(m.supportPct).toBeCloseTo(8, 5);
    expect(m.confidenceAB).toBeCloseTo(40, 5);
    expect(m.confidenceBA).toBeCloseTo(80, 5);
    expect(m.lift).toBeCloseTo(4, 5);
  });

  it('sin boletas o sin conteos no hay métricas', () => {
    expect(pairMetrics({ a: 'A', b: 'B', together: 1, withA: 0, withB: 1 }, 10)).toBeNull();
    expect(pairMetrics({ a: 'A', b: 'B', together: 1, withA: 1, withB: 1 }, 0)).toBeNull();
  });
});

describe('ranking', () => {
  const tickets = 1000;
  const pairs = [
    // Pan y bebida: van juntos muy seguido, pero los dos están en casi todas las boletas: lift ≈ 1.
    { a: 'pan', b: 'bebida', together: 400, withA: 800, withB: 500 },
    // Miel y queso: pocas veces, pero muchísimo más que el azar.
    { a: 'miel', b: 'queso', together: 30, withA: 60, withB: 50 },
    // Relación negativa: no se muestra.
    { a: 'cafe', b: 'te', together: 5, withA: 200, withB: 100 },
    // Bajo el mínimo de boletas juntos.
    { a: 'x', b: 'y', together: 3, withA: 3, withB: 3 },
  ];

  it('ordena por lift, descarta la relación negativa y lo que no llega al mínimo', () => {
    const ranked = rankPairs(pairs, tickets, 5);
    expect(ranked.map((pair) => pair.a)).toEqual(['miel']);
    expect(ranked[0]!.lift).toBeCloseTo(10, 5);
    expect(rankPairs([{ a: 'p', b: 'q', together: 401, withA: 800, withB: 500 }], tickets, 5)[0]!.lift).toBeCloseTo(1.0025, 4);
  });

  it('un combo exige relación fuerte y que uno lleve al otro con frecuencia', () => {
    const ranked = rankPairs(
      [
        { a: 'miel', b: 'queso', together: 30, withA: 60, withB: 50 },
        // Lift alto pero confianza baja en los dos sentidos: casualidad entre dos productos muy vendidos por separado.
        { a: 'raro1', b: 'raro2', together: 10, withA: 100, withB: 60 },
      ],
      tickets,
      5
    );
    expect(comboCandidates(ranked).map((pair) => pair.a)).toEqual(['miel']);
  });

  it('la frase parte por el sentido más fuerte', () => {
    const m = pairMetrics({ a: 'A', b: 'B', together: 8, withA: 20, withB: 10 }, 100)!;
    expect(describePair(m, { a: 'Miel', b: 'Queso' })).toBe('Quienes llevan Queso también llevan Miel en el 80% de las boletas (4 veces más que lo normal).');
  });

  it('período y mínimo salen de listas cerradas', () => {
    expect(parseBasketPeriod('60')).toBe(60);
    expect(parseBasketPeriod('7')).toBe(30);
    expect(parseMinTogether('10')).toBe(10);
    expect(parseMinTogether('1')).toBe(5);
  });
});
