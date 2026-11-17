import { isValidEan13 } from '@/lib/barcode/code128';
import {
  buildScaleLabel,
  DEFAULT_SCALE_LABEL_FORMAT,
  describeScaleLabel,
  parseScaleLabel,
  parseScaleLabelFormat,
  scaleCodeFits,
  scaleCodeKey,
  scaleLabelQuantity,
  scaleValueLength,
  type ScaleLabel,
  type ScaleLabelFormat,
} from '@/lib/pos/scale-label';
import { classifyRutEntry, resolveScan, type ScanProduct } from '@/lib/pos/scan';

const weightFormat: ScaleLabelFormat = DEFAULT_SCALE_LABEL_FORMAT;
const mixedFormat: ScaleLabelFormat = {
  codeLength: 5,
  rules: [
    { prefix: '20', mode: 'WEIGHT' },
    { prefix: '22', mode: 'PRICE' },
  ],
};

const jamon: ScanProduct = { id: 'jamon', sku: 'FIA-001', name: 'Jamón pierna', barcode: null, packagings: [], scaleCode: '123', grossPrice: 11990 };
const palta: ScanProduct = { id: 'palta', sku: 'VER-PALTA', name: 'Palta hass', barcode: null, packagings: [], scaleCode: '00045', grossPrice: 4990 };
const sinPrecio: ScanProduct = { id: 'sp', sku: 'X', name: 'Queso sin precio', barcode: null, packagings: [], scaleCode: '777', grossPrice: 0 };
// Un producto con un EAN interno que empieza con 20: su código exacto debe seguir mandando.
const interno: ScanProduct = { id: 'interno', sku: 'INT-1', name: 'Bolsa reutilizable', barcode: buildScaleLabel('20', '123', 512, 5), packagings: [] };
const catalog = [jamon, palta, sinPrecio];

function ok(label: ScaleLabel | null): Extract<ScaleLabel, { ok: true }> {
  if (!label || !label.ok) throw new Error('se esperaba una etiqueta válida');
  return label;
}

describe('formato de etiquetas de balanza', () => {
  it('el valor ocupa lo que deja el PLU', () => {
    expect(scaleValueLength(4)).toBe(6);
    expect(scaleValueLength(5)).toBe(5);
    expect(scaleValueLength(6)).toBe(4);
  });

  it('acepta solo formatos de la lista cerrada', () => {
    expect(parseScaleLabelFormat(mixedFormat)).toEqual(mixedFormat);
    expect(parseScaleLabelFormat(null)).toBeNull();
    expect(parseScaleLabelFormat({ codeLength: 7, rules: [{ prefix: '20', mode: 'WEIGHT' }] })).toBeNull();
    expect(parseScaleLabelFormat({ codeLength: 5, rules: [{ prefix: '19', mode: 'WEIGHT' }] })).toBeNull();
    expect(parseScaleLabelFormat({ codeLength: 5, rules: [] })).toBeNull();
    expect(parseScaleLabelFormat({ codeLength: 5, rules: [{ prefix: '20', mode: 'WEIGHT' }, { prefix: '20', mode: 'PRICE' }] })).toBeNull();
    expect(parseScaleLabelFormat({ codeLength: 5, rules: [{ prefix: '20', mode: 'WEIGHT' }], extra: true })).toBeNull();
  });
});

describe('PLU del producto', () => {
  it('ignora ceros a la izquierda', () => {
    expect(scaleCodeKey('00123')).toBe('123');
    expect(scaleCodeKey(' 123 ')).toBe('123');
  });

  it('rechaza lo que no es un PLU', () => {
    expect(scaleCodeKey('')).toBeNull();
    expect(scaleCodeKey(null)).toBeNull();
    expect(scaleCodeKey('00000')).toBeNull();
    expect(scaleCodeKey('12a')).toBeNull();
    expect(scaleCodeKey('1234567')).toBeNull();
  });

  it('avisa si el PLU no cabe en la etiqueta', () => {
    expect(scaleCodeFits('12345', 5)).toBe(true);
    expect(scaleCodeFits('123456', 5)).toBe(false);
  });
});

