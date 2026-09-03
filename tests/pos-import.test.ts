import {
  computeChange,
  computeDifference,
  computeExpectedAmount,
  isPaymentSufficient,
  sumCashPayments,
} from '@/modules/pos/calc';
import {
  parseBoolean,
  parseChileanInteger,
  parseChileanDecimal,
  parseChileanDate,
  validateHistoricalSalesRow,
  validateHistoricalPurchasesRow,
  type ContactLookupContext,
} from '@/modules/import/services/import.service';
import { mapHeaders, normalizeHeader } from '@/modules/import/services/parse.service';
import { IMPORT_COLUMNS, DTE_TYPE_TEXT_MAP, PURCHASE_DOC_TYPE_TEXT_MAP } from '@/modules/import/schema';
import { computeDocument } from '@/modules/sales/calc';
import { formatRut, validateRut } from '@/lib/chile/rut';

describe('Arqueo de caja — efectivo esperado', () => {
  it('suma el fondo inicial, las ventas en efectivo y los ingresos, y resta los retiros', () => {
    expect(
      computeExpectedAmount({ initialAmount: 50000, cashSales: 320000, inflows: 10000, outflows: 100000 })
    ).toBe(280000);
  });

  it('un turno sin movimientos espera exactamente el fondo inicial', () => {
    expect(computeExpectedAmount({ initialAmount: 30000, cashSales: 0, inflows: 0, outflows: 0 })).toBe(30000);
  });

  it('los retiros pueden dejar el cajón por debajo del fondo inicial', () => {
    expect(computeExpectedAmount({ initialAmount: 20000, cashSales: 5000, inflows: 0, outflows: 24000 })).toBe(1000);
  });
});

describe('Arqueo de caja — solo el efectivo entra al cajón', () => {
  const ventas = [
    { method: 'EFECTIVO', total: 150000 },
    { method: 'TARJETA_DEBITO', total: 400000 },
    { method: 'TARJETA_CREDITO', total: 250000 },
    { method: 'TRANSFERENCIA', total: 90000 },
  ];

  it('ignora tarjetas y transferencias al calcular el efectivo', () => {
    expect(sumCashPayments(ventas)).toBe(150000);
  });

  it('un turno que solo vendió con tarjeta no genera faltante', () => {
    const soloTarjeta = ventas.filter((row) => row.method !== 'EFECTIVO');
    const esperado = computeExpectedAmount({
      initialAmount: 20000,
      cashSales: sumCashPayments(soloTarjeta),
      inflows: 0,
      outflows: 0,
    });
    expect(esperado).toBe(20000);
    expect(computeDifference(20000, esperado)).toBe(0);
  });
});

describe('Arqueo de caja — descuadre', () => {
  it('contado menor al esperado es faltante (negativo)', () => {
    expect(computeDifference(95000, 100000)).toBe(-5000);
  });

  it('contado mayor al esperado es sobrante (positivo)', () => {
    expect(computeDifference(103000, 100000)).toBe(3000);
  });

  it('cuadrar da exactamente cero', () => {
    expect(computeDifference(100000, 100000)).toBe(0);
  });
});

describe('Vuelto', () => {
  it('calcula el vuelto sobre el total con IVA', () => {
    expect(computeChange(20000, 11900)).toBe(8100);
  });

  it('pago exacto no genera vuelto', () => {
    expect(computeChange(11900, 11900)).toBe(0);
  });

  it('nunca devuelve un vuelto negativo', () => {
    expect(computeChange(5000, 11900)).toBe(0);
    expect(isPaymentSufficient(5000, 11900)).toBe(false);
    expect(isPaymentSufficient(11900, 11900)).toBe(true);
  });
});

describe('Venta POS — el total del ticket usa el mismo motor de IVA', () => {
  it('una línea de precio neto 10.000 cobra 11.900', () => {
    const { totals } = computeDocument([{ unitPrice: 10000, quantity: 1, isExempt: false }]);
    expect(totals.netAmount).toBe(10000);
    expect(totals.ivaAmount).toBe(1900);
    expect(totals.totalAmount).toBe(11900);
  });

  it('el IVA se redondea una vez sobre el neto agregado, no por línea', () => {
    const lines = [
      { unitPrice: 1001, quantity: 1, isExempt: false },
      { unitPrice: 1001, quantity: 1, isExempt: false },
      { unitPrice: 1001, quantity: 1, isExempt: false },
    ];
    const { items, totals } = computeDocument(lines);
    expect(totals.ivaAmount).toBe(571);
    // El reparto por línea suma exactamente el IVA del documento.
    expect(items.reduce((sum, item) => sum + item.iva, 0)).toBe(571);
    expect(totals.totalAmount).toBe(3574);
  });

  it('el vuelto se calcula contra el total del documento, no contra el neto', () => {
    const { totals } = computeDocument([{ unitPrice: 1001, quantity: 3, isExempt: false }]);
    expect(computeChange(5000, totals.totalAmount)).toBe(5000 - totals.totalAmount);
  });
});

