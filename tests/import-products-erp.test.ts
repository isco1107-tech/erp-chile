/**
 * Importación de productos desde otro ERP: aliases de encabezados, columnas
 * nuevas (código de barras, marca, costo, productor), unidades equivalentes,
 * límites por entidad y commit por lotes dentro de una sola transacción.
 */
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: jest.fn(), createMany: jest.fn() },
    producer: { findMany: jest.fn() },
    contact: { findMany: jest.fn(), createMany: jest.fn() },
    category: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildPreview,
  buildProductCreateData,
  commitImport,
  validateProductRow,
  type ValidationContext,
} from '@/modules/import/services/import.service';
import { mapHeaders } from '@/modules/import/services/parse.service';
import {
  barcodeError,
  buildProducerLookup,
  normalizeUnit,
  resolveProducer,
} from '@/modules/import/services/product-import';
import { IMPORT_INSERT_BATCH_SIZE, MAX_IMPORT_ROWS, MAX_IMPORT_ROWS_BULK, maxImportRows } from '@/modules/import/schema';

const db = prisma as unknown as {
  product: { findMany: jest.Mock; createMany: jest.Mock };
  producer: { findMany: jest.Mock };
  contact: { findMany: jest.Mock; createMany: jest.Mock };
  category: { upsert: jest.Mock };
  $transaction: jest.Mock;
};

const lookup = buildProducerLookup([
  { id: 'pr1', isActive: true, contact: { rutClean: '111111111', razonSocial: 'Miel del Valle SpA' } },
  { id: 'pr2', isActive: false, contact: { rutClean: '222222222', razonSocial: 'Productor Inactivo' } },
  { id: 'pr3', isActive: true, contact: { rutClean: '333333333', razonSocial: 'Gemelo' } },
  { id: 'pr4', isActive: true, contact: { rutClean: '444444444', razonSocial: 'GEMELO' } },
]);

function ctx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    companyId: 'c1',
    existingKeys: new Set(),
    seenKeys: new Map(),
    existingBarcodes: new Set(['7800000000001']),
    seenBarcodes: new Map(),
    producers: lookup,
    ...overrides,
  };
}

function row(overrides: Record<string, string> = {}): Record<string, string> {
  return { sku: 'A-1', name: 'Producto', netPrice: '1000', ...overrides };
}

const columnsOf = (errors: Array<{ column: string }>) => errors.map((e) => e.column);

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
});

describe('encabezados de otros ERP', () => {
  it('reconoce nombres genéricos de columnas de productos', () => {
    const mapping = mapHeaders('products', [
      'Código Producto', 'Nombre del Producto', 'Precio Venta Neto', 'Unidad de Medida', 'Stock Crítico',
      'Rubro', 'Código de Barras', 'Marca', 'Costo Neto', 'Productor',
    ]);
    expect(mapping.missingRequiredColumns).toEqual([]);
    expect(mapping.unknownHeaders).toEqual([]);
    expect(Object.keys(mapping.columnIndex).sort()).toEqual(
      ['barcode', 'brand', 'categoryName', 'cost', 'minStock', 'name', 'netPrice', 'producer', 'sku', 'unit']
    );
  });

  it('acepta "Cod. Barra", EAN y GTIN para el código de barras', () => {
    for (const header of ['Cod. Barra', 'EAN', 'GTIN', 'EAN13']) {
      expect(mapHeaders('products', ['SKU', 'Nombre', 'Precio Neto', header]).columnIndex.barcode).toBe(3);
    }
  });

  it('NO toma como precio neto una columna con IVA incluido', () => {
    const mapping = mapHeaders('products', ['SKU', 'Nombre', 'Precio Neto', 'Precio con IVA']);
    expect(mapping.unknownHeaders).toEqual(['Precio con IVA']);
  });

  it('la plantilla conserva el orden histórico y agrega las columnas nuevas al final', () => {
    const keys = mapHeaders('products', []).columnIndex;
    expect(keys).toEqual({});
    // Las 8 primeras no cambian de lugar (la plantilla del asistente es posicional).
    const { IMPORT_COLUMNS } = jest.requireActual('@/modules/import/schema') as typeof import('@/modules/import/schema');
    expect(IMPORT_COLUMNS.products.map((c) => c.key)).toEqual([
      'sku', 'name', 'netPrice', 'unit', 'minStock', 'categoryName', 'isExempt', 'description',
      'barcode', 'brand', 'cost', 'producer',
    ]);
  });
});

