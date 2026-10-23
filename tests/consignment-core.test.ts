import {
  bpsToInput,
  bpsToPercent,
  commissionBpsSchema,
  commissionOf,
  effectiveCommissionBps,
  formatCommission,
  isValidCommissionBps,
  parseCommissionPercent,
  percentToBps,
} from '@/lib/consignment/commission';
import { parseClpAmount } from '@/lib/consignment/amount';
import { lineCostForMargin, productCostForMargin } from '@/lib/consignment/margin';
import {
  currentContribution,
  documentSign,
  pendingLines,
  settlementTotals,
  sumSettledByItem,
  type ConsignedSaleLine,
} from '@/lib/consignment/settlement';

/**
 * Consignación: la mercadería es del seller hasta que se vende. Estas pruebas fijan la comisión
 * (enteros, sin decimales flotantes) y que lo pendiente se corrija solo cuando un documento se
 * anula o se devuelve, sin reescribir liquidaciones ya hechas.
 */

const line = (over: Partial<ConsignedSaleLine> = {}): ConsignedSaleLine => ({
  salesDocumentItemId: 'item-1',
  productId: 'prod-1',
  sku: 'ART-1',
  description: 'Jabón artesanal',
  quantity: 2,
  subtotal: 10_000,
  commissionBps: 2000,
  dteType: 'BOLETA_39',
  status: 'ISSUED',
  ...over,
});

