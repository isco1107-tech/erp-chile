/**
 * Arreglos de la auditoría de las apps en la operación diaria (29-10-2026):
 * montos escritos «a la chilena» y la entrada a las apps que usan hardware.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { amountDigits, formatAmountDigits, parseAmountDigits } from '@/lib/chile/amount-input';
import { entryDestination, needsFullPageLoad } from '@/lib/auth/entry-preference';
import { missingPermissionMessage } from '@/lib/auth/permissions';
import { calculateTotal, netPriceForGross } from '@/lib/chile/tax';
import { santiagoDateTimeLabel, santiagoTimeLabel } from '@/lib/chile/timezone';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('montos en pesos escritos a mano', () => {
  it('«50.000» son cincuenta mil, no cincuenta', () => {
    expect(parseAmountDigits('50.000')).toBe(50_000);
    expect(parseAmountDigits('$ 1.250.000')).toBe(1_250_000);
    expect(parseAmountDigits('150000')).toBe(150_000);
  });

  it('el campo vacío no es cero, pero el cero escrito sí cuenta (fondo de caja vacío)', () => {
    expect(parseAmountDigits('')).toBeNull();
    expect(parseAmountDigits('abc')).toBeNull();
    expect(parseAmountDigits('0')).toBe(0);
    expect(parseAmountDigits('000')).toBe(0);
  });

  it('una coma decimal no suma centavos al monto', () => {
    expect(amountDigits('1.500,50')).toBe('1500');
    expect(amountDigits('2500,9')).toBe('2500');
  });

  it('muestra el punto de miles mientras se escribe', () => {
    expect(formatAmountDigits('50000')).toBe('50.000');
    expect(formatAmountDigits('007')).toBe('7');
    expect(formatAmountDigits('')).toBe('');
  });

  it('no pasa de un entero seguro', () => {
    expect(amountDigits('9'.repeat(30))).toHaveLength(12);
    expect(Number.isSafeInteger(parseAmountDigits('9'.repeat(30)))).toBe(true);
  });

  it.each([
    'src/components/pos/OpenShiftPanel.tsx',
    'src/components/pos/CashPanel.tsx',
    'src/components/treasury/RegisterPaymentDialog.tsx',
    'src/components/academy/PaymentsPanel.tsx',
  ])('%s usa el campo de monto chileno, no type="number"', (file) => {
    const source = read(file);
    expect(source).toContain('AmountInput');
    expect(source).not.toMatch(/type="number"/);
  });
});

describe('entrar a una app que usa hardware', () => {
  it('Bodega (cámara) y POS (USB) se abren con una carga completa; el resto no', () => {
    expect(needsFullPageLoad('/bodega')).toBe(true);
    expect(needsFullPageLoad('/pos')).toBe(true);
    expect(needsFullPageLoad('/control')).toBe(false);
    expect(needsFullPageLoad('/dashboard')).toBe(false);
  });

  it('el selector de empresa y el cambio de contraseña respetan esa regla para todas las apps', () => {
    for (const value of ['bodega', 'pos', 'control', 'erp']) expect(typeof needsFullPageLoad(entryDestination(value))).toBe('boolean');
    expect(read('src/components/auth/CompanyPicker.tsx')).toContain('needsFullPageLoad(destination)');
    expect(read('src/components/ChangePasswordForm.tsx')).toContain('needsFullPageLoad(destination)');
    expect(read('src/app/seleccionar-empresa/page.tsx')).toContain('destination={destination}');
  });

  it('una IP no autorizada deja a la persona en el ingreso de SU app, con el motivo a la vista', () => {
    expect(read('src/app/control/(app)/page.tsx')).toContain("redirect('/control/ingresar?reason=ip')");
    expect(read('src/app/bodega/(app)/layout.tsx')).toContain("redirect('/bodega/ingresar?reason=ip')");
    expect(read('src/app/pos/(app)/layout.tsx')).toContain("redirect('/pos/ingresar?reason=ip')");
  });
});

describe('mensajes que dicen qué pasó y qué hacer', () => {
  it('un permiso faltante dice cuál es y a quién pedirlo', () => {
    const message = missingPermissionMessage('pos:close');
    expect(message).toContain('«');
    expect(message).toMatch(/dueño o a un administrador/);
    expect(message).not.toBe('No autorizado para esta acción');
  });

  it('una falla de programación no llega en inglés a la pantalla; un mensaje de negocio sí llega', () => {
    expect(toFriendlyErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toMatch(/^Ocurrió un error inesperado/);
    expect(toFriendlyErrorMessage(new Error('Stock insuficiente para SKU-1'))).toBe('Stock insuficiente para SKU-1');
  });
});

describe('precio escrito con IVA incluido', () => {
  it('encuentra el neto que da exactamente el precio final', () => {
    expect(netPriceForGross(1990, false)).toEqual({ net: 1672, exact: true });
    expect(netPriceForGross(1190, false)).toEqual({ net: 1000, exact: true });
    for (const gross of [990, 4990, 12_990, 119_000]) {
      const { net, exact } = netPriceForGross(gross, false);
      if (exact) expect(calculateTotal(net)).toBe(gross);
    }
  });

  it('si ningún neto da ese precio, propone el más cercano y lo avisa', () => {
    const unreachable = Array.from({ length: 300 }, (_, i) => i + 1).find((g) => !netPriceForGross(g, false).exact)!;
    const { net, exact } = netPriceForGross(unreachable, false);
    expect(exact).toBe(false);
    expect(Math.abs(calculateTotal(net) - unreachable)).toBeLessThanOrEqual(1);
  });

  it('un exento no lleva IVA: el neto es el precio', () => {
    expect(netPriceForGross(5000, true)).toEqual({ net: 5000, exact: true });
  });
});

describe('horas que no rompen la pantalla', () => {
  it('se escriben con dígitos y en hora de Chile, igual en el servidor y en el navegador', () => {
    // 04:20:33 UTC del 29-10-2026 = 01:20:33 en Santiago (UTC-3, horario de verano).
    const at = new Date('2026-10-29T04:20:33Z');
    expect(santiagoDateTimeLabel(at)).toBe('29-10-2026 01:20');
    expect(santiagoTimeLabel(at)).toBe('01:20:33');
    expect(santiagoDateTimeLabel(new Date('2026-10-29T18:05:00Z'))).toBe('29-10-2026 15:05');
  });

  it('las pantallas del POS ya no usan toLocaleString para fechas', () => {
    for (const file of ['PosWorkspace', 'ShiftHistoryPanel', 'CashPanel', 'CashShiftReceipt', 'PosTicket']) {
      expect(read(`src/components/pos/${file}.tsx`)).not.toMatch(/Date\([^)]*\)\.toLocale(String|TimeString)|issuedAt\.toLocaleString/);
    }
  });
});