describe('Importador — números en formato chileno', () => {
  it('interpreta el punto como separador de miles', () => {
    expect(parseChileanInteger('1.250')).toBe(1250);
    expect(parseChileanInteger('1.250.000')).toBe(1250000);
  });

  it('interpreta la coma como decimal y redondea a entero CLP', () => {
    expect(parseChileanInteger('1250,00')).toBe(1250);
    expect(parseChileanInteger('1.250,49')).toBe(1250);
    expect(parseChileanInteger('1.250,50')).toBe(1251);
  });

  it('tolera el símbolo de peso y los espacios', () => {
    expect(parseChileanInteger('$ 9.990')).toBe(9990);
    expect(parseChileanInteger(' 9990 ')).toBe(9990);
  });

  it('acepta números simples y el cero', () => {
    expect(parseChileanInteger('9990')).toBe(9990);
    expect(parseChileanInteger('0')).toBe(0);
  });

  it('rechaza texto y vacíos en vez de devolver un número inventado', () => {
    expect(parseChileanInteger('')).toBeNull();
    expect(parseChileanInteger('gratis')).toBeNull();
    expect(parseChileanInteger('12ab')).toBeNull();
    expect(parseChileanInteger('N/A')).toBeNull();
  });

  it('un punto con menos de 3 decimales se trata como decimal, no como miles', () => {
    // "10.5" es un decimal mal tipeado, no diez mil quinientos.
    expect(parseChileanInteger('10.5')).toBe(11);
    expect(parseChileanInteger('10.50')).toBe(11);
  });

  /**
   * Una planilla exportada en formato inglés trae "1,250" como mil doscientos
   * cincuenta. Leerlo como coma decimal chilena daba 1,25 → 1: un error de tres
   * órdenes de magnitud que se arrastra a todas las boletas del producto.
   */
  it('una coma con exactamente 3 dígitos es separador de miles, no decimal', () => {
    expect(parseChileanInteger('1,250')).toBe(1250);
    expect(parseChileanInteger('12,500')).toBe(12500);
  });

  it('el formato inglés completo también se interpreta bien', () => {
    expect(parseChileanInteger('1,250,000')).toBe(1250000);
  });

  it('sigue tratando como decimal la coma con 1 o 2 dígitos', () => {
    expect(parseChileanInteger('1250,5')).toBe(1251);
    expect(parseChileanInteger('1250,49')).toBe(1250);
  });
});

describe('Importador — sí/no de planilla', () => {
  it('acepta las formas que la gente escribe', () => {
    for (const value of ['si', 'Sí', 'TRUE', '1', 'x', 'exento']) {
      expect(parseBoolean(value)).toBe(true);
    }
    for (const value of ['no', 'FALSE', '0', '', 'afecto']) {
      expect(parseBoolean(value)).toBe(false);
    }
  });

  it('devuelve null ante algo que no entiende, en vez de asumir', () => {
    expect(parseBoolean('quizás')).toBeNull();
    expect(parseBoolean('2')).toBeNull();
  });
});

describe('POS — productos exentos', () => {
  it('una línea exenta no paga IVA y va al monto exento', () => {
    const { totals } = computeDocument([{ unitPrice: 10000, quantity: 1, isExempt: true }]);
    expect(totals.netAmount).toBe(0);
    expect(totals.exemptAmount).toBe(10000);
    expect(totals.ivaAmount).toBe(0);
    expect(totals.totalAmount).toBe(10000);
  });

  it('mezcla afecto y exento cobrando IVA solo sobre lo afecto', () => {
    const { totals } = computeDocument([
      { unitPrice: 10000, quantity: 1, isExempt: false },
      { unitPrice: 5000, quantity: 1, isExempt: true },
    ]);
    expect(totals.netAmount).toBe(10000);
    expect(totals.exemptAmount).toBe(5000);
    expect(totals.ivaAmount).toBe(1900);
    expect(totals.totalAmount).toBe(16900);
  });
});