describe('comisión', () => {
  it('convierte porcentaje y puntos base sin perder decimales', () => {
    expect(percentToBps(15)).toBe(1500);
    expect(percentToBps(15.5)).toBe(1550);
    expect(percentToBps(0.29)).toBe(29);
    expect(bpsToPercent(1550)).toBe(15.5);
  });

  it('interpreta lo que se escribe en el formulario', () => {
    expect(parseCommissionPercent('15')).toBe(1500);
    expect(parseCommissionPercent('15,5')).toBe(1550);
    expect(parseCommissionPercent('15.5 %')).toBe(1550);
    expect(parseCommissionPercent(' 20% ')).toBe(2000);
    expect(parseCommissionPercent(0)).toBe(0);
    expect(parseCommissionPercent(100)).toBe(10_000);
  });

  it('rechaza lo que no es un porcentaje entre 0 y 100', () => {
    expect(parseCommissionPercent('')).toBeNull();
    expect(parseCommissionPercent(null)).toBeNull();
    expect(parseCommissionPercent(undefined)).toBeNull();
    expect(parseCommissionPercent('abc')).toBeNull();
    expect(parseCommissionPercent('-5')).toBeNull();
    expect(parseCommissionPercent('100,01')).toBeNull();
    expect(parseCommissionPercent('1,2,3')).toBeNull();
  });

  it('valida puntos base enteros entre 0 y 10.000', () => {
    expect(isValidCommissionBps(0)).toBe(true);
    expect(isValidCommissionBps(10_000)).toBe(true);
    expect(isValidCommissionBps(10_001)).toBe(false);
    expect(isValidCommissionBps(-1)).toBe(false);
    expect(isValidCommissionBps(12.5)).toBe(false);
    expect(isValidCommissionBps(null)).toBe(false);
    expect(isValidCommissionBps('1500')).toBe(false);
  });

  it('la del producto manda sobre la del seller; sin ninguna no se inventa una', () => {
    expect(effectiveCommissionBps(1000, 2000)).toBe(1000);
    expect(effectiveCommissionBps(null, 2000)).toBe(2000);
    expect(effectiveCommissionBps(undefined, 2000)).toBe(2000);
    expect(effectiveCommissionBps(0, 2000)).toBe(0); // 0 % es una comisión válida, no "sin definir"
    expect(effectiveCommissionBps(null, null)).toBeNull();
  });

  it('calcula la comisión en CLP enteros con Math.round', () => {
    expect(commissionOf(10_000, 2000)).toBe(2000);
    expect(commissionOf(9_999, 1500)).toBe(1500); // 1499,85
    expect(commissionOf(1, 5000)).toBe(1); // 0,5 redondea hacia arriba
    expect(commissionOf(0, 2000)).toBe(0);
  });

  it('el neto se reparte exactamente entre empresa y seller', () => {
    for (const net of [1, 7, 999, 10_001, 123_457]) {
      for (const bps of [0, 1, 1550, 3333, 10_000]) {
        const commission = commissionOf(net, bps);
        expect(Number.isInteger(commission)).toBe(true);
        expect(commission + (net - commission)).toBe(net);
        expect(net - commission).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('escribe la comisión guardada como la lee el formulario, sin perder decimales', () => {
    expect(bpsToInput(1500)).toBe('15');
    expect(bpsToInput(1550)).toBe('15,5');
    expect(bpsToInput(1234)).toBe('12,34');
    for (const bps of [0, 1, 29, 1234, 1550, 10_000]) expect(parseCommissionPercent(bpsToInput(bps))).toBe(bps);
  });

  it('el esquema compartido de comisión acepta 0–10.000 enteros', () => {
    expect(commissionBpsSchema.safeParse(1500).success).toBe(true);
    expect(commissionBpsSchema.safeParse(10_001).success).toBe(false);
    expect(commissionBpsSchema.safeParse(-1).success).toBe(false);
    expect(commissionBpsSchema.safeParse(12.5).success).toBe(false);
  });

  it('muestra la comisión en formato chileno', () => {
    expect(formatCommission(1500)).toBe('15 %');
    expect(formatCommission(1550)).toBe('15,5 %');
  });
});

describe('monto en pesos escrito por una persona', () => {
  it('el punto separa miles: "3.000" son tres mil', () => {
    expect(parseClpAmount('3.000')).toBe(3000);
    expect(parseClpAmount('-1.500')).toBe(-1500);
    expect(parseClpAmount('1.000.000')).toBe(1_000_000);
    expect(parseClpAmount('+2.500')).toBe(2500);
    expect(parseClpAmount('$ 2.000')).toBe(2000);
    expect(parseClpAmount('-$ 2.000')).toBe(-2000);
    expect(parseClpAmount('1500')).toBe(1500);
    expect(parseClpAmount(' -750 ')).toBe(-750);
    expect(parseClpAmount('0')).toBe(0);
  });

  it('rechaza lo que se leería mal en silencio', () => {
    for (const text of ['', '-', 'abc', '1,5', '1.5', '1.50', '1.0000', '12.34.567', '3,000', '--5', '5-', '1e3', '9999999999999999999']) expect(parseClpAmount(text)).toBeNull();
  });
});

describe('qué documentos cuentan', () => {
  it('suman facturas y boletas, restan la nota de crédito y no cuentan lo demás', () => {
    expect(documentSign('FACTURA_33')).toBe(1);
    expect(documentSign('FACTURA_EXENTA_34')).toBe(1);
    expect(documentSign('BOLETA_39')).toBe(1);
    expect(documentSign('BOLETA_EXENTA_41')).toBe(1);
    expect(documentSign('NOTA_CREDITO_61')).toBe(-1);
    expect(documentSign('GUIA_DESPACHO_52')).toBe(0);
    expect(documentSign('NOTA_DEBITO_56')).toBe(0);
    expect(documentSign('COTIZACION')).toBe(0);
  });
});

describe('lo que vale una línea hoy', () => {
  it('una venta emitida vale su neto menos la comisión congelada', () => {
    expect(currentContribution(line())).toEqual({ quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 });
  });

  it('un borrador, un documento anulado y una guía valen 0', () => {
    const zero = { quantity: 0, netAmount: 0, commissionAmount: 0, payoutAmount: 0 };
    expect(currentContribution(line({ status: 'DRAFT' }))).toEqual(zero);
    expect(currentContribution(line({ status: 'CANCELLED' }))).toEqual(zero);
    expect(currentContribution(line({ dteType: 'GUIA_DESPACHO_52' }))).toEqual(zero);
    expect(currentContribution(line({ dteType: 'NOTA_DEBITO_56' }))).toEqual(zero);
  });

  it('una línea sin comisión congelada no se liquida (nunca se asume una)', () => {
    expect(currentContribution(line({ commissionBps: null })).payoutAmount).toBe(0);
  });

  it('la nota de crédito resta exactamente lo que sumó la venta', () => {
    const sale = currentContribution(line({ subtotal: 9_999, commissionBps: 1500, quantity: 3 }));
    const credit = currentContribution(line({ subtotal: 9_999, commissionBps: 1500, quantity: 3, dteType: 'NOTA_CREDITO_61' }));
    expect(credit).toEqual({
      quantity: -sale.quantity,
      netAmount: -sale.netAmount,
      commissionAmount: -sale.commissionAmount,
      payoutAmount: -sale.payoutAmount,
    });
  });

  it('una devolución revierte lo que se le acreditó por esas unidades, no el precio de la nota', () => {
    // Venta: 3 unidades, $27.000 neto (con descuento) → al seller $21.600 al 20 %. Se devuelve 1 unidad con una nota de $10.000.
    const credit = currentContribution(line({ dteType: 'NOTA_CREDITO_61', quantity: 1, subtotal: 10_000, baseNet: 9000 }));
    expect(credit).toEqual({ quantity: -1, netAmount: -9000, commissionAmount: -1800, payoutAmount: -7200 });
    // Sin base se usa el subtotal de la línea (comportamiento anterior).
    expect(currentContribution(line({ dteType: 'NOTA_CREDITO_61', quantity: 1, subtotal: 10_000, baseNet: null })).netAmount).toBe(-10_000);
    // La base solo manda en devoluciones.
    expect(currentContribution(line({ subtotal: 10_000, baseNet: 1 })).netAmount).toBe(10_000);
  });

  it('una nota de crédito sin cantidad (ajuste de precio) no descuenta sola', () => {
    expect(currentContribution(line({ dteType: 'NOTA_CREDITO_61', quantity: 0 })).payoutAmount).toBe(0);
  });

  it('un producto exento (sin IVA) liquida igual sobre su monto', () => {
    expect(currentContribution(line({ dteType: 'BOLETA_EXENTA_41', subtotal: 5_000, commissionBps: 1000 }))).toEqual({
      quantity: 2,
      netAmount: 5_000,
      commissionAmount: 500,
      payoutAmount: 4_500,
    });
  });
});

describe('pendiente de liquidar', () => {
  it('sin nada liquidado, todo lo emitido está pendiente', () => {
    const pending = pendingLines([line(), line({ salesDocumentItemId: 'item-2', subtotal: 5_000 })], new Map());
    expect(pending.map((p) => p.salesDocumentItemId)).toEqual(['item-1', 'item-2']);
    expect(settlementTotals(pending)).toMatchObject({ netSales: 15_000, commissionAmount: 3000, payoutAmount: 12_000, units: 4 });
  });

  it('lo ya liquidado no vuelve a aparecer', () => {
    const settled = sumSettledByItem([{ salesDocumentItemId: 'item-1', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 }]);
    expect(pendingLines([line()], settled)).toEqual([]);
  });

  it('anular un documento ya liquidado deja un ajuste negativo en la siguiente', () => {
    const settled = sumSettledByItem([{ salesDocumentItemId: 'item-1', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 }]);
    const pending = pendingLines([line({ status: 'CANCELLED' })], settled);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ quantity: -2, netAmount: -10_000, commissionAmount: -2000, payoutAmount: -8000 });
  });

  it('anular un documento que nunca se liquidó no deja nada pendiente', () => {
    expect(pendingLines([line({ status: 'CANCELLED' })], new Map())).toEqual([]);
  });

  it('una nota de crédito posterior resta en la liquidación siguiente', () => {
    const settled = sumSettledByItem([{ salesDocumentItemId: 'item-1', quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 }]);
    const credit = line({ salesDocumentItemId: 'item-credit', dteType: 'NOTA_CREDITO_61', quantity: 1, subtotal: 5_000 });
    const pending = pendingLines([line(), credit], settled);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ salesDocumentItemId: 'item-credit', quantity: -1, payoutAmount: -4_000 });
  });

  it('una liquidación parcial deja solo la diferencia', () => {
    const settled = sumSettledByItem([{ salesDocumentItemId: 'item-1', quantity: 1, netAmount: 5_000, commissionAmount: 1000, payoutAmount: 4000 }]);
    const pending = pendingLines([line()], settled);
    expect(pending[0]).toMatchObject({ quantity: 1, netAmount: 5_000, commissionAmount: 1000, payoutAmount: 4000 });
  });

  it('las cantidades decimales no dejan restos de punto flotante', () => {
    const settled = sumSettledByItem([
      { salesDocumentItemId: 'item-1', quantity: 0.1, netAmount: 0, commissionAmount: 0, payoutAmount: 0 },
      { salesDocumentItemId: 'item-1', quantity: 0.2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 },
    ]);
    expect(pendingLines([line({ quantity: 0.3 })], settled)).toEqual([]);
  });
});

