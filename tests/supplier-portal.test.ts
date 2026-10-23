import { SUPPLIER_CODE_LENGTH, formatSupplierCode, hashSupplierCode, newSupplierCode, normalizeSupplierCode, supplierCodeHint } from '@/lib/supplier-portal/code';
import { coverageDays, countStatuses, roundQty, stockStatus } from '@/lib/supplier-portal/analysis';

describe('código de acceso del proveedor', () => {
  it('son 16 símbolos del alfabeto sin letras confusas', () => {
    for (let i = 0; i < 200; i++) {
      const code = newSupplierCode();
      expect(code).toHaveLength(SUPPLIER_CODE_LENGTH);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    }
  });

  it('usa los 80 bits: el extremo de cada byte aporta símbolos y no se pierde ni se sesga nada', () => {
    expect(newSupplierCode(() => new Uint8Array(10).fill(0))).toBe('0000000000000000');
    expect(newSupplierCode(() => new Uint8Array(10).fill(255))).toBe('ZZZZZZZZZZZZZZZZ');
    // Los bits 00001 00010 00011 (1, 2, 3) repartidos en bytes: 00001000 10000110 …
    expect(newSupplierCode(() => Uint8Array.from([0b00001000, 0b10000110, 0, 0, 0, 0, 0, 0, 0, 0])).slice(0, 3)).toBe('123');
  });

  it('dos códigos nuevos no se repiten', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newSupplierCode()));
    expect(seen.size).toBe(2000);
  });

  it('se entrega en grupos de cuatro y vuelve a su forma original', () => {
    const code = 'K7QM4TXD9HWB2ZNC';
    expect(formatSupplierCode(code)).toBe('K7QM-4TXD-9HWB-2ZNC');
    expect(normalizeSupplierCode('K7QM-4TXD-9HWB-2ZNC')).toBe(code);
  });

  it('tolera cómo lo escribe una persona: minúsculas, espacios y confusiones típicas', () => {
    expect(normalizeSupplierCode('k7qm 4txd 9hwb 2znc')).toBe('K7QM4TXD9HWB2ZNC');
    expect(normalizeSupplierCode('  K7QM-4TXD-9HWB-2ZNC \n')).toBe('K7QM4TXD9HWB2ZNC');
    // I y L se leen como 1; O se lee como 0.
    expect(normalizeSupplierCode('IL0O-0000-0000-0000')).toBe('1100000000000000');
  });

  it('rechaza lo que no puede ser un código', () => {
    expect(normalizeSupplierCode('')).toBeNull();
    expect(normalizeSupplierCode('K7QM-4TXD-9HWB')).toBeNull();
    expect(normalizeSupplierCode('K7QM-4TXD-9HWB-2ZNCC')).toBeNull();
    expect(normalizeSupplierCode('K7QM-4TXD-9HWB-2ZN!')).toBeNull();
    expect(normalizeSupplierCode('UUUU-UUUU-UUUU-UUUU')).toBeNull(); // la U no existe en el alfabeto
  });

  it('del código solo se guarda su huella: es estable, distinta por código y no revela el código', () => {
    const a = hashSupplierCode('K7QM4TXD9HWB2ZNC');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSupplierCode('K7QM4TXD9HWB2ZNC')).toBe(a);
    expect(hashSupplierCode('K7QM4TXD9HWB2ZND')).not.toBe(a);
    expect(a).not.toContain('K7QM');
  });

  it('la pista muestra solo el final', () => {
    expect(supplierCodeHint('K7QM4TXD9HWB2ZNC')).toBe('2ZNC');
  });
});

describe('estado del stock que ve el proveedor', () => {
  it('sin existencias, bajo el mínimo y suficiente', () => {
    expect(stockStatus(0, 5)).toBe('OUT');
    expect(stockStatus(-2, 0)).toBe('OUT');
    expect(stockStatus(5, 5)).toBe('LOW');
    expect(stockStatus(3, 5)).toBe('LOW');
    expect(stockStatus(6, 5)).toBe('OK');
  });

  it('sin mínimo definido nunca avisa "bajo"', () => {
    expect(stockStatus(1, 0)).toBe('OK');
  });

  it('la cobertura sale del ritmo de venta real y se omite si no hubo ventas', () => {
    expect(coverageDays(60, 30)).toBe(60); // 1 por día
    expect(coverageDays(10, 60)).toBe(5); // 2 por día
    expect(coverageDays(0, 30)).toBe(0);
    expect(coverageDays(50, 0)).toBeNull();
    expect(coverageDays(50, -1)).toBeNull();
  });

  it('cuenta los estados para el resumen', () => {
    expect(countStatuses([{ status: 'OK' }, { status: 'LOW' }, { status: 'OUT' }, { status: 'OUT' }])).toEqual({ products: 4, out: 2, low: 1 });
    expect(countStatuses([])).toEqual({ products: 0, out: 0, low: 0 });
  });

  it('redondea cantidades a tres decimales', () => {
    expect(roundQty(2.34567)).toBe(2.346);
    expect(roundQty(10)).toBe(10);
  });
});
