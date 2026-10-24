import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hashAccountToken,
  isMonthKey,
  isWellFormedToken,
  monthLabel,
  newAccountToken,
  normalizeEmail,
  recentMonths,
  shiftMonth,
} from '@/lib/supplier-portal/accounts';

/**
 * Seller Center (cuentas de sellers): enlaces de un solo uso que solo se guardan como huella y meses
 * de Santiago. La sesión se firma con una clave propia: un token del seller no sirve como sesión del
 * panel, ni al revés. Las ventas usan la regla de la liquidación (`tests/consignment-*.test.ts`).
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
