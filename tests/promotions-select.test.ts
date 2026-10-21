import {
  applicablePromotionsFor,
  dayWindow,
  daysUntilExpiry,
  parseDayIndex,
  promotionStatus,
  selectPromotionTargets,
  validatePromotion,
  type CatalogProduct,
  type Promotion,
  type PromotionRule,
} from '@/lib/promotions';

// 21-oct-2026 12:00 en Santiago (UTC-3 por horario de verano).
const NOW = new Date('2026-10-21T15:00:00Z');
const day = (iso: string) => new Date(`${iso}T12:00:00Z`); // convención de parseExpiryDate

function promo(rules: PromotionRule, over: Partial<Promotion> = {}): Promotion {
  return {
    id: 'P1',
    name: 'Liquidación',
    percentBps: 1000,
    startsAt: new Date('2026-10-01T03:00:00Z'),
    endsAt: null,
    rules,
    isActive: true,
    stackable: false,
    ...over,
  };
}

function product(id: string, over: Partial<CatalogProduct> = {}): CatalogProduct {
  return { id, name: `Producto ${id}`, categoryId: null, producerId: null, lots: [], ...over };
}

const catalog: CatalogProduct[] = [
  product('leche', { categoryId: 'lacteos', producerId: 'soprole', lots: [{ lotNumber: 'L1', expiresAt: day('2026-10-24'), quantity: 10 }, { lotNumber: 'L2', expiresAt: day('2026-12-01'), quantity: 20 }] }),
  product('yogurt', { categoryId: 'lacteos', producerId: 'colun', lots: [{ lotNumber: 'Y1', expiresAt: day('2026-10-22'), quantity: 5 }] }),
  product('arroz', { categoryId: 'abarrotes', producerId: 'tucapel', lots: [{ lotNumber: 'A1', expiresAt: null, quantity: 100 }] }),
  product('suelto', { lots: [] }),
];

const ids = (p: Promotion, c = catalog, now = NOW) => selectPromotionTargets([p], c, now).selections[0]!.products.map((x) => x.productId);

describe('selectPromotionTargets - reglas', () => {
  it('EXPIRY_WITHIN_DAYS elige solo los lotes que vencen dentro del plazo', () => {
    const result = selectPromotionTargets([promo({ type: 'EXPIRY_WITHIN_DAYS', days: 7 })], catalog, NOW);
    const products = result.selections[0]!.products;
    expect(products.map((p) => p.productId)).toEqual(['leche', 'yogurt']);
    const leche = products[0]!;
    expect(leche.matchedLots.map((l) => l.lotNumber)).toEqual(['L1']);
    expect(leche.matchedLots[0]!.daysToExpiry).toBe(3);
    expect(leche.wholeProduct).toBe(false); // L2 no califica: la línea se parte por FEFO
    expect(products[1]!.wholeProduct).toBe(true);
  });

  it('EXPIRY_BEFORE es estricto: el lote que vence ese mismo día no entra', () => {
    expect(ids(promo({ type: 'EXPIRY_BEFORE', date: '2026-10-24' }))).toEqual(['yogurt']);
    expect(ids(promo({ type: 'EXPIRY_BEFORE', date: '2026-10-25' }))).toEqual(['leche', 'yogurt']);
  });

  it('CATEGORY, PRODUCER y PRODUCTS seleccionan el producto entero', () => {
    expect(ids(promo({ type: 'CATEGORY', ids: ['lacteos'] }))).toEqual(['leche', 'yogurt']);
    expect(ids(promo({ type: 'PRODUCER', ids: ['tucapel'] }))).toEqual(['arroz']);
    const byList = selectPromotionTargets([promo({ type: 'PRODUCTS', ids: ['leche', 'suelto'] })], catalog, NOW).selections[0]!.products;
    expect(byList.map((p) => p.productId)).toEqual(['leche', 'suelto']);
    expect(byList.every((p) => p.wholeProduct)).toBe(true);
    expect(byList[1]!.matchedLots).toEqual([]); // sin lotes: igual se liquida el producto
  });

  it('ALL (AND) y ANY (OR) combinan reglas', () => {
    const and = promo({ type: 'ALL', rules: [{ type: 'CATEGORY', ids: ['lacteos'] }, { type: 'EXPIRY_WITHIN_DAYS', days: 3 }] });
    const sel = selectPromotionTargets([and], catalog, NOW).selections[0]!.products;
    expect(sel.map((p) => [p.productId, p.matchedLots.map((l) => l.lotNumber)])).toEqual([
      ['leche', ['L1']],
      ['yogurt', ['Y1']],
    ]);
    const or = promo({ type: 'ANY', rules: [{ type: 'PRODUCER', ids: ['tucapel'] }, { type: 'PRODUCTS', ids: ['yogurt'] }] });
    expect(ids(or)).toEqual(['yogurt', 'arroz']);
  });

  it('un combinador sin reglas no coincide con nada (no liquida todo el catálogo)', () => {
    expect(ids(promo({ type: 'ALL', rules: [] }))).toEqual([]);
    expect(ids(promo({ type: 'ANY', rules: [] }))).toEqual([]);
  });

  it('producto sin categoría ni productor no cae en reglas por categoría/productor', () => {
    expect(ids(promo({ type: 'CATEGORY', ids: ['lacteos', ''] }), [product('x', { categoryId: null })])).toEqual([]);
    expect(ids(promo({ type: 'PRODUCER', ids: ['colun'] }), [product('x')])).toEqual([]);
  });

  it('catálogo sin lotes: las reglas de vencimiento no seleccionan nada', () => {
    expect(ids(promo({ type: 'EXPIRY_WITHIN_DAYS', days: 30 }), [product('a'), product('b')])).toEqual([]);
    expect(selectPromotionTargets([promo({ type: 'EXPIRY_WITHIN_DAYS', days: 30 })], [], NOW)).toEqual({
      selections: [{ promotionId: 'P1', percentBps: 1000, status: 'ACTIVE', products: [] }],
      expired: [],
    });
  });

  it('lotes sin stock se ignoran', () => {
    const c = [product('a', { lots: [{ lotNumber: 'Z', expiresAt: day('2026-10-22'), quantity: 0 }] })];
    expect(ids(promo({ type: 'EXPIRY_WITHIN_DAYS', days: 7 }), c)).toEqual([]);
  });
});

