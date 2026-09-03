import { calculateNewPmp } from '@/lib/inventory/pmp';
import { validateRut, formatRut, cleanRut } from '@/lib/chile/rut';

describe('PMP (Precio Medio Ponderado)', () => {
  it('aplica la fórmula ponderada de CLAUDE.md', () => {
    // (10 × 1.000 + 10 × 2.000) / 20 = 1.500
    const { newStock, newPmp } = calculateNewPmp({
      previousStock: 10,
      previousPmp: 1000,
      incomingQuantity: 10,
      incomingUnitCost: 2000,
    });

    expect(newStock).toBe(20);
    expect(newPmp).toBe(1500);
  });

  it('adopta el costo entrante cuando no había stock previo', () => {
    const { newPmp } = calculateNewPmp({
      previousStock: 0,
      previousPmp: 0,
      incomingQuantity: 5,
      incomingUnitCost: 3200,
    });

    expect(newPmp).toBe(3200);
  });

  it('no divide por cero cuando el stock resultante es nulo, y no corrompe el costo a $0', () => {
    // Hallazgo de auditoría: cuando el stock resultante queda en 0 (o negativo,
    // caso de backorder con `allowNegativeStock`), la función antes devolvía
    // `newPmp: 0` — un costo inventado que contaminaba toda venta posterior
    // hasta la siguiente compra. Ahora usa el costo de la compra entrante,
    // que es un dato real, nunca cero ni negativo.
    const result = calculateNewPmp({
      previousStock: 0,
      previousPmp: 0,
      incomingQuantity: 0,
      incomingUnitCost: 1000,
    });

    expect(result.newStock).toBe(0);
    expect(result.newPmp).toBe(1000);
    expect(Number.isFinite(result.newPmp)).toBe(true);
  });

  it('backorder: una compra que no alcanza a cubrir el stock negativo usa el costo entrante, no $0', () => {
    const result = calculateNewPmp({
      previousStock: -10,
      previousPmp: 5000,
      incomingQuantity: 3,
      incomingUnitCost: 8000,
    });

    expect(result.newStock).toBe(-7);
    expect(result.newPmp).toBe(8000);
  });

  it('pondera correctamente cuando el ingreso es mucho menor al stock existente', () => {
    // (100 × 1.000 + 1 × 5.000) / 101 = 1039,60...
    const { newPmp } = calculateNewPmp({
      previousStock: 100,
      previousPmp: 1000,
      incomingQuantity: 1,
      incomingUnitCost: 5000,
    });

    expect(newPmp).toBeCloseTo(1039.6, 1);
  });

  it('rechaza costos PMP negativos', () => {
    expect(() => calculateNewPmp({ previousStock: 10, previousPmp: 1000, incomingQuantity: 1, incomingUnitCost: -1 })).toThrow(
      'El costo PMP no puede ser negativo'
    );
  });
});

describe('RUT chileno (Módulo 11)', () => {
  it('valida RUTs correctos', () => {
    expect(validateRut('12.345.678-5')).toBe(true);
    expect(validateRut('12345678-5')).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(validateRut('12.345.678-4')).toBe(false);
    expect(validateRut('12.345.678-K')).toBe(false);
  });

  it('maneja el dígito verificador K (resto 10)', () => {
    expect(validateRut('10.000.013-K')).toBe(true);
    expect(validateRut('10000013-k')).toBe(true);
    expect(validateRut('10000013-1')).toBe(false);
  });

  it('maneja el dígito verificador 0 (resto 11)', () => {
    expect(validateRut('10.000.004-0')).toBe(true);
    expect(validateRut('10000004-K')).toBe(false);
  });

  it('valida personas y empresas de rangos altos', () => {
    expect(validateRut('24.000.000-8')).toBe(true);
    expect(validateRut('76.123.456-0')).toBe(true);
    expect(validateRut('76.123.456-1')).toBe(false);
  });

  it('normaliza al formato canónico con puntos y guión', () => {
    expect(formatRut('12345678-5')).toBe('12.345.678-5');
    expect(formatRut('12.345.678-5')).toBe('12.345.678-5');
    expect(formatRut('9999999-9')).toBe('9.999.999-9');
  });

  it('formatRut es idempotente: aplicarlo dos veces no cambia el resultado', () => {
    // El seed creaba una empresa duplicada porque comparaba un RUT sin formato
    // contra uno ya formateado en la base.
    const once = formatRut('99999999-9');
    expect(formatRut(once)).toBe(once);
  });

  it('cleanRut quita puntos y guión, y normaliza el DV a mayúscula', () => {
    expect(cleanRut('12.345.678-k')).toBe('12345678K');
  });
});
