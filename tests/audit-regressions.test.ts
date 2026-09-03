import { calculateGrossPrice, calculateIva, calculateNeto, calculateTotal } from '@/lib/chile/tax';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { calculateNewPmp } from '@/lib/inventory/pmp';
import { regions } from '@/lib/chile/locations';
import { computeDocument } from '@/modules/sales/calc';

/**
 * Regresiones fijadas por la auditoría integral. Cada bloque corresponde a un
 * hallazgo concreto: si alguno vuelve a fallar, el defecto reapareció.
 */

describe('Precio bruto y condición de exento', () => {
  it('un producto afecto suma 19% al neto', () => {
    expect(calculateGrossPrice(10000, false)).toBe(11900);
    expect(calculateGrossPrice(1001, false)).toBe(1191);
  });

  /**
   * Hallazgo: cada punto que persistía `Product.grossPrice` aplicaba
   * `calculateTotal` a ciegas, así que un exento quedaba guardado con un 19%
   * que nunca se le cobra — el POS exhibía un precio y la boleta cobraba otro.
   */
  it('un producto exento tiene bruto igual a su neto', () => {
    expect(calculateGrossPrice(10000, true)).toBe(10000);
    expect(calculateGrossPrice(1, true)).toBe(1);
    expect(calculateGrossPrice(0, true)).toBe(0);
  });

  it('grossPrice de un afecto equivale a redondear neto × 1,19', () => {
    for (const neto of [1, 7, 105, 999, 1000, 1001, 123456]) {
      expect(calculateGrossPrice(neto, false)).toBe(Math.round(neto * 1.19));
    }
  });

  it('calculateNeto revierte el bruto de un afecto', () => {
    expect(calculateNeto(11900)).toBe(10000);
    expect(calculateIva(10000)).toBe(1900);
    expect(calculateTotal(10000)).toBe(11900);
  });
});

describe('Exento en el documento de venta', () => {
  /**
   * Hallazgo: `createSalesDocument` tomaba `isExempt` de lo que enviaba el
   * formulario en vez del catálogo, así que vender un producto exento por el
   * módulo de Ventas le cargaba el 19% igual. El POS ya lo leía del producto;
   * esta ruta había quedado atrás. Lo que se fija acá es el efecto tributario.
   */
  it('una línea exenta va al monto exento y no genera IVA', () => {
    const { totals } = computeDocument([{ unitPrice: 10000, quantity: 1, isExempt: true }]);
    expect(totals.netAmount).toBe(0);
    expect(totals.exemptAmount).toBe(10000);
    expect(totals.ivaAmount).toBe(0);
    expect(totals.totalAmount).toBe(10000);
  });

  it('la misma línea marcada como afecta sí paga IVA', () => {
    const { totals } = computeDocument([{ unitPrice: 10000, quantity: 1, isExempt: false }]);
    expect(totals.exemptAmount).toBe(0);
    expect(totals.ivaAmount).toBe(1900);
    expect(totals.totalAmount).toBe(11900);
  });
});

describe('RUT chileno — Módulo 11', () => {
  it('acepta RUTs de persona y de empresa válidos', () => {
    for (const rut of ['11.111.111-1', '76.543.210-3', '99.999.999-9', '66.666.666-6']) {
      expect(validateRut(rut)).toBe(true);
    }
  });

  it('acepta el dígito verificador K en mayúscula y minúscula', () => {
    // Cuerpos cuyo DV real por Módulo 11 es K (resto 10).
    for (const conK of ['12.000.008-K', '12.000.011-K', '12.000.025-K']) {
      expect(validateRut(conK)).toBe(true);
      expect(validateRut(conK.toLowerCase())).toBe(true);
    }
  });

  it('rechaza el dígito verificador incorrecto', () => {
    expect(validateRut('11.111.111-2')).toBe(false);
    expect(validateRut('76.543.210-K')).toBe(false);
    expect(validateRut('76.543.210-9')).toBe(false);
  });

  it('rechaza entradas basura sin lanzar excepción', () => {
    for (const value of ['', '1', 'abc', '...-', '12.345.678-']) {
      expect(validateRut(value)).toBe(false);
    }
  });

  it('formatRut deja el formato canónico XX.XXX.XXX-X', () => {
    expect(formatRut('111111111')).toBe('11.111.111-1');
    expect(formatRut('76543210-3')).toBe('76.543.210-3');
    expect(formatRut('12000008k')).toBe('12.000.008-K');
  });

  it('cleanRut deja solo cuerpo y DV, en mayúscula', () => {
    expect(cleanRut('11.111.111-1')).toBe('111111111');
    expect(cleanRut('12.000.008-k')).toBe('12000008K');
  });

  /** Es lo que hace que `@@unique([companyId, rutClean])` no se pueda burlar. */
  it('normaliza a la misma clave distintas grafías del mismo RUT', () => {
    const variantes = ['12.000.008-K', '12000008-k', '12000008K', '12.000.008-k'];
    const claves = new Set(variantes.map(cleanRut));
    expect(claves.size).toBe(1);
  });
});

