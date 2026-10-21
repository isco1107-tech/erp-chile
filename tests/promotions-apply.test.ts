import { computeDocument, computeLineSubtotal } from '@/modules/sales/calc';
import { applyBestPromotion, discountedPrice, pickBestPromotion, splitQuantityByLots } from '@/lib/promotions';

describe('pickBestPromotion', () => {
  it('elige UNA: la de mayor descuento, sin apilar', () => {
    expect(pickBestPromotion([{ id: 'a', percentBps: 1000 }, { id: 'b', percentBps: 2500 }, { id: 'c', percentBps: 500 }])).toEqual({ id: 'b', percentBps: 2500 });
  });
  it('empate: id menor (determinista)', () => {
    expect(pickBestPromotion([{ id: 'z', percentBps: 1000 }, { id: 'm', percentBps: 1000 }])!.id).toBe('m');
  });
  it('ignora 0 %, negativos, no enteros y sobre 90 %', () => {
    expect(pickBestPromotion([{ id: 'a', percentBps: 0 }, { id: 'b', percentBps: -5 }, { id: 'c', percentBps: 9001 }, { id: 'd', percentBps: 10.5 }])).toBeNull();
    expect(pickBestPromotion([])).toBeNull();
  });
});

describe('applyBestPromotion', () => {
  it('10 % sobre $1.990 -> $1.791, discountPercent 10', () => {
    expect(applyBestPromotion(1990, [{ id: 'p', percentBps: 1000 }])).toEqual({
      originalPrice: 1990,
      promotionId: 'p',
      percentBps: 1000,
      discountPercent: 10,
      discountedUnitPrice: 1791,
      discountPerUnit: 199,
    });
  });

  it('redondeo aritmético (Math.round), no bancario', () => {
    expect(discountedPrice(5, 1000)).toBe(5); // 4,5 -> 5
    expect(discountedPrice(25, 1000)).toBe(23); // 22,5 -> 23
    expect(discountedPrice(1, 5000)).toBe(1); // 0,5 -> 1
    expect(discountedPrice(333, 3333)).toBe(222); // 221,9 -> 222
  });

  it('0 % deja el precio igual; 90 % es el tope', () => {
    const none = applyBestPromotion(1000, [{ id: 'p', percentBps: 0 }]);
    expect(none.promotionId).toBeNull();
    expect(none.discountedUnitPrice).toBe(1000);
    expect(discountedPrice(1000, 0)).toBe(1000);
    expect(applyBestPromotion(1000, [{ id: 'p', percentBps: 9000 }]).discountedUnitPrice).toBe(100);
    expect(applyBestPromotion(1000, [{ id: 'p', percentBps: 9001 }]).promotionId).toBeNull();
  });

  it('nunca da precio negativo ni sobre el original, en todo el rango', () => {
    for (const price of [1, 2, 3, 7, 99, 100, 1990, 123_457]) {
      for (let bps = 0; bps <= 9000; bps += 125) {
        const p = discountedPrice(price, bps);
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(price);
      }
    }
  });

  it('precio 0, negativo o con decimales vuelve sin promoción', () => {
    for (const price of [0, -100, 10.5, NaN]) {
      const r = applyBestPromotion(price, [{ id: 'p', percentBps: 1000 }]);
      expect(r.promotionId).toBeNull();
      expect(r.discountPerUnit).toBe(0);
    }
    expect(discountedPrice(-5, 1000)).toBe(0);
  });

  it('sin candidatas no cambia el precio', () => {
    expect(applyBestPromotion(1990, []).discountedUnitPrice).toBe(1990);
  });
});

describe('compatibilidad con computeDocument (calc.ts)', () => {
  it('el neto de la línea con discountPercent coincide con el unitario con descuento para qty 1', () => {
    for (const price of [1, 5, 25, 99, 333, 1990, 12_345]) {
      for (const bps of [500, 1000, 2000, 3000, 3333, 9000]) {
        const r = applyBestPromotion(price, [{ id: 'p', percentBps: bps }]);
        expect(computeLineSubtotal({ unitPrice: price, quantity: 1, discountPercent: r.discountPercent })).toBe(r.discountedUnitPrice);
      }
    }
  });

  it('el documento cuadra: neto + IVA = total, con una línea promocionada y otra exenta', () => {
    const r = applyBestPromotion(1990, [{ id: 'p', percentBps: 1500 }]);
    const doc = computeDocument([
      { unitPrice: 1990, quantity: 7, discountPercent: r.discountPercent },
      { unitPrice: 1001, quantity: 3 },
      { unitPrice: 500, quantity: 2, isExempt: true, discountPercent: 10 },
    ]);
    const { totals, items } = doc;
    expect(totals.totalAmount).toBe(totals.netAmount + totals.exemptAmount + totals.ivaAmount);
    expect(items.reduce((s, i) => s + i.iva, 0)).toBe(totals.ivaAmount);
    expect(items[0]!.subtotal).toBe(Math.round(1990 * 7 * 0.85));
  });
});

describe('splitQuantityByLots (promoción solo en algunos lotes)', () => {
  const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const lots = [
    { lotNumber: 'NUEVO', expiresAt: d('2026-12-01'), quantity: 20 },
    { lotNumber: 'VIEJO', expiresAt: d('2026-10-24'), quantity: 4 },
    { lotNumber: 'SIN', expiresAt: null, quantity: 9 },
  ];
  it('consume primero el lote que vence antes (FEFO)', () => {
    expect(splitQuantityByLots(lots, ['VIEJO'], 3)).toEqual({ discounted: 3, full: 0 });
    expect(splitQuantityByLots(lots, ['VIEJO'], 10)).toEqual({ discounted: 4, full: 6 });
  });
  it('lo que excede el stock de lotes cuenta sin descuento; cantidad 0 o negativa es 0', () => {
    expect(splitQuantityByLots(lots, ['VIEJO'], 100)).toEqual({ discounted: 4, full: 96 });
    expect(splitQuantityByLots(lots, ['VIEJO'], 0)).toEqual({ discounted: 0, full: 0 });
    expect(splitQuantityByLots(lots, ['VIEJO'], -2)).toEqual({ discounted: 0, full: 0 });
  });
});