describe('Importador — RUT de las plantillas y del receptor genérico', () => {
  /**
   * Los RUT que el sistema muestra como ejemplo tienen que pasar Módulo 11. Un
   * RUT de ejemplo inválido hace que la primera importación de cada usuario
   * falle en la fila que el propio sistema le entregó.
   */
  it('el RUT de ejemplo de la plantilla de contactos es válido', () => {
    expect(validateRut('76.543.210-3')).toBe(true);
    // El DV correcto es 3: -K y -9 son los errores típicos al inventarlo.
    expect(validateRut('76.543.210-K')).toBe(false);
    expect(validateRut('76.543.210-9')).toBe(false);
  });

  it('el receptor genérico de boletas del POS es un RUT válido', () => {
    expect(validateRut('66.666.666-6')).toBe(true);
  });

  it('formatRut deja el formato canónico que espera el resto del sistema', () => {
    expect(formatRut('765432103')).toBe('76.543.210-3');
    expect(formatRut('66666666-6')).toBe('66.666.666-6');
  });
});

describe('Importador — encabezados', () => {
  it('normaliza tildes, mayúsculas y separadores', () => {
    expect(normalizeHeader('Categoría')).toBe('categoria');
    expect(normalizeHeader('  PRECIO   NETO ')).toBe('precio neto');
    expect(normalizeHeader('Razon_Social')).toBe('razon social');
    expect(normalizeHeader('Stock-Mínimo')).toBe('stock minimo');
  });

  it('mapea encabezados en español a los campos de producto', () => {
    const mapping = mapHeaders('products', ['Código', 'Nombre', 'Precio', 'Categoría']);
    expect(mapping.columnIndex.sku).toBe(0);
    expect(mapping.columnIndex.name).toBe(1);
    expect(mapping.columnIndex.netPrice).toBe(2);
    expect(mapping.columnIndex.categoryName).toBe(3);
    expect(mapping.missingRequiredColumns).toEqual([]);
  });

  it('reporta las columnas obligatorias que faltan', () => {
    const mapping = mapHeaders('products', ['Nombre', 'Unidad']);
    expect(mapping.missingRequiredColumns).toEqual(expect.arrayContaining(['SKU', 'Precio Neto']));
  });

  it('lista los encabezados desconocidos en vez de fallar', () => {
    const mapping = mapHeaders('products', ['SKU', 'Nombre', 'Precio Neto', 'Color favorito']);
    expect(mapping.unknownHeaders).toEqual(['Color favorito']);
    expect(mapping.missingRequiredColumns).toEqual([]);
  });

  it('mapea los encabezados de contactos, incluido RUT', () => {
    const mapping = mapHeaders('contacts', ['RUT', 'Razón Social', 'Correo', 'Fono']);
    expect(mapping.columnIndex.rut).toBe(0);
    expect(mapping.columnIndex.razonSocial).toBe(1);
    expect(mapping.columnIndex.email).toBe(2);
    expect(mapping.columnIndex.phone).toBe(3);
    expect(mapping.missingRequiredColumns).toEqual([]);
  });

  it('no asigna dos campos al mismo encabezado', () => {
    // "Nombre" es alias de razonSocial en contactos; no debe consumirse dos veces.
    const mapping = mapHeaders('contacts', ['RUT', 'Nombre']);
    const usedIndexes = Object.values(mapping.columnIndex);
    expect(new Set(usedIndexes).size).toBe(usedIndexes.length);
  });
});

describe('Importador Refactorizado — Validación de Ventas Históricas', () => {
  const emptyCtx: ContactLookupContext = {
    contactsByRut: new Map(),
    seenFolios: new Map(),
  };

  it('permite RUTs que no existen previamente en la base (auto-creación)', () => {
    const values = {
      contactRut: '76.543.210-3',
      razonSocial: 'Comercial Ejemplo SpA',
      dteType: 'Factura',
      folio: '1001',
      issueDate: '2024-03-15',
      productDetail: 'Producto A',
      quantity: '2',
      unitPrice: '10000',
    };

    const errors = validateHistoricalSalesRow(values, 2, emptyCtx);
    expect(errors).toEqual([]);
  });

  it('rechaza RUTs con dígito verificador inválido', () => {
    const values = {
      contactRut: '76.543.210-K',
      dteType: 'Factura',
      folio: '1001',
      issueDate: '2024-03-15',
    };

    const errors = validateHistoricalSalesRow(values, 2, emptyCtx);
    expect(errors.some((e) => e.column === 'RUT Cliente')).toBe(true);
  });

  it('exige Folio obligatorio', () => {
    const values = {
      contactRut: '76.543.210-3',
      dteType: 'Factura',
      folio: '',
      issueDate: '2024-03-15',
    };

    const errors = validateHistoricalSalesRow(values, 2, emptyCtx);
    expect(errors.some((e) => e.column === 'Folio')).toBe(true);
  });

  it('reconoce tipos de documento incluidos Nota de Crédito 61 y Boleta 39', () => {
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('factura')]).toBe('FACTURA_33');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('33')]).toBe('FACTURA_33');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('boleta')]).toBe('BOLETA_39');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('39')]).toBe('BOLETA_39');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('guia de despacho')]).toBe('GUIA_DESPACHO_52');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('52')]).toBe('GUIA_DESPACHO_52');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('nota de credito')]).toBe('NOTA_CREDITO_61');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('61')]).toBe('NOTA_CREDITO_61');
    expect(DTE_TYPE_TEXT_MAP[normalizeHeader('nc')]).toBe('NOTA_CREDITO_61');
  });
});