describe('totales de la liquidación', () => {
  it('suma líneas y ajuste manual en lo que se le debe al seller', () => {
    const lines = [
      { quantity: 2, netAmount: 10_000, commissionAmount: 2000, payoutAmount: 8000 },
      { quantity: -1, netAmount: -5_000, commissionAmount: -1000, payoutAmount: -4000 },
    ];
    expect(settlementTotals(lines, -500)).toEqual({
      netSales: 5_000,
      commissionAmount: 1000,
      linesPayout: 4000,
      adjustmentAmount: -500,
      payoutAmount: 3500,
      units: 1,
    });
  });

  it('sin líneas ni ajuste el total es cero', () => {
    expect(settlementTotals([])).toMatchObject({ netSales: 0, payoutAmount: 0, units: 0 });
  });
});

describe('margen de la mercadería de un seller', () => {
  it('el costo de una línea de seller es lo que se le debe; el de una propia, su PMP', () => {
    const own = { quantity: 3, subtotal: 9000, unitCostPMP: 1000, consignorId: null, consignorCommissionBps: null };
    expect(lineCostForMargin(own)).toBe(3000);
    const seller = { ...own, unitCostPMP: 0, consignorId: 's1', consignorCommissionBps: 2000 };
    expect(lineCostForMargin(seller)).toBe(7200); // 9.000 − 20 %
    // Margen de la línea = la comisión.
    expect(seller.subtotal - lineCostForMargin(seller)).toBe(1800);
  });

  it('una línea de seller sin comisión congelada no inventa un costo', () => {
    expect(lineCostForMargin({ quantity: 2, subtotal: 5000, unitCostPMP: 0, consignorId: 's1', consignorCommissionBps: null })).toBe(0);
  });

  it('el costo de un producto de seller usa su comisión, o la del seller si no tiene propia', () => {
    const product = { costPricePMP: 0, netPrice: 10_000, consignorId: 's1', consignmentCommissionBps: null };
    expect(productCostForMargin(product, 2000)).toBe(8000);
    expect(productCostForMargin({ ...product, consignmentCommissionBps: 1000 }, 2000)).toBe(9000);
    expect(productCostForMargin(product, null)).toBe(0); // sin comisión: no se inventa
    expect(productCostForMargin({ costPricePMP: 600, netPrice: 10_000, consignorId: null, consignmentCommissionBps: null }, 2000)).toBe(600);
  });
});