describe('unidad de medida', () => {
  it.each([
    ['', 'UN'], ['un', 'UN'], ['UNI', 'UN'], ['Unid.', 'UN'], ['kilo', 'KG'], ['LT', 'LTS'], ['MTS', 'MT'], ['Caja', 'CJA'],
  ])('%j se interpreta como %s', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });

  it('una unidad desconocida no se adivina', () => {
    expect(normalizeUnit('docena')).toBeNull();
    expect(columnsOf(validateProductRow(row({ unit: 'docena' }), 2, ctx()))).toEqual(['Unidad']);
  });
});

describe('código de barras', () => {
  it('acepta EAN-13 e internos; rechaza notación científica y espacios', () => {
    expect(barcodeError('7801234567895')).toBeNull();
    expect(barcodeError('INT-0001')).toBeNull();
    expect(barcodeError('')).toBeNull();
    expect(barcodeError('7.80123E+12')).toMatch(/notación científica/);
    expect(barcodeError('78 01')).toMatch(/no es un código válido/);
  });

  it('detecta duplicados dentro del archivo y contra el catálogo', () => {
    const shared = ctx();
    expect(validateProductRow(row({ barcode: '7801' }), 2, shared)).toEqual([]);
    const dup = validateProductRow(row({ sku: 'A-2', barcode: '7801' }), 3, shared);
    expect(dup).toEqual([{ column: 'Código de Barras', message: expect.stringContaining('fila 2') }]);
    const existing = validateProductRow(row({ sku: 'A-3', barcode: '7800000000001' }), 4, shared);
    expect(existing[0].message).toMatch(/Ya existe un producto con este código de barras/);
  });
});

describe('productor', () => {
  it('se resuelve por RUT o por razón social, sin distinguir tildes ni mayúsculas', () => {
    expect(resolveProducer('11.111.111-1', lookup)).toMatchObject({ ok: true, producer: { id: 'pr1' } });
    expect(resolveProducer('miel del valle spa', lookup)).toMatchObject({ ok: true, producer: { id: 'pr1' } });
  });

  it('rechaza inexistente, inactivo, ambiguo o módulo no disponible', () => {
    expect(resolveProducer('Nadie', lookup)).toMatchObject({ ok: false, message: expect.stringContaining('No existe un productor') });
    expect(resolveProducer('22.222.222-2', lookup)).toMatchObject({ ok: false, message: expect.stringContaining('inactivo') });
    expect(resolveProducer('gemelo', lookup)).toMatchObject({ ok: false, message: expect.stringContaining('más de un productor') });
    expect(resolveProducer('Miel del Valle SpA', null)).toMatchObject({ ok: false, message: expect.stringContaining('no están disponibles') });
  });

  it('un producto de productor no puede traer costo', () => {
    const errors = validateProductRow(row({ producer: '11.111.111-1', cost: '500' }), 2, ctx());
    expect(columnsOf(errors)).toEqual(['Costo']);
    expect(validateProductRow(row({ producer: '11.111.111-1', cost: '0' }), 2, ctx())).toEqual([]);
  });

  it('el costo debe ser un entero no negativo', () => {
    expect(columnsOf(validateProductRow(row({ cost: 'abc' }), 2, ctx()))).toEqual(['Costo']);
    expect(columnsOf(validateProductRow(row({ cost: '-5' }), 2, ctx()))).toEqual(['Costo']);
  });
});