describe('Importador Refactorizado — Validación de Compras Históricas', () => {
  const emptyCtx: ContactLookupContext = {
    contactsByRut: new Map(),
    seenFolios: new Map(),
  };

  it('permite RUTs de proveedor que no existen previamente en la base', () => {
    const values = {
      contactRut: '76.543.210-3',
      razonSocial: 'Proveedor Nuevo SpA',
      documentType: 'Factura',
      folio: 'F-556',
      issueDate: '2024-03-10',
      productDetail: 'Insumos',
      quantity: '5',
      unitPrice: '5000',
    };

    const errors = validateHistoricalPurchasesRow(values, 2, emptyCtx);
    expect(errors).toEqual([]);
  });

  it('reconoce tipos de documento de compras incluidos NOTA_CREDITO', () => {
    expect(PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader('factura')]).toBe('FACTURA');
    expect(PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader('boleta')]).toBe('BOLETA');
    expect(PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader('guia de despacho')]).toBe('GUIA_DESPACHO');
    expect(PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader('nota de credito')]).toBe('NOTA_CREDITO');
    expect(PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader('61')]).toBe('NOTA_CREDITO');
    expect(PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader('otro')]).toBe('OTRO');
  });

  it('exige Folio obligatorio en compras', () => {
    const values = {
      contactRut: '76.543.210-3',
      documentType: 'Factura',
      folio: '',
      issueDate: '2024-03-10',
    };

    const errors = validateHistoricalPurchasesRow(values, 2, emptyCtx);
    expect(errors.some((e) => e.column === 'Folio')).toBe(true);
  });
});

describe('Importador Refactorizado — Columnas y Esquema', () => {
  it('historicalSales contiene todas las columnas requeridas y no tiene columnas deprecadas', () => {
    const cols = IMPORT_COLUMNS.historicalSales;
    const requiredKeys = cols.filter((c) => c.required).map((c) => c.key);
    expect(requiredKeys).toEqual(
      expect.arrayContaining(['contactRut', 'dteType', 'folio', 'issueDate', 'productDetail', 'quantity', 'unitPrice'])
    );

    const allKeys = cols.map((c) => c.key);
    expect(allKeys).not.toContain('itemsText');
    expect(allKeys).not.toContain('docId');
    expect(allKeys).not.toContain('isExempt');
  });

  it('historicalPurchases contiene todas las columnas requeridas y no tiene columnas deprecadas', () => {
    const cols = IMPORT_COLUMNS.historicalPurchases;
    const requiredKeys = cols.filter((c) => c.required).map((c) => c.key);
    expect(requiredKeys).toEqual(
      expect.arrayContaining(['contactRut', 'documentType', 'folio', 'issueDate', 'productDetail', 'quantity', 'unitPrice'])
    );

    const allKeys = cols.map((c) => c.key);
    expect(allKeys).not.toContain('itemsText');
    expect(allKeys).not.toContain('docId');
  });
});

describe('Importador — Parseo de Fechas y Decimales', () => {
  it('parseChileanDate acepta AAAA-MM-DD y DD-MM-AAAA', () => {
    expect(parseChileanDate('2024-03-15')).toBe('2024-03-15');
    expect(parseChileanDate('15-03-2024')).toBe('2024-03-15');
    expect(parseChileanDate('15/03/2024')).toBe('2024-03-15');
    expect(parseChileanDate('invalido')).toBeNull();
  });

  it('parseChileanDecimal conserva decimales para cantidades', () => {
    expect(parseChileanDecimal('10,5')).toBe(10.5);
    expect(parseChileanDecimal('10.5')).toBe(10.5);
    expect(parseChileanDecimal('100')).toBe(100);
  });
});

