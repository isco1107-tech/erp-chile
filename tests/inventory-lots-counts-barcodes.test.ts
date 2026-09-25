import { allocateFefo, daysToExpiry, expiryStatus, fefoOrder, NO_LOT, normalizeLotNumber, parseExpiryDate, type LotBalance } from '@/lib/inventory/lots';
import { adjustmentAtPosting, lineDifference, summarizeCount } from '@/lib/inventory/count';
import { code128Bars, code128Values, code128Widths, ean13CheckDigit, isEncodable, isValidEan13 } from '@/lib/barcode/code128';
import { inventoryCountEntriesSchema, productCreateSchema, stockMovementSchema } from '@/modules/inventory/schema';
import { goodsReceiptItemSchema } from '@/modules/purchases/schema';
import { MODULE_KEYS, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav, findNavLinkForPath } from '@/lib/navigation/workspace-nav';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('lotes: salida FEFO', () => {
  const lot = (lotNumber: string, expiry: string | null, quantity: number, created = '2026-01-01'): LotBalance => ({
    lotNumber,
    expiryDate: expiry ? day(expiry) : null,
    quantity,
    createdAt: day(created),
  });

  it('sale primero lo que vence antes; los lotes sin fecha van al final por antigüedad', () => {
    const ordered = fefoOrder([lot('C', null, 1, '2026-01-02'), lot('B', '2026-12-01', 1), lot('A', '2026-10-01', 1), lot('D', null, 1, '2026-01-01')]);
    expect(ordered.map((l) => l.lotNumber)).toEqual(['A', 'B', 'D', 'C']);
  });

  it('reparte la salida entre lotes y deja sin asignar lo que no alcanza', () => {
    const lots = [lot('NUEVO', '2027-01-01', 10), lot('VIEJO', '2026-10-01', 4), lot('VACIO', '2026-09-01', 0)];
    expect(allocateFefo(lots, 6)).toEqual({
      allocations: [
        { lotNumber: 'VIEJO', expiryDate: day('2026-10-01').toISOString(), quantity: 4 },
        { lotNumber: 'NUEVO', expiryDate: day('2027-01-01').toISOString(), quantity: 2 },
      ],
      unallocated: 0,
    });
    expect(allocateFefo(lots, 20).unallocated).toBe(6);
    expect(allocateFefo([], 3)).toEqual({ allocations: [], unallocated: 3 });
  });

  it('clasifica el vencimiento contra hoy', () => {
    const today = new Date('2026-09-25T03:00:00Z'); // medianoche en Santiago
    expect(daysToExpiry(day('2026-09-25'), today)).toBe(0);
    expect(daysToExpiry(day('2026-09-24'), today)).toBe(-1);
    expect(expiryStatus(day('2026-09-24'), today)).toBe('expired');
    expect(expiryStatus(day('2026-09-25'), today)).toBe('soon');
    expect(expiryStatus(day('2026-10-25'), today)).toBe('soon');
    expect(expiryStatus(day('2026-10-26'), today)).toBe('ok');
    expect(expiryStatus(null, today)).toBe('none');
  });

  it('normaliza el número de lote y parsea la fecha del formulario', () => {
    expect(normalizeLotNumber('  l-24  09a ')).toBe('L-24 09A');
    expect(normalizeLotNumber('')).toBe(NO_LOT);
    expect(normalizeLotNumber(undefined)).toBe(NO_LOT);
    expect(parseExpiryDate('2026-12-31')?.toISOString()).toBe('2026-12-31T12:00:00.000Z');
    expect(parseExpiryDate('2026-02-30')).toBeNull();
    expect(parseExpiryDate('31-12-2026')).toBeNull();
    expect(parseExpiryDate('')).toBeNull();
  });
});

