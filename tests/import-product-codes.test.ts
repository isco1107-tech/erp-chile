import { validateProductRow, type ProductCodeContext } from '@/modules/import/services/import.service';
import { mapHeaders } from '@/modules/import/services/parse.service';

function context(existing: { barcodes?: string[]; scaleCodes?: string[] } = {}) {
  const codes: ProductCodeContext = {
    existingBarcodes: new Set(existing.barcodes ?? []),
    existingScaleCodes: new Set(existing.scaleCodes ?? []),
    seenBarcodes: new Map(),
    seenScaleCodes: new Map(),
  };
  return { companyId: 'c1', existingKeys: new Set<string>(), seenKeys: new Map<string, number>(), codes };
}

const base = { sku: 'A1', name: 'Jamón pierna', netPrice: '9000', unit: 'KG', minStock: '', categoryName: '', isExempt: '', description: '' };

describe('importación de productos: código de barras y PLU de balanza', () => {
  it('reconoce los encabezados habituales sin confundirlos con el SKU', () => {
    const mapping = mapHeaders('products', ['Código', 'Nombre', 'Precio neto', 'Código de barras', 'PLU']);
    expect(mapping.columnIndex.sku).toBe(0);
    expect(mapping.columnIndex.barcode).toBe(3);
    expect(mapping.columnIndex.scaleCode).toBe(4);
  });

  it('acepta un código de barras y un PLU nuevos', () => {
    expect(validateProductRow({ ...base, barcode: '7801234567890', scaleCode: '00123' }, 2, context())).toEqual([]);
  });

  it('rechaza un código de barras con espacios o ya usado en el catálogo', () => {
    expect(validateProductRow({ ...base, barcode: '780 123', scaleCode: '' }, 2, context())[0]?.column).toBe('Código de barras');
    const used = validateProductRow({ ...base, barcode: '7801234567890', scaleCode: '' }, 2, context({ barcodes: ['7801234567890'] }));
    expect(used[0]?.message).toContain('ya lo usa');
  });

  it('rechaza códigos repetidos dentro del mismo archivo', () => {
    const ctx = context();
    expect(validateProductRow({ ...base, barcode: '7801234567890', scaleCode: '5' }, 2, ctx)).toEqual([]);
    const second = validateProductRow({ ...base, sku: 'A2', barcode: '7801234567890', scaleCode: '005' }, 3, ctx);
    expect(second.map((error) => error.column)).toEqual(['Código de barras', 'PLU balanza']);
    expect(second[1]?.message).toContain('fila 2');
  });

  it('rechaza un PLU que no es número, es cero o ya existe (sin mirar ceros a la izquierda)', () => {
    expect(validateProductRow({ ...base, barcode: '', scaleCode: 'A12' }, 2, context())[0]?.column).toBe('PLU balanza');
    expect(validateProductRow({ ...base, barcode: '', scaleCode: '0000' }, 2, context())[0]?.column).toBe('PLU balanza');
    expect(validateProductRow({ ...base, barcode: '', scaleCode: '0123' }, 2, context({ scaleCodes: ['123'] }))[0]?.message).toContain('ya lo usa');
  });
});
