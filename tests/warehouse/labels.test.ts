import { parseGs1, readLabelText, matchWarehouseCode } from '@/lib/warehouse/labels';
import { warehouseOperationSchema, daySchema, canonicalJson, type WarehouseProduct } from '@/lib/warehouse/contracts';

const product: WarehouseProduct = { id: 'p', sku: 'HARINA', name: 'Harina', barcode: '7801234567890', unit: 'KG', tracksLots: true, stocks: [], lots: [], packagings: [{ id: 'box', name: 'Caja x12', factor: 12, barcode: 'BOX12' }] };
describe('Etiquetas de bodega', () => {
  it('lee GS1 impreso sin convertir el contenido por caja en mercadería recibida', () => {
    expect(parseGs1('(01)07801234567890(17)261130(10)ABC-01')).toMatchObject({ barcode: '07801234567890', lotNumber: 'ABC-01', expiryDate: '2026-11-30' });
  });
  it('interpreta FNC1 para que el lote variable no absorba el vencimiento', () => {
    expect(parseGs1(']C1010780123456789010LOTE-A\x1d17261130')).toMatchObject({ lotNumber: 'LOTE-A', expiryDate: '2026-11-30' });
  });
  it('no inventa un separador ausente dentro de un lote', () => {
    expect(parseGs1('10ABC17261130').expiryDate).toBeUndefined();
  });
  it('convierte día GS1 cero al último día real de ese mes', () => {
    expect(parseGs1('(17)280200').expiryDate).toBe('2028-02-29');
    expect(parseGs1('(17)270230').expiryDate).toBeUndefined();
  });
  it('lee peso con su precisión GS1', () => {
    expect(parseGs1('(3103)012345').weightKg).toBe(12.345);
  });
  it('interpreta Digital Link sin navegar al sitio del código', () => {
    expect(parseGs1('https://id.gs1.org/01/07801234567890/10/LOTE-A?17=261130')).toMatchObject({ lotNumber: 'LOTE-A', expiryDate: '2026-11-30' });
  });
  it('lee una etiqueta OCR y rechaza fechas inexistentes', () => {
    expect(readLabelText('LOTE: ABC-9\nVENC: 30/11/2026\nPESO NETO: 12,50 KG')).toMatchObject({ lotNumber: 'ABC-9', expiryDate: '2026-11-30', weightKg: 12.5 });
    expect(readLabelText('VTO: 31/02/2026').expiryDate).toBeUndefined();
  });
  it('resuelve GTIN-14 con cero inicial al código de catálogo y reconoce empaques', () => {
    expect(matchWarehouseCode([product], '(01)07801234567890(10)A')?.product.id).toBe('p');
    expect(matchWarehouseCode([product], 'BOX12')).toMatchObject({ factor: 12, packagingName: 'Caja x12' });
    expect(matchWarehouseCode([product], 'Harina parecida')).toBeNull();
  });
});
describe('Contrato de operación offline', () => {
  const base = { protocol: 1, id: 'c0525b20-c355-4b44-8d5a-e9216371ca28', deviceId: 'ff0db5e1-dc79-48ef-8c26-0bd923d5cda8', capturedAt: '2026-10-21T12:00:00.000Z', productId: 'p', warehouseId: 'w', quantity: 1, kind: 'OUT', note: 'Consumo interno' };
  it('rechaza costos/empresa enviados por el teléfono', () => {
    expect(warehouseOperationSchema.safeParse({ ...base, unitCost: 1 }).success).toBe(false);
    expect(warehouseOperationSchema.safeParse({ ...base, companyId: 'otra' }).success).toBe(false);
  });
  it('solo permite cero en un conteo con referencia de existencias', () => {
    expect(warehouseOperationSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(warehouseOperationSchema.safeParse({ ...base, kind: 'COUNT', quantity: 0, baseline: { stockUpdatedAt: null } }).success).toBe(true);
  });
  it('rechaza valores no finitos, negativos y una precisión no soportada', () => {
    for (const quantity of [Infinity, NaN, -1, 1.1234567]) expect(warehouseOperationSchema.safeParse({ ...base, quantity }).success).toBe(false);
  });
  it('exige un destino distinto y una orden para la recepción', () => {
    expect(warehouseOperationSchema.safeParse({ ...base, kind: 'TRANSFER', targetWarehouseId: 'w' }).success).toBe(false);
    expect(warehouseOperationSchema.safeParse({ ...base, kind: 'RECEIPT' }).success).toBe(false);
  });
  it('valida días reales y canonicaliza JSON independientemente del orden', () => {
    expect(daySchema.safeParse('2026-02-29').success).toBe(false);
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(canonicalJson({ b: { d: 3, c: 2 }, a: 1 }));
  });
});