describe('selectPromotionTargets - vencidos', () => {
  const withExpired: CatalogProduct[] = [
    product('queso', { categoryId: 'lacteos', lots: [{ lotNumber: 'Q-OLD', expiresAt: day('2026-10-18'), quantity: 4 }, { lotNumber: 'Q-OK', expiresAt: day('2026-10-30'), quantity: 6 }] }),
    product('crema', { categoryId: 'lacteos', lots: [{ lotNumber: 'C-OLD', expiresAt: day('2026-10-01'), quantity: 2 }] }),
  ];

  it('no liquida lotes vencidos, ni siquiera por categoría, y los marca para retirar', () => {
    const result = selectPromotionTargets([promo({ type: 'CATEGORY', ids: ['lacteos'] })], withExpired, NOW);
    const queso = result.selections[0]!.products.find((p) => p.productId === 'queso')!;
    expect(queso.matchedLots.map((l) => l.lotNumber)).toEqual(['Q-OK']);
    expect(queso.wholeProduct).toBe(true); // todo lo vendible califica
    expect(result.selections[0]!.products.map((p) => p.productId)).toEqual(['queso']); // crema: solo vencido
    expect(result.expired.map((e) => [e.productId, e.lotNumber, e.daysOverdue, e.action])).toEqual([
      ['queso', 'Q-OLD', 3, 'Vencido, retirar'],
      ['crema', 'C-OLD', 20, 'Vencido, retirar'],
    ]);
  });

  it('el lote que vence hoy todavía se puede liquidar', () => {
    const c = [product('p', { lots: [{ lotNumber: 'H', expiresAt: day('2026-10-21'), quantity: 1 }] })];
    expect(ids(promo({ type: 'EXPIRY_WITHIN_DAYS', days: 0 }), c)).toEqual(['p']);
  });
});