describe('Datos oficiales de Chile', () => {
  it('carga las 16 regiones con sus comunas', () => {
    expect(regions.length).toBe(16);
    for (const region of regions) {
      expect(region.name.length).toBeGreaterThan(0);
      expect(region.comunas.length).toBeGreaterThan(0);
    }
  });

  it('incluye comunas conocidas de la Región Metropolitana', () => {
    const rm = regions.find((r) => r.name.includes('Metropolitana'));
    expect(rm).toBeDefined();
    expect(rm!.comunas).toEqual(expect.arrayContaining(['Santiago', 'Providencia', 'Las Condes']));
  });
});

describe('PMP — Precio Medio Ponderado', () => {
  it('aplica la fórmula ponderada', () => {
    // (10×1000 + 10×1400) / 20 = 1200
    expect(calculateNewPmp({ previousStock: 10, previousPmp: 1000, incomingQuantity: 10, incomingUnitCost: 1400 }))
      .toEqual({ newStock: 20, newPmp: 1200 });
  });

  it('con stock inicial 0 el PMP es el costo de entrada, sin dividir por cero', () => {
    const result = calculateNewPmp({ previousStock: 0, previousPmp: 0, incomingQuantity: 5, incomingUnitCost: 3000 });
    expect(result).toEqual({ newStock: 5, newPmp: 3000 });
    expect(Number.isFinite(result.newPmp)).toBe(true);
  });

  it('con stock resultante 0 usa el costo entrante en vez de NaN o $0 corrompido', () => {
    const result = calculateNewPmp({ previousStock: 0, previousPmp: 0, incomingQuantity: 0, incomingUnitCost: 500 });
    expect(result).toEqual({ newStock: 0, newPmp: 500 });
    expect(Number.isNaN(result.newPmp)).toBe(false);
  });

  it('redondea el PMP a 2 decimales', () => {
    // (3×1000 + 1×1001) / 4 = 1000.25
    expect(calculateNewPmp({ previousStock: 3, previousPmp: 1000, incomingQuantity: 1, incomingUnitCost: 1001 }).newPmp)
      .toBe(1000.25);
  });
});

describe('Cuadratura F29', () => {
  /**
   * Débito − Crédito: positivo es IVA a pagar, negativo es remanente a favor
   * del período siguiente. Es el signo que usa la fórmula del Panel del Excel.
   */
  function f29(debito: number, credito: number) {
    const saldo = debito - credito;
    return { saldo, etiqueta: saldo >= 0 ? 'IVA a Pagar' : 'Remanente Fiscal' };
  }

  it('débito mayor que crédito da IVA a pagar', () => {
    expect(f29(28500, 15200)).toEqual({ saldo: 13300, etiqueta: 'IVA a Pagar' });
  });

  it('crédito mayor que débito da remanente fiscal', () => {
    expect(f29(15200, 28500)).toEqual({ saldo: -13300, etiqueta: 'Remanente Fiscal' });
  });

  it('sin diferencia queda en cero', () => {
    expect(f29(10000, 10000).saldo).toBe(0);
  });
});