describe('toma de inventario', () => {
  it('calcula diferencias y las valoriza al costo', () => {
    const summary = summarizeCount([
      { productId: 'a', systemQuantity: 10, countedQuantity: 8, unitCost: 1000 },
      { productId: 'b', systemQuantity: 5, countedQuantity: 6, unitCost: 250.5 },
      { productId: 'c', systemQuantity: 3, countedQuantity: 3, unitCost: 100 },
      { productId: 'd', systemQuantity: 7, countedQuantity: null, unitCost: 100 },
    ]);
    expect(summary).toEqual({ lines: 4, counted: 3, withDifference: 2, surplusValue: 251, shortageValue: 2000, netValue: -1749, progress: 75 });
  });

  it('una línea sin contar no tiene diferencia (y no se ajusta)', () => {
    expect(lineDifference({ systemQuantity: 4, countedQuantity: null })).toBeNull();
    expect(lineDifference({ systemQuantity: 0.1 + 0.2, countedQuantity: 0.3 })).toBe(0);
  });

  it('ajusta contra el stock del momento, no contra la foto de apertura', () => {
    // Se abrió con 10, se vendieron 2 mientras se contaba y se contaron 8: no hay ajuste.
    expect(adjustmentAtPosting(8, 8)).toBe(0);
    expect(adjustmentAtPosting(8, 10)).toBe(-2);
    expect(adjustmentAtPosting(12, 10)).toBe(2);
  });

  it('el esquema no acepta cantidades contadas negativas', () => {
    expect(inventoryCountEntriesSchema.safeParse([{ lineId: 'l1', countedQuantity: 3 }, { lineId: 'l2', countedQuantity: null }]).success).toBe(true);
    expect(inventoryCountEntriesSchema.safeParse([{ lineId: 'l1', countedQuantity: -1 }]).success).toBe(false);
  });
});

describe('código de barras Code 128', () => {
  it('arma inicio B, datos, verificador módulo 103 y parada', () => {
    // 104 + 33·1 + 34·2 = 205 → 205 mod 103 = 102
    expect(code128Values('AB')).toEqual([104, 33, 34, 102, 106]);
  });

  it('cada símbolo mide 11 módulos y la parada 13, para todo carácter imprimible', () => {
    for (let code = 32; code <= 126; code += 1) {
      const widths = code128Widths(String.fromCharCode(code));
      expect(widths).toHaveLength(6 * 3 + 7);
      expect(widths.reduce((sum, width) => sum + width, 0)).toBe(11 * 3 + 13);
    }
  });

  it('usa el patrón estándar de la letra A y agrega zona de silencio', () => {
    expect(code128Widths('A').slice(6, 12).join('')).toBe('111323');
    const { bars, totalModules } = code128Bars('A');
    expect(bars[0]![0]).toBe(10);
    expect(totalModules).toBe(10 + 11 * 3 + 13 + 10);
  });

  it('rechaza lo que un lector no puede codificar', () => {
    expect(isEncodable('ÑANDÚ-01')).toBe(false);
    expect(isEncodable('')).toBe(false);
    expect(isEncodable('SKU-001')).toBe(true);
    expect(() => code128Values('año')).toThrow();
  });

  it('calcula y valida el dígito verificador EAN-13', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('780123')).toBe(false);
  });
});

describe('formularios de inventario', () => {
  it('el código de barras del producto admite solo lo que escribe un lector', () => {
    const base = { sku: 'A-1', name: 'Arroz', netPrice: 1000 };
    expect(productCreateSchema.safeParse({ ...base, barcode: '7801234567890' }).success).toBe(true);
    expect(productCreateSchema.safeParse({ ...base, barcode: 'código ñ' }).success).toBe(false);
  });

  it('la entrada de stock valida el formato del vencimiento', () => {
    const base = { productId: 'p', warehouseId: 'w', type: 'PURCHASE_IN' as const, quantity: 5, unitCost: 100 };
    expect(stockMovementSchema.safeParse({ ...base, lotNumber: 'L1', expiryDate: '2027-01-31' }).success).toBe(true);
    expect(stockMovementSchema.safeParse({ ...base, lotNumber: 'L1', expiryDate: '' }).success).toBe(true);
    expect(stockMovementSchema.safeParse({ ...base, expiryDate: '31/01/2027' }).success).toBe(false);
    expect(goodsReceiptItemSchema.safeParse({ orderItemId: 'i', quantity: 1, expiryDate: '2027-01-31', lotNumber: 'L9' }).success).toBe(true);
  });
});

describe('menú de inventario', () => {
  const allFeatures = Object.fromEntries(MODULE_KEYS.map((key) => [key, true])) as CompanyFeatureFlags;
  const links = buildAvailableWorkspaceNav({ permissions: ALL_PERMISSIONS, features: allFeatures, isSuperAdmin: false }).flatMap((group) => group.links);

  it('las pantallas nuevas resaltan su propio ítem, no el de Inventario', () => {
    expect(findNavLinkForPath(links, '/dashboard/inventory/counts/abc')?.href).toBe('/dashboard/inventory/counts');
    expect(findNavLinkForPath(links, '/dashboard/inventory/lots')?.href).toBe('/dashboard/inventory/lots');
    expect(findNavLinkForPath(links, '/dashboard/inventory/labels')?.href).toBe('/dashboard/inventory/labels');
    expect(findNavLinkForPath(links, '/dashboard/inventory')?.href).toBe('/dashboard/inventory');
  });
});