describe('datos de creación del producto', () => {
  const categories = new Map([['Miel', 'cat1']]);

  it('sin productor ni costo conserva el comportamiento histórico (PMP = precio neto) y es afecto', () => {
    const data = buildProductCreateData('c1', row({ categoryName: 'Miel' }), categories, null);
    expect(data).toMatchObject({ companyId: 'c1', isExempt: false, costPricePMP: 1000, grossPrice: 1190, categoryId: 'cat1', unit: 'UN' });
    expect(data).not.toHaveProperty('producerId');
    expect(data).not.toHaveProperty('supplyMode');
  });

  it('usa el costo del archivo, la marca y el código de barras', () => {
    const data = buildProductCreateData('c1', row({ cost: '600', brand: ' Marca X ', barcode: '7801234567895', unit: 'kilo' }), categories, null);
    expect(data).toMatchObject({ costPricePMP: 600, brand: 'Marca X', barcode: '7801234567895', unit: 'KG' });
  });

  it('exento solo si el archivo lo dice (decide el usuario)', () => {
    expect(buildProductCreateData('c1', row({ isExempt: 'si' }), categories, null)).toMatchObject({ isExempt: true, grossPrice: 1000 });
  });

  it('con productor queda en consignación y a costo 0', () => {
    const data = buildProductCreateData('c1', row({ producer: 'Miel del Valle SpA', cost: '0' }), categories, lookup);
    expect(data).toMatchObject({ producerId: 'pr1', supplyMode: 'CONSIGNMENT', costPricePMP: 0 });
  });
});

function csv(rows: number, extraHeader = ''): Buffer {
  const lines = [`SKU;Nombre;Precio Neto${extraHeader}`];
  for (let i = 1; i <= rows; i++) lines.push(`SKU-${i};Producto ${i};${1000 + i}`);
  return Buffer.from(lines.join('\n'), 'utf8');
}

describe('límites de filas por entidad', () => {
  it('productos y contactos admiten más filas que las entidades que van fila por fila', () => {
    expect(maxImportRows('products')).toBe(MAX_IMPORT_ROWS_BULK);
    expect(maxImportRows('contacts')).toBe(MAX_IMPORT_ROWS_BULK);
    expect(maxImportRows('stock')).toBe(MAX_IMPORT_ROWS);
    expect(maxImportRows('historicalSales')).toBe(MAX_IMPORT_ROWS);
    expect(MAX_IMPORT_ROWS_BULK).toBeGreaterThan(MAX_IMPORT_ROWS);
  });

  it('el CSV de productos se lee hasta el tope nuevo y marca el corte pasado ese tope', async () => {
    db.product.findMany.mockResolvedValue([]);
    const ok = await buildPreview('c1', 'products', { name: 'p.csv', buffer: csv(MAX_IMPORT_ROWS + 500) });
    expect(ok.truncated).toBe(false);
    expect(ok.totalRows).toBe(MAX_IMPORT_ROWS + 500);
    const cut = await buildPreview('c1', 'products', { name: 'p.csv', buffer: csv(MAX_IMPORT_ROWS_BULK + 1) });
    expect(cut.truncated).toBe(true);
    expect(cut.totalRows).toBe(MAX_IMPORT_ROWS_BULK);
  });
});

