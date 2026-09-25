import { compareQuotes, groupAward, type ComparisonQuote } from '@/lib/purchases/quote-comparison';
import { allocateLargestRemainder, computeLandedCost } from '@/lib/purchases/landed-cost';
import { importItemsSchema, purchaseAwardSchema, purchaseRequestSchema, supplierQuoteSchema } from '@/modules/purchases/schema';

/**
 * Ola 6 · Compras: comparativo de cotizaciones (adjudicación por mejor
 * precio) y costeo de carpetas de importación (costo puesto en bodega).
 */

const items = [
  { id: 'cable', description: 'Cable XLR 10 m', quantity: 20 },
  { id: 'foco', description: 'Foco LED PAR 64', quantity: 8 },
  { id: 'trus', description: 'Truss 2 m', quantity: 4 },
];

const quotes: ComparisonQuote[] = [
  { id: 'q-audio', contactId: 'c1', supplierName: 'Audio Sur', leadTimeDays: 5, prices: { cable: 9_000, foco: 61_000, trus: 120_000 } },
  { id: 'q-luz', contactId: 'c2', supplierName: 'Luces Norte', leadTimeDays: 10, prices: { cable: 8_500, foco: 55_000 } },
  { id: 'q-rapido', contactId: 'c3', supplierName: 'Rápido SpA', leadTimeDays: 2, prices: { cable: 8_500, trus: 125_000 } },
];

describe('Comparativo de cotizaciones', () => {
  const comparison = compareQuotes(items, quotes);

  it('elige el mejor precio por ítem y desempata por plazo de entrega', () => {
    const best = Object.fromEntries(comparison.rows.map((row) => [row.item.id, row.bestQuoteId]));
    // Cable: Luces Norte y Rápido empatan en 8.500; gana el que entrega antes.
    expect(best).toEqual({ cable: 'q-rapido', foco: 'q-luz', trus: 'q-audio' });
    expect(comparison.rows[0].cells['q-rapido']?.isBest).toBe(true);
    expect(comparison.rows[0].cells['q-luz']?.isBest).toBe(false);
  });

  it('calcula totales por proveedor y quién cubre todo', () => {
    const audio = comparison.totals.find((total) => total.quoteId === 'q-audio')!;
    expect(audio).toMatchObject({ total: 20 * 9_000 + 8 * 61_000 + 4 * 120_000, itemsQuoted: 3, covers: true, bestCount: 1 });
    const luz = comparison.totals.find((total) => total.quoteId === 'q-luz')!;
    expect(luz.covers).toBe(false);
    expect(comparison.bestSingleQuoteId).toBe('q-audio');
    expect(comparison.bestSplitTotal).toBe(20 * 8_500 + 8 * 55_000 + 4 * 120_000);
    expect(comparison.bestSplitTotal).toBeLessThan(audio.total);
    expect(comparison.uncovered).toEqual([]);
  });

  it('informa la dispersión de precios y los ítems que nadie cotizó', () => {
    const withGap = compareQuotes([...items, { id: 'mesa', description: 'Mesa de mezcla', quantity: 1 }], quotes);
    expect(withGap.uncovered).toEqual(['mesa']);
    expect(withGap.bestSingleQuoteId).toBeNull();
    const foco = withGap.rows.find((row) => row.item.id === 'foco')!;
    expect(foco.spread).toBe(8 * (61_000 - 55_000));
  });

  it('agrupa la adjudicación en una OC por proveedor', () => {
    const groups = groupAward({ cable: 'q-rapido', foco: 'q-luz', trus: 'q-audio' }, quotes);
    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.quoteId === 'q-luz')).toEqual({ quoteId: 'q-luz', contactId: 'c2', items: [{ requestItemId: 'foco', unitCost: 55_000 }] });
    const single = groupAward({ cable: 'q-audio', foco: 'q-audio', trus: 'q-audio' }, quotes);
    expect(single).toHaveLength(1);
    expect(single[0].items).toHaveLength(3);
  });

  it('no permite adjudicar a quien no cotizó el ítem', () => {
    expect(() => groupAward({ trus: 'q-luz' }, quotes)).toThrow(/Luces Norte no cotizó/);
    expect(() => groupAward({ trus: 'q-x' }, quotes)).toThrow(/no existe/);
  });
});

