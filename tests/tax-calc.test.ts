import { computeDocument, computeLineSubtotal } from '@/modules/sales/calc';
import { calculateIva } from '@/lib/chile/tax';

describe('IVA a nivel de documento', () => {
  it('redondea el IVA una sola vez sobre el neto agregado, no por línea', () => {
    // Caso que producía el descuadre: redondear 1.001 × 19% = 190,19 → 190 en
    // cada línea daba 570; el neto agregado 3.003 × 19% = 570,57 → 571.
    const lines = [
      { unitPrice: 1001, quantity: 1 },
      { unitPrice: 1001, quantity: 1 },
      { unitPrice: 1001, quantity: 1 },
    ];

    const { totals } = computeDocument(lines);

    expect(totals.netAmount).toBe(3003);
    expect(totals.ivaAmount).toBe(571);
    expect(totals.ivaAmount).toBe(calculateIva(totals.netAmount));
    expect(totals.totalAmount).toBe(3003 + 571);
  });

  it('el IVA de las líneas suma exactamente el IVA del documento', () => {
    const lines = [
      { unitPrice: 1001, quantity: 1 },
      { unitPrice: 1001, quantity: 1 },
      { unitPrice: 1001, quantity: 1 },
    ];

    const { items, totals } = computeDocument(lines);
    const sumaLineas = items.reduce((sum, i) => sum + i.iva, 0);

    expect(sumaLineas).toBe(totals.ivaAmount);
  });

  it('mantiene la identidad neto + exento + IVA = total en montos irregulares', () => {
    const lines = [
      { unitPrice: 3337, quantity: 3 },
      { unitPrice: 89, quantity: 7 },
      { unitPrice: 12345, quantity: 1, discountPercent: 13.5 },
      { unitPrice: 50000, quantity: 2, isExempt: true },
    ];

    const { items, totals } = computeDocument(lines);

    expect(totals.netAmount + totals.exemptAmount + totals.ivaAmount).toBe(totals.totalAmount);
    expect(items.reduce((s, i) => s + i.iva, 0)).toBe(totals.ivaAmount);
    expect(totals.ivaAmount).toBe(calculateIva(totals.netAmount));
  });

  it('no cobra IVA sobre líneas exentas', () => {
    const lines = [
      { unitPrice: 10000, quantity: 1, isExempt: true },
      { unitPrice: 10000, quantity: 1 },
    ];

    const { items, totals } = computeDocument(lines);

    expect(items[0]!.iva).toBe(0);
    expect(totals.exemptAmount).toBe(10000);
    expect(totals.netAmount).toBe(10000);
    expect(totals.ivaAmount).toBe(1900);
  });

  it('un documento totalmente exento no genera IVA', () => {
    const { totals } = computeDocument([{ unitPrice: 7777, quantity: 3, isExempt: true }]);

    expect(totals.netAmount).toBe(0);
    expect(totals.ivaAmount).toBe(0);
    expect(totals.totalAmount).toBe(totals.exemptAmount);
  });

  it('aplica el descuento porcentual antes de redondear a CLP entero', () => {
    expect(computeLineSubtotal({ unitPrice: 1000, quantity: 3, discountPercent: 10 })).toBe(2700);
    expect(computeLineSubtotal({ unitPrice: 999, quantity: 1, discountPercent: 33.3 })).toBe(Math.round(999 * 0.667));
  });

  it('reparte los pesos sobrantes por resto mayor, sin perderlos ni duplicarlos', () => {
    // 100 líneas de $1 → neto 100, IVA 19. Solo 19 líneas pueden recibir $1.
    const lines = Array.from({ length: 100 }, () => ({ unitPrice: 1, quantity: 1 }));

    const { items, totals } = computeDocument(lines);

    expect(totals.ivaAmount).toBe(19);
    expect(items.reduce((s, i) => s + i.iva, 0)).toBe(19);
    expect(items.filter((i) => i.iva === 1)).toHaveLength(19);
    expect(items.filter((i) => i.iva === 0)).toHaveLength(81);
  });
});
