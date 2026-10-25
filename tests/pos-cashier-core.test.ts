import {
  addUnits,
  changeQuantity,
  countUnits,
  formatQuantity,
  MAX_LINE_QUANTITY,
  normalizeQuantity,
  removeLine,
  setQuantity,
  type CartLine,
  type CartProduct,
} from '@/lib/pos/cart';
import { classifyRutEntry, parseQuantityPrefix, resolveScan, searchProducts, type ScanProduct } from '@/lib/pos/scan';
import { changeFor, parseCashDigits, suggestTenders } from '@/lib/pos/cash';
import { holdSale, MAX_HELD_SALES, parseHeldSales, serializeHeldSales, takeHeldSale, type HeldSale } from '@/lib/pos/held-sales';

const leche: CartProduct & ScanProduct = {
  id: 'p1', sku: 'LECHE-1L', name: 'Leche entera 1 L', netPrice: 840, grossPrice: 1000, stock: 10, isTrackable: true, isExempt: false,
  barcode: '7801234567890',
  packagings: [{ barcode: '7801234000012', factor: 12, name: 'Caja x12' }],
};
const pan: CartProduct & ScanProduct = {
  id: 'p2', sku: 'K12', name: 'Pan de molde', netPrice: 1500, grossPrice: 1785, stock: 4, isTrackable: true, isExempt: false,
  barcode: null, packagings: [],
};
const upc: CartProduct & ScanProduct = {
  id: 'p3', sku: 'UPC-1', name: 'Galletas', netPrice: 700, grossPrice: 700, stock: 9, isTrackable: true, isExempt: true,
  barcode: '0036000291452', packagings: [],
};
const catalog = [leche, pan, upc];