describe('Costeo de importación', () => {
  it('reparte en enteros que siempre suman el total (resto mayor)', () => {
    expect(allocateLargestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateLargestRemainder(10, [0, 0])).toEqual([5, 5]);
    expect(allocateLargestRemainder(0, [3, 4])).toEqual([0, 0]);
    const parts = allocateLargestRemainder(1_234_567, [0.3, 1.7, 5, 11]);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(1_234_567);
  });

  const shipment = {
    exchangeRate: 950,
    items: [
      { id: 'parlante', quantity: 10, unitPriceForeign: 200 }, // FOB US$2.000 → $1.900.000
      { id: 'cable', quantity: 100, unitPriceForeign: 5.5 }, // FOB US$550 → $522.500
    ],
    costs: [
      { kind: 'FREIGHT', amount: 300_000 },
      { kind: 'INSURANCE', amount: 25_000 },
      { kind: 'CUSTOMS_AGENT', amount: 120_000 },
    ],
  };

  it('prorratea por valor FOB y calcula el costo unitario puesto en bodega', () => {
    const result = computeLandedCost({ ...shipment, method: 'VALUE' });
    expect(result.fobTotal).toBe(2_422_500);
    expect(result.costsTotal).toBe(445_000);
    expect(result.landedTotal).toBe(2_867_500);
    const [parlante, cable] = result.items;
    expect(parlante.fobClp).toBe(1_900_000);
    expect(parlante.allocated + cable.allocated).toBe(445_000);
    // 1.900.000 / 2.422.500 × 445.000 = 349.019,6… → el resto mayor lo redondea hacia arriba.
    expect(parlante.allocated).toBe(349_020);
    expect(parlante.landedUnitCost).toBe(224_902);
    expect(cable.landedUnitCost).toBe(Math.round(((522_500 + 95_980) / 100) * 100) / 100);
    expect(result.upliftPercent).toBe(18.4);
  });

  it('prorratea por unidades cuando se elige ese método', () => {
    const result = computeLandedCost({ ...shipment, method: 'QUANTITY' });
    const [parlante, cable] = result.items;
    // 10 de 110 unidades → 1/11 de los costos.
    expect(parlante.allocated).toBe(40_455);
    expect(cable.allocated).toBe(404_545);
  });

  it('calcula CIF, arancel general y el IVA de importación como referencia', () => {
    const withDuty = computeLandedCost({ ...shipment, method: 'VALUE', costs: [...shipment.costs, { kind: 'DUTY', amount: 164_850 }] });
    expect(withDuty.cif).toBe(2_422_500 + 300_000 + 25_000);
    expect(withDuty.suggestedDuty).toBe(Math.round(2_747_500 * 0.06));
    expect(withDuty.importVat).toBe(Math.round((2_747_500 + 164_850) * 0.19));
    // El IVA no se suma al costo.
    expect(withDuty.landedTotal).toBe(2_422_500 + 445_000 + 164_850);
  });

  it('exige un tipo de cambio válido', () => {
    expect(() => computeLandedCost({ ...shipment, method: 'VALUE', exchangeRate: 0 })).toThrow(/tipo de cambio/);
  });

  it('una carpeta sin costos queda al valor FOB', () => {
    const result = computeLandedCost({ ...shipment, method: 'VALUE', costs: [] });
    expect(result.items[0].landedUnitCost).toBe(190_000);
    expect(result.upliftPercent).toBe(0);
  });
});

describe('Validación de entradas', () => {
  it('una solicitud necesita título e ítems con cantidad', () => {
    expect(purchaseRequestSchema.safeParse({ title: 'Sillas', items: [] }).success).toBe(false);
    expect(purchaseRequestSchema.safeParse({ title: 'Sillas', items: [{ description: 'Silla', quantity: 0 }] }).success).toBe(false);
    expect(purchaseRequestSchema.safeParse({ title: 'Sillas', neededBy: '2026-10-01', items: [{ description: 'Silla', quantity: 12 }] }).success).toBe(true);
  });

  it('una cotización trae precios enteros en pesos', () => {
    expect(supplierQuoteSchema.safeParse({ contactId: 'c', lines: [{ requestItemId: 'i', unitCost: 10.5 }] }).success).toBe(false);
    expect(supplierQuoteSchema.safeParse({ contactId: 'c', leadTimeDays: 5, lines: [{ requestItemId: 'i', unitCost: 10 }] }).success).toBe(true);
    expect(purchaseAwardSchema.safeParse({ award: {} }).success).toBe(false);
  });

  it('los productos de una importación admiten precios FOB con decimales', () => {
    expect(importItemsSchema.safeParse([{ productId: 'p', quantity: 3, unitPriceForeign: 12.75 }]).success).toBe(true);
    expect(importItemsSchema.safeParse([{ productId: 'p', quantity: -1, unitPriceForeign: 1 }]).success).toBe(false);
  });
});
