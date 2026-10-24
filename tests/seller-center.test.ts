import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exclusiveProductIds,
  hashAccountToken,
  isMonthKey,
  isWellFormedToken,
  monthLabel,
  newAccountToken,
  normalizeEmail,
  recentMonths,
  shiftMonth,
  summarizeSales,
} from '@/lib/supplier-portal/accounts';

/**
 * Seller Center (cuentas del proveedor): enlaces de un solo uso que solo se guardan como huella,
 * meses de Santiago y ventas solo de lo que el proveedor surte en exclusiva. La sesión se firma con
 * una clave propia: un token del proveedor no sirve como sesión del panel, ni al revés.
 */

describe('enlaces y correos', () => {
  it('un enlace tiene 32 bytes al azar y se guarda solo su SHA-256', () => {
    const token = newAccountToken();
    expect(isWellFormedToken(token)).toBe(true);
    expect(token).not.toBe(newAccountToken());
    expect(hashAccountToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccountToken(token)).not.toContain(token);
    expect(isWellFormedToken('abc')).toBe(false);
    expect(isWellFormedToken(`${token.slice(0, 42)}!`)).toBe(false);
  });

  it('el correo es la identidad: sin espacios y en minúsculas', () => {
    expect(normalizeEmail('  Ana.Productora@Campo.CL ')).toBe('ana.productora@campo.cl');
  });
});

describe('meses', () => {
  it('valida, desplaza y nombra meses', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(['2026-13', '2026-1', 'otro', undefined].map((value) => isMonthKey(value))).toEqual([false, false, false, false]);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(recentMonths('2026-02', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
    expect(monthLabel('2026-10')).toBe('octubre 2026');
  });
});

describe('ventas del proveedor', () => {
  it('suma boletas y facturas menos notas de crédito, con precio promedio entero', () => {
    const result = summarizeSales([
      { productId: 'miel', units: 3, net: 9000 },
      { productId: 'miel', units: 2, net: 6200 },
      { productId: 'miel', units: -1, net: -3000 },
      { productId: 'queso', units: 1, net: 4500 },
      // Devuelto todo: no queda nada que informar.
      { productId: 'pan', units: 1, net: 1000 },
      { productId: 'pan', units: -1, net: -1000 },
    ]);
    expect(result.products).toEqual([
      { productId: 'miel', units: 4, net: 12200, averagePrice: 3050 },
      { productId: 'queso', units: 1, net: 4500, averagePrice: 4500 },
    ]);
    expect(result).toMatchObject({ units: 5, net: 16700 });
  });

  it('una nota de crédito de solo precio deja el monto sin unidades: sin precio promedio', () => {
    expect(summarizeSales([{ productId: 'miel', units: 0, net: -500 }]).products).toEqual([{ productId: 'miel', units: 0, net: -500, averagePrice: null }]);
  });

  it('solo cuentan los productos que surte un único proveedor', () => {
    expect([...exclusiveProductIds([{ productId: 'a', supplierCount: 1 }, { productId: 'b', supplierCount: 2 }])]).toEqual(['a']);
  });
});

describe('sesión con clave propia', () => {
  // `jose` es ESM y no carga en Jest: la separación real se prueba en e2e/seller-center.spec.ts
  // (la cookie del proveedor puesta como sesión del panel no entra). Acá se vigila que nadie la quite.
  it('firma con una clave derivada distinta a la del panel y exige su propósito', () => {
    const source = readFileSync(join(__dirname, '../src/lib/supplier-portal/session.ts'), 'utf8');
    expect(source).toContain('update(`${process.env.JWT_SECRET}:supplier-portal-session`)');
    expect(source).toContain("payload.purpose !== 'supplier_session'");
    expect(source).not.toMatch(/new TextEncoder\(\)\.encode\(process\.env\.JWT_SECRET\)/);
  });
});
