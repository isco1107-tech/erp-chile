import { computeDocument, type LineItemInput } from '@/modules/sales/calc';
import { calculateIva, calculateTotal, calculateGrossPrice, formatCurrency } from '@/lib/chile/tax';
import { cleanRut, formatRut, rutKey, validateRut } from '@/lib/chile/rut';
import { calculateNewPmp } from '@/lib/inventory/pmp';
import { numberToWords, pesosInWords } from '@/lib/chile/number-words';

/**
 * Pruebas de estrés de la lógica central: miles de casos aleatorios con
 * semilla fija (reproducibles) contra invariantes que nunca deben romperse.
 * Si una falla, el mensaje incluye el caso exacto para reproducirlo.
 */

/** PRNG determinista (mulberry32): mismo resultado en cada corrida. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function rutDv(body: number): string {
  let sum = 0;
  let multiplier = 2;
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  return remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
}

describe('estrés: documentos de venta (computeDocument)', () => {
  it('5.000 documentos aleatorios: el IVA por línea siempre cuadra con el total y todo es entero', () => {
    const random = rng(19);
    for (let run = 0; run < 5_000; run++) {
      const lines: LineItemInput[] = Array.from({ length: int(random, 1, 40) }, () => ({
        unitPrice: int(random, 0, 5_000_000),
        quantity: random() < 0.2 ? int(random, 1, 3000) / 100 : int(random, 1, 500),
        discountPercent: random() < 0.3 ? int(random, 0, 100) : undefined,
        isExempt: random() < 0.25,
      }));
      const { items, totals } = computeDocument(lines);
      const context = JSON.stringify(lines);

      const lineIva = items.reduce((sum, item) => sum + item.iva, 0);
      if (lineIva !== totals.ivaAmount) throw new Error(`IVA por línea ${lineIva} ≠ total ${totals.ivaAmount}: ${context}`);
      expect(totals.ivaAmount).toBe(calculateIva(totals.netAmount));
      expect(totals.totalAmount).toBe(totals.netAmount + totals.exemptAmount + totals.ivaAmount);
      for (const item of items) {
        if (item.isExempt && item.iva !== 0) throw new Error(`Línea exenta con IVA: ${context}`);
        if (!Number.isInteger(item.subtotal) || !Number.isInteger(item.iva)) throw new Error(`Montos no enteros: ${context}`);
        if (item.iva < 0 || item.subtotal < 0) throw new Error(`Montos negativos: ${context}`);
      }
    }
  });

  it('casos extremos: sin líneas, todo exento, descuento 100% y montos enormes', () => {
    expect(computeDocument([]).totals).toEqual({ netAmount: 0, exemptAmount: 0, ivaAmount: 0, totalAmount: 0 });
    expect(computeDocument([{ unitPrice: 1000, quantity: 3, isExempt: true }]).totals.ivaAmount).toBe(0);
    expect(computeDocument([{ unitPrice: 1000, quantity: 3, discountPercent: 100 }]).totals.totalAmount).toBe(0);
    const huge = computeDocument([{ unitPrice: 999_999_999, quantity: 1000 }]);
    expect(Number.isSafeInteger(huge.totals.totalAmount)).toBe(true);
  });

  it('el ejemplo documentado: 3 líneas de $1.001 dan IVA 571, no 570', () => {
    const lines = Array.from({ length: 3 }, () => ({ unitPrice: 1001, quantity: 1 }));
    expect(computeDocument(lines).totals.ivaAmount).toBe(571);
  });
});

describe('estrés: impuestos', () => {
  it('total = neto + IVA y el precio de un exento nunca lleva IVA (30.000 casos)', () => {
    const random = rng(7);
    for (let run = 0; run < 30_000; run++) {
      const neto = int(random, 0, 2_000_000_000);
      expect(calculateTotal(neto)).toBe(neto + calculateIva(neto));
      expect(calculateGrossPrice(neto, true)).toBe(neto);
      if (Math.abs(calculateIva(neto) - neto * 0.19) > 0.5) throw new Error(`IVA mal redondeado para ${neto}`);
    }
  });

  it('formato CLP sin decimales ni espacio tras el signo', () => {
    expect(formatCurrency(1_250_000)).toBe('$1.250.000');
    expect(formatCurrency(0)).toBe('$0');
  });
});

describe('estrés: RUT (Módulo 11)', () => {
  it('20.000 RUT válidos se validan, formatean y vuelven a limpiar igual', () => {
    const random = rng(11);
    for (let run = 0; run < 20_000; run++) {
      const body = int(random, 1_000_000, 99_999_999);
      const raw = `${body}-${rutDv(body)}`;
      if (!validateRut(raw)) throw new Error(`RUT válido rechazado: ${raw}`);
      const formatted = formatRut(raw);
      expect(cleanRut(formatted)).toBe(cleanRut(raw));
      expect(validateRut(formatted)).toBe(true);
      expect(validateRut(formatted.toLowerCase())).toBe(true);
    }
  });

  it('cualquier otro dígito verificador se rechaza', () => {
    const random = rng(13);
    const dvs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'K'];
    for (let run = 0; run < 20_000; run++) {
      const body = int(random, 1_000_000, 99_999_999);
      const wrong = dvs.filter((dv) => dv !== rutDv(body))[int(random, 0, 9)]!;
      if (validateRut(`${body}-${wrong}`)) throw new Error(`RUT inválido aceptado: ${body}-${wrong}`);
    }
  });

  it('entradas basura nunca lanzan ni se aceptan', () => {
    for (const junk of ['', '-', 'K', 'abc', '12.345.678', '1K3-4', '....-', '0-0', '   ', '9'.repeat(40)]) {
      expect(() => validateRut(junk)).not.toThrow();
    }
    expect(validateRut('1K3-4')).toBe(false);
    expect(rutKey('00.012.345.678-k')).toBe('12345678K');
  });
});

describe('estrés: PMP (Kardex)', () => {
  it('20.000 compras sucesivas: el PMP queda entre el mínimo y el máximo de los costos y nunca es negativo', () => {
    const random = rng(23);
    for (let product = 0; product < 200; product++) {
      let stock = 0;
      let pmp = 0;
      let minCost = Infinity;
      let maxCost = -Infinity;
      for (let purchase = 0; purchase < 100; purchase++) {
        // Ventas entre compras (pueden dejar stock negativo, como con allowNegativeStock).
        stock -= int(random, 0, 50);
        const quantity = int(random, 1, 200);
        const cost = int(random, 1, 1_000_000);
        const result = calculateNewPmp({ previousStock: stock, previousPmp: pmp, incomingQuantity: quantity, incomingUnitCost: cost });
        if (stock <= 0) {
          // Lo que queda en bodega salió todo de esta compra.
          minCost = cost;
          maxCost = cost;
        } else {
          minCost = Math.min(minCost, cost, pmp);
          maxCost = Math.max(maxCost, cost, pmp);
        }
        const context = JSON.stringify({ stock, pmp, quantity, cost, result });
        if (!Number.isFinite(result.newPmp) || result.newPmp < 0) throw new Error(`PMP inválido: ${context}`);
        if (result.newStock > 0 && (result.newPmp < minCost - 0.01 || result.newPmp > maxCost + 0.01)) {
          throw new Error(`PMP fuera del rango de costos: ${context}`);
        }
        if (Math.round(result.newPmp * 100) !== Math.round(result.newPmp * 100 * 1e6) / 1e6) throw new Error(`Más de 2 decimales: ${context}`);
        stock = result.newStock;
        pmp = result.newPmp;
      }
    }
  });

  it('regresión: una compra que cubre un stock negativo usa el costo de la compra, nunca un PMP negativo', () => {
    expect(calculateNewPmp({ previousStock: -5, previousPmp: 1000, incomingQuantity: 10, incomingUnitCost: 100 })).toEqual({
      newStock: 5,
      newPmp: 100,
    });
  });
});

describe('estrés: montos en palabras (contratos y finiquitos)', () => {
  it('50.000 montos: nunca lanza, nunca deja huecos ni "undefined"', () => {
    const random = rng(29);
    for (let run = 0; run < 50_000; run++) {
      const amount = run < 2000 ? run : int(random, 0, 999_999_999_999);
      const words = pesosInWords(amount);
      if (/undefined|NaN| {2}|^ | $/.test(words)) throw new Error(`Texto mal formado para ${amount}: "${words}"`);
      expect(words.endsWith('pesos') || words === 'un peso').toBe(true);
    }
  });

  it('casos de gramática conocidos', () => {
    expect(pesosInWords(1)).toBe('un peso');
    expect(pesosInWords(21)).toBe('veintiún pesos');
    expect(pesosInWords(100)).toBe('cien pesos');
    expect(pesosInWords(101)).toBe('ciento un pesos');
    expect(pesosInWords(1_000_000)).toBe('un millón de pesos');
    expect(pesosInWords(1_250_000)).toBe('un millón doscientos cincuenta mil pesos');
    expect(pesosInWords(21_000)).toBe('veintiún mil pesos');
    expect(numberToWords(2_000_000_000)).toBe('dos mil millones');
  });
});