describe('lectura de la etiqueta', () => {
  it('arma etiquetas con dígito verificador válido', () => {
    const label = buildScaleLabel('20', '123', 512, 5);
    expect(label).toHaveLength(13);
    expect(label.startsWith('2000123')).toBe(true);
    expect(isValidEan13(label)).toBe(true);
  });

  it('lee PLU y peso', () => {
    const label = ok(parseScaleLabel(buildScaleLabel('20', '123', 512, 5), weightFormat));
    expect(label).toMatchObject({ prefix: '20', mode: 'WEIGHT', code: '123', value: 512 });
    expect(describeScaleLabel(label)).toBe('0,512 kg');
    expect(scaleLabelQuantity(label, 11990)).toBe(0.512);
  });

  it('lee PLU y precio, y deduce la cantidad al gramo con el precio del catálogo', () => {
    const label = ok(parseScaleLabel(buildScaleLabel('22', '45', 2495, 5), mixedFormat));
    expect(label).toMatchObject({ mode: 'PRICE', code: '45', value: 2495 });
    expect(describeScaleLabel(label)).toBe('$2.495');
    expect(scaleLabelQuantity(label, 4990)).toBe(0.5);
    expect(scaleLabelQuantity(label, 0)).toBeNull();
  });

  it('respeta el largo de PLU configurado', () => {
    const format: ScaleLabelFormat = { codeLength: 4, rules: [{ prefix: '21', mode: 'WEIGHT' }] };
    const label = ok(parseScaleLabel(buildScaleLabel('21', '987', 125000, 4), format));
    expect(label).toMatchObject({ code: '987', value: 125000 });
    expect(scaleLabelQuantity(label, 1)).toBe(125);
  });

  it('no toma como etiqueta lo que no lo es', () => {
    expect(parseScaleLabel('7801234567890', weightFormat)).toBeNull();
    expect(parseScaleLabel('2000123', weightFormat)).toBeNull();
    // Prefijo 22 no está en el formato de solo peso.
    expect(parseScaleLabel(buildScaleLabel('22', '45', 2495, 5), weightFormat)).toBeNull();
  });

  it('rechaza un dígito verificador malo, un PLU en cero y un valor en cero', () => {
    const good = buildScaleLabel('20', '123', 512, 5);
    const bad = `${good.slice(0, 12)}${(Number(good[12]) + 1) % 10}`;
    expect(parseScaleLabel(bad, weightFormat)).toEqual({ ok: false, prefix: '20', problem: 'check-digit' });
    expect(parseScaleLabel(buildScaleLabel('20', '0', 512, 5), weightFormat)).toEqual({ ok: false, prefix: '20', problem: 'no-code' });
    expect(parseScaleLabel(buildScaleLabel('20', '123', 0, 5), weightFormat)).toEqual({ ok: false, prefix: '20', problem: 'zero-value' });
  });
});

describe('lector del POS con etiquetas de balanza', () => {
  it('sin formato configurado, una etiqueta no agrega nada por balanza', () => {
    const result = resolveScan(catalog, buildScaleLabel('20', '123', 512, 5));
    expect(result.kind).toBe('none');
    expect(result.kind === 'none' && result.scaleProblem).toBeFalsy();
  });

  it('agrega el producto del PLU con el peso de la etiqueta', () => {
    const result = resolveScan(catalog, buildScaleLabel('20', '123', 512, 5), [], weightFormat);
    expect(result).toMatchObject({ kind: 'product', units: 0.512, via: 'scale', scaleText: '0,512 kg' });
    expect(result.kind === 'product' && result.product.id).toBe('jamon');
  });

  it('el PLU de la ficha puede tener ceros a la izquierda', () => {
    const result = resolveScan(catalog, buildScaleLabel('22', '45', 2495, 5), [], mixedFormat);
    expect(result).toMatchObject({ kind: 'product', units: 0.5, via: 'scale', scaleText: '$2.495' });
    expect(result.kind === 'product' && result.product.id).toBe('palta');
  });

  it('un prefijo de cantidad multiplica la etiqueta (dos paquetes iguales)', () => {
    const result = resolveScan(catalog, `2*${buildScaleLabel('20', '123', 512, 5)}`, [], weightFormat);
    expect(result).toMatchObject({ kind: 'product', units: 1.024 });
  });

  it('el código exacto de un producto manda sobre la etiqueta', () => {
    const result = resolveScan([...catalog, interno], interno.barcode as string, [], weightFormat);
    expect(result.kind === 'product' && result.product.id).toBe('interno');
    expect(result.kind === 'product' && result.via).toBe('barcode');
  });

  it('explica un PLU desconocido sin caer en la búsqueda parcial', () => {
    const result = resolveScan(catalog, buildScaleLabel('20', '999', 512, 5), [jamon], weightFormat);
    expect(result.kind).toBe('none');
    expect(result.kind === 'none' && result.scaleProblem).toContain('PLU 999');
  });

  it('no adivina si dos productos tienen el mismo PLU', () => {
    const repetido = { ...palta, id: 'otro', scaleCode: '123' };
    const result = resolveScan([...catalog, repetido], buildScaleLabel('20', '123', 512, 5), [], weightFormat);
    expect(result.kind === 'none' && result.scaleProblem).toContain('más de un producto');
  });

  it('no calcula una etiqueta de precio para un producto sin precio', () => {
    const result = resolveScan(catalog, buildScaleLabel('22', '777', 1000, 5), [], mixedFormat);
    expect(result.kind === 'none' && result.scaleProblem).toContain('no tiene precio');
  });

  it('explica una etiqueta con dígito verificador malo', () => {
    const good = buildScaleLabel('20', '123', 512, 5);
    const bad = `${good.slice(0, 12)}${(Number(good[12]) + 1) % 10}`;
    const result = resolveScan(catalog, bad, [], weightFormat);
    expect(result.kind === 'none' && result.scaleProblem).toContain('dígito verificador');
  });

  it('en el paso del RUT, una etiqueta es un producto y no un RUT', () => {
    const entry = classifyRutEntry(catalog, buildScaleLabel('20', '123', 512, 5), weightFormat);
    expect(entry.kind).toBe('product');
    const unknown = classifyRutEntry(catalog, buildScaleLabel('20', '999', 512, 5), weightFormat);
    expect(unknown).toMatchObject({ kind: 'invalid' });
    expect(unknown.kind === 'invalid' && unknown.message).toContain('PLU 999');
  });
});