describe('carrito del mostrador', () => {
  it('agrega, suma y no pasa del tope por línea', () => {
    let cart = addUnits([], leche, 1);
    cart = addUnits(cart, leche, 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(addUnits(cart, leche, MAX_LINE_QUANTITY)[0].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it('ignora cantidades inválidas en vez de ensuciar el carrito', () => {
    expect(addUnits([], leche, 0)).toEqual([]);
    expect(addUnits([], leche, -2)).toEqual([]);
    expect(addUnits([], leche, Number.NaN)).toEqual([]);
    expect(normalizeQuantity(MAX_LINE_QUANTITY + 1)).toBeNull();
  });

  it('suma fracciones sin arrastrar error de coma flotante', () => {
    let cart = addUnits([], pan, 0.1);
    cart = addUnits(cart, pan, 0.2);
    expect(cart[0].quantity).toBe(0.3);
  });

  it('cambiar la cantidad a cero o menos quita la línea', () => {
    const cart = addUnits([], leche, 2);
    expect(changeQuantity(cart, 'p1', -1)[0].quantity).toBe(1);
    expect(changeQuantity(cart, 'p1', -2)).toEqual([]);
    expect(setQuantity(cart, 'p1', 0)).toEqual([]);
    expect(setQuantity(cart, 'p1', 5)[0].quantity).toBe(5);
    expect(removeLine(cart, 'p1')).toEqual([]);
  });

  it('cuenta unidades y las muestra con coma decimal', () => {
    const cart: CartLine[] = addUnits(addUnits([], leche, 2), pan, 0.5);
    expect(countUnits(cart)).toBe(2.5);
    expect(formatQuantity(1)).toBe('1');
    expect(formatQuantity(0.5)).toBe('0,5');
  });
});

describe('lector de códigos del mostrador', () => {
  it('lee el prefijo N* como cantidad', () => {
    expect(parseQuantityPrefix('3*7801234567890')).toMatchObject({ units: 3, code: '7801234567890', explicit: true, invalid: false });
    expect(parseQuantityPrefix('0,5*K12')).toMatchObject({ units: 0.5, code: 'K12' });
    expect(parseQuantityPrefix('7801234567890')).toMatchObject({ units: 1, explicit: false });
    expect(parseQuantityPrefix('0*K12').invalid).toBe(true);
    expect(parseQuantityPrefix('abc*K12').invalid).toBe(true);
    expect(parseQuantityPrefix('*K12').invalid).toBe(true);
  });

  it('el código exacto manda sobre la búsqueda parcial', () => {
    const search = searchProducts(catalog, 'leche');
    const exact = resolveScan(catalog, '7801234567890', search);
    expect(exact).toMatchObject({ kind: 'product', via: 'barcode', units: 1 });
    expect(exact.kind === 'product' && exact.product.id).toBe('p1');
    const bySku = resolveScan(catalog, 'k12');
    expect(bySku).toMatchObject({ kind: 'product', via: 'sku' });
  });

  it('un empaque agrega sus unidades y respeta el prefijo', () => {
    expect(resolveScan(catalog, '7801234000012')).toMatchObject({ kind: 'product', via: 'packaging', units: 12, packName: 'Caja x12' });
    expect(resolveScan(catalog, '2*7801234000012')).toMatchObject({ units: 24 });
    expect(resolveScan(catalog, '3*7801234567890')).toMatchObject({ units: 3 });
  });

  it('un UPC-A leído como EAN-13 con cero adelante encuentra el producto', () => {
    expect(resolveScan(catalog, '036000291452')).toMatchObject({ kind: 'product', via: 'barcode' });
    const loose = resolveScan(catalog, '36000291452');
    expect(loose.kind).toBe('product');
  });

  it('un prefijo inválido o un código desconocido no agregan nada', () => {
    expect(resolveScan(catalog, '0*K12')).toMatchObject({ kind: 'none', invalidPrefix: true });
    expect(resolveScan(catalog, '9999999999999')).toMatchObject({ kind: 'none', invalidPrefix: false });
    expect(resolveScan(catalog, '')).toMatchObject({ kind: 'none' });
  });

  it('sin coincidencia exacta toma la primera parcial del buscador', () => {
    const search = searchProducts(catalog, 'pan');
    expect(resolveScan(catalog, 'pan', search)).toMatchObject({ kind: 'product', via: 'search' });
  });
});

describe('paso del RUT al escanear el primer producto', () => {
  it('vacío es consumidor final', () => {
    expect(classifyRutEntry(catalog, '   ')).toEqual({ kind: 'empty' });
  });

  it('un RUT válido, con o sin formato, se normaliza', () => {
    expect(classifyRutEntry(catalog, '12.345.678-5')).toEqual({ kind: 'rut', rut: '12.345.678-5' });
    expect(classifyRutEntry(catalog, '123456785')).toEqual({ kind: 'rut', rut: '12.345.678-5' });
    expect(classifyRutEntry(catalog, '12345678-5')).toEqual({ kind: 'rut', rut: '12.345.678-5' });
    expect(classifyRutEntry(catalog, '10.000.013-k')).toEqual({ kind: 'rut', rut: '10.000.013-K' });
    expect(classifyRutEntry(catalog, '10000013K')).toEqual({ kind: 'rut', rut: '10.000.013-K' });
  });

  it('un RUT con dígito verificador malo se rechaza con un mensaje accionable', () => {
    const result = classifyRutEntry(catalog, '12.345.678-9');
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.message).toMatch(/dígito verificador/);
  });

  it('un código del catálogo escaneado con el paso abierto es un producto, no un RUT roto', () => {
    const barcode = classifyRutEntry(catalog, '7801234567890');
    expect(barcode.kind).toBe('product');
    const sku = classifyRutEntry(catalog, 'K12');
    expect(sku.kind).toBe('product');
    const multiplied = classifyRutEntry(catalog, '2*7801234567890');
    expect(multiplied.kind === 'product' && multiplied.resolution.units).toBe(2);
  });

  it('un RUT con guion y verificador válido gana aunque el catálogo tenga un código igual', () => {
    const clash: ScanProduct = { id: 'x', sku: '12.345.678-5', name: 'Raro', barcode: null, packagings: [] };
    expect(classifyRutEntry([clash], '12.345.678-5')).toEqual({ kind: 'rut', rut: '12.345.678-5' });
  });

  it('texto que no es RUT ni producto avisa', () => {
    const result = classifyRutEntry(catalog, 'hola');
    expect(result.kind).toBe('invalid');
  });
});

describe('efectivo', () => {
  it('calcula el vuelto y lo que falta', () => {
    expect(changeFor(3490, 5000)).toBe(1510);
    expect(changeFor(3490, 3000)).toBe(-490);
  });

  it('solo toma dígitos y respeta el máximo', () => {
    expect(parseCashDigits('1.000')).toBe(1000);
    expect(parseCashDigits('$ 5 000')).toBe(5000);
    expect(parseCashDigits('abc')).toBe(0);
    expect(parseCashDigits('1234567890123')).toBe(123456789);
  });

  it('sugiere los montos con los que se suele pagar', () => {
    expect(suggestTenders(3490)).toEqual([4000, 5000, 10000, 20000]);
    expect(suggestTenders(450)).toEqual([1000, 2000, 5000, 10000]);
    expect(suggestTenders(12350)).toEqual([13000, 15000, 20000]);
    expect(suggestTenders(25000)).toEqual([30000, 40000]);
    expect(suggestTenders(5000)).toEqual([10000, 20000]);
    expect(suggestTenders(0)).toEqual([]);
    expect(suggestTenders(-5)).toEqual([]);
  });
});

describe('ventas en espera', () => {
  const sale = (id: string): HeldSale => ({ id, heldAt: 1, customerRut: '12.345.678-5', customerName: 'Ana', rutResolved: true, lines: addUnits([], leche, 2) });

  it('pone en espera, retoma y respeta el tope', () => {
    let list: HeldSale[] = [];
    for (let i = 0; i < MAX_HELD_SALES; i += 1) {
      const result = holdSale(list, sale(`h${i}`));
      expect(result.ok).toBe(true);
      if (result.ok) list = result.list;
    }
    const over = holdSale(list, sale('extra'));
    expect(over.ok).toBe(false);
    const taken = takeHeldSale(list, 'h2');
    expect(taken.sale?.id).toBe('h2');
    expect(taken.list).toHaveLength(MAX_HELD_SALES - 1);
    expect(takeHeldSale(list, 'nope').sale).toBeNull();
  });

  it('no pone en espera un carrito vacío', () => {
    expect(holdSale([], { ...sale('a'), lines: [] }).ok).toBe(false);
  });

  it('guarda y recupera, y descarta lo corrupto sin romper', () => {
    const list = [sale('a'), sale('b')];
    expect(parseHeldSales(serializeHeldSales(list))).toEqual(list);
    expect(parseHeldSales(null)).toEqual([]);
    expect(parseHeldSales('no es json')).toEqual([]);
    expect(parseHeldSales('{"a":1}')).toEqual([]);
    const mixed = JSON.stringify([sale('ok'), { id: 'malo', lines: [] }, 42]);
    expect(parseHeldSales(mixed).map((item) => item.id)).toEqual(['ok']);
  });
});