describe('zona horaria America/Santiago', () => {
  // Medianoche de Santiago = 03:00Z (UTC-3 en octubre).
  const lotHoy = [product('p', { lots: [{ lotNumber: 'H', expiresAt: day('2026-10-20'), quantity: 1 }] })]; // vence el 20
  const rule = promo({ type: 'EXPIRY_WITHIN_DAYS', days: 0 });

  it('a las 23:59:59 del 20 en Santiago (02:59:59Z del 21) el lote del 20 sigue vigente', () => {
    const justBefore = new Date('2026-10-21T02:59:59Z');
    expect(daysUntilExpiry(day('2026-10-20'), justBefore)).toBe(0);
    expect(ids(rule, lotHoy, justBefore)).toEqual(['p']);
    expect(selectPromotionTargets([rule], lotHoy, justBefore).expired).toEqual([]);
  });

  it('a las 00:00:00 del 21 en Santiago (03:00:00Z) el lote del 20 ya venció', () => {
    const midnight = new Date('2026-10-21T03:00:00Z');
    expect(daysUntilExpiry(day('2026-10-20'), midnight)).toBe(-1);
    const result = selectPromotionTargets([rule], lotHoy, midnight);
    expect(result.selections[0]!.products).toEqual([]);
    expect(result.expired).toHaveLength(1);
  });

  it('la vigencia por días termina al final del último día en Santiago (fin exclusivo)', () => {
    const w = dayWindow('2026-10-20', '2026-10-25')!;
    expect(w.startsAt.toISOString()).toBe('2026-10-20T03:00:00.000Z');
    expect(w.endsAt!.toISOString()).toBe('2026-10-26T03:00:00.000Z');
    const p = promo({ type: 'PRODUCTS', ids: ['x'] }, { startsAt: w.startsAt, endsAt: w.endsAt });
    expect(promotionStatus(p, new Date('2026-10-20T02:59:59Z'))).toBe('NOT_STARTED');
    expect(promotionStatus(p, new Date('2026-10-20T03:00:00Z'))).toBe('ACTIVE');
    expect(promotionStatus(p, new Date('2026-10-26T02:59:59Z'))).toBe('ACTIVE'); // 25-oct 23:59:59 en Santiago
    expect(promotionStatus(p, new Date('2026-10-26T03:00:00Z'))).toBe('ENDED');
  });

  it('dayWindow rechaza fechas inválidas o invertidas y acepta vigencia abierta', () => {
    expect(dayWindow('2026-02-30', null)).toBeNull();
    expect(dayWindow('2026-10-25', '2026-10-20')).toBeNull();
    expect(dayWindow('2026-10-20', null)!.endsAt).toBeNull();
    expect(parseDayIndex('2026-13-01')).toBeNull();
    expect(parseDayIndex('hoy')).toBeNull();
  });
});

describe('vigencia y estado', () => {
  const rule: PromotionRule = { type: 'CATEGORY', ids: ['lacteos'] };

  it('promociones inactivas, futuras o terminadas no seleccionan nada', () => {
    const cases: Array<[Partial<Promotion>, string]> = [
      [{ isActive: false }, 'DISABLED'],
      [{ startsAt: new Date('2026-11-01T03:00:00Z') }, 'NOT_STARTED'],
      [{ endsAt: new Date('2026-10-20T03:00:00Z') }, 'ENDED'],
      [{ percentBps: 9001 }, 'INVALID'],
      [{ percentBps: 0 }, 'INVALID'],
    ];
    for (const [over, status] of cases) {
      const sel = selectPromotionTargets([promo(rule, over)], catalog, NOW).selections[0]!;
      expect(sel.status).toBe(status);
      expect(sel.products).toEqual([]);
    }
  });

  it('applicablePromotionsFor devuelve las promociones que rigen para un producto/lote', () => {
    const result = selectPromotionTargets(
      [promo({ type: 'EXPIRY_WITHIN_DAYS', days: 7 }, { id: 'A', percentBps: 2000 }), promo({ type: 'PRODUCER', ids: ['nadie'] }, { id: 'B' }), promo({ type: 'CATEGORY', ids: ['lacteos'] }, { id: 'C', percentBps: 500 })],
      catalog,
      NOW,
    );
    expect(applicablePromotionsFor(result, 'leche').map((p) => p.id).sort()).toEqual(['A', 'C']);
    expect(applicablePromotionsFor(result, 'leche', 'L1').map((p) => p.id).sort()).toEqual(['A', 'C']);
    expect(applicablePromotionsFor(result, 'leche', 'L2').map((p) => p.id)).toEqual(['C']); // A solo cubre L1
    expect(applicablePromotionsFor(result, 'arroz')).toEqual([]);
  });
});

describe('validatePromotion', () => {
  it('acepta una promoción correcta', () => {
    expect(validatePromotion(promo({ type: 'CATEGORY', ids: ['a'] }))).toEqual([]);
  });
  it('informa en español cada problema', () => {
    const errors = validatePromotion(
      promo({ type: 'ALL', rules: [{ type: 'EXPIRY_BEFORE', date: '2026-99-99' }, { type: 'EXPIRY_WITHIN_DAYS', days: -1 }, { type: 'PRODUCTS', ids: [] }] }, { name: ' ', percentBps: 9500, endsAt: new Date('2026-09-01T00:00:00Z') }),
    );
    expect(errors).toHaveLength(6);
    expect(validatePromotion(promo({ type: 'ANY', rules: [] }))).toEqual(['Regla: la combinación no tiene reglas.']);
    expect(validatePromotion(promo({ type: 'CATEGORY', ids: ['a'] }, { percentBps: 0 }))).toEqual(['Un descuento de 0 % no rebaja nada.']);
    expect(validatePromotion(promo({ type: 'CATEGORY', ids: ['a'] }, { percentBps: 9000 }))).toEqual([]);
  });
});