describe('vista previa y commit de productos', () => {
  it('toda consulta de lectura filtra por companyId y los productores solo se piden si se usan', async () => {
    db.product.findMany.mockResolvedValue([]);
    await buildPreview('c1', 'products', { name: 'p.csv', buffer: csv(3) });
    for (const call of db.product.findMany.mock.calls) expect(call[0].where.companyId).toBe('c1');
    expect(db.producer.findMany).not.toHaveBeenCalled();

    db.producer.findMany.mockResolvedValue([]);
    const withProducer = Buffer.from('SKU;Nombre;Precio Neto;Productor\nA;Prod;100;Miel del Valle SpA', 'utf8');
    const preview = await buildPreview('c1', 'products', { name: 'p.csv', buffer: withProducer });
    expect(db.producer.findMany.mock.calls[0][0].where.companyId).toBe('c1');
    expect(preview.rows[0].errors).toEqual([{ column: 'Productor', message: expect.stringContaining('No existe un productor') }]);
  });

  it('si la tabla de productores aún no existe, solo falla la fila que la usa', async () => {
    db.product.findMany.mockResolvedValue([]);
    db.producer.findMany.mockRejectedValue(Object.assign(new Error('no table'), { code: 'P2021' }));
    const buffer = Buffer.from('SKU;Nombre;Precio Neto;Productor\nA;Con productor;100;Alguien\nB;Sin productor;100;', 'utf8');
    const preview = await buildPreview('c1', 'products', { name: 'p.csv', buffer });
    expect(preview.rows[0].errors[0].message).toMatch(/no están disponibles/);
    expect(preview.rows[1].errors).toEqual([]);
  });

  it('inserta por lotes con createMany dentro de UNA transacción', async () => {
    db.product.findMany.mockResolvedValue([]);
    db.product.createMany.mockResolvedValue({ count: 0 });
    const total = IMPORT_INSERT_BATCH_SIZE * 2 + 200;
    const result = await commitImport('c1', 'products', { name: 'p.csv', buffer: csv(total) });
    expect(result).toEqual({ entity: 'products', created: total, updated: 0, skipped: 0 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.product.createMany.mock.calls.map((c) => c[0].data.length)).toEqual([IMPORT_INSERT_BATCH_SIZE, IMPORT_INSERT_BATCH_SIZE, 200]);
    for (const call of db.product.createMany.mock.calls) {
      for (const item of call[0].data) expect(item.companyId).toBe('c1');
    }
  });

  it('no importa nada si hay filas con error', async () => {
    db.product.findMany.mockResolvedValue([]);
    const buffer = Buffer.from('SKU;Nombre;Precio Neto\nA;Ok;100\nB;;100', 'utf8');
    await expect(commitImport('c1', 'products', { name: 'p.csv', buffer })).rejects.toThrow(/con errores/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza el commit de un archivo cortado en vez de importar solo una parte', async () => {
    db.product.findMany.mockResolvedValue([]);
    await expect(commitImport('c1', 'products', { name: 'p.csv', buffer: csv(MAX_IMPORT_ROWS_BULK + 1) })).rejects.toThrow(/supera las/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('traduce un error de constraint (carrera con otra alta) a un mensaje en español, sin texto de Prisma', async () => {
    db.product.findMany.mockResolvedValue([]);
    db.product.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target: ['companyId', 'sku'] } })
    );
    await expect(commitImport('c1', 'products', { name: 'p.csv', buffer: csv(2) })).rejects.toThrow('Ya existe un registro con ese SKU');
  });

  it('los contactos también se insertan por lotes', async () => {
    db.contact.findMany.mockResolvedValue([]);
    db.contact.createMany.mockResolvedValue({ count: 0 });
    const ruts = ['11111111-1', '12345678-5', '9999999-3', '7654321-6'];
    const lines = ['RUT;Razón Social'];
    ruts.forEach((rut, i) => lines.push(`${rut};Empresa ${i}`));
    const result = await commitImport('c1', 'contacts', { name: 'c.csv', buffer: Buffer.from(lines.join('\n'), 'utf8') });
    // Si algún RUT de ejemplo no pasara Módulo 11 el commit habría lanzado antes.
    expect(result.created).toBe(ruts.length);
    expect(db.contact.createMany).toHaveBeenCalledTimes(1);
    expect(db.contact.createMany.mock.calls[0][0].data[0].companyId).toBe('c1');
  });
});
