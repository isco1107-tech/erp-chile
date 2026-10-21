import {
  computeCashChangeChile,
  computeCashRoundingDiff,
  isCashPaymentSufficientChile,
  matchScaleBarcodeToProduct,
  parseScaleBarcode,
  parseScannerInput,
  roundCashChile,
  sumCashDenominations,
} from '@/modules/pos/calc';
import { posCreditNoteSchema, posSaleSchema } from '@/modules/pos/schema';

describe('POS Supermercado — Ley de Redondeo en Efectivo (Ley N° 20.956)', () => {
  it('redondea hacia abajo las terminaciones 1 a 5 y hacia arriba las terminaciones 6 a 9', () => {
    expect(roundCashChile(1990)).toBe(1990);
    expect(roundCashChile(1991)).toBe(1990);
    expect(roundCashChile(1995)).toBe(1990);
    expect(roundCashChile(1996)).toBe(2000);
    expect(roundCashChile(1999)).toBe(2000);
    expect(roundCashChile(2000)).toBe(2000);
  });

  it('calcula la diferencia por redondeo para el desglose del ticket térmico', () => {
    expect(computeCashRoundingDiff(1995)).toBe(-5);
    expect(computeCashRoundingDiff(1996)).toBe(4);
    expect(computeCashRoundingDiff(1990)).toBe(0);
  });

  it('permite cobrar en efectivo con el monto redondeado hacia abajo (ej. total $1.995 pagado con $1.990)', () => {
    expect(isCashPaymentSufficientChile(1990, 1995)).toBe(true);
    expect(computeCashChangeChile(2000, 1995)).toBe(10);
    expect(isCashPaymentSufficientChile(1990, 1996)).toBe(false);
    expect(isCashPaymentSufficientChile(2000, 1996)).toBe(true);
    expect(computeCashChangeChile(2000, 1996)).toBe(0);
  });
});

describe('POS Supermercado — Balanzas EAN-13 (Prefijos 20–29, Peso y Precio)', () => {
  it('decodifica etiqueta EAN-13 de peso (prefijo 20, PLU 01234, 00450 g = 0,45 kg)', () => {
    // Base 12 dígitos: 20 01234 00450
    // Impares (pos 0,2,4,6,8,10): 2 + 0 + 2 + 4 + 0 + 5 = 13
    // Pares (pos 1,3,5,7,9,11):   0 + 1 + 3 + 0 + 4 + 0 = 8 -> 8 * 3 = 24
    // Suma = 37 -> dígito verificador = (10 - (37 % 10)) % 10 = 3
    const reading = parseScaleBarcode('2001234004503');
    expect(reading).not.toBeNull();
    expect(reading?.mode).toBe('WEIGHT');
    expect(reading?.plu).toBe('01234');
    expect(reading?.pluNumber).toBe(1234);
    expect(reading?.weightKg).toBe(0.45);
  });

  it('decodifica etiqueta EAN-13 de precio total (prefijo 26, PLU 00105, $02500)', () => {
    // Base 12 dígitos: 26 00105 02500
    // Impares: 2 + 0 + 1 + 5 + 2 + 0 = 10
    // Pares:   6 + 0 + 0 + 0 + 5 + 0 = 11 -> 11 * 3 = 33
    // Suma = 43 -> dígito verificador = 7
    const reading = parseScaleBarcode('2600105025007');
    expect(reading).not.toBeNull();
    expect(reading?.mode).toBe('PRICE');
    expect(reading?.plu).toBe('00105');
    expect(reading?.pluNumber).toBe(105);
    expect(reading?.totalPriceClp).toBe(2500);
  });

  it('rechaza códigos con dígito verificador adulterado o prefijos estándar (780)', () => {
    expect(parseScaleBarcode('2001234004509')).toBeNull();
    expect(parseScaleBarcode('7801234567893')).toBeNull();
  });

  it('asocia la lectura de balanza al producto por SKU o prefijo de código de barras', () => {
    const catalog = [
      { id: 'p-pan', sku: '1234', barcode: null },
      { id: 'p-queso', sku: 'QUESO-GAUDA', barcode: '2000105000000' },
    ];
    const panReading = parseScaleBarcode('2001234004503')!;
    expect(matchScaleBarcodeToProduct(panReading, catalog)?.id).toBe('p-pan');

    const quesoReading = parseScaleBarcode('2600105025007')!;
    expect(matchScaleBarcodeToProduct(quesoReading, catalog)?.id).toBe('p-queso');
  });
});

describe('POS Supermercado — Multiplicador rápido de escáner y Contador de Billetes', () => {
  it('interpreta "12*" como multiplicador pendiente y "6*78012345" como escaneo múltiple', () => {
    expect(parseScannerInput('12*')).toEqual({ multiplier: 12, code: '' });
    expect(parseScannerInput('6*7801234567890')).toEqual({ multiplier: 6, code: '7801234567890' });
    expect(parseScannerInput('0,45*pan')).toEqual({ multiplier: 0.45, code: 'pan' });
    expect(parseScannerInput('7801234567890')).toEqual({ multiplier: null, code: '7801234567890' });
  });

  it('suma correctamente el arqueo de billetes y monedas chilenas', () => {
    const total = sumCashDenominations({
      20000: 3, // 60.000
      10000: 2, // 20.000
      5000: 1, // 5.000
      1000: 4, // 4.000
      500: 2, // 1.000
      100: 5, // 500
      10: 3, // 30
    });
    expect(total).toBe(90530);
  });
});

describe('POS Supermercado — Documentos Tributarios (Boleta 39/41, Factura 33/34, NC 61)', () => {
  it('exige RUT válido distinto de consumidor final cuando se emite FACTURA_33 en caja', () => {
    const sinRut = posSaleSchema.safeParse({
      dteType: 'FACTURA_33',
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'TARJETA_DEBITO',
    });
    expect(sinRut.success).toBe(false);

    const rutGenerico = posSaleSchema.safeParse({
      dteType: 'FACTURA_33',
      customerRut: '66.666.666-6',
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'TARJETA_DEBITO',
    });
    expect(rutGenerico.success).toBe(false);

    const conRutEmpresa = posSaleSchema.safeParse({
      dteType: 'FACTURA_33',
      customerRut: '76.543.210-3',
      customerName: 'Supermercado del Sur SpA',
      customerGiro: 'Supermercado',
      items: [{ productId: 'p1', quantity: 2 }],
      paymentMethod: 'TARJETA_DEBITO',
    });
    expect(conRutEmpresa.success).toBe(true);
  });

  it('valida el esquema de devolución por Nota de Crédito (61) desde el POS', () => {
    const parsed = posCreditNoteSchema.safeParse({
      originalDocumentId: 'doc-123',
      reason: 'Producto devuelto por el cliente en caja',
      refundCashFromDrawer: true,
      items: [{ productId: 'p1', quantity: 1 }],
    });
    expect(parsed.success).toBe(true);
  });
});

